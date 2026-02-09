const express = require('express')
const router = express.Router()
const alchemyAuthController = require('../controllers/alchemyAuthController')
const { authenticatePrivy } = require('../middleware/auth')

// Public routes
router.post('/login', alchemyAuthController.loginOrRegister)

// Protected routes
router.use(authenticatePrivy)
router.post('/session-key', alchemyAuthController.setupSessionKey)
router.get('/profile', alchemyAuthController.getProfile)

module.exports = router
