import axios from 'axios'
import { API_URL } from '../config/constants'

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json'
  }
})

// Store the token getter so interceptor can refresh tokens automatically
let _getAccessToken = null

export const setTokenGetter = (getter) => {
  _getAccessToken = getter
}

// Set static auth token on axios defaults
export const setAuthToken = (token) => {
  if (token) {
    api.defaults.headers.common['Authorization'] = `Bearer ${token}`
  } else {
    delete api.defaults.headers.common['Authorization']
  }
}

// Auto-refresh token before each request (Privy caches internally)
api.interceptors.request.use(async (config) => {
  // Skip auth for register/login endpoint
  if (config.url?.includes('/auth/login') || config.url?.includes('/auth/register')) {
    // Still use token if available for register (needs Privy verification)
    if (_getAccessToken) {
      try {
        const token = await _getAccessToken()
        if (token) {
          config.headers.Authorization = `Bearer ${token}`
        }
      } catch (e) {
        // Proceed without token
      }
    }
    return config
  }

  // Try to get fresh token
  if (_getAccessToken) {
    try {
      const token = await _getAccessToken()
      if (token) {
        config.headers.Authorization = `Bearer ${token}`
        return config
      }
    } catch (e) {
      console.warn('Failed to get fresh token:', e)
    }
  }

  return config
})

// Auth API
export const authAPI = {
  // Register or login user
  login: (privyUserId, email, privyWalletAddress) =>
    api.post('/auth/login', { privyUserId, email, privyWalletAddress }),

  // Get current user profile
  getProfile: () =>
    api.get('/auth/profile'),

  // Setup session key for backend signing
  setupSessionKey: () =>
    api.post('/auth/session-key'),

  // Get session key status
  getSessionKeyStatus: () =>
    api.get('/auth/session-key/status')
}

// Smart Account API (ERC-4337)
export const accountAPI = {
  // Activate smart account (deploy if needed)
  activate: () =>
    api.post('/account/activate'),

  // Get smart account address and status
  getStatus: () =>
    api.get('/account/status'),

  // Get balances (ETH, tokens, positions)
  getBalances: () =>
    api.get('/account/balances'),

  // Get Compound V3 positions
  getPositions: () =>
    api.get('/account/positions'),

  // Fund EOA with test tokens (Tenderly only)
  fundEOA: (tokens) =>
    api.post('/account/fund', { tokens }),

  // Get EOA balances
  getEOABalances: () =>
    api.get('/account/eoa-balances'),

  // Approve smart account to spend EOA tokens
  approveSmartAccount: (tokens) =>
    api.post('/account/approve', { tokens }),

  // Pull tokens from EOA to Smart Account via session key (gasless!)
  pullFromEOA: (token, amount) =>
    api.post('/account/pull', { token, amount })
}

// DeFi Operations API
export const defiAPI = {
  // Get current position details
  getPosition: () =>
    api.get('/defi/position'),

  // Get market comparison (USDC Comet vs WETH Comet rates)
  getMarketComparison: () =>
    api.get('/defi/markets'),

  // Supply collateral to Comet
  supply: (comet, asset, amount) =>
    api.post('/defi/supply', { comet, asset, amount }),

  // Borrow from Comet
  borrow: (comet, asset, amount) =>
    api.post('/defi/borrow', { comet, asset, amount }),

  // Repay borrowed amount
  repay: (comet, asset, amount) =>
    api.post('/defi/repay', { comet, asset, amount }),

  // Withdraw collateral
  withdraw: (comet, asset, amount) =>
    api.post('/defi/withdraw', { comet, asset, amount }),

  // Switch position between Comets (cross-Comet switch via flash loan)
  switchPosition: (sourceComet, targetComet, collateralAsset, amount) =>
    api.post('/defi/switch', {
      sourceComet,
      targetComet,
      collateralAsset,
      amount
    }),

  // Get transaction history
  getTransactions: (limit = 20, offset = 0) =>
    api.get(`/defi/transactions?limit=${limit}&offset=${offset}`)
}

// Swap API
export const swapAPI = {
  // Get swap quote
  getQuote: (fromToken, toToken, amount) =>
    api.get('/swap/quote', { params: { fromToken, toToken, amount } }),

  // Execute swap
  swap: (fromToken, toToken, amount, slippage = 0.5) =>
    api.post('/swap/execute', { fromToken, toToken, amount, slippage })
}

export default api
