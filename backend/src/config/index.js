require('dotenv').config();

module.exports = {
  // Server
  port: process.env.PORT || 3001,
  nodeEnv: process.env.NODE_ENV || 'development',

  // MongoDB
  mongodbUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/defi-borrowing-app',

  // Privy
  privy: {
    appId: process.env.PRIVY_APP_ID,
    appSecret: process.env.PRIVY_APP_SECRET
  },

  // Blockchain
  blockchain: {
    chainId: parseInt(process.env.CHAIN_ID) || 1,
    rpcUrl: process.env.RPC_URL
  },

  // Contracts (deployment-specific from env, or hardcoded mainnet addresses)
  contracts: {
    switcher: process.env.SWITCHER_ADDRESS,
    paymasterV06: process.env.PAYMASTER_V06_ADDRESS,
    // Constant mainnet addresses
    entryPointV06: '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789',
    sessionKeyPlugin: '0x0000003E0000a96de4058e1E02a62FaaeCf23d8d',
    multiOwnerPlugin: '0xcE0000007B008F50d762D155002600004cD6c647',
    usdcComet: '0xc3d688B66703497DAA19211EEdff47f25384cdc3',
    wethComet: '0xA17581A9E3356d9A858b789D68B4d866e593aE94',
    // Uniswap pools
    flashPool: '0x88e6A0c2dDD26FEEb64F039a2c41296FcB3f5640', // 0.05% USDC/WETH
    swapPool: '0x7BeA39867e4169DBe237d55C8242a8f2fcDcc387'   // 1% USDC/WETH
  },

  // Tokens (constant mainnet addresses)
  tokens: {
    wbtc: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
    usdc: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    weth: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'
  },

  // NOTE: Session keys are now per-user, stored encrypted in MongoDB
  // No global session key config needed

  // Encryption (for storing session keys in DB)
  encryption: {
    secret: process.env.ENCRYPTION_SECRET || 'change-this-in-production-use-long-random-string'
  },

  // Logging
  logLevel: process.env.LOG_LEVEL || 'info'
};
