/**
 * Account Controller
 *
 * Handles ERC-4337 smart account operations:
 * - Activate (deploy) smart account
 * - Get status
 * - Get balances
 * - Get Compound V3 positions
 */

const erc4337Service = require('../services/erc4337.service')
const logger = require('../utils/logger')
const { decrypt } = require('../utils/encryption')

/**
 * Activate (deploy) smart account and install session key plugin
 */
async function activate(req, res, next) {
  try {
    const user = req.user

    if (!user.smartAccountAddress) {
      return res.status(400).json({
        success: false,
        error: 'No smart account address found. Please login first.'
      })
    }

    // Check if already deployed
    const isDeployed = await erc4337Service.isAccountDeployed(user.smartAccountAddress)

    if (isDeployed) {
      // Check if session key is installed
      const hasSessionKey = await erc4337Service.isSessionKeyRegistered(user.smartAccountAddress)

      if (!hasSessionKey) {
        // Install session key plugin
        logger.info(`Installing session key plugin for ${user.smartAccountAddress}`)
        const ownerKey = decrypt(user.encryptedOwnerKey)
        const installResult = await erc4337Service.installSessionKeyPlugin(ownerKey, user.smartAccountAddress)

        // Update user record
        user.sessionKey = {
          address: installResult.sessionKeyAddress,
          expiresAt: installResult.expiresAt,
          isGranted: installResult.installed
        }
        await user.save()

        return res.json({
          success: true,
          data: {
            address: user.smartAccountAddress,
            deployed: true,
            sessionKeyInstalled: installResult.installed,
            sessionKeyAddress: installResult.sessionKeyAddress,
            txHash: installResult.txHash
          }
        })
      }

      return res.json({
        success: true,
        data: {
          address: user.smartAccountAddress,
          deployed: true,
          sessionKeyInstalled: true,
          message: 'Account already activated'
        }
      })
    }

    // Deploy account
    logger.info(`Deploying smart account for ${user.email}`)
    const ownerKey = decrypt(user.encryptedOwnerKey)
    const deployResult = await erc4337Service.deploySmartAccount(ownerKey)

    // Install session key plugin
    logger.info(`Installing session key plugin for ${deployResult.address}`)
    const installResult = await erc4337Service.installSessionKeyPlugin(ownerKey, deployResult.address)

    // Update user record
    user.sessionKey = {
      address: installResult.sessionKeyAddress,
      expiresAt: installResult.expiresAt,
      isGranted: installResult.installed
    }
    await user.save()

    logger.info(`Account activated: ${deployResult.address}`)

    res.json({
      success: true,
      data: {
        address: deployResult.address,
        deployed: true,
        deployTxHash: deployResult.txHash,
        sessionKeyInstalled: installResult.installed,
        sessionKeyAddress: installResult.sessionKeyAddress,
        sessionKeyTxHash: installResult.txHash
      }
    })
  } catch (error) {
    logger.error('Account activation error:', error)
    next(error)
  }
}

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

    const status = await erc4337Service.getAccountStatus(user.smartAccountAddress)

    res.json({
      success: true,
      data: {
        ...status,
        ownerAddress: user.privyWalletAddress,
        email: user.email
      }
    })
  } catch (error) {
    logger.error('Get status error:', error)
    next(error)
  }
}

/**
 * Get token balances
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

    // Return balances directly for easier frontend consumption
    res.json({
      success: true,
      data: {
        address: user.smartAccountAddress,
        ...balances  // Spread balances at top level for easy access
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
 * Fund EOA with test tokens via Tenderly
 * Funds the OWNER address (derived from encryptedOwnerKey), NOT privyWalletAddress
 * This is the address that controls the smart account
 */
async function fundEOA(req, res, next) {
  try {
    const user = req.user
    const { tokens } = req.body // Optional: specific tokens to fund

    if (!user.encryptedOwnerKey) {
      return res.status(400).json({
        success: false,
        error: 'No owner key found. Please login first.'
      })
    }

    // Get the owner address from the encrypted key
    const ownerKey = decrypt(user.encryptedOwnerKey)
    const ownerAddress = erc4337Service.getOwnerAddress(ownerKey)

    logger.info(`Funding owner EOA ${ownerAddress} with test tokens`)

    const results = await erc4337Service.fundWithTenderly(
      ownerAddress,
      tokens || ['WBTC', 'USDC', 'WETH']
    )

    // Get updated balances
    const eoaBalances = await erc4337Service.getBalances(ownerAddress)

    res.json({
      success: true,
      data: {
        funded: results,
        eoaAddress: ownerAddress,
        balances: eoaBalances
      }
    })
  } catch (error) {
    logger.error('Fund EOA error:', error)
    next(error)
  }
}

/**
 * Get EOA balances (the owner address, NOT privyWalletAddress)
 */
async function getEOABalances(req, res, next) {
  try {
    const user = req.user

    if (!user.encryptedOwnerKey) {
      return res.status(400).json({
        success: false,
        error: 'No owner key found'
      })
    }

    // Get the owner address from the encrypted key
    const ownerKey = decrypt(user.encryptedOwnerKey)
    const ownerAddress = erc4337Service.getOwnerAddress(ownerKey)

    const balances = await erc4337Service.getBalances(ownerAddress)

    res.json({
      success: true,
      data: {
        address: ownerAddress,
        ...balances
      }
    })
  } catch (error) {
    logger.error('Get EOA balances error:', error)
    next(error)
  }
}

/**
 * Approve smart account to spend EOA tokens (infinite approval)
 * This must be done before pulling tokens via session key
 */
async function approveSmartAccount(req, res, next) {
  try {
    const user = req.user
    const { tokens } = req.body // Optional: specific tokens to approve

    if (!user.smartAccountAddress || !user.encryptedOwnerKey) {
      return res.status(400).json({
        success: false,
        error: 'Smart account or owner key not found'
      })
    }

    const ownerKey = decrypt(user.encryptedOwnerKey)
    const ownerAddress = erc4337Service.getOwnerAddress(ownerKey)

    logger.info(`Setting up approvals from EOA ${ownerAddress} to Smart Account ${user.smartAccountAddress}`)

    const results = await erc4337Service.approveSmartAccountForTokens(
      ownerKey,
      user.smartAccountAddress,
      tokens || ['WBTC', 'USDC']
    )

    res.json({
      success: true,
      data: {
        approvals: results,
        eoaAddress: ownerAddress,
        smartAccountAddress: user.smartAccountAddress
      }
    })
  } catch (error) {
    logger.error('Approve smart account error:', error)
    next(error)
  }
}

/**
 * Pull tokens from EOA to Smart Account via session key (gasless!)
 * Requires prior approval from EOA
 */
async function pullFromEOA(req, res, next) {
  try {
    const user = req.user
    const { token, amount } = req.body

    if (!user.smartAccountAddress || !user.encryptedOwnerKey) {
      return res.status(400).json({
        success: false,
        error: 'Smart account or owner key not found'
      })
    }

    if (!token || !amount) {
      return res.status(400).json({
        success: false,
        error: 'Token and amount are required'
      })
    }

    const ownerKey = decrypt(user.encryptedOwnerKey)
    const ownerAddress = erc4337Service.getOwnerAddress(ownerKey)

    logger.info(`Pulling ${amount} ${token} from EOA ${ownerAddress} to Smart Account ${user.smartAccountAddress}`)

    const result = await erc4337Service.pullTokensFromEOA(
      user.smartAccountAddress,
      ownerAddress,
      token,
      amount
    )

    // Get updated balances for both EOA and Smart Account
    const [eoaBalances, smartAccountBalances] = await Promise.all([
      erc4337Service.getBalances(ownerAddress),
      erc4337Service.getBalances(user.smartAccountAddress)
    ])

    res.json({
      success: true,
      data: {
        ...result,
        eoaBalances,
        smartAccountBalances
      }
    })
  } catch (error) {
    logger.error('Pull from EOA error:', error)
    next(error)
  }
}

module.exports = {
  activate,
  getStatus,
  getBalances,
  getPositions,
  fundEOA,
  getEOABalances,
  approveSmartAccount,
  pullFromEOA
}
