const User = require('../models/User');
const erc4337Service = require('../services/erc4337.service');
const { ethers } = require('ethers');
const logger = require('../utils/logger');
const { ValidationError } = require('../utils/errors');
const { encrypt, decrypt } = require('../utils/encryption');

/**
 * Register or login user with Privy
 */
async function loginOrRegister(req, res, next) {
  try {
    const { privyUserId, privyWalletAddress, email } = req.body;

    if (!privyUserId || !email) {
      throw new ValidationError('Privy user ID and email are required');
    }

    // Check if user exists first (no wallet required for login)
    let user = await User.findOne({ privyId: privyUserId });

    if (user) {
      // Update wallet address if provided and different
      if (privyWalletAddress && privyWalletAddress !== user.privyWalletAddress) {
        user.privyWalletAddress = privyWalletAddress;
        await user.save();
      }

      logger.info(`User logged in: ${user.email}`);
      return res.json({
        success: true,
        data: {
          user: {
            id: user._id,
            email: user.email,
            eoaAddress: user.privyWalletAddress,
            privyWalletAddress: user.privyWalletAddress,
            smartWalletAddress: user.smartAccountAddress,
            smartAccountAddress: user.smartAccountAddress,
            hasSessionKey: !!user.sessionKey?.address && user.sessionKey?.isGranted,
            sessionKeyExpiry: user.sessionKey?.expiresAt
          }
        }
      });
    }

    // New user registration - wallet address is required
    if (!privyWalletAddress) {
      throw new ValidationError('Privy wallet address is required for new users');
    }

    // Generate owner key for the Smart Account
    // NOTE: In production, the user's Privy wallet should ideally be the owner
    // But since we need to sign UserOps on the backend, we create a managed owner key
    const ownerWallet = ethers.Wallet.createRandom();
    const ownerPrivateKey = ownerWallet.privateKey;

    // Create Smart Account using ERC-6900 ModularAccount
    const { address: smartAccountAddress } = await erc4337Service.createSmartAccount(ownerPrivateKey);
    const eoa = privyWalletAddress;

    user = new User({
      privyId: privyUserId,
      email,
      privyWalletAddress: eoa,
      smartAccountAddress,
      encryptedOwnerKey: encrypt(ownerPrivateKey)
    });

    await user.save();

    logger.info(`User created:
      Email: ${email}
      Privy EOA: ${eoa}
      Smart Account: ${smartAccountAddress}
    `);

    res.status(201).json({
      success: true,
      data: {
        user: {
          id: user._id,
          email: user.email,
          eoaAddress: eoa,
          privyWalletAddress: eoa,
          smartWalletAddress: smartAccountAddress,
          smartAccountAddress,
          hasSessionKey: false
        },
        message: 'User and Smart Account created successfully'
      }
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Setup session key for gasless transactions
 * Uses ERC-6900 Session Key Plugin
 */
async function setupSessionKey(req, res, next) {
  try {
    const user = req.user;

    // Check if session key already exists and is valid
    const isRegistered = await erc4337Service.isSessionKeyRegistered(user.smartAccountAddress);
    if (isRegistered && user.sessionKey?.expiresAt && new Date(user.sessionKey.expiresAt) > new Date()) {
      return res.json({
        success: true,
        data: {
          sessionKeyAddress: user.sessionKey.address,
          expiresAt: user.sessionKey.expiresAt,
          message: 'Session key already exists and is valid'
        }
      });
    }

    // Check if account is deployed
    const isDeployed = await erc4337Service.isAccountDeployed(user.smartAccountAddress);
    if (!isDeployed) {
      return res.status(400).json({
        success: false,
        error: 'Smart account not deployed. Please activate your account first.'
      });
    }

    // Decrypt owner key to install session key plugin
    const ownerPrivateKey = decrypt(user.encryptedOwnerKey);

    // Install Session Key Plugin with DeFi permissions
    const result = await erc4337Service.installSessionKeyPlugin(ownerPrivateKey, user.smartAccountAddress);

    // Update user record
    user.sessionKey = {
      address: result.sessionKeyAddress,
      expiresAt: result.expiresAt,
      permissions: ['SWAP', 'SUPPLY', 'BORROW', 'REPAY', 'SWITCH_PROTOCOL'],
      isGranted: result.installed
    };

    await user.save();

    logger.info(`Session key plugin installed for user: ${user.email}
      Smart Account: ${user.smartAccountAddress}
      Session Key: ${result.sessionKeyAddress}
    `);

    res.json({
      success: true,
      data: {
        sessionKeyAddress: result.sessionKeyAddress,
        smartAccountAddress: user.smartAccountAddress,
        expiresAt: result.expiresAt,
        txHash: result.txHash,
        message: 'Session key plugin installed. User can now perform gasless transactions.'
      }
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get session key status
 */
async function getSessionKeyStatus(req, res, next) {
  try {
    const user = req.user;

    const isRegistered = await erc4337Service.isSessionKeyRegistered(user.smartAccountAddress);
    const isExpired = user.sessionKey?.expiresAt ? new Date(user.sessionKey.expiresAt) < new Date() : true;

    res.json({
      success: true,
      data: {
        hasSessionKey: isRegistered && !isExpired,
        sessionKeyAddress: user.sessionKey?.address,
        expiresAt: user.sessionKey?.expiresAt,
        isExpired,
        isRegistered
      }
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get user profile
 */
async function getProfile(req, res, next) {
  try {
    const user = req.user;

    res.json({
      success: true,
      data: {
        user: {
          id: user._id,
          email: user.email,
          // Include both aliases for consistency with loginOrRegister
          eoaAddress: user.privyWalletAddress,
          privyWalletAddress: user.privyWalletAddress,
          smartWalletAddress: user.smartAccountAddress,
          smartAccountAddress: user.smartAccountAddress,
          hasSessionKey: !!user.sessionKey?.address && user.sessionKey?.isGranted,
          sessionKeyExpiry: user.sessionKey?.expiresAt,
          sessionKey: user.sessionKey ? {
            address: user.sessionKey.address,
            expiresAt: user.sessionKey.expiresAt,
            permissions: user.sessionKey.permissions,
            isGranted: user.sessionKey.isGranted
          } : null,
          createdAt: user.createdAt
        }
      }
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  loginOrRegister,
  setupSessionKey,
  getSessionKeyStatus,
  getProfile
};
