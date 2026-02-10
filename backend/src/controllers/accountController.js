/**
 * Account Controller
 *
 * Handles ERC-4337 smart account operations:
 * - Get status
 * - Get balances
 * - Get Compound V3 positions
 * - Fund smart account with test tokens (Tenderly only)
 *
 * IMPORTANT: User's Privy EOA is the OWNER of the smart account.
 * Backend can only operate via session key (after user grants it).
 */

const erc4337Service = require('../services/erc4337.service')
const logger = require('../utils/logger')

/**
 * Get smart account status
 */
async function getStatus(req, res, next) {
  try {
    const user = req.user

    if (!user.smartAccountAddress) {
      return res.status(400).json({
        success: false,
        error: 'No smart account address found'
      })
    }

    const status = await erc4337Service.getAccountStatus(
      user.smartAccountAddress,
      user.sessionKey?.address
    )

    res.json({
      success: true,
      data: {
        ...status,
        ownerAddress: user.privyWalletAddress,
        email: user.email,
        sessionKeyGranted: user.sessionKey?.isGranted || false,
        sessionKeyExpiry: user.sessionKey?.expiresAt
      }
    })
  } catch (error) {
    logger.error('Get status error:', error)
    next(error)
  }
}

/**
 * Get token balances for smart account
 */
async function getBalances(req, res, next) {
  try {
    const user = req.user

    if (!user.smartAccountAddress) {
      return res.status(400).json({
        success: false,
        error: 'No smart account address found'
      })
    }

    const balances = await erc4337Service.getBalances(user.smartAccountAddress)

    res.json({
      success: true,
      data: {
        address: user.smartAccountAddress,
        ...balances
      }
    })
  } catch (error) {
    logger.error('Get balances error:', error)
    next(error)
  }
}

/**
 * Get Compound V3 positions
 */
async function getPositions(req, res, next) {
  try {
    const user = req.user

    if (!user.smartAccountAddress) {
      return res.status(400).json({
        success: false,
        error: 'No smart account address found'
      })
    }

    const positions = await erc4337Service.getPositions(user.smartAccountAddress)

    res.json({
      success: true,
      data: {
        address: user.smartAccountAddress,
        positions
      }
    })
  } catch (error) {
    logger.error('Get positions error:', error)
    next(error)
  }
}

/**
 * Fund Smart Account with test tokens via Tenderly
 * Tokens go directly to the smart account - no approval/pull needed!
 */
async function fundSmartAccount(req, res, next) {
  try {
    const user = req.user
    const { tokens } = req.body

    if (!user.smartAccountAddress) {
      return res.status(400).json({
        success: false,
        error: 'No smart account address found. Please activate first.'
      })
    }

    logger.info(`Funding Smart Account ${user.smartAccountAddress} with test tokens`)

    const results = await erc4337Service.fundWithTenderly(
      user.smartAccountAddress,
      tokens || ['WBTC', 'USDC', 'WETH']
    )

    const balances = await erc4337Service.getBalances(user.smartAccountAddress)

    res.json({
      success: true,
      data: {
        funded: results,
        smartAccountAddress: user.smartAccountAddress,
        balances
      }
    })
  } catch (error) {
    logger.error('Fund smart account error:', error)
    next(error)
  }
}

module.exports = {
  getStatus,
  getBalances,
  getPositions,
  fundSmartAccount
}
