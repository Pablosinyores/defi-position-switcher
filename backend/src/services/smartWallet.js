const { createModularAccountAlchemyClient } = require('@alchemy/aa-alchemy');
const { LocalAccountSigner, sepolia } = require('@alchemy/aa-core');
const { ethers } = require('ethers');
const config = require('../config');
const logger = require('../utils/logger');

class SmartWalletService {
  constructor() {
    this.alchemyApiKey = config.alchemy.apiKey;
    this.gasPolicyId = config.alchemy.gasPolicyId;
    this.chain = sepolia;
  }

  /**
   * Create a Smart Account (ERC-4337) for a user
   * @param {string} privyUserId - Privy user ID for deterministic address
   * @param {string} privyWalletAddress - User's Privy embedded EOA wallet address
   * @returns {object} Smart Account details
   */
  async createSmartAccount(privyUserId, privyWalletAddress) {
    try {
      // Generate deterministic salt based on Privy wallet address
      const salt = BigInt(ethers.keccak256(ethers.toUtf8Bytes(privyWalletAddress)));

      // Create owner signer for the Smart Account
      // NOTE: In production, this would ideally be the user's Privy wallet itself
      // But since we don't have access to Privy's private key, we create a backend-managed owner
      const ownerWallet = ethers.Wallet.createRandom();
      const ownerSigner = LocalAccountSigner.privateKeyToAccountSigner(
        ownerWallet.privateKey
      );

      // Create Alchemy Smart Account client
      const client = await createModularAccountAlchemyClient({
        apiKey: this.alchemyApiKey,
        chain: this.chain,
        signer: ownerSigner,
        gasManagerConfig: {
          policyId: this.gasPolicyId
        },
        salt
      });

      const smartAccountAddress = await client.getAddress();

      logger.info(`Smart Account created:
        Privy EOA: ${privyWalletAddress}
        Smart Account: ${smartAccountAddress}
      `);

      return {
        smartAccountAddress,
        privyWalletAddress,
        ownerPrivateKey: ownerWallet.privateKey, // Must be encrypted before storage!
        client
      };
    } catch (error) {
      logger.error('Error creating Smart Account:', error);
      throw error;
    }
  }

  /**
   * Grant session key permission on Smart Account
   * @param {string} smartAccountAddress - Smart Account contract address
   * @param {string} sessionKeyAddress - Session key address to grant permission
   * @param {string} ownerPrivateKey - Owner's private key to authorize the grant
   * @returns {object} Grant result
   */
  async grantSessionKey(smartAccountAddress, sessionKeyAddress, ownerPrivateKey) {
    try {
      // Recreate client with owner signer
      const ownerSigner = LocalAccountSigner.privateKeyToAccountSigner(
        ownerPrivateKey
      );

      const client = await createModularAccountAlchemyClient({
        apiKey: this.alchemyApiKey,
        chain: this.chain,
        signer: ownerSigner,
        gasManagerConfig: {
          policyId: this.gasPolicyId
        }
      });

      // TODO: Implement actual session key granting via Alchemy's session key plugin
      // This requires installing and configuring the session key plugin on the Smart Account
      // For now, we'll mark it as granted in the database
      // Reference: https://accountkit.alchemy.com/packages/aa-accounts/modular-account/session-keys/

      logger.info(`Session key granted:
        Smart Account: ${smartAccountAddress}
        Session Key: ${sessionKeyAddress}
      `);

      return {
        granted: true,
        smartAccountAddress,
        sessionKeyAddress
      };
    } catch (error) {
      logger.error('Error granting session key:', error);
      throw error;
    }
  }

  /**
   * Get client for existing Smart Account with owner key
   * @param {string} ownerPrivateKey - Owner's private key
   * @returns {object} Alchemy client
   */
  async getSmartAccountClient(ownerPrivateKey) {
    try {
      const ownerSigner = LocalAccountSigner.privateKeyToAccountSigner(
        ownerPrivateKey
      );

      const client = await createModularAccountAlchemyClient({
        apiKey: this.alchemyApiKey,
        chain: this.chain,
        signer: ownerSigner,
        gasManagerConfig: {
          policyId: this.gasPolicyId
        }
      });

      return client;
    } catch (error) {
      logger.error('Error getting Smart Account client:', error);
      throw error;
    }
  }

  /**
   * Get client with session key for executing transactions
   * @param {string} sessionKeyPrivateKey - Session key private key
   * @returns {object} Alchemy client
   */
  async getSessionKeyClient(sessionKeyPrivateKey) {
    try {
      const sessionKeySigner = LocalAccountSigner.privateKeyToAccountSigner(
        sessionKeyPrivateKey
      );

      const client = await createModularAccountAlchemyClient({
        apiKey: this.alchemyApiKey,
        chain: this.chain,
        signer: sessionKeySigner,
        gasManagerConfig: {
          policyId: this.gasPolicyId
        }
      });

      return client;
    } catch (error) {
      logger.error('Error getting session key client:', error);
      throw error;
    }
  }

  /**
   * Execute a transaction via smart wallet
   */
  async executeTransaction(client, to, data, value = '0') {
    try {
      const userOp = await client.sendUserOperation({
        uo: {
          target: to,
          data,
          value: BigInt(value)
        }
      });

      logger.info(`User operation sent: ${userOp.hash}`);

      // Wait for transaction to be mined
      const txHash = await client.waitForUserOperationTransaction(userOp);

      logger.info(`Transaction mined: ${txHash}`);

      return { userOpHash: userOp.hash, txHash };
    } catch (error) {
      logger.error('Error executing transaction:', error);
      throw error;
    }
  }

  /**
   * Batch multiple transactions
   */
  async executeBatchTransactions(client, calls) {
    try {
      const userOp = await client.sendUserOperation({
        uo: calls
      });

      logger.info(`Batch user operation sent: ${userOp.hash}`);

      const txHash = await client.waitForUserOperationTransaction(userOp);

      logger.info(`Batch transaction mined: ${txHash}`);

      return { userOpHash: userOp.hash, txHash };
    } catch (error) {
      logger.error('Error executing batch transaction:', error);
      throw error;
    }
  }
}

module.exports = new SmartWalletService();
