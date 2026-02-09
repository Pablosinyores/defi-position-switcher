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

  // Alchemy
  alchemy: {
    apiKey: process.env.ALCHEMY_API_KEY,
    gasPolicyId: process.env.ALCHEMY_GAS_POLICY_ID
  },

  // Blockchain
  blockchain: {
    chainId: parseInt(process.env.CHAIN_ID) || 11155111,
    rpcUrl: process.env.RPC_URL
  },

  // Contracts
  contracts: {
    flashLoanSwitcher: process.env.FLASH_LOAN_SWITCHER_ADDRESS,
    aavePool: process.env.AAVE_POOL_ADDRESS,
    compoundComet: process.env.COMPOUND_COMET_ADDRESS,
    uniswapV3Router: process.env.UNISWAP_V3_ROUTER,
    switcher: process.env.SWITCHER_ADDRESS,
    paymasterV06: process.env.PAYMASTER_V06_ADDRESS,
    paymasterV07: process.env.PAYMASTER_V07_ADDRESS,
    entryPointV06: process.env.ENTRYPOINT_V06_ADDRESS || '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789',
    entryPointV07: process.env.ENTRYPOINT_ADDRESS || '0x0000000071727De22E5E9d8BAf0edAc6f37da032',
    sessionKeyPlugin: '0x0000003E0000a96de4058e1E02a62FaaeCf23d8d',
    multiOwnerPlugin: '0xcE0000007B008F50d762D155002600004cD6c647',
    usdcComet: process.env.USDC_COMET_ADDRESS,
    wethComet: process.env.WETH_COMET_ADDRESS
  },

  // Tokens (Verified on Aave V3 & Compound V3 Sepolia)
  tokens: {
    weth: process.env.WETH_ADDRESS,  // Collateral asset
    usdc: process.env.USDC_ADDRESS,  // Borrow asset
    link: process.env.LINK_ADDRESS,
    dai: process.env.DAI_ADDRESS
  },

  // Session Key
  sessionKey: {
    privateKey: process.env.SESSION_KEY_PRIVATE_KEY
  },

  // Encryption (for storing private keys)
  encryption: {
    secret: process.env.ENCRYPTION_SECRET || 'change-this-in-production-use-long-random-string'
  },

  // Logging
  logLevel: process.env.LOG_LEVEL || 'info'
};
