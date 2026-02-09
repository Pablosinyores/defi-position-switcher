const express = require('express')
const router = express.Router()
const accountController = require('../controllers/accountController')
const { authenticatePrivy } = require('../middleware/auth')

// All routes require authentication
router.use(authenticatePrivy)

// Activate smart account (deploy + install session key)
router.post('/activate', accountController.activate)

// Get smart account status
router.get('/status', accountController.getStatus)

// Get token balances
router.get('/balances', accountController.getBalances)

// Get Compound V3 positions
router.get('/positions', accountController.getPositions)

// Fund EOA with test tokens (Tenderly only)
router.post('/fund', accountController.fundEOA)

// Get EOA balances
router.get('/eoa-balances', accountController.getEOABalances)

// Approve smart account to spend EOA tokens
router.post('/approve', accountController.approveSmartAccount)

// Pull tokens from EOA to Smart Account via session key (gasless!)
router.post('/pull', accountController.pullFromEOA)

module.exports = router
