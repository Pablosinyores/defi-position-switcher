const User = require('../models/User')
const {
  createSmartAccount,
  addSessionKey,
  getSmartAccountInfo
} = require('../services/alchemySmartAccount.service')
const { authorizeSmartAccountWithSwitcher } = require('../services/alchemyPosition.service')
const logger = require('../utils/logger')
const { ValidationError } = require('../utils/errors')
const { encrypt } = require('../utils/encryption')

/**
 * Register or login user with Privy + Alchemy AA
 * Creates Alchemy ModularAccount for the user
 */
async function loginOrRegister(req, res, next) {
  try {
    const { privyUserId, privyEOAPrivateKey, email } = req.body

    if (!privyUserId || !email) {
      throw new ValidationError('Privy user ID and email are required')
    }

    if (!privyEOAPrivateKey) {
      throw new ValidationError('Privy EOA private key is required')
    }

    // Check if user exists
    let user = await User.findOne({ privyId: privyUserId })

    if (user) {
      logger.info(`User logged in: ${user.email}`)

      // Get Alchemy account info
      const accountInfo = await getSmartAccountInfo(privyUserId)

      return res.json({
        success: true,
        data: {
          user: {
            id: user._id,
            email: user.email,
            privyWalletAddress: user.privyWalletAddress,
            smartAccountAddress: accountInfo?.address || user.smartAccountAddress,
            hasSessionKey: accountInfo?.hasSessionKey || false,
            accountType: 'alchemy'
          }
        }
      })
    }

    // Create Alchemy ModularAccount
    logger.info(`Creating Alchemy smart account for user: ${privyUserId}`)

    const { address: smartAccountAddress, owner: ownerAddress } = await createSmartAccount(
      privyUserId,
      privyEOAPrivateKey
    )

    logger.info(`Alchemy smart account created: ${smartAccountAddress}`)

    // Authorize smart account with switcher contract
    logger.info('Authorizing smart account with switcher...')
    await authorizeSmartAccountWithSwitcher(smartAccountAddress)
    logger.info('Smart account authorized with switcher')

    // Create user in database
    user = new User({
      privyId: privyUserId,
      email,
      privyWalletAddress: ownerAddress,
      smartAccountAddress,
      encryptedOwnerKey: encrypt(privyEOAPrivateKey)
    })

    await user.save()

    logger.info(`User created with Alchemy AA:
      Email: ${email}
      Privy EOA: ${ownerAddress}
      Smart Account: ${smartAccountAddress}
    `)

    res.status(201).json({
      success: true,
      data: {
        user: {
          id: user._id,
          email: user.email,
          privyWalletAddress: ownerAddress,
          smartAccountAddress,
          hasSessionKey: false,
          accountType: 'alchemy'
        },
        message: 'User and Alchemy Smart Account created successfully'
      }
    })
  } catch (error) {
    logger.error('Login/register error:', error)
    next(error)
  }
}

/**
 * Setup session key for gasless transactions
 * Installs SessionKeyPlugin on Alchemy ModularAccount
 */
async function setupSessionKey(req, res, next) {
  try {
    const user = req.user

    // Check if session key already exists
    const accountInfo = await getSmartAccountInfo(user.privyId)

    if (accountInfo?.hasSessionKey) {
      return res.json({
        success: true,
        data: {
          smartAccountAddress: accountInfo.address,
          hasSessionKey: true,
          message: 'Session key already installed'
        }
      })
    }

    logger.info(`Installing session key for user: ${user.email}`)

    // Add session key to Alchemy account
    const result = await addSessionKey(user.privyId)

    // Update user record
    user.sessionKey = {
      address: process.env.SESSION_KEY_PRIVATE_KEY, // Backend session key
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      permissions: ['SUPPLY', 'BORROW', 'WITHDRAW', 'SWITCH_COMET'],
      isGranted: true
    }

    await user.save()

    logger.info(`Session key installed for user: ${user.email}
      Smart Account: ${user.smartAccountAddress}
    `)

    res.json({
      success: true,
      data: {
        smartAccountAddress: user.smartAccountAddress,
        hasSessionKey: true,
        expiresAt: user.sessionKey.expiresAt,
        message: 'Session key installed. User can now perform gasless transactions via paymaster.'
      }
    })
  } catch (error) {
    logger.error('Setup session key error:', error)
    next(error)
  }
}

/**
 * Get user profile with Alchemy account info
 */
async function getProfile(req, res, next) {
  try {
    const user = req.user

    // Get live Alchemy account info
    const accountInfo = await getSmartAccountInfo(user.privyId)

    res.json({
      success: true,
      data: {
        user: {
          id: user._id,
          email: user.email,
          privyWalletAddress: user.privyWalletAddress,
          smartAccountAddress: user.smartAccountAddress,
          hasSessionKey: accountInfo?.hasSessionKey || false,
          accountType: 'alchemy',
          sessionKey: user.sessionKey
            ? {
                expiresAt: user.sessionKey.expiresAt,
                permissions: user.sessionKey.permissions,
                isGranted: user.sessionKey.isGranted
              }
            : null,
          createdAt: user.createdAt
        }
      }
    })
  } catch (error) {
    logger.error('Get profile error:', error)
    next(error)
  }
}

module.exports = {
  loginOrRegister,
  setupSessionKey,
  getProfile
}
