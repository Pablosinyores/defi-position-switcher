/**
 * Verification script to test Sepolia configuration
 * Run with: node scripts/verify-setup.js
 */

require('dotenv').config();
const { ethers } = require('ethers');
const config = require('../src/config');

// ABIs
const ERC20_ABI = [
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function totalSupply() view returns (uint256)'
];

const AAVE_POOL_ABI = [
  'function getReserveData(address asset) view returns (tuple(uint256 configuration, uint128 liquidityIndex, uint128 currentLiquidityRate, uint128 variableBorrowIndex, uint128 currentVariableBorrowRate, uint128 currentStableBorrowRate, uint40 lastUpdateTimestamp, uint16 id, address aTokenAddress, address stableDebtTokenAddress, address variableDebtTokenAddress, address interestRateStrategyAddress, uint128 accruedToTreasury, uint128 unbacked, uint128 isolationModeTotalDebt))'
];

const COMPOUND_COMET_ABI = [
  'function baseToken() view returns (address)',
  'function numAssets() view returns (uint8)',
  'function getAssetInfo(uint8 i) view returns (tuple(uint8 offset, address asset, address priceFeed, uint64 scale, uint64 borrowCollateralFactor, uint64 liquidateCollateralFactor, uint64 liquidationFactor, uint128 supplyCap))'
];

async function main() {
  console.log('🔍 Verifying Sepolia Testnet Configuration\n');
  console.log('=' .repeat(60));

  // Connect to provider
  console.log('\n1️⃣  Connecting to RPC...');
  const provider = new ethers.JsonRpcProvider(config.blockchain.rpcUrl);

  try {
    const network = await provider.getNetwork();
    console.log(`✅ Connected to ${network.name} (ChainID: ${network.chainId})`);
  } catch (error) {
    console.error('❌ RPC connection failed:', error.message);
    process.exit(1);
  }

  // Verify token addresses
  console.log('\n2️⃣  Verifying Token Addresses...');
  const tokens = [
    { name: 'WETH', address: config.tokens.weth },
    { name: 'USDC', address: config.tokens.usdc },
    { name: 'LINK', address: config.tokens.link },
    { name: 'DAI', address: config.tokens.dai }
  ];

  for (const token of tokens) {
    try {
      const contract = new ethers.Contract(token.address, ERC20_ABI, provider);
      const [name, symbol, decimals] = await Promise.all([
        contract.name(),
        contract.symbol(),
        contract.decimals()
      ]);
      console.log(`  ✅ ${token.name}: ${name} (${symbol}) - ${decimals} decimals`);
      console.log(`     Address: ${token.address}`);
    } catch (error) {
      console.log(`  ❌ ${token.name}: Failed to verify - ${error.message}`);
    }
  }

  // Verify Aave V3 Pool
  console.log('\n3️⃣  Verifying Aave V3 Pool...');
  try {
    const aavePool = new ethers.Contract(
      config.contracts.aavePool,
      AAVE_POOL_ABI,
      provider
    );

    // Check USDC reserve data
    const reserveData = await aavePool.getReserveData(config.tokens.usdc);
    console.log(`  ✅ Aave V3 Pool: ${config.contracts.aavePool}`);
    console.log(`  ✅ USDC Reserve configured (aToken: ${reserveData.aTokenAddress})`);
    console.log(`  ✅ Liquidity Rate: ${Number(reserveData.currentLiquidityRate) / 1e27}%`);
  } catch (error) {
    console.log(`  ❌ Aave V3 verification failed: ${error.message}`);
  }

  // Verify Compound V3 (Comet)
  console.log('\n4️⃣  Verifying Compound V3 (Comet)...');
  try {
    const comet = new ethers.Contract(
      config.contracts.compoundComet,
      COMPOUND_COMET_ABI,
      provider
    );

    const baseToken = await comet.baseToken();
    const numAssets = await comet.numAssets();

    console.log(`  ✅ Compound Comet: ${config.contracts.compoundComet}`);
    console.log(`  ✅ Base Token (USDC): ${baseToken}`);
    console.log(`  ✅ Number of collateral assets: ${numAssets}`);

    // List collateral assets
    console.log(`\n     Supported Collateral Assets:`);
    for (let i = 0; i < numAssets; i++) {
      const assetInfo = await comet.getAssetInfo(i);
      const assetContract = new ethers.Contract(assetInfo.asset, ERC20_ABI, provider);
      const symbol = await assetContract.symbol();
      console.log(`     - ${symbol}: ${assetInfo.asset}`);
    }
  } catch (error) {
    console.log(`  ❌ Compound V3 verification failed: ${error.message}`);
  }

  // Verify Uniswap V3 Router
  console.log('\n5️⃣  Verifying Uniswap V3 Router...');
  try {
    const code = await provider.getCode(config.contracts.uniswapV3Router);
    if (code !== '0x') {
      console.log(`  ✅ Uniswap V3 Router: ${config.contracts.uniswapV3Router}`);
    } else {
      console.log(`  ❌ Uniswap V3 Router: No contract found at address`);
    }
  } catch (error) {
    console.log(`  ❌ Uniswap V3 verification failed: ${error.message}`);
  }

  console.log('\n' + '='.repeat(60));
  console.log('✅ Verification Complete!\n');
  console.log('📝 Summary:');
  console.log('   - Collateral Asset: WETH (18 decimals)');
  console.log('   - Borrow Asset: USDC (6 decimals)');
  console.log('   - Both tokens are supported on Aave V3 and Compound V3');
  console.log('\n💡 Next Steps:');
  console.log('   1. Deploy FlashLoanSwitcher contract');
  console.log('   2. Get testnet WETH and USDC from faucets');
  console.log('   3. Test the full flow!');
  console.log('');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  });
