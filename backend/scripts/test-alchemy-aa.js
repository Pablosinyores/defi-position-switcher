/**
 * Test Alchemy Account Abstraction
 *
 * This script demonstrates:
 * 1. Creating a Smart Account from an existing EOA
 * 2. Creating a session key
 * 3. Executing a transaction with the session key
 */

const { createModularAccountAlchemyClient } = require('@alchemy/aa-alchemy');
const { LocalAccountSigner, sepolia } = require('@alchemy/aa-core');
const { ethers } = require('ethers');
require('dotenv').config();

const ALCHEMY_API_KEY = process.env.ALCHEMY_API_KEY;
const ALCHEMY_GAS_POLICY_ID = process.env.ALCHEMY_GAS_POLICY_ID;

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  blue: '\x1b[34m',
  yellow: '\x1b[33m',
  red: '\x1b[31m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function main() {
  try {
    log('\n=== Alchemy Account Abstraction Test ===\n', 'bright');

    // Step 1: Get EOA (owner wallet)
    log('Step 1: Setting up EOA (Owner Wallet)', 'blue');

    let ownerPrivateKey = process.env.TEST_PRIVATE_KEY;

    if (!ownerPrivateKey) {
      log('No TEST_PRIVATE_KEY found in .env, generating a new one...', 'yellow');
      const newWallet = ethers.Wallet.createRandom();
      ownerPrivateKey = newWallet.privateKey;
      log(`Generated new EOA: ${newWallet.address}`, 'yellow');
      log(`Private Key: ${ownerPrivateKey}`, 'yellow');
      log('⚠️  Add this to your .env as TEST_PRIVATE_KEY and fund it with Sepolia ETH', 'yellow');
      log('⚠️  Get Sepolia ETH from: https://sepoliafaucet.com/', 'yellow');
    }

    const ownerWallet = new ethers.Wallet(ownerPrivateKey);
    log(`✅ Owner EOA: ${ownerWallet.address}`, 'green');

    // Step 2: Create Smart Account
    log('\nStep 2: Creating Smart Account with Alchemy', 'blue');

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

    // Step 3: Create Session Key
    log('\nStep 3: Creating Session Key', 'blue');

    const sessionKeyWallet = ethers.Wallet.createRandom();
    log(`✅ Session Key Created: ${sessionKeyWallet.address}`, 'green');
    log(`   Private Key: ${sessionKeyWallet.privateKey}`, 'green');

    // Step 4: Grant Session Key Permission (TODO)
    log('\nStep 4: Granting Session Key Permission', 'blue');
    log('⚠️  Note: Session key granting requires Alchemy session key plugin', 'yellow');
    log('   For now, we\'ll use the owner key to execute transactions', 'yellow');

    // Step 5: Check Smart Account Balance
    log('\nStep 5: Checking Smart Account Balance', 'blue');

    const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
    const balance = await provider.getBalance(smartAccountAddress);
    log(`   Balance: ${ethers.formatEther(balance)} ETH`, 'green');

    if (balance === 0n) {
      log('⚠️  Smart Account has no ETH!', 'yellow');
      log(`   Send some Sepolia ETH to: ${smartAccountAddress}`, 'yellow');
      log('   Get from: https://sepoliafaucet.com/', 'yellow');
    }

    // Step 6: Execute a Test Transaction (if funded)
    if (balance > 0n) {
      log('\nStep 6: Executing Test Transaction (Self-transfer)', 'blue');

      try {
        const userOp = await smartAccountClient.sendUserOperation({
          uo: {
            target: smartAccountAddress, // Send to self
            data: '0x',
            value: BigInt(1000) // 1000 wei
          }
        });

        log(`   UserOperation Hash: ${userOp.hash}`, 'green');
        log('   Waiting for transaction to be mined...', 'yellow');

        const txHash = await smartAccountClient.waitForUserOperationTransaction(userOp);
        log(`✅ Transaction Mined: ${txHash}`, 'green');
        log(`   View on Etherscan: https://sepolia.etherscan.io/tx/${txHash}`, 'green');
      } catch (error) {
        log(`❌ Transaction failed: ${error.message}`, 'red');
      }
    }

    // Step 7: Test Session Key Execution (if we had session key plugin)
    log('\nStep 7: Session Key Execution', 'blue');
    log('⚠️  To use session keys, you need to:', 'yellow');
    log('   1. Install Alchemy session key plugin', 'yellow');
    log('   2. Grant permission to session key', 'yellow');
    log('   3. Use session key signer for transactions', 'yellow');
    log('\n   For now, we demonstrated owner-based execution.', 'yellow');

    // Summary
    log('\n=== Summary ===\n', 'bright');
    log(`Owner EOA:       ${ownerWallet.address}`, 'green');
    log(`Smart Account:   ${smartAccountAddress}`, 'green');
    log(`Session Key:     ${sessionKeyWallet.address}`, 'green');
    log(`Balance:         ${ethers.formatEther(balance)} ETH`, 'green');

    log('\n=== Next Steps ===\n', 'bright');
    log('1. Fund the Smart Account with Sepolia ETH', 'yellow');
    log('2. Fund it with test tokens (WETH, USDC) from Aave faucet', 'yellow');
    log('3. Test DeFi operations (supply, borrow) using this Smart Account', 'yellow');
    log('4. Integrate with your backend authentication flow', 'yellow');

    log('\n✅ Test Complete!\n', 'green');

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
