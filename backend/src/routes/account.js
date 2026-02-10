const express = require('express')
const router = express.Router()
const accountController = require('../controllers/accountController')
const { authenticatePrivy } = require('../middleware/auth')

// All routes require authentication
router.use(authenticatePrivy)

// Get smart account status
router.get('/status', accountController.getStatus)

// Get token balances (smart account)
router.get('/balances', accountController.getBalances)

// Get Compound V3 positions
router.get('/positions', accountController.getPositions)

// Fund Smart Account with test tokens (Tenderly only)
// Tokens go directly to smart account - no approval needed!
router.post('/fund', accountController.fundSmartAccount)

module.exports = router
