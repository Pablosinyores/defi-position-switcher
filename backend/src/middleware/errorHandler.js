const logger = require('../utils/logger');
const { AppError } = require('../utils/errors');

/**
 * Parse blockchain/RPC errors and return user-friendly messages
 */
function parseBlockchainError(err) {
  // Check for Tenderly quota limit error
  if (err.error?.code === -32004 || err.message?.includes('quota limit')) {
    return {
      statusCode: 503,
      userMessage: 'Tenderly Virtual Testnet quota exceeded. Please create a new Virtual Testnet fork or upgrade your Tenderly plan.',
      errorCode: 'TENDERLY_QUOTA_EXCEEDED',
      actionRequired: 'Create a new Virtual Testnet at https://dashboard.tenderly.co'
    };
  }

  // Check for Tenderly block limit error (50 blocks on free tier)
  if (err.message?.includes('block limit') || err.message?.includes('exceeded the maximum')) {
    return {
      statusCode: 503,
      userMessage: 'Tenderly Virtual Testnet has reached its block limit. Please create a new fork.',
      errorCode: 'TENDERLY_BLOCK_LIMIT',
      actionRequired: 'Create a new Virtual Testnet at https://dashboard.tenderly.co'
    };
  }

  // Check for rate limiting
  if (err.error?.code === -32005 || err.message?.includes('rate limit')) {
    return {
      statusCode: 429,
      userMessage: 'Too many requests. Please wait a moment and try again.',
      errorCode: 'RATE_LIMITED',
      actionRequired: 'Wait 30 seconds before retrying'
    };
  }

  // Check for nonce errors
  if (err.message?.includes('nonce') || err.message?.includes('NONCE_EXPIRED')) {
    return {
      statusCode: 409,
      userMessage: 'Transaction nonce conflict. Please try again.',
      errorCode: 'NONCE_ERROR',
      actionRequired: 'Retry the transaction'
    };
  }

  // Check for gas estimation failures
  if (err.message?.includes('gas required exceeds') || err.message?.includes('UNPREDICTABLE_GAS_LIMIT')) {
    return {
      statusCode: 400,
      userMessage: 'Transaction would fail. Please check your inputs and try again.',
      errorCode: 'GAS_ESTIMATION_FAILED',
      actionRequired: 'Check transaction parameters'
    };
  }

  // Check for insufficient funds
  if (err.message?.includes('insufficient funds') || err.message?.includes('INSUFFICIENT_FUNDS')) {
    return {
      statusCode: 400,
      userMessage: 'Insufficient balance for this transaction.',
      errorCode: 'INSUFFICIENT_FUNDS',
      actionRequired: 'Add more funds to your account'
    };
  }

  // Check for RPC connection errors
  if (err.code === 'ECONNREFUSED' || err.message?.includes('ECONNREFUSED')) {
    return {
      statusCode: 503,
      userMessage: 'Unable to connect to blockchain network. Please try again later.',
      errorCode: 'RPC_CONNECTION_FAILED',
      actionRequired: 'Check network configuration or try again later'
    };
  }

  // Check for network timeout
  if (err.code === 'ETIMEDOUT' || err.message?.includes('timeout')) {
    return {
      statusCode: 504,
      userMessage: 'Network request timed out. Please try again.',
      errorCode: 'NETWORK_TIMEOUT',
      actionRequired: 'Retry the transaction'
    };
  }

  return null;
}

function errorHandler(err, req, res, next) {
  logger.error(err.message, {
    stack: err.stack,
    url: req.url,
    method: req.method
  });

  // Check for blockchain/RPC specific errors first
  const blockchainError = parseBlockchainError(err);
  if (blockchainError) {
    return res.status(blockchainError.statusCode).json({
      success: false,
      error: blockchainError.userMessage,
      errorCode: blockchainError.errorCode,
      actionRequired: blockchainError.actionRequired
    });
  }

  // Operational errors (our custom AppError)
  if (err instanceof AppError && err.isOperational) {
    return res.status(err.statusCode).json({
      success: false,
      error: err.message,
      details: err.details || undefined
    });
  }

  // Programming or unknown errors
  console.error('Unexpected error:', err);

  return res.status(500).json({
    success: false,
    error: 'An unexpected error occurred'
  });
}

// 404 handler
function notFoundHandler(req, res) {
  res.status(404).json({
    success: false,
    error: 'Route not found'
  });
}

module.exports = {
  errorHandler,
  notFoundHandler,
  parseBlockchainError
};
