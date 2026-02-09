class AppError extends Error {
  constructor(message, statusCode, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

class ValidationError extends AppError {
  constructor(message, details = null) {
    super(message, 400, details);
    this.name = 'ValidationError';
  }
}

class AuthenticationError extends AppError {
  constructor(message = 'Authentication failed') {
    super(message, 401);
    this.name = 'AuthenticationError';
  }
}

class AuthorizationError extends AppError {
  constructor(message = 'Not authorized') {
    super(message, 403);
    this.name = 'AuthorizationError';
  }
}

class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(message, 404);
    this.name = 'NotFoundError';
  }
}

class BlockchainError extends AppError {
  constructor(message, details = null) {
    super(message, 500, details);
    this.name = 'BlockchainError';
  }
}

class InsufficientLiquidityError extends AppError {
  constructor(message = 'Insufficient liquidity') {
    super(message, 400);
    this.name = 'InsufficientLiquidityError';
  }
}

class HealthFactorTooLowError extends AppError {
  constructor(message = 'Health factor too low', currentHealthFactor = null) {
    super(message, 400, { currentHealthFactor });
    this.name = 'HealthFactorTooLowError';
  }
}

module.exports = {
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  BlockchainError,
  InsufficientLiquidityError,
  HealthFactorTooLowError
};
