const express = require('express')
const router = express.Router()
const defiController = require('../controllers/defiController')
const { authenticatePrivy } = require('../middleware/auth')

// All routes require authentication
router.use(authenticatePrivy)

// Get current position
router.get('/position', defiController.getPosition)

// Get market comparison
router.get('/markets', defiController.getMarketComparison)

// Supply collateral
router.post('/supply', defiController.supply)

// Borrow
router.post('/borrow', defiController.borrow)

// Repay
router.post('/repay', defiController.repay)

// Withdraw
router.post('/withdraw', defiController.withdraw)

// Switch position between Comets
router.post('/switch', defiController.switchPosition)

// Get transaction history
router.get('/transactions', defiController.getTransactions)

module.exports = router
