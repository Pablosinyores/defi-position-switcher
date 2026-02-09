const { encodeFunctionData, parseEther, parseUnits } = require('viem')
const logger = require('../utils/logger')
const { getClientForSessionKey } = require('./alchemySmartAccount.service')

// ABIs
const ERC20_ABI = [
  {
    name: 'approve',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' }
    ],
    outputs: [{ name: '', type: 'bool' }]
  },
  {
    name: 'transfer',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' }
    ],
    outputs: [{ name: '', type: 'bool' }]
  },
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }]
  }
]

const COMET_ABI = [
  {
    name: 'supply',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'asset', type: 'address' },
      { name: 'amount', type: 'uint256' }
    ],
    outputs: []
  },
  {
    name: 'withdraw',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'asset', type: 'address' },
      { name: 'amount', type: 'uint256' }
    ],
    outputs: []
  },
  {
    name: 'allow',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'manager', type: 'address' },
      { name: 'isAllowed', type: 'bool' }
    ],
    outputs: []
  },
  {
    name: 'collateralBalanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'account', type: 'address' },
      { name: 'asset', type: 'address' }
    ],
    outputs: [{ name: '', type: 'uint128' }]
  },
  {
    name: 'borrowBalanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }]
  }
]

const SWITCHER_ABI = [
  {
    name: 'switchCollateral',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'user', type: 'address' },
      { name: 'sourceComet', type: 'address' },
      { name: 'targetComet', type: 'address' },
      { name: 'collateralAsset', type: 'address' },
      { name: 'collateralAmount', type: 'uint256' },
      { name: 'borrowAmount', type: 'uint256' },
      { name: 'minOutputAmount', type: 'uint256' }
    ],
    outputs: []
  },
  {
    name: 'authorizeCaller',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'caller', type: 'address' },
      { name: 'authorized', type: 'bool' }
    ],
    outputs: []
  }
]

/**
 * Execute a UserOperation with session key
 * @param {string} privyUserId - Privy user ID
 * @param {string} target - Target contract address
 * @param {string} data - Encoded function call data
 * @param {string} value - Native token value (default "0")
 * @returns {Promise<{hash: string, success: boolean}>}
 */
async function executeWithSessionKey(privyUserId, target, data, value = '0') {
  try {
    logger.info(`Executing UserOp for user ${privyUserId}`)
    logger.info(`Target: ${target}`)
    logger.info(`Data: ${data.slice(0, 66)}...`)

    const client = await getClientForSessionKey(privyUserId)

    // Send UserOperation - Alchemy SDK handles UserOp creation and submission
    const userOpHash = await client.sendUserOperation({
      uo: {
        target,
        data,
        value: BigInt(value)
      }
    })

    logger.info(`UserOp sent: ${userOpHash}`)

    // Wait for UserOp to be mined
    const txHash = await client.waitForUserOperationTransaction({
      hash: userOpHash
    })

    logger.info(`UserOp mined in tx: ${txHash}`)

    return {
      hash: txHash,
      userOpHash,
      success: true
    }
  } catch (error) {
    logger.error('Failed to execute UserOp:', error)
    throw new Error(`Failed to execute UserOp: ${error.message}`)
  }
}

/**
 * Deposit collateral to Compound V3
 * @param {string} privyUserId - Privy user ID
 * @param {Object} params - Deposit parameters
 * @param {string} params.cometAddress - Comet contract address
 * @param {string} params.assetAddress - Collateral asset address
 * @param {string} params.amount - Amount to deposit (in token decimals)
 * @returns {Promise<{hash: string, success: boolean}>}
 */
async function depositCollateral(privyUserId, { cometAddress, assetAddress, amount }) {
  try {
    logger.info(`Depositing collateral for user ${privyUserId}`)
    logger.info(`Comet: ${cometAddress}, Asset: ${assetAddress}, Amount: ${amount}`)

    // Step 1: Approve Comet to spend tokens
    const approveData = encodeFunctionData({
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [cometAddress, BigInt(amount)]
    })

    logger.info('Approving token spend...')
    await executeWithSessionKey(privyUserId, assetAddress, approveData)

    // Step 2: Supply to Comet
    const supplyData = encodeFunctionData({
      abi: COMET_ABI,
      functionName: 'supply',
      args: [assetAddress, BigInt(amount)]
    })

    logger.info('Supplying to Comet...')
    const result = await executeWithSessionKey(privyUserId, cometAddress, supplyData)

    logger.info(`Collateral deposited successfully: ${result.hash}`)
    return result
  } catch (error) {
    logger.error('Failed to deposit collateral:', error)
    throw new Error(`Failed to deposit collateral: ${error.message}`)
  }
}

/**
 * Borrow asset from Compound V3
 * @param {string} privyUserId - Privy user ID
 * @param {Object} params - Borrow parameters
 * @param {string} params.cometAddress - Comet contract address
 * @param {string} params.amount - Amount to borrow (in base token decimals)
 * @returns {Promise<{hash: string, success: boolean}>}
 */
async function borrowAsset(privyUserId, { cometAddress, amount }) {
  try {
    logger.info(`Borrowing asset for user ${privyUserId}`)
    logger.info(`Comet: ${cometAddress}, Amount: ${amount}`)

    // Withdraw base token (borrow)
    // In Compound V3, withdrawing base token = borrowing
    const withdrawData = encodeFunctionData({
      abi: COMET_ABI,
      functionName: 'withdraw',
      args: [
        '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', // Special address for base token
        BigInt(amount)
      ]
    })

    logger.info('Borrowing from Comet...')
    const result = await executeWithSessionKey(privyUserId, cometAddress, withdrawData)

    logger.info(`Asset borrowed successfully: ${result.hash}`)
    return result
  } catch (error) {
    logger.error('Failed to borrow asset:', error)
    throw new Error(`Failed to borrow asset: ${error.message}`)
  }
}

/**
 * Switch position between two Comets
 * @param {string} privyUserId - Privy user ID
 * @param {Object} params - Switch parameters
 * @param {string} params.sourceCometAddress - Source Comet address
 * @param {string} params.targetCometAddress - Target Comet address
 * @param {string} params.collateralAssetAddress - Collateral asset address
 * @param {string} params.collateralAmount - Amount of collateral to switch
 * @param {string} params.borrowAmount - Amount to borrow in target token
 * @param {string} params.minOutputAmount - Minimum output from swap (slippage protection)
 * @returns {Promise<{hash: string, success: boolean}>}
 */
async function switchComet(
  privyUserId,
  {
    sourceCometAddress,
    targetCometAddress,
    collateralAssetAddress,
    collateralAmount,
    borrowAmount,
    minOutputAmount
  }
) {
  try {
    logger.info(`Switching comet position for user ${privyUserId}`)
    logger.info(`Source: ${sourceCometAddress}, Target: ${targetCometAddress}`)

    const client = await getClientForSessionKey(privyUserId)
    const smartAccountAddress = client.getAddress()

    // Step 1: Allow switcher to manage Comet position
    const allowData = encodeFunctionData({
      abi: COMET_ABI,
      functionName: 'allow',
      args: [process.env.SWITCHER_ADDRESS, true]
    })

    logger.info('Authorizing switcher...')
    await executeWithSessionKey(privyUserId, sourceCometAddress, allowData)

    // Step 2: Execute switch via Switcher contract
    const switchData = encodeFunctionData({
      abi: SWITCHER_ABI,
      functionName: 'switchCollateral',
      args: [
        smartAccountAddress,
        sourceCometAddress,
        targetCometAddress,
        collateralAssetAddress,
        BigInt(collateralAmount),
        BigInt(borrowAmount),
        BigInt(minOutputAmount)
      ]
    })

    logger.info('Executing cross-comet switch...')
    const result = await executeWithSessionKey(
      privyUserId,
      process.env.SWITCHER_ADDRESS,
      switchData
    )

    logger.info(`Position switched successfully: ${result.hash}`)
    return result
  } catch (error) {
    logger.error('Failed to switch comet:', error)
    throw new Error(`Failed to switch comet: ${error.message}`)
  }
}

/**
 * Get user's position in a Comet
 * @param {string} smartAccountAddress - Smart account address
 * @param {string} cometAddress - Comet contract address
 * @param {string} collateralAssetAddress - Collateral asset address
 * @returns {Promise<{collateral: string, borrowed: string}>}
 */
async function getPosition(smartAccountAddress, cometAddress, collateralAssetAddress) {
  try {
    const { createPublicClient, http } = require('viem')
    const { mainnet } = require('viem/chains')

    // Create mainnet fork client
    const mainnetFork = {
      ...mainnet,
      id: 1,
      rpcUrls: {
        default: { http: [process.env.RPC_URL] },
        public: { http: [process.env.RPC_URL] }
      }
    }

    const publicClient = createPublicClient({
      chain: mainnetFork,
      transport: http()
    })

    // Get collateral balance
    const collateral = await publicClient.readContract({
      address: cometAddress,
      abi: COMET_ABI,
      functionName: 'collateralBalanceOf',
      args: [smartAccountAddress, collateralAssetAddress]
    })

    // Get borrow balance
    const borrowed = await publicClient.readContract({
      address: cometAddress,
      abi: COMET_ABI,
      functionName: 'borrowBalanceOf',
      args: [smartAccountAddress]
    })

    return {
      collateral: collateral.toString(),
      borrowed: borrowed.toString()
    }
  } catch (error) {
    logger.error('Failed to get position:', error)
    throw new Error(`Failed to get position: ${error.message}`)
  }
}

/**
 * Authorize smart account with switcher contract
 * This should be called once per smart account before using cross-comet switching
 * @param {string} smartAccountAddress - Smart account address to authorize
 * @returns {Promise<{hash: string, success: boolean}>}
 */
async function authorizeSmartAccountWithSwitcher(smartAccountAddress) {
  try {
    logger.info(`Authorizing smart account with switcher: ${smartAccountAddress}`)

    const { createWalletClient, http } = require('viem')
    const { privateKeyToAccount } = require('viem/accounts')
    const { mainnet } = require('viem/chains')

    // Create mainnet fork client
    const mainnetFork = {
      ...mainnet,
      id: 1,
      rpcUrls: {
        default: { http: [process.env.RPC_URL] },
        public: { http: [process.env.RPC_URL] }
      }
    }

    // Use deployer key (contract owner)
    const account = privateKeyToAccount(process.env.DEPLOYER_PRIVATE_KEY)

    const walletClient = createWalletClient({
      account,
      chain: mainnetFork,
      transport: http()
    })

    // Authorize the smart account
    const hash = await walletClient.writeContract({
      address: process.env.SWITCHER_ADDRESS,
      abi: SWITCHER_ABI,
      functionName: 'authorizeCaller',
      args: [smartAccountAddress, true]
    })

    logger.info(`Smart account authorized: ${hash}`)

    return {
      hash,
      success: true
    }
  } catch (error) {
    logger.error('Failed to authorize smart account:', error)
    throw new Error(`Failed to authorize smart account: ${error.message}`)
  }
}

module.exports = {
  executeWithSessionKey,
  depositCollateral,
  borrowAsset,
  switchComet,
  getPosition,
  authorizeSmartAccountWithSwitcher
}
