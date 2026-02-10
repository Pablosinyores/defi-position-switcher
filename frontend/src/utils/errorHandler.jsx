import { toast } from 'react-toastify'

/**
 * Known error codes and their user-friendly messages
 */
const ERROR_MESSAGES = {
  TENDERLY_QUOTA_EXCEEDED: {
    title: 'Testnet Quota Exceeded',
    message: 'The Tenderly Virtual Testnet has reached its limit. A new fork needs to be created.',
    action: 'Please contact the admin to reset the testnet or try again later.',
    severity: 'warning'
  },
  TENDERLY_BLOCK_LIMIT: {
    title: 'Testnet Block Limit',
    message: 'The testnet has reached its maximum block height.',
    action: 'A new Virtual Testnet fork needs to be created.',
    severity: 'warning'
  },
  RATE_LIMITED: {
    title: 'Too Many Requests',
    message: 'Please wait a moment before trying again.',
    action: 'Wait 30 seconds and retry.',
    severity: 'info'
  },
  NONCE_ERROR: {
    title: 'Transaction Conflict',
    message: 'There was a conflict with transaction ordering.',
    action: 'Please try your transaction again.',
    severity: 'warning'
  },
  GAS_ESTIMATION_FAILED: {
    title: 'Transaction Would Fail',
    message: 'The transaction cannot be completed with current parameters.',
    action: 'Check your inputs and try again.',
    severity: 'error'
  },
  INSUFFICIENT_FUNDS: {
    title: 'Insufficient Balance',
    message: 'You do not have enough tokens for this transaction.',
    action: 'Add more funds or reduce the amount.',
    severity: 'error'
  },
  RPC_CONNECTION_FAILED: {
    title: 'Network Connection Failed',
    message: 'Unable to connect to the blockchain network.',
    action: 'Check your connection and try again.',
    severity: 'error'
  },
  NETWORK_TIMEOUT: {
    title: 'Network Timeout',
    message: 'The request took too long to complete.',
    action: 'Please try again.',
    severity: 'warning'
  }
}

/**
 * Handle API errors and display appropriate toast messages
 * @param {Error} error - The error object from API call
 * @param {string} fallbackMessage - Fallback message if error is not recognized
 * @returns {object} Error details for UI display
 */
export function handleApiError(error, fallbackMessage = 'An error occurred') {
  console.error('API Error:', error)

  const response = error.response?.data
  const errorCode = response?.errorCode
  const errorMessage = response?.error || error.message || fallbackMessage
  const actionRequired = response?.actionRequired

  // Check for known error codes
  if (errorCode && ERROR_MESSAGES[errorCode]) {
    const knownError = ERROR_MESSAGES[errorCode]

    // Show appropriate toast
    if (knownError.severity === 'warning') {
      toast.warning(
        <div>
          <strong>{knownError.title}</strong>
          <p style={{ margin: '4px 0', fontSize: '0.9em' }}>{knownError.message}</p>
          <p style={{ margin: 0, fontSize: '0.85em', opacity: 0.8 }}>{knownError.action}</p>
        </div>,
        { autoClose: 8000 }
      )
    } else if (knownError.severity === 'info') {
      toast.info(knownError.message, { autoClose: 5000 })
    } else {
      toast.error(
        <div>
          <strong>{knownError.title}</strong>
          <p style={{ margin: '4px 0', fontSize: '0.9em' }}>{knownError.message}</p>
        </div>,
        { autoClose: 6000 }
      )
    }

    return {
      code: errorCode,
      ...knownError,
      actionRequired
    }
  }

  // Check for Tenderly quota error in message (fallback detection)
  if (errorMessage.includes('quota') || errorMessage.includes('Tenderly')) {
    toast.warning(
      <div>
        <strong>Testnet Limit Reached</strong>
        <p style={{ margin: '4px 0', fontSize: '0.9em' }}>
          The Tenderly Virtual Testnet needs to be reset.
        </p>
        <p style={{ margin: 0, fontSize: '0.85em', opacity: 0.8 }}>
          Please contact the admin or try again later.
        </p>
      </div>,
      { autoClose: 8000 }
    )
    return {
      code: 'TENDERLY_ERROR',
      title: 'Testnet Limit Reached',
      message: errorMessage,
      severity: 'warning'
    }
  }

  // Default error handling
  toast.error(errorMessage, { autoClose: 5000 })

  return {
    code: 'UNKNOWN_ERROR',
    title: 'Error',
    message: errorMessage,
    severity: 'error'
  }
}

/**
 * Check if error is a Tenderly quota/limit error
 */
export function isTenderlyLimitError(error) {
  const response = error.response?.data
  const errorCode = response?.errorCode
  const errorMessage = response?.error || error.message || ''

  return (
    errorCode === 'TENDERLY_QUOTA_EXCEEDED' ||
    errorCode === 'TENDERLY_BLOCK_LIMIT' ||
    errorMessage.includes('quota limit') ||
    errorMessage.includes('block limit')
  )
}

export default handleApiError
