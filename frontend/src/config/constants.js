// API Configuration
export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'

// Network Configuration - Mainnet Fork
export const MAINNET_FORK = {
  chainId: 1,
  name: 'Ethereum Mainnet Fork',
  rpc: import.meta.env.VITE_RPC_URL || 'http://127.0.0.1:8545',
  explorer: 'https://etherscan.io'
}

// Tenderly Virtual TestNet Explorer
// Format: https://dashboard.tenderly.co/explorer/vnet/{fork-id}/tx/{txHash}
export const TENDERLY_EXPLORER = {
  baseUrl: 'https://dashboard.tenderly.co/explorer/vnet',
  forkId: import.meta.env.VITE_TENDERLY_FORK_ID || 'ee2e420a-0979-4e1e-ad46-dcdc7c46c2af',
  getTxUrl: (txHash, forkId) => {
    const id = forkId || TENDERLY_EXPLORER.forkId
    return `${TENDERLY_EXPLORER.baseUrl}/${id}/tx/${txHash}`
  }
}

// Contract Addresses (Mainnet)
export const CONTRACTS = {
  ENTRYPOINT_V06: '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789',
  SESSION_KEY_PLUGIN: '0x0000003E0000a96de4058e1E02a62FaaeCf23d8d',
  MULTI_OWNER_PLUGIN: '0xcE0000007B008F50d762D155002600004cD6c647',
  PAYMASTER: import.meta.env.VITE_PAYMASTER_ADDRESS || '0x2a75a9AfF7d909002fc458b765CB92F47350464B',
  SWITCHER: import.meta.env.VITE_SWITCHER_ADDRESS || '0xda1AEA47D63D21475dEEd98f94a3beD82671B7F2'
}

// Compound V3 Comets (Mainnet)
export const COMETS = {
  USDC: {
    address: '0xc3d688B66703497DAA19211EEdff47f25384cdc3',
    name: 'USDC Comet',
    baseToken: 'USDC',
    baseDecimals: 6
  },
  WETH: {
    address: '0xA17581A9E3356d9A858b789D68B4d866e593aE94',
    name: 'WETH Comet',
    baseToken: 'WETH',
    baseDecimals: 18
  }
}

// Token Addresses (Mainnet)
export const TOKENS = {
  WBTC: {
    address: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
    symbol: 'WBTC',
    decimals: 8
  },
  USDC: {
    address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    symbol: 'USDC',
    decimals: 6
  },
  WETH: {
    address: '0xC02aaA39b223FE8d0A5E5C4F27eAD9083c756Cc2',
    symbol: 'WETH',
    decimals: 18
  }
}

// Format helpers
export const formatAddress = (address) => {
  if (!address) return 'Not available'
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

export const formatAmount = (amount, decimals = 18) => {
  if (!amount) return '0'
  const num = Number(amount) / Math.pow(10, decimals)
  return num.toLocaleString('en-US', { maximumFractionDigits: 6 })
}
