const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticatePrivy } = require('../middleware/auth');

// Public routes
router.post('/login', authController.loginOrRegister);

// Protected routes
router.use(authenticatePrivy);

// Session key registration flow (user must sign via Privy)
router.get('/session-key/registration-data', authController.getSessionKeyRegistrationData);
router.post('/session-key/confirm', authController.confirmSessionKeyRegistration);
router.get('/session-key/status', authController.getSessionKeyStatus);

router.get('/profile', authController.getProfile);

module.exports = router;
