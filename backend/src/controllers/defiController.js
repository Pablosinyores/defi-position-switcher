/**
 * DeFi Controller
 *
 * Handles DeFi operations via ERC-4337 session keys:
 * - Get positions
 * - Supply/Withdraw collateral
 * - Borrow/Repay
 * - Cross-Comet switch
 */

const { ethers } = require('ethers')
const erc4337Service = require('../services/erc4337.service')
const Transaction = require('../models/Transaction')
const config = require('../config')
const logger = require('../utils/logger')
const { decrypt } = require('../utils/encryption')

/**
 * Helper to get decrypted session key from user
 */
function getSessionKey(user) {
  if (!user.sessionKey?.isGranted || !user.sessionKey?.encryptedPrivateKey) {
    return null
  }
  return decrypt(user.sessionKey.encryptedPrivateKey)
}

// Contract addresses (constant mainnet addresses)
const USDC_COMET = '0xc3d688B66703497DAA19211EEdff47f25384cdc3'
const WETH_COMET = '0xA17581A9E3356d9A858b789D68B4d866e593aE94'
const WBTC = '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599'
const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
const WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'
const SWAP_POOL = '0x7BeA39867e4169DBe237d55C8242a8f2fcDcc387' // 1% USDC/WETH pool for price

// Provider for price queries
const provider = new ethers.JsonRpcProvider(config.blockchain.rpcUrl)

// ABIs
const ERC20_ABI = [
  'function approve(address spender, uint256 amount) returns (bool)',
]

const COMET_ABI = [
  'function supply(address asset, uint256 amount) external',
  'function withdraw(address asset, uint256 amount) external',
  'function allow(address manager, bool isAllowed) external',
  'function borrowBalanceOf(address account) view returns (uint256)',
]

const UNISWAP_POOL_ABI = [
  'function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)',
  'function token0() view returns (address)',
  'function token1() view returns (address)',
]

/**
 * Get current ETH/USDC price from Uniswap pool
 * Returns price as USDC per 1 ETH (e.g., 2500 means 1 ETH = 2500 USDC)
 */
async function getEthUsdcPrice() {
  try {
    if (!SWAP_POOL) {
      logger.warn('SWAP_POOL not configured, using default price')
      return 2500 // Fallback price
    }

    const pool = new ethers.Contract(SWAP_POOL, UNISWAP_POOL_ABI, provider)
    const [slot0, token0] = await Promise.all([
      pool.slot0(),
      pool.token0()
    ])

    const sqrtPriceX96 = slot0.sqrtPriceX96

    // Calculate price from sqrtPriceX96
    // price = (sqrtPriceX96 / 2^96)^2
    const Q96 = 2n ** 96n
    const sqrtPrice = BigInt(sqrtPriceX96)

    // Uniswap stores price as token1/token0
    // In USDC/WETH pool: token0 = USDC, token1 = WETH
    // So sqrtPriceX96 gives us WETH/USDC (how many USDC per WETH)
    // But we need to account for decimals (USDC=6, WETH=18)

    // price = (sqrtPrice^2) / 2^192 * 10^(token0Decimals - token1Decimals)
    // For USDC(6)/WETH(18): multiply by 10^12

    // Check if USDC is token0 (it should be in this pool)
    const usdcIsToken0 = token0.toLowerCase() === USDC?.toLowerCase()

    // Calculate raw price (as float for simplicity)
    const priceRaw = Number(sqrtPrice * sqrtPrice) / Number(Q96 * Q96)

    let ethUsdcPrice
    if (usdcIsToken0) {
      // sqrtPriceX96 gives WETH/USDC, but with 6 vs 18 decimals
      // Actual price = priceRaw * 10^(6-18) = priceRaw * 10^-12
      // This gives WETH per USDC, so invert for USDC per WETH
      ethUsdcPrice = 1 / (priceRaw * 1e-12)
    } else {
      // sqrtPriceX96 gives USDC/WETH with 18 vs 6 decimals
      ethUsdcPrice = priceRaw * 1e12
    }

    logger.info(`Current ETH/USDC price from Uniswap: ${ethUsdcPrice.toFixed(2)}`)
    return ethUsdcPrice
  } catch (error) {
    logger.error('Failed to get ETH/USDC price:', error.message)
    return 2500 // Fallback price
  }
}

/**
 * Calculate borrow amount needed to cover debt repayment after swap
 * @param {bigint} debtAmount - The debt to repay in source token
 * @param {string} sourceToken - 'USDC' or 'WETH'
 * @param {number} ethPrice - Current ETH/USDC price
 * @returns {bigint} - Amount to borrow in target token
 */
function calculateBorrowAmount(debtAmount, sourceToken, ethPrice) {
  // Add buffer for:
  // - Flash loan fee: 0.05% (on 0.05% pool)
  // - Swap fee: 1% (on 1% pool)
  // - Slippage buffer: 0.5%
  // Total: ~1.55% buffer, round up to 2% for safety
  const BUFFER_MULTIPLIER = 1.02

  const debtFloat = Number(debtAmount)

  if (sourceToken === 'USDC') {
    // Debt is in USDC, need to borrow WETH
    // USDC has 6 decimals, WETH has 18
    const debtUsdc = debtFloat / 1e6
    const wethNeeded = (debtUsdc * BUFFER_MULTIPLIER) / ethPrice
    const wethWei = BigInt(Math.ceil(wethNeeded * 1e18))
    logger.info(`Calculated borrow: ${debtUsdc.toFixed(2)} USDC debt -> ${wethNeeded.toFixed(6)} WETH needed`)
    return wethWei
  } else {
    // Debt is in WETH, need to borrow USDC
    // WETH has 18 decimals, USDC has 6
    const debtWeth = debtFloat / 1e18
    const usdcNeeded = debtWeth * ethPrice * BUFFER_MULTIPLIER
    const usdcUnits = BigInt(Math.ceil(usdcNeeded * 1e6))
    logger.info(`Calculated borrow: ${debtWeth.toFixed(6)} WETH debt -> ${usdcNeeded.toFixed(2)} USDC needed`)
    return usdcUnits
  }
}

/**
 * Get current DeFi position
 */
async function getPosition(req, res, next) {
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
    logger.error('Get position error:', error)
    next(error)
  }
}

/**
 * Get market comparison (APY rates)
 */
async function getMarketComparison(req, res, next) {
  try {
    // Static rates for now - in production would fetch from on-chain
    const markets = {
      USDC: {
        comet: USDC_COMET,
        name: 'USDC Comet',
        baseToken: 'USDC',
        supplyAPY: '3.2%',
        borrowAPY: '4.8%',
        collateralFactor: '82%'
      },
      WETH: {
        comet: WETH_COMET,
        name: 'WETH Comet',
        baseToken: 'WETH',
        supplyAPY: '1.8%',
        borrowAPY: '3.2%',
        collateralFactor: '85%'
      }
    }

    res.json({
      success: true,
      data: { markets }
    })
  } catch (error) {
    logger.error('Get market comparison error:', error)
    next(error)
  }
}

/**
 * Supply collateral to Comet
 */
async function supply(req, res, next) {
  try {
    const user = req.user
    const { comet, asset, amount } = req.body

    if (!user.smartAccountAddress) {
      return res.status(400).json({
        success: false,
        error: 'No smart account address found'
      })
    }

    // Get session key
    const sessionKeyPrivate = getSessionKey(user)
    if (!sessionKeyPrivate) {
      return res.status(400).json({
        success: false,
        error: 'Session key not granted. Please complete account activation first.'
      })
    }

    const cometAddress = comet === 'USDC' ? USDC_COMET : WETH_COMET
    const assetAddress = asset === 'WBTC' ? WBTC : asset === 'USDC' ? USDC : WETH

    // Get decimals
    let decimals = 18
    if (asset === 'WBTC') decimals = 8
    if (asset === 'USDC') decimals = 6

    const amountWei = ethers.parseUnits(amount.toString(), decimals)

    // Build calls: approve + supply
    const erc20Iface = new ethers.Interface(ERC20_ABI)
    const cometIface = new ethers.Interface(COMET_ABI)

    const calls = [
      {
        target: assetAddress,
        value: 0n,
        data: erc20Iface.encodeFunctionData('approve', [cometAddress, amountWei])
      },
      {
        target: cometAddress,
        value: 0n,
        data: cometIface.encodeFunctionData('supply', [assetAddress, amountWei])
      }
    ]

    logger.info(`Supplying ${amount} ${asset} to ${comet} Comet for ${user.smartAccountAddress}`)

    const result = await erc4337Service.executeWithSessionKey(user.smartAccountAddress, calls, sessionKeyPrivate)

    // Save transaction
    await Transaction.create({
      user: user._id,
      smartAccountAddress: user.smartAccountAddress,
      type: 'SUPPLY',
      protocol: comet === 'USDC' ? 'COMPOUND_USDC' : 'COMPOUND_WETH',
      asset,
      amount: amount.toString(),
      txHash: result.txHash,
      userOpHash: result.userOpHash,
      status: result.success ? 'SUCCESS' : 'FAILED'
    })

    res.json({
      success: result.success,
      data: {
        txHash: result.txHash,
        userOpHash: result.userOpHash,
        gasUsed: result.gasUsed
      }
    })
  } catch (error) {
    logger.error('Supply error:', error)
    next(error)
  }
}

/**
 * Borrow from Comet
 */
async function borrow(req, res, next) {
  try {
    const user = req.user
    const { comet, asset, amount } = req.body

    if (!user.smartAccountAddress) {
      return res.status(400).json({
        success: false,
        error: 'No smart account address found'
      })
    }

    // Get session key
    const sessionKeyPrivate = getSessionKey(user)
    if (!sessionKeyPrivate) {
      return res.status(400).json({
        success: false,
        error: 'Session key not granted. Please complete account activation first.'
      })
    }

    const cometAddress = comet === 'USDC' ? USDC_COMET : WETH_COMET
    const assetAddress = comet === 'USDC' ? USDC : WETH

    // Get decimals
    const decimals = comet === 'USDC' ? 6 : 18
    const amountWei = ethers.parseUnits(amount.toString(), decimals)

    // Build call: withdraw (borrow)
    const cometIface = new ethers.Interface(COMET_ABI)

    const calls = [{
      target: cometAddress,
      value: 0n,
      data: cometIface.encodeFunctionData('withdraw', [assetAddress, amountWei])
    }]

    logger.info(`Borrowing ${amount} from ${comet} Comet for ${user.smartAccountAddress}`)

    const result = await erc4337Service.executeWithSessionKey(user.smartAccountAddress, calls, sessionKeyPrivate)

    // Save transaction
    await Transaction.create({
      user: user._id,
      smartAccountAddress: user.smartAccountAddress,
      type: 'BORROW',
      protocol: comet === 'USDC' ? 'COMPOUND_USDC' : 'COMPOUND_WETH',
      asset: comet,
      amount: amount.toString(),
      txHash: result.txHash,
      userOpHash: result.userOpHash,
      status: result.success ? 'SUCCESS' : 'FAILED'
    })

    res.json({
      success: result.success,
      data: {
        txHash: result.txHash,
        userOpHash: result.userOpHash,
        gasUsed: result.gasUsed
      }
    })
  } catch (error) {
    logger.error('Borrow error:', error)
    next(error)
  }
}

/**
 * Repay borrowed amount
 */
async function repay(req, res, next) {
  try {
    const user = req.user
    const { comet, asset, amount } = req.body

    if (!user.smartAccountAddress) {
      return res.status(400).json({
        success: false,
        error: 'No smart account address found'
      })
    }

    // Get session key
    const sessionKeyPrivate = getSessionKey(user)
    if (!sessionKeyPrivate) {
      return res.status(400).json({
        success: false,
        error: 'Session key not granted. Please complete account activation first.'
      })
    }

    const cometAddress = comet === 'USDC' ? USDC_COMET : WETH_COMET
    const assetAddress = comet === 'USDC' ? USDC : WETH

    // Get decimals
    const decimals = comet === 'USDC' ? 6 : 18
    const amountWei = ethers.parseUnits(amount.toString(), decimals)

    // Build calls: approve + supply (repay)
    const erc20Iface = new ethers.Interface(ERC20_ABI)
    const cometIface = new ethers.Interface(COMET_ABI)

    const calls = [
      {
        target: assetAddress,
        value: 0n,
        data: erc20Iface.encodeFunctionData('approve', [cometAddress, amountWei])
      },
      {
        target: cometAddress,
        value: 0n,
        data: cometIface.encodeFunctionData('supply', [assetAddress, amountWei])
      }
    ]

    logger.info(`Repaying ${amount} to ${comet} Comet for ${user.smartAccountAddress}`)

    const result = await erc4337Service.executeWithSessionKey(user.smartAccountAddress, calls, sessionKeyPrivate)

    // Save transaction
    await Transaction.create({
      user: user._id,
      smartAccountAddress: user.smartAccountAddress,
      type: 'REPAY',
      protocol: comet === 'USDC' ? 'COMPOUND_USDC' : 'COMPOUND_WETH',
      asset: comet,
      amount: amount.toString(),
      txHash: result.txHash,
      userOpHash: result.userOpHash,
      status: result.success ? 'SUCCESS' : 'FAILED'
    })

    res.json({
      success: result.success,
      data: {
        txHash: result.txHash,
        userOpHash: result.userOpHash,
        gasUsed: result.gasUsed
      }
    })
  } catch (error) {
    logger.error('Repay error:', error)
    next(error)
  }
}

/**
 * Withdraw collateral
 */
async function withdraw(req, res, next) {
  try {
    const user = req.user
    const { comet, asset, amount } = req.body

    if (!user.smartAccountAddress) {
      return res.status(400).json({
        success: false,
        error: 'No smart account address found'
      })
    }

    // Get session key
    const sessionKeyPrivate = getSessionKey(user)
    if (!sessionKeyPrivate) {
      return res.status(400).json({
        success: false,
        error: 'Session key not granted. Please complete account activation first.'
      })
    }

    const cometAddress = comet === 'USDC' ? USDC_COMET : WETH_COMET
    const assetAddress = asset === 'WBTC' ? WBTC : asset === 'USDC' ? USDC : WETH

    // Get decimals
    let decimals = 18
    if (asset === 'WBTC') decimals = 8
    if (asset === 'USDC') decimals = 6

    const amountWei = ethers.parseUnits(amount.toString(), decimals)

    // Build call: withdraw
    const cometIface = new ethers.Interface(COMET_ABI)

    const calls = [{
      target: cometAddress,
      value: 0n,
      data: cometIface.encodeFunctionData('withdraw', [assetAddress, amountWei])
    }]

    logger.info(`Withdrawing ${amount} ${asset} from ${comet} Comet for ${user.smartAccountAddress}`)

    const result = await erc4337Service.executeWithSessionKey(user.smartAccountAddress, calls, sessionKeyPrivate)

    // Save transaction
    await Transaction.create({
      user: user._id,
      smartAccountAddress: user.smartAccountAddress,
      type: 'WITHDRAW',
      protocol: comet === 'USDC' ? 'COMPOUND_USDC' : 'COMPOUND_WETH',
      asset,
      amount: amount.toString(),
      txHash: result.txHash,
      userOpHash: result.userOpHash,
      status: result.success ? 'SUCCESS' : 'FAILED'
    })

    res.json({
      success: result.success,
      data: {
        txHash: result.txHash,
        userOpHash: result.userOpHash,
        gasUsed: result.gasUsed
      }
    })
  } catch (error) {
    logger.error('Withdraw error:', error)
    next(error)
  }
}

/**
 * Switch position between Comets
 */
async function switchPosition(req, res, next) {
  try {
    const user = req.user
    const { sourceComet, targetComet, collateralAsset, amount } = req.body

    if (!user.smartAccountAddress) {
      return res.status(400).json({
        success: false,
        error: 'No smart account address found'
      })
    }

    // Get session key - required for gasless execution
    const sessionKeyPrivate = getSessionKey(user)
    if (!sessionKeyPrivate) {
      return res.status(400).json({
        success: false,
        error: 'Session key not granted. Please complete account activation first.'
      })
    }

    // Get source comet address
    const sourceCometAddress = sourceComet === 'USDC' ? USDC_COMET : WETH_COMET
    const targetCometAddress = targetComet === 'USDC' ? USDC_COMET : WETH_COMET

    // Get current position
    const positions = await erc4337Service.getPositions(user.smartAccountAddress)
    const sourcePosition = sourceComet === 'USDC' ? positions.USDC : positions.WETH

    if (!sourcePosition || BigInt(sourcePosition.collateral.balance) === 0n) {
      return res.status(400).json({
        success: false,
        error: 'No collateral in source Comet'
      })
    }

    // Calculate amounts
    const collateralAmount = amount
      ? ethers.parseUnits(amount.toString(), 8) // WBTC has 8 decimals
      : BigInt(sourcePosition.collateral.balance)

    // Get actual debt from source Comet
    const sourceCometContract = new ethers.Contract(sourceCometAddress, COMET_ABI, provider)
    const actualDebt = await sourceCometContract.borrowBalanceOf(user.smartAccountAddress)

    if (actualDebt === 0n) {
      return res.status(400).json({
        success: false,
        error: 'No debt to switch. Supply collateral and borrow first.'
      })
    }

    // Get current ETH/USDC price and calculate borrow amount
    const ethPrice = await getEthUsdcPrice()
    const borrowAmount = calculateBorrowAmount(actualDebt, sourceComet, ethPrice)

    logger.info(`Switching position from ${sourceComet} to ${targetComet}`)
    logger.info(`  Collateral: ${ethers.formatUnits(collateralAmount, 8)} WBTC`)
    logger.info(`  Actual debt: ${sourceComet === 'USDC' ? ethers.formatUnits(actualDebt, 6) + ' USDC' : ethers.formatEther(actualDebt) + ' WETH'}`)
    logger.info(`  Borrow amount: ${sourceComet === 'USDC' ? ethers.formatEther(borrowAmount) + ' WETH' : ethers.formatUnits(borrowAmount, 6) + ' USDC'}`)
    logger.info(`  ETH price: $${ethPrice.toFixed(2)}`)

    const result = await erc4337Service.executeCrossSwitch(
      user.smartAccountAddress,
      sourceCometAddress,
      targetCometAddress,
      collateralAmount.toString(),
      borrowAmount.toString(),
      sessionKeyPrivate
    )

    // Save transaction
    await Transaction.create({
      user: user._id,
      smartAccountAddress: user.smartAccountAddress,
      type: 'SWITCH',
      protocol: 'COMPOUND',
      asset: collateralAsset || 'WBTC',
      amount: ethers.formatUnits(collateralAmount, 8),
      txHash: result.txHash,
      userOpHash: result.userOpHash,
      status: result.success ? 'SUCCESS' : 'FAILED',
      metadata: { sourceComet, targetComet }
    })

    // Get updated positions
    const newPositions = await erc4337Service.getPositions(user.smartAccountAddress)

    res.json({
      success: result.success,
      data: {
        txHash: result.txHash,
        userOpHash: result.userOpHash,
        gasUsed: result.gasUsed,
        positions: newPositions
      }
    })
  } catch (error) {
    logger.error('Switch position error:', error)
    next(error)
  }
}

/**
 * Get transaction history
 */
async function getTransactions(req, res, next) {
  try {
    const user = req.user
    const { limit = 20, offset = 0 } = req.query

    const transactions = await Transaction.find({ user: user._id })
      .sort({ createdAt: -1 })
      .skip(parseInt(offset))
      .limit(parseInt(limit))

    const total = await Transaction.countDocuments({ user: user._id })

    res.json({
      success: true,
      data: {
        transactions,
        pagination: {
          total,
          limit: parseInt(limit),
          offset: parseInt(offset)
        }
      }
    })
  } catch (error) {
    logger.error('Get transactions error:', error)
    next(error)
  }
}

module.exports = {
  getPosition,
  getMarketComparison,
  supply,
  borrow,
  repay,
  withdraw,
  switchPosition,
  getTransactions
}
