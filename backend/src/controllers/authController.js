const User = require('../models/User');
const erc4337Service = require('../services/erc4337.service');
const { ethers } = require('ethers');
const { generatePrivateKey, privateKeyToAccount } = require('viem/accounts');
const logger = require('../utils/logger');
const { ValidationError } = require('../utils/errors');
const { encrypt, decrypt } = require('../utils/encryption');

/**
 * Register or login user with Privy
 *
 * IMPORTANT: The user's Privy EOA wallet is the OWNER of the smart account.
 * Backend does NOT have owner access - only session key access after user grants it.
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
            smartAccountAddress: user.smartAccountAddress,
            hasSessionKey: !!user.sessionKey?.address && user.sessionKey?.isGranted,
            sessionKeyAddress: user.sessionKey?.address,
            sessionKeyExpiry: user.sessionKey?.expiresAt
          }
        }
      });
    }

    // New user registration - wallet address is required
    if (!privyWalletAddress) {
      throw new ValidationError('Privy wallet address is required for new users');
    }

    // Compute Smart Account address with Privy EOA as owner (counterfactual)
    // The user's Privy wallet IS the owner - backend has NO owner access
    const { address: smartAccountAddress } = await erc4337Service.computeSmartAccountAddress(privyWalletAddress);

    // Generate a unique session key for this user
    // This key will be registered on the smart account after user signs
    const sessionKeyPrivate = generatePrivateKey();
    const sessionKeyAccount = privateKeyToAccount(sessionKeyPrivate);

    user = new User({
      privyId: privyUserId,
      email,
      privyWalletAddress,
      smartAccountAddress,
      sessionKey: {
        address: sessionKeyAccount.address,
        encryptedPrivateKey: encrypt(sessionKeyPrivate),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
        permissions: ['SWAP', 'SUPPLY', 'BORROW', 'REPAY', 'SWITCH_PROTOCOL'],
        isGranted: false  // Not granted until user signs registration
      }
    });

    await user.save();

    logger.info(`User created:
      Email: ${email}
      Privy EOA (OWNER): ${privyWalletAddress}
      Smart Account: ${smartAccountAddress}
      Session Key: ${sessionKeyAccount.address} (pending user signature)
    `);

    res.status(201).json({
      success: true,
      data: {
        user: {
          id: user._id,
          email: user.email,
          eoaAddress: privyWalletAddress,
          privyWalletAddress,
          smartAccountAddress,
          hasSessionKey: false,
          // Return session key address so frontend can build registration UserOp
          sessionKeyAddress: sessionKeyAccount.address
        },
        message: 'User created. Smart account owner is your Privy wallet. Please activate to deploy and grant session key.'
      }
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get the data needed for user to sign session key registration
 * Returns the unsigned UserOp that the user must sign via Privy
 */
async function getSessionKeyRegistrationData(req, res, next) {
  try {
    const user = req.user;

    if (!user.sessionKey?.address) {
      return res.status(400).json({
        success: false,
        error: 'No session key generated. Please login again.'
      });
    }

    // Check if session key already registered
    if (user.sessionKey.isGranted) {
      const isRegistered = await erc4337Service.isSessionKeyRegistered(
        user.smartAccountAddress,
        user.sessionKey.address
      );
      if (isRegistered) {
        return res.json({
          success: true,
          data: {
            alreadyRegistered: true,
            sessionKeyAddress: user.sessionKey.address,
            expiresAt: user.sessionKey.expiresAt,
            message: 'Session key already registered'
          }
        });
      }
    }

    // Build the unsigned UserOp for session key registration
    // User must sign this with their Privy wallet (the owner)
    const registrationData = await erc4337Service.buildSessionKeyRegistrationUserOp(
      user.smartAccountAddress,
      user.privyWalletAddress,  // Owner is Privy wallet
      user.sessionKey.address,
      user.sessionKey.expiresAt
    );

    // Store the UserOp in the user record so we can retrieve it during confirmation
    // This avoids timestamp mismatch when rebuilding
    user.sessionKey.pendingUserOp = JSON.stringify(registrationData.userOp);
    user.sessionKey.pendingUserOpHash = registrationData.userOpHash;
    await user.save();

    logger.info(`Session key registration data generated for ${user.email}`);

    res.json({
      success: true,
      data: {
        ...registrationData,
        sessionKeyAddress: user.sessionKey.address,
        message: 'Sign this UserOp with your Privy wallet to grant session key access'
      }
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Confirm session key registration after user has signed
 * Called by frontend after user signs the registration UserOp
 */
async function confirmSessionKeyRegistration(req, res, next) {
  try {
    const user = req.user;
    const { signature, userOpHash } = req.body;

    if (!signature) {
      return res.status(400).json({
        success: false,
        error: 'Signature is required'
      });
    }

    // Retrieve the stored UserOp (avoids timestamp mismatch from rebuilding)
    if (!user.sessionKey?.pendingUserOp) {
      return res.status(400).json({
        success: false,
        error: 'No pending registration found. Please request registration data first.'
      });
    }

    const storedUserOp = JSON.parse(user.sessionKey.pendingUserOp);

    // Verify the hash matches what we stored
    if (userOpHash && userOpHash !== user.sessionKey.pendingUserOpHash) {
      logger.warn(`UserOp hash mismatch for ${user.email}: expected ${user.sessionKey.pendingUserOpHash}, got ${userOpHash}`);
    }

    // Submit the stored UserOp with the user's signature
    const result = await erc4337Service.submitSignedUserOp(storedUserOp, signature);

    if (result.success) {
      // Verify session key was actually registered
      const isRegistered = await erc4337Service.isSessionKeyRegistered(
        user.smartAccountAddress,
        user.sessionKey.address
      );

      if (isRegistered) {
        // Update user record - session key is now granted
        user.sessionKey.isGranted = true;
        // Clear the pending data
        user.sessionKey.pendingUserOp = undefined;
        user.sessionKey.pendingUserOpHash = undefined;
        await user.save();

        logger.info(`Session key registered for user: ${user.email}
          Smart Account: ${user.smartAccountAddress}
          Session Key: ${user.sessionKey.address}
          Tx: ${result.txHash}
        `);
      } else {
        result.success = false;
        result.error = 'Session key registration transaction succeeded but key not found on-chain';
      }
    }

    res.json({
      success: result.success,
      data: {
        sessionKeyAddress: user.sessionKey.address,
        smartAccountAddress: user.smartAccountAddress,
        expiresAt: user.sessionKey.expiresAt,
        txHash: result.txHash,
        message: result.success
          ? 'Session key registered. Backend can now execute gasless transactions.'
          : result.error || 'Failed to register session key'
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
  getSessionKeyRegistrationData,
  confirmSessionKeyRegistration,
  getSessionKeyStatus,
  getProfile
};
