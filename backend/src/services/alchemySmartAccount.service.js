const {
  createMultiOwnerLightAccount,
  getDefaultLightAccountFactoryAddress,
  multiOwnerLightAccountClientActions
} = require('@alchemy/aa-accounts')
const { createSmartAccountClient, split } = require('@alchemy/aa-core')
const { createPublicClient, http, concat, toHex, pad } = require('viem')
const { privateKeyToAccount, generatePrivateKey } = require('viem/accounts')
const { mainnet } = require('viem/chains')
const logger = require('../utils/logger')

// Paymaster address for v0.7.0 EntryPoint
const PAYMASTER_ADDRESS = process.env.PAYMASTER_ADDRESS

/**
 * V0.7.0 Paymaster Configuration
 * SDK expects paymasterAndData as an object with dummyPaymasterAndData and paymasterAndData
 */
const getPaymasterMiddleware = () => ({
  // dummyPaymasterAndData - called WITHOUT arguments, returns paymaster config
  // For v0.7.0, SDK expects object with paymaster fields
  dummyPaymasterAndData: () => ({
    paymaster: PAYMASTER_ADDRESS,
    paymasterData: '0x',
    paymasterVerificationGasLimit: toHex(100000n),
    paymasterPostOpGasLimit: toHex(50000n)
  }),

  // paymasterAndData - called AFTER gas estimation, can modify struct
  // For v0.7.0, we set the fields again to ensure they're in the final UserOp
  paymasterAndData: async (struct, { account }) => {
    // Set v0.7.0 paymaster fields on the struct
    struct.paymaster = PAYMASTER_ADDRESS
    struct.paymasterData = '0x'
    struct.paymasterVerificationGasLimit = toHex(100000n)
    struct.paymasterPostOpGasLimit = toHex(50000n)
    return struct
  }
})

// Mainnet fork chain config
const mainnetFork = {
  ...mainnet,
  id: 1,
  name: 'Mainnet Fork',
  rpcUrls: {
    default: { http: [process.env.RPC_URL] },
    public: { http: [process.env.RPC_URL] }
  }
}

// EntryPoint v0.7.0 (required by MultiOwnerLightAccount v2.0.0)
// Note: MultiOwnerLightAccount only supports v2.0.0, which uses v0.7.0
const ENTRYPOINT_ADDRESS = '0x0000000071727De22E5E9d8BAf0edAc6f37da032'
const ENTRYPOINT_VERSION = '0.7'

// Get Alchemy's official LightAccount factory address for mainnet
// (MultiOwnerLightAccount uses the same factory as LightAccount)
const FACTORY_ADDRESS = getDefaultLightAccountFactoryAddress(mainnet)

// Compound V3 contract addresses (for session key permissions)
const USDC_COMET = '0xc3d688B66703497DAA19211EEdff47f25384cdc3'
const WETH_COMET = '0xA17581A9E3356d9A858b789D68B4d866e593aE94'
const CROSS_COMET_SWITCHER = process.env.CROSS_COMET_SWITCHER_ADDRESS

// Store for user smart accounts
const userAccounts = new Map()

/**
 * Create Alchemy LightAccount with custom bundler and paymaster
 * @param {string} privyUserId - Privy user ID
 * @param {string} privyEOAPrivateKey - Privy embedded wallet private key
 * @returns {Promise<{address: string, owner: string}>}
 */
async function createSmartAccount(privyUserId, privyEOAPrivateKey) {
  try {
    logger.info(`Creating Alchemy Multi-Owner LightAccount for user: ${privyUserId}`)

    // Check if user already has an account
    if (userAccounts.has(privyUserId)) {
      logger.info(`User ${privyUserId} already has a smart account`)
      const existing = userAccounts.get(privyUserId)
      return {
        address: existing.address,
        owner: existing.owner
      }
    }

    // Create owner account from Privy EOA
    const owner = privateKeyToAccount(privyEOAPrivateKey)
    const ownerAddress = owner.address

    logger.info(`Creating Alchemy Multi-Owner LightAccount with owner: ${ownerAddress}`)
    logger.info(`Using Alchemy factory: ${FACTORY_ADDRESS}`)

    // Create Alchemy Multi-Owner LightAccount
    // Note: NOT specifying entryPoint or factoryAddress to use SDK defaults
    // Pass signer for signing AND owners array for deployment
    const { LocalAccountSigner } = require('@alchemy/aa-core')
    const signer = new LocalAccountSigner(owner)

    const lightAccount = await createMultiOwnerLightAccount({
      transport: http(process.env.RPC_URL),
      chain: mainnetFork,
      signer,  // Signer for signing UserOps
      owners: [owner.address],  // Owner addresses for deployment
      version: "v2.0.0"  // MultiOwnerLightAccount only supports v2.0.0 (EntryPoint v0.7.0)
    })

    const accountAddress = lightAccount.address

    logger.info(`Alchemy Multi-Owner LightAccount created: ${accountAddress}`)

    // Create split transport to route bundler methods to Alto and RPC methods to Anvil
    const bundlerMethods = [
      'eth_sendUserOperation',
      'eth_estimateUserOperationGas',
      'eth_getUserOperationReceipt',
      'eth_getUserOperationByHash',
      'eth_supportedEntryPoints'
    ]

    const splitTransport = split({
      overrides: [{
        methods: bundlerMethods,
        transport: http(process.env.BUNDLER_URL)  // Alto bundler
      }],
      fallback: http(process.env.RPC_URL)  // Anvil mainnet fork
    })

    // Create smart account client with split transport and v0.7.0 paymaster middleware
    const smartAccountClient = createSmartAccountClient({
      account: lightAccount,
      chain: mainnetFork,
      transport: splitTransport,
      // v0.7.0 paymaster middleware - SDK expects nested structure
      paymasterAndData: getPaymasterMiddleware()
    })

    // Extend client with Multi-Owner LightAccount actions
    const clientWithMultiOwner = smartAccountClient.extend(multiOwnerLightAccountClientActions)

    // Store account info
    const accountInfo = {
      address: accountAddress,
      owner: ownerAddress,
      account: lightAccount,
      client: clientWithMultiOwner,
      hasSessionKey: false,
      sessionKeyPrivateKey: null
    }

    userAccounts.set(privyUserId, accountInfo)

    logger.info(`Account stored for user ${privyUserId}`)

    return {
      address: accountAddress,
      owner: ownerAddress
    }
  } catch (error) {
    logger.error('Failed to create smart account:', error)
    throw new Error(`Failed to create smart account: ${error.message}`)
  }
}

/**
 * Add backend as second owner to Multi-Owner LightAccount
 * This allows backend to sign transactions without user approval
 * @param {string} privyUserId - Privy user ID
 * @returns {Promise<{success: boolean, message: string, sessionKeyAddress: string}>}
 */
async function addSessionKey(privyUserId) {
  try {
    logger.info(`Adding backend as second owner for user: ${privyUserId}`)

    const accountInfo = userAccounts.get(privyUserId)
    if (!accountInfo) {
      throw new Error('Smart account not found for user')
    }

    if (accountInfo.hasSessionKey) {
      logger.info(`User ${privyUserId} already has backend owner`)
      return {
        success: true,
        message: 'Backend owner already added',
        sessionKeyAddress: accountInfo.sessionKeyAddress
      }
    }

    // Generate a new private key for the backend owner (session key)
    const sessionKeyPrivateKey = generatePrivateKey()
    const sessionKeyAccount = privateKeyToAccount(sessionKeyPrivateKey)

    logger.info(`Generated backend owner key: ${sessionKeyAccount.address}`)
    logger.info('Adding backend as second owner via UserOp...')

    // For MultiOwnerLightAccount, use the client action to update owners
    const userOpHash = await accountInfo.client.updateOwners({
      ownersToAdd: [sessionKeyAccount.address],
      ownersToRemove: []
    })

    logger.info(`Add owner UserOp sent: ${userOpHash}`)

    // Wait for the UserOp to be mined
    logger.info('Waiting for UserOp to be mined...')
    const receipt = await accountInfo.client.waitForUserOperationReceipt({
      hash: userOpHash
    })

    logger.info(`Backend owner added! Tx: ${receipt.receipt.transactionHash}`)

    // Update account info
    accountInfo.hasSessionKey = true
    accountInfo.sessionKeyPrivateKey = sessionKeyPrivateKey
    accountInfo.sessionKeyAddress = sessionKeyAccount.address
    userAccounts.set(privyUserId, accountInfo)

    return {
      success: true,
      message: 'Backend owner added successfully',
      sessionKeyAddress: sessionKeyAccount.address,
      txHash: receipt.receipt.transactionHash
    }
  } catch (error) {
    logger.error('Failed to add backend owner:', error)
    throw new Error(`Failed to add backend owner: ${error.message}`)
  }
}

/**
 * Get smart account info for a user
 * @param {string} privyUserId - Privy user ID
 * @returns {Promise<{address: string, owner: string, hasSessionKey: boolean}>}
 */
async function getSmartAccountInfo(privyUserId) {
  const accountInfo = userAccounts.get(privyUserId)

  if (!accountInfo) {
    return null
  }

  return {
    address: accountInfo.address,
    owner: accountInfo.owner,
    hasSessionKey: accountInfo.hasSessionKey
  }
}

/**
 * Get client for executing with session key
 * Creates a new smart account client that uses the session key to sign UserOps
 * @param {string} privyUserId - Privy user ID
 * @returns {Promise<Object>} Smart account client configured with session key
 */
async function getClientForSessionKey(privyUserId) {
  const accountInfo = userAccounts.get(privyUserId)

  if (!accountInfo) {
    throw new Error('Smart account not found for user')
  }

  if (!accountInfo.hasSessionKey) {
    throw new Error('Session key not installed for this account')
  }

  logger.info(`Creating client with backend owner for user: ${privyUserId}`)

  // Create account instance with backend owner (second owner) as signer
  const sessionKeyAccount = privateKeyToAccount(accountInfo.sessionKeyPrivateKey)

  const { LocalAccountSigner } = require('@alchemy/aa-core')
  const backendSigner = new LocalAccountSigner(sessionKeyAccount)

  const lightAccountWithBackendOwner = await createMultiOwnerLightAccount({
    transport: http(process.env.RPC_URL),
    chain: mainnetFork,
    signer: backendSigner,  // Use backend owner as the signer
    accountAddress: accountInfo.address,  // Use existing account address
    version: "v2.0.0"  // MultiOwnerLightAccount only supports v2.0.0 (EntryPoint v0.7.0)
  })

  // Create split transport for backend client too
  const bundlerMethods = [
    'eth_sendUserOperation',
    'eth_estimateUserOperationGas',
    'eth_getUserOperationReceipt',
    'eth_getUserOperationByHash',
    'eth_supportedEntryPoints'
  ]

  const backendSplitTransport = split({
    overrides: [{
      methods: bundlerMethods,
      transport: http(process.env.BUNDLER_URL)
    }],
    fallback: http(process.env.RPC_URL)
  })

  // Create smart account client with backend owner as signer and v0.7.0 paymaster middleware
  const backendClient = createSmartAccountClient({
    account: lightAccountWithBackendOwner,
    chain: mainnetFork,
    transport: backendSplitTransport,
    // v0.7.0 paymaster middleware - SDK expects nested structure
    paymasterAndData: getPaymasterMiddleware()
  })

  logger.info('Backend owner client created successfully')

  return backendClient
}

module.exports = {
  createSmartAccount,
  addSessionKey,
  getSmartAccountInfo,
  getClientForSessionKey
}
