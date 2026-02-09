const mongoose = require('mongoose');
const logger = require('../utils/logger');
const config = require('./index');

const connectDB = async () => {
  try {
    // Note: useNewUrlParser and useUnifiedTopology are deprecated in MongoDB driver 4.x+
    await mongoose.connect(config.mongodbUri);

    logger.info('MongoDB connected successfully');

    // Clean up legacy indexes that may cause issues
    await cleanupLegacyIndexes();

    mongoose.connection.on('error', (err) => {
      logger.error('MongoDB connection error:', err);
    });

    mongoose.connection.on('disconnected', () => {
      logger.warn('MongoDB disconnected');
    });

    process.on('SIGINT', async () => {
      await mongoose.connection.close();
      logger.info('MongoDB connection closed through app termination');
      process.exit(0);
    });

  } catch (error) {
    logger.error('Failed to connect to MongoDB:', error);
    process.exit(1);
  }
};

/**
 * Drop legacy indexes that may conflict with current schema
 */
async function cleanupLegacyIndexes() {
  try {
    const db = mongoose.connection.db;
    const usersCollection = db.collection('users');

    // Get current indexes
    const indexes = await usersCollection.indexes();

    // Drop legacy smartWalletAddress index if it exists
    const legacyIndex = indexes.find(idx => idx.name === 'smartWalletAddress_1');
    if (legacyIndex) {
      await usersCollection.dropIndex('smartWalletAddress_1');
      logger.info('Dropped legacy smartWalletAddress_1 index');
    }

    // Also check for any other legacy indexes
    const legacyIndexes = ['walletAddress_1', 'smartWallet_1'];
    for (const indexName of legacyIndexes) {
      const idx = indexes.find(i => i.name === indexName);
      if (idx) {
        await usersCollection.dropIndex(indexName);
        logger.info(`Dropped legacy ${indexName} index`);
      }
    }
  } catch (error) {
    // Ignore errors if collection doesn't exist yet
    if (error.code !== 26) { // 26 = NamespaceNotFound
      logger.warn('Error cleaning up legacy indexes:', error.message);
    }
  }
}

module.exports = connectDB;
