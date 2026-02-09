const express = require('express')
const router = express.Router()
const alchemyBorrowController = require('../controllers/alchemyBorrowController')
const { authenticatePrivy } = require('../middleware/auth')

// All routes require authentication
router.use(authenticatePrivy)

// DeFi operations
router.post('/deposit', alchemyBorrowController.deposit)
router.post('/borrow', alchemyBorrowController.borrow)
router.post('/switch-comet', alchemyBorrowController.switchPosition)

// Query operations
router.get('/position', alchemyBorrowController.getUserPosition)
router.get('/transactions', alchemyBorrowController.getTransactions)

module.exports = router
