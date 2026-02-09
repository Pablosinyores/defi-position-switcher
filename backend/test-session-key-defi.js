/**
 * ERC-4337 Session Key + DeFi Switcher E2E Test
 *
 * Tests the complete flow:
 * 1. Deploy MultiOwnerModularAccount
 * 2. Install Session Key Plugin with DeFi permissions
 * 3. Setup collateral position in USDC Comet
 * 4. Use session key to execute cross-Comet switch via Switcher
 */
require('dotenv').config({ path: __dirname + '/.env' })
const { ethers } = require('ethers')
const {
  createMultiOwnerModularAccount,
  SessionKeyPermissionsBuilder,
  SessionKeyAccessListType,
} = require('@alchemy/aa-accounts')
const { LocalAccountSigner } = require('@alchemy/aa-core')
const { http, keccak256, toHex, encodeAbiParameters, encodePacked } = require('viem')
const { privateKeyToAccount, generatePrivateKey } = require('viem/accounts')
const { mainnet } = require('viem/chains')

// Mainnet fork config
const mainnetFork = {
  ...mainnet,
  id: 1,
  name: 'Mainnet Fork',
  rpcUrls: {
    default: { http: [process.env.RPC_URL] },
    public: { http: [process.env.RPC_URL] }
  }
}

// Addresses
const ENTRYPOINT_V06 = '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789'
const PAYMASTER_V06 = process.env.PAYMASTER_V06_ADDRESS
const SESSION_KEY_PLUGIN = '0x0000003E0000a96de4058e1E02a62FaaeCf23d8d'
const MULTI_OWNER_PLUGIN = '0xcE0000007B008F50d762D155002600004cD6c647'

// DeFi Addresses
const SWITCHER = process.env.SWITCHER_ADDRESS
const USDC_COMET = process.env.USDC_COMET_ADDRESS
const WETH_COMET = process.env.WETH_COMET_ADDRESS
const WBTC = process.env.WBTC_ADDRESS
const USDC = process.env.USDC_ADDRESS

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
]

const COMET_ABI = [
  'function supply(address asset, uint256 amount) external',
  'function withdraw(address asset, uint256 amount) external',
  'function borrowBalanceOf(address account) view returns (uint256)',
  'function collateralBalanceOf(address account, address asset) view returns (uint128)',
  'function allow(address manager, bool isAllowed) external',
]

const SWITCHER_ABI = [
  'function switchCollateral(address user, address sourceComet, address targetComet, address collateralAsset, uint256 collateralAmount, uint256 borrowAmount, uint256 minOutputAmount) external',
]

// v0.6.0 UserOp hash computation
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

async function testSessionKeyDeFi() {
  console.log('\n╔════════════════════════════════════════════════════════════╗')
  console.log('║  ERC-4337 Session Key + DeFi Switcher E2E Test            ║')
  console.log('╚════════════════════════════════════════════════════════════╝\n')

  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL)

  // Create a fresh executor to avoid nonce issues
  const executorWallet = ethers.Wallet.createRandom().connect(provider)
  // Try Tenderly first, then Anvil for balance setting
  try {
    await provider.send('tenderly_setBalance', [[executorWallet.address], '0x56BC75E2D63100000'])
  } catch (e) {
    await provider.send('anvil_setBalance', [executorWallet.address, '0x56BC75E2D63100000'])
  }
  console.log('Executor:', executorWallet.address)

  let executorNonce = 0
  const executor = executorWallet
  const entryPoint = new ethers.Contract(ENTRYPOINT_V06, ENTRYPOINT_V06_ABI, executor)
  const sessionKeyPlugin = new ethers.Contract(SESSION_KEY_PLUGIN, SESSION_KEY_PLUGIN_ABI, provider)

  console.log('Config:')
  console.log('  EntryPoint:', ENTRYPOINT_V06)
  console.log('  Paymaster:', PAYMASTER_V06)
  console.log('  Switcher:', SWITCHER)
  console.log('')

  // Step 1: Create signers
  console.log('Step 1: Creating signers...')
  const ownerKey = generatePrivateKey()
  const owner = privateKeyToAccount(ownerKey)
  const ownerSigner = new LocalAccountSigner(owner)
  const sessionKey = privateKeyToAccount(process.env.SESSION_KEY_PRIVATE_KEY)
  console.log('  Owner:', owner.address)
  console.log('  Session Key:', sessionKey.address)

  // Step 2: Create the account
  console.log('\nStep 2: Creating ModularAccount...')
  const account = await createMultiOwnerModularAccount({
    transport: http(process.env.RPC_URL),
    chain: mainnetFork,
    signer: ownerSigner,
    owners: [owner.address],
  })

  const accountAddress = account.address
  console.log('  Account:', accountAddress)

  // Fund the account with ETH
  try {
    await provider.send('tenderly_setBalance', [[accountAddress], '0x1BC16D674EC80000']) // 2 ETH
  } catch (e) {
    await provider.send('anvil_setBalance', [accountAddress, '0x1BC16D674EC80000'])
  }

  // Step 3: Deploy account
  console.log('\nStep 3: Deploying account...')
  const initCode = await account.getInitCode()
  const nonce0 = await entryPoint.getNonce(accountAddress, 0)
  const deployCalldata = await account.encodeExecute({
    target: '0x0000000000000000000000000000000000000001',
    value: 1n,
    data: '0x'
  })

  const deployOp = {
    sender: accountAddress,
    nonce: nonce0,
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

  const deployHash = computeUserOpHashV06(deployOp, ENTRYPOINT_V06, 1n)
  deployOp.signature = await owner.signMessage({ message: { raw: ethers.getBytes(deployHash) } })
  const deployGas = await entryPoint.handleOps.estimateGas([deployOp], executor.address)
  await (await entryPoint.handleOps([deployOp], executor.address, { gasLimit: deployGas * 2n, nonce: executorNonce++ })).wait()
  console.log('  Account deployed!')

  // Step 4: Install Session Key Plugin with DeFi permissions
  console.log('\nStep 4: Installing Session Key Plugin with DeFi permissions...')

  // Build permissions that allow:
  // - Switcher contract (for switchCollateral)
  // - USDC Comet (for supply, withdraw, allow)
  // - WETH Comet (for supply, withdraw, allow)
  // - WBTC (for approve)
  const permissions = new SessionKeyPermissionsBuilder()
    .setContractAccessControlType(SessionKeyAccessListType.ALLOWLIST)
    .addContractAddressAccessEntry({ contractAddress: SWITCHER, isOnList: true, checkSelectors: false })
    .addContractAddressAccessEntry({ contractAddress: USDC_COMET, isOnList: true, checkSelectors: false })
    .addContractAddressAccessEntry({ contractAddress: WETH_COMET, isOnList: true, checkSelectors: false })
    .addContractAddressAccessEntry({ contractAddress: WBTC, isOnList: true, checkSelectors: false })
    .setTimeRange({
      validFrom: Math.floor(Date.now() / 1000) - 60,
      validUntil: Math.floor(Date.now() / 1000) + 86400 * 7  // 7 days
    })
    .encode()

  const sessionKeyTag = keccak256(toHex('defi-backend-v1'))
  console.log('  Permissions: ALLOWLIST for Switcher, Comets, WBTC')

  // Build plugin install data
  const pluginInstallData = encodeAbiParameters(
    [
      { type: 'address[]' },
      { type: 'bytes32[]' },
      { type: 'bytes[][]' }
    ],
    [
      [sessionKey.address],
      [sessionKeyTag],
      [permissions]
    ]
  )

  // Get manifest hash
  const pluginManifestSelector = '0xc7763130'
  const rawManifestData = await provider.call({
    to: SESSION_KEY_PLUGIN,
    data: pluginManifestSelector
  })
  const manifestHash = ethers.keccak256(rawManifestData)

  // Build dependencies
  const dependency0 = encodePacked(['address', 'uint8'], [MULTI_OWNER_PLUGIN, 0x0])
  const dependency1 = encodePacked(['address', 'uint8'], [MULTI_OWNER_PLUGIN, 0x1])

  // Build installPlugin calldata
  const INSTALL_PLUGIN_ABI = [
    'function installPlugin(address plugin, bytes32 manifestHash, bytes calldata pluginInitData, bytes21[] calldata dependencies) external'
  ]
  const installPluginIface = new ethers.Interface(INSTALL_PLUGIN_ABI)
  const installPluginCalldata = installPluginIface.encodeFunctionData('installPlugin', [
    SESSION_KEY_PLUGIN,
    manifestHash,
    pluginInstallData,
    [dependency0, dependency1]
  ])

  const nonce1 = await entryPoint.getNonce(accountAddress, 0)
  const installOp = {
    sender: accountAddress,
    nonce: nonce1,
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

  const installHash = computeUserOpHashV06(installOp, ENTRYPOINT_V06, 1n)
  installOp.signature = await owner.signMessage({ message: { raw: ethers.getBytes(installHash) } })

  const userOpEventIface = new ethers.Interface([
    'event UserOperationEvent(bytes32 indexed userOpHash, address indexed sender, address indexed paymaster, uint256 nonce, bool success, uint256 actualGasCost, uint256 actualGasUsed)'
  ])

  const installGas = await entryPoint.handleOps.estimateGas([installOp], executor.address)
  const installTx = await entryPoint.handleOps([installOp], executor.address, { gasLimit: installGas * 2n, nonce: executorNonce++ })
  const installReceipt = await installTx.wait()

  for (const log of installReceipt.logs) {
    try {
      const parsed = userOpEventIface.parseLog({ topics: log.topics, data: log.data })
      if (parsed?.name === 'UserOperationEvent') {
        console.log('  Plugin install success:', parsed.args.success)
      }
    } catch (e) {}
  }

  // Verify session key registered
  const isRegistered = await sessionKeyPlugin.isSessionKeyOf(accountAddress, sessionKey.address)
  console.log('  Session key registered:', isRegistered)

  if (!isRegistered) {
    console.error('  ❌ Session key not registered, aborting')
    return
  }

  // Step 5: Setup initial position - Give account WBTC and supply to USDC Comet
  console.log('\nStep 5: Setting up initial position...')

  // Detect RPC type and use appropriate funding method
  const wbtcAmount = ethers.parseUnits('0.1', 8) // 0.1 WBTC
  const wbtcAmountHex = '0x' + wbtcAmount.toString(16)

  // Try Tenderly method first, then Anvil
  let useTenderly = false
  try {
    // Try Tenderly's setErc20Balance (array format for multiple addresses)
    await provider.send('tenderly_setErc20Balance', [WBTC, [accountAddress], wbtcAmountHex])
    useTenderly = true
    console.log('  Funded 0.1 WBTC via Tenderly setErc20Balance')
  } catch (tenderlyErr) {
    console.log('  Tenderly method failed, trying Anvil impersonation...')
    // Fall back to Anvil impersonation
    const WBTC_WHALE = '0x5Ee5bf7ae06D1Be5997A1A72006FE6C607eC6DE8' // Binance 7
    await provider.send('anvil_impersonateAccount', [WBTC_WHALE])
    await provider.send('anvil_setBalance', [WBTC_WHALE, '0x56BC75E2D63100000'])

    const wbtcWhale = await provider.getSigner(WBTC_WHALE)
    const wbtc = new ethers.Contract(WBTC, [...ERC20_ABI, 'function transfer(address to, uint256 amount) returns (bool)'], wbtcWhale)
    await (await wbtc.transfer(accountAddress, wbtcAmount)).wait()
    console.log('  Funded 0.1 WBTC via Anvil impersonation')
  }

  // Verify WBTC balance
  const wbtcContract = new ethers.Contract(WBTC, ERC20_ABI, provider)
  const wbtcBal = await wbtcContract.balanceOf(accountAddress)
  console.log('  Account WBTC balance:', ethers.formatUnits(wbtcBal, 8))

  // Authorize the smart account on the switcher (owner needs to do this)
  console.log('\nStep 5b: Authorizing account on switcher...')
  const SWITCHER_OWNER_ABI = ['function authorizeCaller(address caller, bool authorized) external', 'function owner() view returns (address)']
  const switcherContract = new ethers.Contract(SWITCHER, SWITCHER_OWNER_ABI, provider)
  const switcherOwner = await switcherContract.owner()
  console.log('  Switcher owner:', switcherOwner)

  // Check if DEPLOYER_PRIVATE_KEY is the switcher owner
  const deployerKey = process.env.DEPLOYER_PRIVATE_KEY
  if (deployerKey) {
    const deployerWallet = new ethers.Wallet(deployerKey, provider)
    if (deployerWallet.address.toLowerCase() === switcherOwner.toLowerCase()) {
      console.log('  Using deployer key as switcher owner')
      await (await new ethers.Contract(SWITCHER, SWITCHER_OWNER_ABI, deployerWallet).authorizeCaller(accountAddress, true)).wait()
    } else {
      // Try impersonation
      if (useTenderly) {
        // Tenderly: Use storage override to set authorized callers directly
        // authorizedCallers is at slot 0 (mapping) - keccak256(abi.encode(address, uint256(0)))
        const slot = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(['address', 'uint256'], [accountAddress, 0]))
        await provider.send('tenderly_setStorageAt', [SWITCHER, slot, '0x0000000000000000000000000000000000000000000000000000000000000001'])
        console.log('  Set authorized via Tenderly storage override')
      } else {
        await provider.send('anvil_impersonateAccount', [switcherOwner])
        await provider.send('anvil_setBalance', [switcherOwner, '0x56BC75E2D63100000'])
        const switcherOwnerSigner = await provider.getSigner(switcherOwner)
        await (await new ethers.Contract(SWITCHER, SWITCHER_OWNER_ABI, switcherOwnerSigner).authorizeCaller(accountAddress, true)).wait()
      }
    }
  } else {
    // Fallback to impersonation
    if (useTenderly) {
      const slot = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(['address', 'uint256'], [accountAddress, 0]))
      await provider.send('tenderly_setStorageAt', [SWITCHER, slot, '0x0000000000000000000000000000000000000000000000000000000000000001'])
    } else {
      await provider.send('anvil_impersonateAccount', [switcherOwner])
      await provider.send('anvil_setBalance', [switcherOwner, '0x56BC75E2D63100000'])
      const switcherOwnerSigner = await provider.getSigner(switcherOwner)
      await (await new ethers.Contract(SWITCHER, SWITCHER_OWNER_ABI, switcherOwnerSigner).authorizeCaller(accountAddress, true)).wait()
    }
  }
  console.log('  Account authorized on switcher')

  // Owner needs to approve WBTC and supply to Comet via UserOp
  // First, approve WBTC for Comet
  console.log('\nStep 6: Owner approves and supplies WBTC to USDC Comet...')

  const wbtcIface = new ethers.Interface(ERC20_ABI)
  const cometIface = new ethers.Interface(COMET_ABI)

  // Batch: approve WBTC + supply to Comet + borrow USDC + allow Switcher
  // IMPORTANT: Must borrow something for the switcher to work (it repays debt)
  const borrowAmount = ethers.parseUnits('500', 6) // Borrow 500 USDC
  const batchCalldata = await account.encodeBatchExecute([
    {
      target: WBTC,
      value: 0n,
      data: wbtcIface.encodeFunctionData('approve', [USDC_COMET, ethers.MaxUint256])
    },
    {
      target: USDC_COMET,
      value: 0n,
      data: cometIface.encodeFunctionData('supply', [WBTC, wbtcAmount])
    },
    {
      target: USDC_COMET,
      value: 0n,
      data: cometIface.encodeFunctionData('withdraw', [USDC, borrowAmount]) // Borrow USDC
    },
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
  ])

  const nonce2 = await entryPoint.getNonce(accountAddress, 0)
  const setupOp = {
    sender: accountAddress,
    nonce: nonce2,
    initCode: '0x',
    callData: batchCalldata,
    callGasLimit: 1000000n,
    verificationGasLimit: 500000n,
    preVerificationGas: 100000n,
    maxFeePerGas: 2000000000n,
    maxPriorityFeePerGas: 1000000000n,
    paymasterAndData: PAYMASTER_V06,
    signature: '0x'
  }

  const setupHash = computeUserOpHashV06(setupOp, ENTRYPOINT_V06, 1n)
  setupOp.signature = await owner.signMessage({ message: { raw: ethers.getBytes(setupHash) } })

  const setupGas = await entryPoint.handleOps.estimateGas([setupOp], executor.address)
  const setupTx = await entryPoint.handleOps([setupOp], executor.address, { gasLimit: setupGas * 2n, nonce: executorNonce++ })
  await setupTx.wait()
  console.log('  Setup complete: WBTC approved, supplied, USDC borrowed, Switcher allowed')

  // Check collateral balance
  const cometRead = new ethers.Contract(USDC_COMET, COMET_ABI, provider)
  const collateralBefore = await cometRead.collateralBalanceOf(accountAddress, WBTC)
  console.log('  USDC Comet collateral:', ethers.formatUnits(collateralBefore, 8), 'WBTC')

  // Step 7: Execute switch using SESSION KEY!
  console.log('\nStep 7: Executing cross-Comet switch with SESSION KEY...')

  const switcherIface = new ethers.Interface(SWITCHER_ABI)

  // Build the switch call
  // switchCollateral(user, sourceComet, targetComet, collateral, amount, borrowAmount, minOutputAmount)
  // borrowAmount needs to cover debt + flash loan fee when swapped to USDC
  // 500 USDC debt + ~0.5% fee = ~502.5 USDC
  // At ~$3000/ETH, that's ~0.17 ETH. Use 0.25 ETH with buffer.
  const switchCalldata = switcherIface.encodeFunctionData('switchCollateral', [
    accountAddress,                // user - the account whose position to switch
    USDC_COMET,                    // source
    WETH_COMET,                    // target
    WBTC,                          // collateral
    collateralBefore,              // amount
    ethers.parseEther('0.25'),     // borrow 0.25 ETH to swap to USDC for debt repayment
    0n                             // minOutputAmount - set to 0 for test
  ])

  // Build executeWithSessionKey calldata
  const EXECUTE_WITH_SESSION_KEY_ABI = [
    'function executeWithSessionKey((address target, uint256 value, bytes data)[] calls, address sessionKey) external returns (bytes[])'
  ]
  const executeIface = new ethers.Interface(EXECUTE_WITH_SESSION_KEY_ABI)

  const sessionCalldata = executeIface.encodeFunctionData('executeWithSessionKey', [
    [{
      target: SWITCHER,
      value: 0n,
      data: switchCalldata
    }],
    sessionKey.address
  ])

  const nonce3 = await entryPoint.getNonce(accountAddress, 0)
  const switchOp = {
    sender: accountAddress,
    nonce: nonce3,
    initCode: '0x',
    callData: sessionCalldata,
    callGasLimit: 5000000n,  // High for flash loan + swap
    verificationGasLimit: 500000n,
    preVerificationGas: 100000n,
    maxFeePerGas: 2000000000n,
    maxPriorityFeePerGas: 1000000000n,
    paymasterAndData: PAYMASTER_V06,
    signature: '0x'
  }

  const switchOpHash = computeUserOpHashV06(switchOp, ENTRYPOINT_V06, 1n)
  console.log('  UserOp hash:', switchOpHash)

  // Sign with SESSION KEY (not owner!)
  switchOp.signature = await sessionKey.signMessage({ message: { raw: ethers.getBytes(switchOpHash) } })
  console.log('  Signed by SESSION KEY:', sessionKey.address)

  try {
    console.log('  Estimating gas...')
    const switchGas = await entryPoint.handleOps.estimateGas([switchOp], executor.address)
    console.log('  Gas estimate:', switchGas.toString())

    console.log('  Submitting UserOp...')
    const switchTx = await entryPoint.handleOps([switchOp], executor.address, { gasLimit: switchGas * 2n, nonce: executorNonce++ })
    const switchReceipt = await switchTx.wait()
    console.log('  Transaction mined!')

    for (const log of switchReceipt.logs) {
      try {
        const parsed = userOpEventIface.parseLog({ topics: log.topics, data: log.data })
        if (parsed?.name === 'UserOperationEvent') {
          console.log('  Switch execution success:', parsed.args.success)
          console.log('  Gas used:', parsed.args.actualGasUsed.toString())
        }
      } catch (e) {}
    }

    // Check final positions
    console.log('\nStep 8: Verifying final positions...')
    const usdcCometAfter = await cometRead.collateralBalanceOf(accountAddress, WBTC)
    console.log('  USDC Comet collateral after:', ethers.formatUnits(usdcCometAfter, 8), 'WBTC')

    const wethCometRead = new ethers.Contract(WETH_COMET, COMET_ABI, provider)
    const wethCometCollateral = await wethCometRead.collateralBalanceOf(accountAddress, WBTC)
    console.log('  WETH Comet collateral after:', ethers.formatUnits(wethCometCollateral, 8), 'WBTC')

    if (wethCometCollateral > 0n && usdcCometAfter === 0n) {
      console.log('\n╔════════════════════════════════════════════════════════════╗')
      console.log('║  ✅ SUCCESS: Cross-Comet Switch via Session Key!          ║')
      console.log('╚════════════════════════════════════════════════════════════╝')
      console.log('\nSummary:')
      console.log('  - Account:', accountAddress)
      console.log('  - Owner:', owner.address)
      console.log('  - Session Key:', sessionKey.address)
      console.log('  - Moved', ethers.formatUnits(wethCometCollateral, 8), 'WBTC from USDC Comet to WETH Comet')
      console.log('  - Signed by backend session key, NOT owner!')
    }
  } catch (e) {
    console.error('  ❌ Switch failed!')
    console.error('  Error:', e.message)
    if (e.data) {
      console.error('  Error data:', e.data.slice(0, 200))
    }
  }

  console.log('\n═══════════════════════════════════════════════════════════════')
}

testSessionKeyDeFi().catch(console.error)
