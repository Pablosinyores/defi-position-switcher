const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticatePrivy } = require('../middleware/auth');

// Public routes
router.post('/login', authController.loginOrRegister);

// Protected routes
router.use(authenticatePrivy);
router.post('/session-key', authController.setupSessionKey);
router.get('/session-key/status', authController.getSessionKeyStatus);
router.get('/profile', authController.getProfile);

module.exports = router;
