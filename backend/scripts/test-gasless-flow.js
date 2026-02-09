/**
 * Complete End-to-End Gasless Flow Test
 *
 * This script demonstrates:
 * 1. Creating Smart Account from EOA
 * 2. User approves tokens to Smart Account (PAYS GAS ONCE)
 * 3. User transfers tokens to Smart Account (PAYS GAS ONCE)
 * 4. Backend grants session key (GASLESS via paymaster)
 * 5. Backend executes DeFi operations (GASLESS via paymaster)
 */

const { createModularAccountAlchemyClient } = require('@alchemy/aa-alchemy');
const { LocalAccountSigner, sepolia } = require('@alchemy/aa-core');
const { ethers } = require('ethers');
require('dotenv').config();

// Configuration
const ALCHEMY_API_KEY = process.env.ALCHEMY_API_KEY;
const ALCHEMY_GAS_POLICY_ID = process.env.ALCHEMY_GAS_POLICY_ID;
const RPC_URL = process.env.RPC_URL;

// Addresses - Using USDT (6 decimals)
const USDT_ADDRESS = process.env.USDT_ADDRESS || '0xaA8E23Fb1079EA71e0a56F48a2aA51851D8433D0';
const AAVE_POOL_ADDRESS = process.env.AAVE_POOL_ADDRESS || '0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951';

// Colors
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  blue: '\x1b[34m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

// ERC20 ABI (minimal)
const ERC20_ABI = [
  'function approve(address spender, uint256 amount) external returns (bool)',
  'function transfer(address to, uint256 amount) external returns (bool)',
  'function balanceOf(address account) external view returns (uint256)',
  'function allowance(address owner, address spender) external view returns (uint256)'
];

// Aave Pool ABI (minimal)
const AAVE_POOL_ABI = [
  'function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode) external'
];

async function main() {
  try {
    log('\n╔════════════════════════════════════════════════════════════╗', 'bright');
    log('║     COMPLETE GASLESS FLOW TEST WITH ALCHEMY PAYMASTER     ║', 'bright');
    log('╚════════════════════════════════════════════════════════════╝\n', 'bright');

    // Validate environment
    if (!ALCHEMY_API_KEY || !ALCHEMY_GAS_POLICY_ID) {
      log('❌ Missing required environment variables:', 'red');
      log('   - ALCHEMY_API_KEY', 'red');
      log('   - ALCHEMY_GAS_POLICY_ID', 'red');
      log('\nPlease set these in backend/.env', 'yellow');
      process.exit(1);
    }

    // ===================================================================
    // STEP 1: Setup EOA (User's Original Wallet)
    // ===================================================================
    log('╔═══════════════════════════════════════════════════════════╗', 'cyan');
    log('║ STEP 1: Setup User EOA (Externally Owned Account)        ║', 'cyan');
    log('╚═══════════════════════════════════════════════════════════╝\n', 'cyan');

    let ownerPrivateKey = process.env.TEST_PRIVATE_KEY;

    if (!ownerPrivateKey) {
      log('No TEST_PRIVATE_KEY found, generating new one...', 'yellow');
      const newWallet = ethers.Wallet.createRandom();
      ownerPrivateKey = newWallet.privateKey;
      log(`\n⚠️  Add this to backend/.env:\n`, 'yellow');
      log(`TEST_PRIVATE_KEY=${ownerPrivateKey}\n`, 'yellow');
      log('⚠️  Fund this address with Sepolia ETH: https://sepoliafaucet.com/', 'yellow');
      log(`   Address: ${newWallet.address}\n`, 'yellow');
      process.exit(0);
    }

    const ownerWallet = new ethers.Wallet(ownerPrivateKey);
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const ownerWithProvider = ownerWallet.connect(provider);

    log(`✅ User EOA Address: ${ownerWallet.address}`, 'green');

    const eoaBalance = await provider.getBalance(ownerWallet.address);
    log(`   ETH Balance: ${ethers.formatEther(eoaBalance)} ETH`, 'green');

    if (eoaBalance === 0n) {
      log('\n⚠️  EOA has no ETH! You need ETH to pay gas for initial approvals.', 'yellow');
      log('   Get Sepolia ETH from: https://sepoliafaucet.com/', 'yellow');
      log(`   Send to: ${ownerWallet.address}\n`, 'yellow');
      process.exit(0);
    }

    // ===================================================================
    // STEP 2: Create Smart Account
    // ===================================================================
    log('\n╔═══════════════════════════════════════════════════════════╗', 'cyan');
    log('║ STEP 2: Create Smart Account (ERC-4337)                  ║', 'cyan');
    log('╚═══════════════════════════════════════════════════════════╝\n', 'cyan');

    const ownerSigner = LocalAccountSigner.privateKeyToAccountSigner(ownerPrivateKey);

    const smartAccountClient = await createModularAccountAlchemyClient({
      apiKey: ALCHEMY_API_KEY,
      chain: sepolia,
      signer: ownerSigner,
      gasManagerConfig: {
        policyId: ALCHEMY_GAS_POLICY_ID
      }
    });

    const smartAccountAddress = await smartAccountClient.getAddress();
    log(`✅ Smart Account Created: ${smartAccountAddress}`, 'green');
    log(`   Owner: ${ownerWallet.address}`, 'green');

    const smartAccountBalance = await provider.getBalance(smartAccountAddress);
    log(`   ETH Balance: ${ethers.formatEther(smartAccountBalance)} ETH`, 'green');

    // ===================================================================
    // STEP 3: Check Token Balance
    // ===================================================================
    log('\n╔═══════════════════════════════════════════════════════════╗', 'cyan');
    log('║ STEP 3: Check USDT Token Balance                         ║', 'cyan');
    log('╚═══════════════════════════════════════════════════════════╝\n', 'cyan');

    const usdtContract = new ethers.Contract(USDT_ADDRESS, ERC20_ABI, ownerWithProvider);
    const eoaUsdtBalance = await usdtContract.balanceOf(ownerWallet.address);
    const smartAccountUsdtBalance = await usdtContract.balanceOf(smartAccountAddress);

    log(`EOA USDT Balance: ${ethers.formatUnits(eoaUsdtBalance, 6)} USDT`, 'green');
    log(`Smart Account USDT Balance: ${ethers.formatUnits(smartAccountUsdtBalance, 6)} USDT`, 'green');

    if (eoaUsdtBalance === 0n && smartAccountUsdtBalance === 0n) {
      log('\n⚠️  No USDT tokens found!', 'yellow');
      log('   Get test USDT from Aave faucet: https://staging.aave.com/faucet', 'yellow');
      log(`   Send to EOA: ${ownerWallet.address}`, 'yellow');
      log('\n   Then run this script again.\n', 'yellow');
      process.exit(0);
    }

    // ===================================================================
    // STEP 4: Approve & Transfer Tokens (USER PAYS GAS - ONCE!)
    // ===================================================================
    if (eoaUsdtBalance > 0n) {
      log('\n╔═══════════════════════════════════════════════════════════╗', 'cyan');
      log('║ STEP 4: Approve & Transfer USDT to Smart Account         ║', 'cyan');
      log('║ 💰 USER PAYS GAS - THIS IS THE ONLY TIME!                ║', 'cyan');
      log('╚═══════════════════════════════════════════════════════════╝\n', 'cyan');

      const amountToTransfer = eoaUsdtBalance; // Transfer all

      // Check current allowance
      const currentAllowance = await usdtContract.allowance(ownerWallet.address, smartAccountAddress);

      if (currentAllowance < amountToTransfer) {
        log('Approving USDT for Smart Account... (USER PAYS GAS)', 'yellow');

        // Approve infinite amount (or specific amount)
        const maxApproval = ethers.MaxUint256; // Infinite approval
        const approveTx = await usdtContract.approve(smartAccountAddress, maxApproval);
        log(`   Transaction sent: ${approveTx.hash}`, 'yellow');

        await approveTx.wait();
        log(`✅ Approval complete!`, 'green');
        log(`   Etherscan: https://sepolia.etherscan.io/tx/${approveTx.hash}`, 'green');
      } else {
        log('✅ Already approved', 'green');
      }

      log('\nTransferring USDT to Smart Account... (USER PAYS GAS)', 'yellow');
      const transferTx = await usdtContract.transfer(smartAccountAddress, amountToTransfer);
      log(`   Transaction sent: ${transferTx.hash}`, 'yellow');

      await transferTx.wait();
      log(`✅ Transfer complete!`, 'green');
      log(`   Amount: ${ethers.formatUnits(amountToTransfer, 6)} USDT`, 'green');
      log(`   Etherscan: https://sepolia.etherscan.io/tx/${transferTx.hash}`, 'green');

      // Update balance
      const newSmartAccountUsdtBalance = await usdtContract.balanceOf(smartAccountAddress);
      log(`\n   Smart Account USDT Balance: ${ethers.formatUnits(newSmartAccountUsdtBalance, 6)} USDT`, 'green');
    }

    // ===================================================================
    // STEP 5: Create Session Key
    // ===================================================================
    log('\n╔═══════════════════════════════════════════════════════════╗', 'cyan');
    log('║ STEP 5: Create Backend Session Key                       ║', 'cyan');
    log('╚═══════════════════════════════════════════════════════════╝\n', 'cyan');

    const sessionKeyWallet = ethers.Wallet.createRandom();
    log(`✅ Session Key Generated: ${sessionKeyWallet.address}`, 'green');
    log(`   Private Key: ${sessionKeyWallet.privateKey}`, 'green');
    log('\n   ⚠️  In production, this would be encrypted and stored in database', 'yellow');

    // ===================================================================
    // STEP 6: Grant Session Key Permission (GASLESS!)
    // ===================================================================
    log('\n╔═══════════════════════════════════════════════════════════╗', 'cyan');
    log('║ STEP 6: Grant Session Key Permission                     ║', 'cyan');
    log('║ 🎉 GASLESS - Paymaster covers gas!                       ║', 'cyan');
    log('╚═══════════════════════════════════════════════════════════╝\n', 'cyan');

    log('⚠️  Note: Session key granting requires Alchemy Session Key Plugin', 'yellow');
    log('   This is a planned feature. For now, we use owner key for demo.', 'yellow');
    log('   All subsequent transactions are STILL gasless via paymaster!\n', 'yellow');

    // ===================================================================
    // STEP 7: Execute DeFi Operation - Supply to Aave (GASLESS!)
    // ===================================================================
    log('\n╔═══════════════════════════════════════════════════════════╗', 'cyan');
    log('║ STEP 7: Supply USDT to Aave V3                           ║', 'cyan');
    log('║ 🎉 GASLESS - Paymaster covers gas!                       ║', 'cyan');
    log('╚═══════════════════════════════════════════════════════════╝\n', 'cyan');

    const finalSmartAccountUsdtBalance = await usdtContract.balanceOf(smartAccountAddress);

    if (finalSmartAccountUsdtBalance === 0n) {
      log('⚠️  No USDT in Smart Account to supply', 'yellow');
      process.exit(0);
    }

    const supplyAmount = ethers.parseUnits('100', 6); // Supply 100 USDT

    if (finalSmartAccountUsdtBalance < supplyAmount) {
      log(`⚠️  Insufficient USDT. Need: ${ethers.formatUnits(supplyAmount, 6)} USDT`, 'yellow');
      log(`   Have: ${ethers.formatUnits(finalSmartAccountUsdtBalance, 6)} USDT`, 'yellow');
      process.exit(0);
    }

    // Step 7a: Approve Aave Pool (GASLESS)
    log('Step 7a: Approving USDT for Aave Pool... (GASLESS)', 'yellow');

    const approveInterface = new ethers.Interface(ERC20_ABI);
    const approveData = approveInterface.encodeFunctionData('approve', [
      AAVE_POOL_ADDRESS,
      ethers.MaxUint256
    ]);

    const approveUserOp = await smartAccountClient.sendUserOperation({
      uo: {
        target: USDT_ADDRESS,
        data: approveData,
        value: 0n
      }
    });

    log(`   UserOperation Hash: ${approveUserOp.hash}`, 'yellow');
    log('   Waiting for transaction to be mined...', 'yellow');

    const approveTxHash = await smartAccountClient.waitForUserOperationTransaction(approveUserOp);
    log(`✅ Approval complete! (Gas paid by paymaster)`, 'green');
    log(`   Etherscan: https://sepolia.etherscan.io/tx/${approveTxHash}`, 'green');

    // Step 7b: Supply to Aave (GASLESS)
    log('\nStep 7b: Supplying USDT to Aave... (GASLESS)', 'yellow');

    const aaveInterface = new ethers.Interface(AAVE_POOL_ABI);
    const supplyData = aaveInterface.encodeFunctionData('supply', [
      USDT_ADDRESS,
      supplyAmount,
      smartAccountAddress,
      0 // referral code
    ]);

    const supplyUserOp = await smartAccountClient.sendUserOperation({
      uo: {
        target: AAVE_POOL_ADDRESS,
        data: supplyData,
        value: 0n
      }
    });

    log(`   UserOperation Hash: ${supplyUserOp.hash}`, 'yellow');
    log('   Waiting for transaction to be mined...', 'yellow');

    const supplyTxHash = await smartAccountClient.waitForUserOperationTransaction(supplyUserOp);
    log(`✅ Supply complete! (Gas paid by paymaster)`, 'green');
    log(`   Amount: ${ethers.formatUnits(supplyAmount, 6)} USDT`, 'green');
    log(`   Etherscan: https://sepolia.etherscan.io/tx/${supplyTxHash}`, 'green');

    // ===================================================================
    // SUMMARY
    // ===================================================================
    log('\n╔═══════════════════════════════════════════════════════════╗', 'bright');
    log('║                      TEST SUMMARY                         ║', 'bright');
    log('╚═══════════════════════════════════════════════════════════╝\n', 'bright');

    log('🎯 What We Demonstrated:', 'cyan');
    log('   1. ✅ Created Smart Account from EOA', 'green');
    log('   2. ✅ User approved & transferred tokens (PAID GAS ONCE)', 'green');
    log('   3. ✅ Generated session key for backend', 'green');
    log('   4. ✅ Approved USDT for Aave (GASLESS via paymaster)', 'green');
    log('   5. ✅ Supplied USDT to Aave (GASLESS via paymaster)', 'green');

    log('\n💰 Gas Payment Summary:', 'cyan');
    log('   - User paid gas: 2 times (approve + transfer)', 'yellow');
    log('   - Paymaster paid gas: 2 times (Aave approve + supply)', 'green');
    log('   - All future DeFi operations: GASLESS! 🎉', 'green');

    log('\n📋 Key Addresses:', 'cyan');
    log(`   User EOA:         ${ownerWallet.address}`, 'green');
    log(`   Smart Account:    ${smartAccountAddress}`, 'green');
    log(`   Session Key:      ${sessionKeyWallet.address}`, 'green');

    log('\n🔑 Next Steps:', 'cyan');
    log('   1. In production, encrypt and store session key in database', 'yellow');
    log('   2. Implement proper session key granting with Alchemy plugin', 'yellow');
    log('   3. Use session key for all DeFi operations (borrow, swap, etc.)', 'yellow');
    log('   4. All operations will be GASLESS for the user! 🚀', 'yellow');

    log('\n✅ GASLESS FLOW TEST COMPLETE!\n', 'bright');

  } catch (error) {
    log(`\n❌ Error: ${error.message}`, 'red');
    console.error(error);
    process.exit(1);
  }
}

// Run the script
if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = { main };
