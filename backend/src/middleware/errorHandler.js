const logger = require('../utils/logger');
const { AppError } = require('../utils/errors');

function errorHandler(err, req, res, next) {
  logger.error('Error:', {
    message: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method
  });

  // Operational errors
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
  notFoundHandler
};
