/**
 * ERC-4337 Service with Session Key Plugin (ERC-6900)
 *
 * Uses MultiOwnerModularAccount with Session Key Plugin for:
 * - User-owned smart accounts (owner is user's Privy wallet)
 * - Backend-controlled session keys (limited permissions)
 * - Gasless transactions via paymaster
 */

const { ethers } = require('ethers')
const {
  createMultiOwnerModularAccount,
  SessionKeyPermissionsBuilder,
  SessionKeyAccessListType,
} = require('@alchemy/aa-accounts')
const { LocalAccountSigner } = require('@alchemy/aa-core')
const { http, keccak256, toHex, encodeAbiParameters, encodePacked } = require('viem')
const { privateKeyToAccount } = require('viem/accounts')
const { mainnet } = require('viem/chains')
const config = require('../config')
const logger = require('../utils/logger')

// Mainnet fork config
const mainnetFork = {
  ...mainnet,
  id: 1,
  name: 'Mainnet Fork',
  rpcUrls: {
    default: { http: [config.blockchain.rpcUrl] },
    public: { http: [config.blockchain.rpcUrl] }
  }
}

// ERC-4337 Infrastructure (constant mainnet addresses)
const ENTRYPOINT_V06 = '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789'
const SESSION_KEY_PLUGIN = '0x0000003E0000a96de4058e1E02a62FaaeCf23d8d'
const MULTI_OWNER_PLUGIN = '0xcE0000007B008F50d762D155002600004cD6c647'

// Deployment-specific addresses (from env or setup script)
const PAYMASTER_V06 = config.contracts?.paymasterV06 || process.env.PAYMASTER_V06_ADDRESS
const SWITCHER = config.contracts?.switcher || process.env.SWITCHER_ADDRESS

// DeFi Addresses (constant mainnet addresses)
const USDC_COMET = '0xc3d688B66703497DAA19211EEdff47f25384cdc3'
const WETH_COMET = '0xA17581A9E3356d9A858b789D68B4d866e593aE94'
const WBTC = '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599'
const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
const WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'

// ABIs
const ENTRYPOINT_V06_ABI = [
  'function handleOps((address sender, uint256 nonce, bytes initCode, bytes callData, uint256 callGasLimit, uint256 verificationGasLimit, uint256 preVerificationGas, uint256 maxFeePerGas, uint256 maxPriorityFeePerGas, bytes paymasterAndData, bytes signature)[] ops, address beneficiary) external',
  'function getNonce(address sender, uint192 key) external view returns (uint256)',
]

const SESSION_KEY_PLUGIN_ABI = [
  'function isSessionKeyOf(address account, address sessionKey) external view returns (bool)',
]

const ERC20_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
]

const COMET_ABI = [
  'function supply(address asset, uint256 amount) external',
  'function withdraw(address asset, uint256 amount) external',
  'function borrowBalanceOf(address account) view returns (uint256)',
  'function collateralBalanceOf(address account, address asset) view returns (uint128)',
  'function allow(address manager, bool isAllowed) external',
  'function baseToken() view returns (address)',
  'function isAllowed(address owner, address manager) view returns (bool)',
]

const SWITCHER_ABI = [
  'function switchCollateral(address user, address sourceComet, address targetComet, address collateralAsset, uint256 collateralAmount, uint256 borrowAmount, uint256 minOutputAmount) external',
  'function authorizedCallers(address) view returns (bool)',
  'function authorizeCaller(address caller, bool authorized) external',
  'function owner() view returns (address)',
]

// Token config for funding
const TOKENS = {
  WBTC: { address: WBTC, decimals: 8, defaultAmount: '1' }, // 1 WBTC
  USDC: { address: USDC, decimals: 6, defaultAmount: '10000' }, // 10,000 USDC
  WETH: { address: WETH, decimals: 18, defaultAmount: '5' }, // 5 WETH
}

const EXECUTE_WITH_SESSION_KEY_ABI = [
  'function executeWithSessionKey((address target, uint256 value, bytes data)[] calls, address sessionKey) external returns (bytes[])'
]

const INSTALL_PLUGIN_ABI = [
  'function installPlugin(address plugin, bytes32 manifestHash, bytes calldata pluginInitData, bytes21[] calldata dependencies) external'
]

/**
 * Compute UserOp hash for v0.6.0
 */
function computeUserOpHashV06(userOp, entryPointAddress, chainId) {
  const packed = ethers.AbiCoder.defaultAbiCoder().encode(
    ['address', 'uint256', 'bytes32', 'bytes32', 'uint256', 'uint256', 'uint256', 'uint256', 'uint256', 'bytes32'],
    [
      userOp.sender,
      userOp.nonce,
      ethers.keccak256(userOp.initCode || '0x'),
      ethers.keccak256(userOp.callData),
      userOp.callGasLimit,
      userOp.verificationGasLimit,
      userOp.preVerificationGas,
      userOp.maxFeePerGas,
      userOp.maxPriorityFeePerGas,
      ethers.keccak256(userOp.paymasterAndData)
    ]
  )
  return ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ['bytes32', 'address', 'uint256'],
      [ethers.keccak256(packed), entryPointAddress, chainId]
    )
  )
}

class ERC4337Service {
  constructor() {
    this.provider = new ethers.JsonRpcProvider(config.blockchain.rpcUrl)
    this.entryPoint = new ethers.Contract(ENTRYPOINT_V06, ENTRYPOINT_V06_ABI, this.provider)
    this.sessionKeyPlugin = new ethers.Contract(SESSION_KEY_PLUGIN, SESSION_KEY_PLUGIN_ABI, this.provider)

    // Executor wallet for submitting UserOps to EntryPoint
    // This is NOT an owner - just pays for on-chain tx gas
    if (process.env.DEPLOYER_PRIVATE_KEY) {
      this.executorWallet = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY, this.provider)
    }
  }

  /**
   * Compute the counterfactual smart account address for an owner
   * The owner (Privy EOA) will control this account - backend has NO owner access
   */
  async computeSmartAccountAddress(ownerAddress) {
    try {
      // We need a signer to compute the address, but ownership is determined by the owners array
      // Use a dummy signer - the actual owner is ownerAddress (user's Privy EOA)
      const dummyKey = '0x0000000000000000000000000000000000000000000000000000000000000001'
      const dummySigner = new LocalAccountSigner(privateKeyToAccount(dummyKey))

      const account = await createMultiOwnerModularAccount({
        transport: http(config.blockchain.rpcUrl),
        chain: mainnetFork,
        signer: dummySigner,
        owners: [ownerAddress],  // User's Privy EOA is the ONLY owner
      })

      logger.info(`Computed smart account address for owner ${ownerAddress}: ${account.address}`)

      return {
        address: account.address,
        ownerAddress
      }
    } catch (error) {
      logger.error('Error computing smart account address:', error)
      throw error
    }
  }

  /**
   * Build unsigned UserOp for session key registration
   * User must sign this with their Privy wallet (the owner)
   */
  async buildSessionKeyRegistrationUserOp(accountAddress, ownerAddress, sessionKeyAddress, expiresAt) {
    // Check if account is deployed
    const isDeployed = await this.isAccountDeployed(accountAddress)

    // Build DeFi permissions for the session key
    const permissions = new SessionKeyPermissionsBuilder()
      .setContractAccessControlType(SessionKeyAccessListType.ALLOWLIST)
      .addContractAddressAccessEntry({ contractAddress: SWITCHER, isOnList: true, checkSelectors: false })
      .addContractAddressAccessEntry({ contractAddress: USDC_COMET, isOnList: true, checkSelectors: false })
      .addContractAddressAccessEntry({ contractAddress: WETH_COMET, isOnList: true, checkSelectors: false })
      .addContractAddressAccessEntry({ contractAddress: WBTC, isOnList: true, checkSelectors: false })
      .addContractAddressAccessEntry({ contractAddress: USDC, isOnList: true, checkSelectors: false })
      .addContractAddressAccessEntry({ contractAddress: WETH, isOnList: true, checkSelectors: false })
      .setTimeRange({
        validFrom: Math.floor(Date.now() / 1000) - 60,
        validUntil: Math.floor(new Date(expiresAt).getTime() / 1000)
      })
      .encode()

    const sessionKeyTag = keccak256(toHex(`session-key-${sessionKeyAddress}`))

    // Build plugin install data
    const pluginInstallData = encodeAbiParameters(
      [{ type: 'address[]' }, { type: 'bytes32[]' }, { type: 'bytes[][]' }],
      [[sessionKeyAddress], [sessionKeyTag], [permissions]]
    )

    // Get manifest hash
    const rawManifestData = await this.provider.call({
      to: SESSION_KEY_PLUGIN,
      data: '0xc7763130' // pluginManifest()
    })
    const manifestHash = ethers.keccak256(rawManifestData)

    // Build dependencies
    const dependency0 = encodePacked(['address', 'uint8'], [MULTI_OWNER_PLUGIN, 0x0])
    const dependency1 = encodePacked(['address', 'uint8'], [MULTI_OWNER_PLUGIN, 0x1])

    // Build installPlugin calldata
    const installPluginIface = new ethers.Interface(INSTALL_PLUGIN_ABI)
    const installPluginCalldata = installPluginIface.encodeFunctionData('installPlugin', [
      SESSION_KEY_PLUGIN,
      manifestHash,
      pluginInstallData,
      [dependency0, dependency1]
    ])

    // Get init code if account not deployed
    let initCode = '0x'
    if (!isDeployed) {
      const dummyKey = '0x0000000000000000000000000000000000000000000000000000000000000001'
      const dummySigner = new LocalAccountSigner(privateKeyToAccount(dummyKey))
      const account = await createMultiOwnerModularAccount({
        transport: http(config.blockchain.rpcUrl),
        chain: mainnetFork,
        signer: dummySigner,
        owners: [ownerAddress],
      })
      initCode = await account.getInitCode()
    }

    const nonce = await this.entryPoint.getNonce(accountAddress, 0)

    const userOp = {
      sender: accountAddress,
      nonce: nonce.toString(),
      initCode,
      callData: installPluginCalldata,
      callGasLimit: '3000000',
      verificationGasLimit: isDeployed ? '500000' : '3000000',
      preVerificationGas: '150000',
      maxFeePerGas: '2000000000',
      maxPriorityFeePerGas: '1000000000',
      paymasterAndData: PAYMASTER_V06,
    }

    // Compute the hash that needs to be signed
    const userOpForHash = {
      ...userOp,
      nonce: BigInt(userOp.nonce),
      callGasLimit: BigInt(userOp.callGasLimit),
      verificationGasLimit: BigInt(userOp.verificationGasLimit),
      preVerificationGas: BigInt(userOp.preVerificationGas),
      maxFeePerGas: BigInt(userOp.maxFeePerGas),
      maxPriorityFeePerGas: BigInt(userOp.maxPriorityFeePerGas),
    }
    const userOpHash = computeUserOpHashV06(userOpForHash, ENTRYPOINT_V06, 1n)

    return {
      userOp,
      userOpHash,
      needsDeploy: !isDeployed
    }
  }

  /**
   * Submit a pre-built UserOp with user's signature
   * @param {Object} userOp - The UserOp object (stored from buildSessionKeyRegistrationUserOp)
   * @param {string} signature - The user's signature
   */
  async submitSignedUserOp(userOp, signature) {
    // Convert string values to BigInt for ethers
    const signedUserOp = {
      sender: userOp.sender,
      nonce: BigInt(userOp.nonce),
      initCode: userOp.initCode,
      callData: userOp.callData,
      callGasLimit: BigInt(userOp.callGasLimit),
      verificationGasLimit: BigInt(userOp.verificationGasLimit),
      preVerificationGas: BigInt(userOp.preVerificationGas),
      maxFeePerGas: BigInt(userOp.maxFeePerGas),
      maxPriorityFeePerGas: BigInt(userOp.maxPriorityFeePerGas),
      paymasterAndData: userOp.paymasterAndData,
      signature
    }

    logger.info(`Submitting signed UserOp for account ${userOp.sender}`)

    // Submit to EntryPoint
    const gas = await this.entryPoint.handleOps.estimateGas([signedUserOp], this.executorWallet.address)
    const tx = await this.entryPoint.connect(this.executorWallet).handleOps(
      [signedUserOp],
      this.executorWallet.address,
      { gasLimit: gas * 2n }
    )
    const receipt = await tx.wait()

    logger.info(`UserOp submitted, tx: ${receipt.hash}`)

    return {
      success: true,
      txHash: receipt.hash
    }
  }

  /**
   * Submit signed session key registration UserOp (DEPRECATED - use submitSignedUserOp instead)
   */
  async submitSessionKeyRegistration(accountAddress, ownerAddress, sessionKeyAddress, expiresAt, signature) {
    // Rebuild the UserOp (or we could cache it)
    const { userOp } = await this.buildSessionKeyRegistrationUserOp(
      accountAddress,
      ownerAddress,
      sessionKeyAddress,
      expiresAt
    )

    // Add signature
    const signedUserOp = {
      ...userOp,
      nonce: BigInt(userOp.nonce),
      callGasLimit: BigInt(userOp.callGasLimit),
      verificationGasLimit: BigInt(userOp.verificationGasLimit),
      preVerificationGas: BigInt(userOp.preVerificationGas),
      maxFeePerGas: BigInt(userOp.maxFeePerGas),
      maxPriorityFeePerGas: BigInt(userOp.maxPriorityFeePerGas),
      signature
    }

    // Submit to EntryPoint
    const gas = await this.entryPoint.handleOps.estimateGas([signedUserOp], this.executorWallet.address)
    const tx = await this.entryPoint.connect(this.executorWallet).handleOps(
      [signedUserOp],
      this.executorWallet.address,
      { gasLimit: gas * 2n }
    )
    const receipt = await tx.wait()

    // Verify installation
    const isNowRegistered = await this.sessionKeyPlugin.isSessionKeyOf(accountAddress, sessionKeyAddress)

    logger.info(`Session key registration: ${isNowRegistered ? 'SUCCESS' : 'FAILED'}, tx: ${receipt.hash}`)

    return {
      success: isNowRegistered,
      txHash: receipt.hash
    }
  }

  /**
   * Deploy the smart account via UserOp
   */
  async deploySmartAccount(ownerPrivateKey) {
    const owner = privateKeyToAccount(ownerPrivateKey)
    const ownerSigner = new LocalAccountSigner(owner)

    const account = await createMultiOwnerModularAccount({
      transport: http(config.blockchain.rpcUrl),
      chain: mainnetFork,
      signer: ownerSigner,
      owners: [owner.address],
    })

    const accountAddress = account.address

    // Check if already deployed
    const code = await this.provider.getCode(accountAddress)
    if (code !== '0x') {
      logger.info(`Account already deployed: ${accountAddress}`)
      return { address: accountAddress, deployed: true, txHash: null }
    }

    // Get init code
    const initCode = await account.getInitCode()
    const nonce = await this.entryPoint.getNonce(accountAddress, 0)

    // Simple deploy calldata
    const deployCalldata = await account.encodeExecute({
      target: '0x0000000000000000000000000000000000000001',
      value: 1n,
      data: '0x'
    })

    const deployOp = {
      sender: accountAddress,
      nonce,
      initCode,
      callData: deployCalldata,
      callGasLimit: 200000n,
      verificationGasLimit: 3000000n,
      preVerificationGas: 150000n,
      maxFeePerGas: 2000000000n,
      maxPriorityFeePerGas: 1000000000n,
      paymasterAndData: PAYMASTER_V06,
      signature: '0x'
    }

    // Sign with owner
    const opHash = computeUserOpHashV06(deployOp, ENTRYPOINT_V06, 1n)
    deployOp.signature = await owner.signMessage({ message: { raw: ethers.getBytes(opHash) } })

    // Submit
    const gas = await this.entryPoint.handleOps.estimateGas([deployOp], this.executorWallet.address)
    const tx = await this.entryPoint.connect(this.executorWallet).handleOps(
      [deployOp],
      this.executorWallet.address,
      { gasLimit: gas * 2n }
    )
    const receipt = await tx.wait()

    logger.info(`Account deployed: ${accountAddress}, tx: ${receipt.hash}`)

    return { address: accountAddress, deployed: true, txHash: receipt.hash }
  }

  /**
   * Install Session Key Plugin with DeFi permissions
   */
  async installSessionKeyPlugin(ownerPrivateKey, accountAddress) {
    const owner = privateKeyToAccount(ownerPrivateKey)
    const ownerSigner = new LocalAccountSigner(owner)

    // Check if plugin already installed
    const isRegistered = await this.sessionKeyPlugin.isSessionKeyOf(accountAddress, this.backendSessionKey.address)
    if (isRegistered) {
      logger.info(`Session key already installed for ${accountAddress}`)
      return {
        installed: true,
        sessionKeyAddress: this.backendSessionKey.address,
        alreadyInstalled: true
      }
    }

    const account = await createMultiOwnerModularAccount({
      transport: http(config.blockchain.rpcUrl),
      chain: mainnetFork,
      signer: ownerSigner,
      owners: [owner.address],
    })

    // Build DeFi permissions - allow all DeFi contracts
    const permissions = new SessionKeyPermissionsBuilder()
      .setContractAccessControlType(SessionKeyAccessListType.ALLOWLIST)
      .addContractAddressAccessEntry({ contractAddress: SWITCHER, isOnList: true, checkSelectors: false })
      .addContractAddressAccessEntry({ contractAddress: USDC_COMET, isOnList: true, checkSelectors: false })
      .addContractAddressAccessEntry({ contractAddress: WETH_COMET, isOnList: true, checkSelectors: false })
      .addContractAddressAccessEntry({ contractAddress: WBTC, isOnList: true, checkSelectors: false })
      .addContractAddressAccessEntry({ contractAddress: USDC, isOnList: true, checkSelectors: false })
      .addContractAddressAccessEntry({ contractAddress: WETH, isOnList: true, checkSelectors: false })
      .setTimeRange({
        validFrom: Math.floor(Date.now() / 1000) - 60,
        validUntil: Math.floor(Date.now() / 1000) + 86400 * 30  // 30 days
      })
      .encode()

    const sessionKeyTag = keccak256(toHex('defi-backend-production'))

    // Build plugin install data
    const pluginInstallData = encodeAbiParameters(
      [{ type: 'address[]' }, { type: 'bytes32[]' }, { type: 'bytes[][]' }],
      [[this.backendSessionKey.address], [sessionKeyTag], [permissions]]
    )

    // Get manifest hash
    const rawManifestData = await this.provider.call({
      to: SESSION_KEY_PLUGIN,
      data: '0xc7763130' // pluginManifest()
    })
    const manifestHash = ethers.keccak256(rawManifestData)

    // Build dependencies
    const dependency0 = encodePacked(['address', 'uint8'], [MULTI_OWNER_PLUGIN, 0x0])
    const dependency1 = encodePacked(['address', 'uint8'], [MULTI_OWNER_PLUGIN, 0x1])

    // Build installPlugin calldata
    const installPluginIface = new ethers.Interface(INSTALL_PLUGIN_ABI)
    const installPluginCalldata = installPluginIface.encodeFunctionData('installPlugin', [
      SESSION_KEY_PLUGIN,
      manifestHash,
      pluginInstallData,
      [dependency0, dependency1]
    ])

    const nonce = await this.entryPoint.getNonce(accountAddress, 0)
    const installOp = {
      sender: accountAddress,
      nonce,
      initCode: '0x',
      callData: installPluginCalldata,
      callGasLimit: 3000000n,
      verificationGasLimit: 500000n,
      preVerificationGas: 100000n,
      maxFeePerGas: 2000000000n,
      maxPriorityFeePerGas: 1000000000n,
      paymasterAndData: PAYMASTER_V06,
      signature: '0x'
    }

    const opHash = computeUserOpHashV06(installOp, ENTRYPOINT_V06, 1n)
    installOp.signature = await owner.signMessage({ message: { raw: ethers.getBytes(opHash) } })

    const gas = await this.entryPoint.handleOps.estimateGas([installOp], this.executorWallet.address)
    const tx = await this.entryPoint.connect(this.executorWallet).handleOps(
      [installOp],
      this.executorWallet.address,
      { gasLimit: gas * 2n }
    )
    const receipt = await tx.wait()

    // Verify installation
    const isNowRegistered = await this.sessionKeyPlugin.isSessionKeyOf(accountAddress, this.backendSessionKey.address)

    logger.info(`Session key plugin installed: ${isNowRegistered}, tx: ${receipt.hash}`)

    return {
      installed: isNowRegistered,
      sessionKeyAddress: this.backendSessionKey.address,
      txHash: receipt.hash,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    }
  }

  /**
   * Check if an account is deployed
   */
  async isAccountDeployed(address) {
    const code = await this.provider.getCode(address)
    return code !== '0x'
  }

  /**
   * Check if session key is registered
   */
  async isSessionKeyRegistered(accountAddress, sessionKeyAddress) {
    if (!sessionKeyAddress) {
      logger.warn('No session key address provided')
      return false
    }
    return await this.sessionKeyPlugin.isSessionKeyOf(accountAddress, sessionKeyAddress)
  }

  /**
   * Get account status
   */
  async getAccountStatus(accountAddress, sessionKeyAddress = null) {
    const deployed = await this.isAccountDeployed(accountAddress)
    const hasSessionKey = deployed && sessionKeyAddress
      ? await this.isSessionKeyRegistered(accountAddress, sessionKeyAddress)
      : false

    // Check switcher authorization
    let switcherAuthorized = false
    if (deployed) {
      try {
        const switcher = new ethers.Contract(SWITCHER, SWITCHER_ABI, this.provider)
        switcherAuthorized = await switcher.authorizedCallers(accountAddress)
      } catch (e) {
        logger.warn('Error checking switcher authorization:', e.message)
      }
    }

    return {
      address: accountAddress,
      deployed,
      hasSessionKey,
      sessionKeyAddress,
      switcherAuthorized,
      entryPoint: ENTRYPOINT_V06,
      paymaster: PAYMASTER_V06
    }
  }

  /**
   * Get token balances for an account
   */
  async getBalances(accountAddress) {
    const tokens = [
      { address: WBTC, symbol: 'WBTC', decimals: 8 },
      { address: USDC, symbol: 'USDC', decimals: 6 },
      { address: WETH, symbol: 'WETH', decimals: 18 },
    ]

    const balances = {}

    // ETH balance
    try {
      const ethBalance = await this.provider.getBalance(accountAddress)
      balances.eth = ethBalance.toString()
      balances.ETH = {
        symbol: 'ETH',
        balance: ethBalance.toString(),
        decimals: 18,
        formatted: ethers.formatEther(ethBalance)
      }
    } catch (e) {
      logger.warn('Error getting ETH balance:', e.message)
      balances.eth = '0'
    }

    // Token balances
    for (const token of tokens) {
      try {
        // Skip if address is missing or invalid
        if (!token.address || token.address === 'undefined') {
          logger.warn(`Missing address for ${token.symbol}`)
          continue
        }

        // Ensure proper checksum
        const checksumAddress = ethers.getAddress(token.address)
        const contract = new ethers.Contract(checksumAddress, ERC20_ABI, this.provider)
        const balance = await contract.balanceOf(accountAddress)

        // Add both lowercase key and full object for frontend compatibility
        balances[token.symbol.toLowerCase()] = balance.toString()
        balances[token.symbol] = {
          symbol: token.symbol,
          address: checksumAddress,
          balance: balance.toString(),
          decimals: token.decimals,
          formatted: ethers.formatUnits(balance, token.decimals)
        }
      } catch (e) {
        logger.warn(`Error getting ${token.symbol} balance:`, e.message)
        balances[token.symbol.toLowerCase()] = '0'
      }
    }

    return balances
  }

  /**
   * Get Compound V3 positions
   */
  async getPositions(accountAddress) {
    const positions = {
      USDC: null,
      WETH: null
    }

    // USDC Comet position
    try {
      const usdcComet = new ethers.Contract(USDC_COMET, COMET_ABI, this.provider)
      const collateral = await usdcComet.collateralBalanceOf(accountAddress, WBTC)
      const borrowed = await usdcComet.borrowBalanceOf(accountAddress)
      const isAllowed = await usdcComet.isAllowed(accountAddress, SWITCHER)

      positions.USDC = {
        comet: USDC_COMET,
        cometName: 'USDC Comet',
        collateral: {
          asset: 'WBTC',
          address: WBTC,
          balance: collateral.toString(),
          formatted: ethers.formatUnits(collateral, 8)
        },
        borrowed: {
          asset: 'USDC',
          balance: borrowed.toString(),
          formatted: ethers.formatUnits(borrowed, 6)
        },
        switcherAllowed: isAllowed
      }
    } catch (e) {
      logger.warn('Error getting USDC Comet position:', e.message)
    }

    // WETH Comet position
    try {
      const wethComet = new ethers.Contract(WETH_COMET, COMET_ABI, this.provider)
      const collateral = await wethComet.collateralBalanceOf(accountAddress, WBTC)
      const borrowed = await wethComet.borrowBalanceOf(accountAddress)
      const isAllowed = await wethComet.isAllowed(accountAddress, SWITCHER)

      positions.WETH = {
        comet: WETH_COMET,
        cometName: 'WETH Comet',
        collateral: {
          asset: 'WBTC',
          address: WBTC,
          balance: collateral.toString(),
          formatted: ethers.formatUnits(collateral, 8)
        },
        borrowed: {
          asset: 'WETH',
          balance: borrowed.toString(),
          formatted: ethers.formatUnits(borrowed, 18)
        },
        switcherAllowed: isAllowed
      }
    } catch (e) {
      logger.warn('Error getting WETH Comet position:', e.message)
    }

    return positions
  }

  /**
   * Execute a transaction using session key
   * @param {string} accountAddress - Smart account address
   * @param {Array} calls - Array of {target, value, data} calls
   * @param {string} sessionKeyPrivate - Per-user session key private key (from encrypted DB storage)
   */
  async executeWithSessionKey(accountAddress, calls, sessionKeyPrivate) {
    if (!sessionKeyPrivate) {
      throw new Error('Session key private key is required')
    }

    const sessionKey = privateKeyToAccount(sessionKeyPrivate)
    const executeIface = new ethers.Interface(EXECUTE_WITH_SESSION_KEY_ABI)

    const sessionCalldata = executeIface.encodeFunctionData('executeWithSessionKey', [
      calls.map(call => ({
        target: call.target,
        value: BigInt(call.value || 0),
        data: call.data
      })),
      sessionKey.address
    ])

    const nonce = await this.entryPoint.getNonce(accountAddress, 0)
    const userOp = {
      sender: accountAddress,
      nonce,
      initCode: '0x',
      callData: sessionCalldata,
      callGasLimit: 5000000n,
      verificationGasLimit: 500000n,
      preVerificationGas: 100000n,
      maxFeePerGas: 2000000000n,
      maxPriorityFeePerGas: 1000000000n,
      paymasterAndData: PAYMASTER_V06,
      signature: '0x'
    }

    const opHash = computeUserOpHashV06(userOp, ENTRYPOINT_V06, 1n)
    userOp.signature = await sessionKey.signMessage({ message: { raw: ethers.getBytes(opHash) } })

    const gas = await this.entryPoint.handleOps.estimateGas([userOp], this.executorWallet.address)
    const tx = await this.entryPoint.connect(this.executorWallet).handleOps(
      [userOp],
      this.executorWallet.address,
      { gasLimit: gas * 2n }
    )
    const receipt = await tx.wait()

    // Check for UserOperationEvent
    const userOpEventIface = new ethers.Interface([
      'event UserOperationEvent(bytes32 indexed userOpHash, address indexed sender, address indexed paymaster, uint256 nonce, bool success, uint256 actualGasCost, uint256 actualGasUsed)'
    ])

    let success = false
    let gasUsed = 0n
    for (const log of receipt.logs) {
      try {
        const parsed = userOpEventIface.parseLog({ topics: log.topics, data: log.data })
        if (parsed?.name === 'UserOperationEvent') {
          success = parsed.args.success
          gasUsed = parsed.args.actualGasUsed
        }
      } catch (e) {}
    }

    return {
      success,
      txHash: receipt.hash,
      userOpHash: opHash,
      gasUsed: gasUsed.toString()
    }
  }

  /**
   * Check if account is authorized on Switcher
   */
  async isAccountAuthorizedOnSwitcher(accountAddress) {
    const switcher = new ethers.Contract(SWITCHER, SWITCHER_ABI, this.provider)
    return await switcher.authorizedCallers(accountAddress)
  }

  /**
   * Authorize account on Switcher (requires deployer/owner key)
   */
  async authorizeAccountOnSwitcher(accountAddress) {
    const switcher = new ethers.Contract(SWITCHER, SWITCHER_ABI, this.provider)
    const owner = await switcher.owner()

    // Check if deployer is the owner
    if (this.executorWallet.address.toLowerCase() !== owner.toLowerCase()) {
      // Try using Tenderly storage override
      try {
        // authorizedCallers mapping is at slot 0
        const slot = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(['address', 'uint256'], [accountAddress, 0]))
        await this.provider.send('tenderly_setStorageAt', [SWITCHER, slot, '0x0000000000000000000000000000000000000000000000000000000000000001'])
        logger.info(`Authorized ${accountAddress} on Switcher via Tenderly storage override`)
        return { success: true, method: 'tenderly_storage' }
      } catch (e) {
        logger.error('Failed to authorize via Tenderly:', e.message)
        throw new Error('Deployer is not Switcher owner and Tenderly override failed')
      }
    }

    // Deployer is the owner, call authorizeCaller directly
    const tx = await new ethers.Contract(SWITCHER, SWITCHER_ABI, this.executorWallet).authorizeCaller(accountAddress, true)
    await tx.wait()
    logger.info(`Authorized ${accountAddress} on Switcher via owner call`)
    return { success: true, method: 'owner_call', txHash: tx.hash }
  }

  /**
   * Check if Switcher is allowed on a Comet for an account
   */
  async isSwitcherAllowedOnComet(accountAddress, cometAddress) {
    const comet = new ethers.Contract(cometAddress, COMET_ABI, this.provider)
    return await comet.isAllowed(accountAddress, SWITCHER)
  }

  /**
   * Allow Switcher on both Comets via session key
   */
  async allowSwitcherOnComets(accountAddress, sessionKeyPrivate) {
    const cometIface = new ethers.Interface(COMET_ABI)

    const calls = [
      {
        target: USDC_COMET,
        value: 0n,
        data: cometIface.encodeFunctionData('allow', [SWITCHER, true])
      },
      {
        target: WETH_COMET,
        value: 0n,
        data: cometIface.encodeFunctionData('allow', [SWITCHER, true])
      }
    ]

    logger.info(`Allowing Switcher on both Comets for ${accountAddress}`)
    return await this.executeWithSessionKey(accountAddress, calls, sessionKeyPrivate)
  }

  /**
   * Execute cross-Comet switch via session key
   * Includes setup steps: authorize on Switcher + allow on Comets
   * @param {string} sessionKeyPrivate - Per-user session key (from encrypted DB)
   */
  async executeCrossSwitch(accountAddress, sourceComet, targetComet, collateralAmount, borrowAmount, sessionKeyPrivate) {
    logger.info(`Executing cross-Comet switch for ${accountAddress}`)
    logger.info(`  Source: ${sourceComet}`)
    logger.info(`  Target: ${targetComet}`)
    logger.info(`  Collateral: ${collateralAmount}`)

    if (!sessionKeyPrivate) {
      throw new Error('Session key private key is required')
    }

    // Step 1: Check and setup Switcher authorization
    const isAuthorized = await this.isAccountAuthorizedOnSwitcher(accountAddress)
    if (!isAuthorized) {
      logger.info('Account not authorized on Switcher, authorizing...')
      await this.authorizeAccountOnSwitcher(accountAddress)
    } else {
      logger.info('Account already authorized on Switcher')
    }

    // Step 2: Check and setup Comet allowances
    const [usdcAllowed, wethAllowed] = await Promise.all([
      this.isSwitcherAllowedOnComet(accountAddress, USDC_COMET),
      this.isSwitcherAllowedOnComet(accountAddress, WETH_COMET)
    ])

    if (!usdcAllowed || !wethAllowed) {
      logger.info(`Setting up Comet allowances (USDC: ${usdcAllowed}, WETH: ${wethAllowed})`)
      const allowResult = await this.allowSwitcherOnComets(accountAddress, sessionKeyPrivate)
      if (!allowResult.success) {
        logger.error('Failed to allow Switcher on Comets')
        return { success: false, error: 'Failed to setup Comet allowances' }
      }
    } else {
      logger.info('Switcher already allowed on both Comets')
    }

    // Step 3: Execute the switch
    const switcherIface = new ethers.Interface(SWITCHER_ABI)

    const switchCalldata = switcherIface.encodeFunctionData('switchCollateral', [
      accountAddress,
      sourceComet,
      targetComet,
      WBTC,
      BigInt(collateralAmount),
      BigInt(borrowAmount),
      0n // minOutputAmount
    ])

    const result = await this.executeWithSessionKey(accountAddress, [{
      target: SWITCHER,
      value: 0n,
      data: switchCalldata
    }], sessionKeyPrivate)

    logger.info(`Switch result: ${result.success ? 'SUCCESS' : 'FAILED'}, tx: ${result.txHash}`)

    return result
  }

  /**
   * Fund an address with test tokens via Tenderly's setErc20Balance
   * This is only for testing on Tenderly Virtual Testnet
   */
  async fundWithTenderly(address, tokens = ['WBTC', 'USDC', 'WETH']) {
    const results = {}

    logger.info(`Starting Tenderly funding for address: ${address}`)

    // First fund with ETH for gas (using tenderly_setBalance)
    try {
      const ethAmount = ethers.parseEther('10') // 10 ETH
      const ethHex = '0x' + ethAmount.toString(16)

      logger.info(`Setting ETH balance: ${ethHex} for ${address}`)

      // Try array format first (Tenderly Virtual TestNet format)
      await this.provider.send('tenderly_setBalance', [
        [address],
        ethHex
      ])

      // Verify the balance was set
      const newEthBalance = await this.provider.getBalance(address)
      logger.info(`ETH balance after funding: ${ethers.formatEther(newEthBalance)}`)

      results.ETH = {
        success: true,
        amount: '10',
        balance: newEthBalance.toString()
      }
    } catch (error) {
      logger.error('Failed to fund ETH with array format, trying single address:', error.message)

      // Try single address format as fallback
      try {
        const ethAmount = ethers.parseEther('10')
        const ethHex = '0x' + ethAmount.toString(16)
        await this.provider.send('tenderly_setBalance', [address, ethHex])

        const newEthBalance = await this.provider.getBalance(address)
        logger.info(`ETH balance after funding (fallback): ${ethers.formatEther(newEthBalance)}`)

        results.ETH = {
          success: true,
          amount: '10',
          balance: newEthBalance.toString()
        }
      } catch (error2) {
        logger.error('Failed to fund ETH (both formats):', error2.message)
        results.ETH = {
          success: false,
          error: error2.message
        }
      }
    }

    // Fund ERC20 tokens
    for (const tokenSymbol of tokens) {
      const token = TOKENS[tokenSymbol]
      if (!token || !token.address) {
        logger.warn(`Unknown token or missing address: ${tokenSymbol}`)
        continue
      }

      try {
        const amount = ethers.parseUnits(token.defaultAmount, token.decimals)
        const amountHex = '0x' + amount.toString(16)

        logger.info(`Setting ${tokenSymbol} balance: ${amountHex} (${token.defaultAmount}) for ${address}`)
        logger.info(`Token address: ${token.address}`)

        // Try array format first (Tenderly Virtual TestNet format)
        await this.provider.send('tenderly_setErc20Balance', [
          token.address,
          [address],
          amountHex
        ])

        // Verify the balance was set
        const tokenContract = new ethers.Contract(token.address, ERC20_ABI, this.provider)
        const newBalance = await tokenContract.balanceOf(address)
        logger.info(`${tokenSymbol} balance after funding: ${ethers.formatUnits(newBalance, token.decimals)}`)

        results[tokenSymbol] = {
          success: true,
          amount: token.defaultAmount,
          balance: newBalance.toString()
        }
      } catch (error) {
        logger.error(`Failed to fund ${tokenSymbol} with array format:`, error.message)

        // Try single address format as fallback
        try {
          const amount = ethers.parseUnits(token.defaultAmount, token.decimals)
          const amountHex = '0x' + amount.toString(16)

          await this.provider.send('tenderly_setErc20Balance', [
            token.address,
            address,
            amountHex
          ])

          const tokenContract = new ethers.Contract(token.address, ERC20_ABI, this.provider)
          const newBalance = await tokenContract.balanceOf(address)
          logger.info(`${tokenSymbol} balance after funding (fallback): ${ethers.formatUnits(newBalance, token.decimals)}`)

          results[tokenSymbol] = {
            success: true,
            amount: token.defaultAmount,
            balance: newBalance.toString()
          }
        } catch (error2) {
          logger.error(`Failed to fund ${tokenSymbol} (both formats):`, error2.message)
          results[tokenSymbol] = {
            success: false,
            error: error2.message
          }
        }
      }
    }

    logger.info('Funding complete. Results:', JSON.stringify(results, null, 2))
    return results
  }

  /**
   * Approve smart account to spend EOA's tokens (infinite approval)
   * Uses the owner's private key (which controls the EOA that was funded)
   */
  async approveSmartAccountForTokens(ownerPrivateKey, smartAccountAddress, tokenSymbols = ['WBTC', 'USDC']) {
    const owner = new ethers.Wallet(ownerPrivateKey, this.provider)
    const results = {}

    logger.info(`Setting up approvals from EOA ${owner.address} to Smart Account ${smartAccountAddress}`)

    for (const tokenSymbol of tokenSymbols) {
      const token = TOKENS[tokenSymbol]
      if (!token || !token.address) {
        logger.warn(`Unknown token: ${tokenSymbol}`)
        continue
      }

      try {
        const tokenContract = new ethers.Contract(token.address, [
          'function approve(address spender, uint256 amount) returns (bool)',
          'function allowance(address owner, address spender) view returns (uint256)',
        ], owner)

        // Check current allowance
        const currentAllowance = await tokenContract.allowance(owner.address, smartAccountAddress)
        const maxUint = ethers.MaxUint256

        if (currentAllowance >= maxUint / 2n) {
          logger.info(`${tokenSymbol} already approved for smart account`)
          results[tokenSymbol] = {
            success: true,
            alreadyApproved: true
          }
          continue
        }

        // Approve infinite
        const tx = await tokenContract.approve(smartAccountAddress, maxUint)
        const receipt = await tx.wait()

        logger.info(`Approved ${tokenSymbol} for smart account: ${smartAccountAddress}, tx: ${receipt.hash}`)
        results[tokenSymbol] = {
          success: true,
          txHash: receipt.hash
        }
      } catch (error) {
        logger.error(`Failed to approve ${tokenSymbol}:`, error.message)
        results[tokenSymbol] = {
          success: false,
          error: error.message
        }
      }
    }

    return results
  }

  /**
   * Pull tokens from EOA to Smart Account using session key
   * Smart account executes transferFrom on the token contract
   * Requires prior approval from EOA
   */
  async pullTokensFromEOA(smartAccountAddress, eoaAddress, tokenSymbol, amount) {
    const token = TOKENS[tokenSymbol]
    if (!token || !token.address) {
      throw new Error(`Unknown token: ${tokenSymbol}`)
    }

    const amountWei = ethers.parseUnits(amount.toString(), token.decimals)

    // First check allowance
    const tokenContract = new ethers.Contract(token.address, [
      'function allowance(address owner, address spender) view returns (uint256)',
      'function balanceOf(address) view returns (uint256)',
    ], this.provider)

    const allowance = await tokenContract.allowance(eoaAddress, smartAccountAddress)
    if (allowance < amountWei) {
      throw new Error(`Insufficient allowance for ${tokenSymbol}. EOA needs to approve smart account first.`)
    }

    const balance = await tokenContract.balanceOf(eoaAddress)
    if (balance < amountWei) {
      throw new Error(`Insufficient ${tokenSymbol} balance in EOA: ${ethers.formatUnits(balance, token.decimals)} < ${amount}`)
    }

    const transferFromIface = new ethers.Interface([
      'function transferFrom(address from, address to, uint256 amount) returns (bool)'
    ])

    const calls = [{
      target: token.address,
      value: 0n,
      data: transferFromIface.encodeFunctionData('transferFrom', [
        eoaAddress,
        smartAccountAddress,
        amountWei
      ])
    }]

    logger.info(`Pulling ${amount} ${tokenSymbol} from EOA ${eoaAddress} to Smart Account ${smartAccountAddress}`)

    const result = await this.executeWithSessionKey(smartAccountAddress, calls)

    return {
      ...result,
      amount,
      tokenSymbol,
      from: eoaAddress,
      to: smartAccountAddress
    }
  }

  /**
   * Get the EOA address derived from the owner private key
   */
  getOwnerAddress(ownerPrivateKey) {
    const owner = new ethers.Wallet(ownerPrivateKey)
    return owner.address
  }
}

module.exports = new ERC4337Service()
