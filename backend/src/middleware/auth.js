const { PrivyClient } = require('@privy-io/server-auth');
const config = require('../config');
const { AuthenticationError } = require('../utils/errors');
const User = require('../models/User');
const logger = require('../utils/logger');

const privyClient = new PrivyClient(
  config.privy.appId,
  config.privy.appSecret
);

/**
 * Middleware to verify Privy authentication token
 */
async function authenticatePrivy(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AuthenticationError('No authentication token provided');
    }

    const token = authHeader.split(' ')[1];

    // Verify token with Privy
    const verifiedClaims = await privyClient.verifyAuthToken(token);

    if (!verifiedClaims || !verifiedClaims.userId) {
      throw new AuthenticationError('Invalid authentication token');
    }

    // Fetch user from database
    const user = await User.findOne({ privyId: verifiedClaims.userId });

    if (!user) {
      throw new AuthenticationError('User not found');
    }

    // Attach user to request
    req.user = user;
    req.privyUserId = verifiedClaims.userId;

    next();
  } catch (error) {
    logger.error('Authentication error:', error);

    if (error instanceof AuthenticationError) {
      return res.status(error.statusCode).json({
        success: false,
        error: error.message
      });
    }

    return res.status(401).json({
      success: false,
      error: 'Authentication failed'
    });
  }
}

module.exports = {
  authenticatePrivy,
  privyClient
};
