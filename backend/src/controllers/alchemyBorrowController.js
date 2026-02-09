const Position = require('../models/Position')
const Transaction = require('../models/Transaction')
const {
  depositCollateral,
  borrowAsset,
  switchComet,
  getPosition
} = require('../services/alchemyPosition.service')
const { getSmartAccountInfo } = require('../services/alchemySmartAccount.service')
const logger = require('../utils/logger')
const { ValidationError, BlockchainError } = require('../utils/errors')

/**
 * Deposit collateral to Compound V3
 */
async function deposit(req, res, next) {
  try {
    const user = req.user
    const { cometAddress, assetAddress, amount } = req.body

    if (!user.sessionKey?.isGranted) {
      throw new ValidationError('Session key not installed')
    }

    logger.info(`Deposit request from ${user.email}`)
    logger.info(`Comet: ${cometAddress}, Asset: ${assetAddress}, Amount: ${amount}`)

    // Execute deposit via Alchemy AA
    const result = await depositCollateral(user.privyId, {
      cometAddress,
      assetAddress,
      amount
    })

    // Save transaction
    const transaction = new Transaction({
      userId: user._id,
      smartWalletAddress: user.smartAccountAddress,
      type: 'DEPOSIT',
      protocol: 'COMPOUND_V3',
      fromAsset: {
        address: assetAddress,
        amount: amount.toString()
      },
      txHash: result.hash,
      userOpHash: result.userOpHash,
      status: 'SUCCESS'
    })

    await transaction.save()

    res.json({
      success: true,
      data: {
        txHash: result.hash,
        userOpHash: result.userOpHash,
        transaction
      }
    })
  } catch (error) {
    logger.error('Deposit error:', error)
    next(new BlockchainError('Deposit failed', error.message))
  }
}

/**
 * Borrow from Compound V3
 */
async function borrow(req, res, next) {
  try {
    const user = req.user
    const { cometAddress, amount } = req.body

    if (!user.sessionKey?.isGranted) {
      throw new ValidationError('Session key not installed')
    }

    logger.info(`Borrow request from ${user.email}`)
    logger.info(`Comet: ${cometAddress}, Amount: ${amount}`)

    // Execute borrow via Alchemy AA
    const result = await borrowAsset(user.privyId, {
      cometAddress,
      amount
    })

    // Update or create position
    let position = await Position.findOne({
      userId: user._id,
      protocolAddress: cometAddress,
      status: 'ACTIVE'
    })

    if (position) {
      // Update existing position
      position.debt.amount = (
        BigInt(position.debt.amount) + BigInt(amount)
      ).toString()
      await position.save()
    } else {
      // Create new position
      position = new Position({
        userId: user._id,
        smartWalletAddress: user.smartAccountAddress,
        protocol: 'COMPOUND_V3',
        protocolAddress: cometAddress,
        debt: {
          asset: 'BASE_TOKEN',
          amount: amount.toString()
        },
        status: 'ACTIVE'
      })
      await position.save()
    }

    // Save transaction
    const transaction = new Transaction({
      userId: user._id,
      smartWalletAddress: user.smartAccountAddress,
      type: 'BORROW',
      protocol: 'COMPOUND_V3',
      toAsset: {
        address: 'BASE_TOKEN',
        amount: amount.toString()
      },
      txHash: result.hash,
      userOpHash: result.userOpHash,
      status: 'SUCCESS'
    })

    await transaction.save()

    res.json({
      success: true,
      data: {
        txHash: result.hash,
        userOpHash: result.userOpHash,
        position,
        transaction
      }
    })
  } catch (error) {
    logger.error('Borrow error:', error)
    next(new BlockchainError('Borrow failed', error.message))
  }
}

/**
 * Switch position between Comets (cross-comet switching)
 */
async function switchPosition(req, res, next) {
  try {
    const user = req.user
    const {
      sourceCometAddress,
      targetCometAddress,
      collateralAssetAddress,
      collateralAmount,
      borrowAmount,
      minOutputAmount
    } = req.body

    if (!user.sessionKey?.isGranted) {
      throw new ValidationError('Session key not installed')
    }

    logger.info(`Cross-comet switch request from ${user.email}`)
    logger.info(`Source: ${sourceCometAddress} -> Target: ${targetCometAddress}`)

    // Execute switch via Alchemy AA
    const result = await switchComet(user.privyId, {
      sourceCometAddress,
      targetCometAddress,
      collateralAssetAddress,
      collateralAmount,
      borrowAmount,
      minOutputAmount
    })

    // Close old position
    const oldPosition = await Position.findOne({
      userId: user._id,
      protocolAddress: sourceCometAddress,
      status: 'ACTIVE'
    })

    if (oldPosition) {
      oldPosition.status = 'CLOSED'
      await oldPosition.save()
    }

    // Create new position
    const newPosition = new Position({
      userId: user._id,
      smartWalletAddress: user.smartAccountAddress,
      protocol: 'COMPOUND_V3',
      protocolAddress: targetCometAddress,
      collateral: {
        asset: collateralAssetAddress,
        amount: collateralAmount.toString()
      },
      debt: {
        asset: 'BASE_TOKEN',
        amount: borrowAmount.toString()
      },
      status: 'ACTIVE'
    })

    await newPosition.save()

    // Save transaction
    const transaction = new Transaction({
      userId: user._id,
      smartWalletAddress: user.smartAccountAddress,
      type: 'SWITCH_COMET',
      protocol: 'COMPOUND_V3',
      fromAsset: {
        address: sourceCometAddress,
        amount: collateralAmount.toString()
      },
      toAsset: {
        address: targetCometAddress,
        amount: collateralAmount.toString()
      },
      txHash: result.hash,
      userOpHash: result.userOpHash,
      status: 'SUCCESS'
    })

    await transaction.save()

    res.json({
      success: true,
      data: {
        txHash: result.hash,
        userOpHash: result.userOpHash,
        oldPosition,
        newPosition,
        transaction,
        message: 'Position switched successfully'
      }
    })
  } catch (error) {
    logger.error('Switch comet error:', error)
    next(new BlockchainError('Switch failed', error.message))
  }
}

/**
 * Get current position
 */
async function getUserPosition(req, res, next) {
  try {
    const user = req.user
    const { cometAddress, collateralAssetAddress } = req.query

    if (!cometAddress || !collateralAssetAddress) {
      throw new ValidationError('Comet address and collateral asset address are required')
    }

    logger.info(`Getting position for ${user.email}`)

    // Get live position from blockchain
    const livePosition = await getPosition(
      user.smartAccountAddress,
      cometAddress,
      collateralAssetAddress
    )

    // Get stored position
    const storedPosition = await Position.findOne({
      userId: user._id,
      protocolAddress: cometAddress,
      status: 'ACTIVE'
    })

    res.json({
      success: true,
      data: {
        smartAccountAddress: user.smartAccountAddress,
        cometAddress,
        collateralAsset: collateralAssetAddress,
        collateralBalance: livePosition.collateral,
        borrowBalance: livePosition.borrowed,
        storedPosition
      }
    })
  } catch (error) {
    logger.error('Get position error:', error)
    next(error)
  }
}

/**
 * Get transaction history
 */
async function getTransactions(req, res, next) {
  try {
    const user = req.user
    const { limit = 20, skip = 0 } = req.query

    const transactions = await Transaction.find({ userId: user._id })
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(skip))

    const total = await Transaction.countDocuments({ userId: user._id })

    res.json({
      success: true,
      data: {
        transactions,
        pagination: {
          total,
          limit: parseInt(limit),
          skip: parseInt(skip)
        }
      }
    })
  } catch (error) {
    logger.error('Get transactions error:', error)
    next(error)
  }
}

module.exports = {
  deposit,
  borrow,
  switchPosition,
  getUserPosition,
  getTransactions
}
