# Mainnet Fork Testing Setup

**Goal**: Test cross-Comet switching on Ethereum Mainnet fork with local node

---

## Prerequisites

1. **Ethereum Mainnet RPC**: You'll need a reliable RPC endpoint
   - Alchemy (recommended): https://www.alchemy.com/
   - Infura: https://www.infura.io/
   - QuickNode: https://www.quicknode.com/
   - Ankr: https://www.ankr.com/

2. **System Requirements**:
   - 16GB+ RAM recommended
   - Good internet connection
   - Disk space for blockchain data cache

---

## Step 1: Get Mainnet RPC URL

### Option A: Alchemy (Recommended)

1. Sign up at https://www.alchemy.com/
2. Create new app
3. Select "Ethereum Mainnet"
4. Copy your HTTP URL

### Option B: Use Existing Public RPC

```bash
# Public Ankr (rate limited)
https://rpc.ankr.com/eth

# Public Cloudflare (rate limited)
https://cloudflare-eth.com
```

---

## Step 2: Set Up Environment Variables

Create or update `.env` file:

```bash
# Add to .env
MAINNET_RPC_URL=<your-alchemy-or-infura-url>
FORK_BLOCK_NUMBER=19000000  # Recent block (optional)
```

---

## Step 3: Start Local Mainnet Fork Node

### Using Anvil (Foundry's built-in node)

```bash
# Basic fork (uses latest block)
anvil --fork-url $MAINNET_RPC_URL

# Fork at specific block (for reproducibility)
anvil --fork-url $MAINNET_RPC_URL --fork-block-number 19000000

# With specific port and chain ID
anvil \
  --fork-url $MAINNET_RPC_URL \
  --fork-block-number 19000000 \
  --port 8545 \
  --chain-id 1 \
  --accounts 10 \
  --balance 10000
```

### What This Does

- Creates local Ethereum node at `http://127.0.0.1:8545`
- Forks from Ethereum Mainnet at specified block
- All mainnet contracts/state available
- Provides 10 accounts with 10,000 ETH each
- Fast block times (instant mining)
- No gas costs (local node)

---

## Step 4: Verify Fork is Working

In a new terminal:

```bash
# Check fork is accessible
cast block-number --rpc-url http://127.0.0.1:8545

# Check Compound V3 USDC Comet exists on mainnet
cast call 0xc3d688B66703497DAA19211EEdff47f25384cdc3 \
  "baseToken()(address)" \
  --rpc-url http://127.0.0.1:8545

# Should return USDC address: 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48
```

---

## Step 5: Update Foundry Config for Mainnet Fork

Add to `foundry.toml`:

```toml
[profile.mainnet-fork]
src = "src"
test = "test/foundry"
out = "out"
libs = ["lib"]

# Mainnet fork settings
fork_url = "${MAINNET_RPC_URL}"
fork_block_number = 19000000  # Optional: pin to specific block
chain_id = 1
gas_limit = 30000000

# Compiler settings
solc_version = "0.8.20"
optimizer = true
optimizer_runs = 200
via_ir = true
evm_version = "cancun"

# Verbosity for debugging
verbosity = 3
```

---

## Step 6: Mainnet Contract Addresses

### Compound V3 (Mainnet)

```solidity
// Comets
address constant USDC_COMET = 0xc3d688B66703497DAA19211EEdff47f25384cdc3;
address constant WETH_COMET = 0xA17581A9E3356d9A858b789D68B4d866e593aE94;

// Tokens
address constant USDC = 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48;
address constant WETH = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;
```

### Uniswap V3 (Mainnet)

```solidity
// Factory
address constant FACTORY = 0x1F98431c8aD98523631AE4a59f267346ea31F984;

// WETH/USDC Pools (Multiple fee tiers!)
address constant POOL_005 = 0x88e6A0c2dDD26FEEb64F039a2c41296FcB3f5640; // 0.05%
address constant POOL_030 = 0x8ad599c3A0ff1De082011EFDDc58f1908eb6e6D8; // 0.3%
address constant POOL_100 = 0x7BeA39867e4169DBe237d55C8242a8f2fcDcc387; // 1%

// SwapRouter
address constant SWAP_ROUTER = 0xE592427A0AEce92De3Edee1F18E0157C05861564;
```

### Flash Loan Providers (Mainnet)

```solidity
// Aave V3
address constant AAVE_POOL = 0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2;

// Balancer V2
address constant BALANCER_VAULT = 0xBA12222222228d8Ba445958a75a0704d566BF2C8;
```

---

## Step 7: Create Mainnet Fork Test

Save as `test/foundry/MainnetCrossCometE2E.t.sol`:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "forge-std/console.sol";
import "../../src/CompoundV3CrossCometSwitcher.sol";

interface IERC20 {
    function balanceOf(address) external view returns (uint256);
    function approve(address, uint256) external returns (bool);
}

interface IComet {
    function supply(address asset, uint amount) external;
    function withdraw(address asset, uint amount) external;
    function allow(address manager, bool isAllowed) external;
    function borrowBalanceOf(address account) external view returns (uint256);
    function collateralBalanceOf(address account, address asset) external view returns (uint128);
}

contract MainnetCrossCometE2ETest is Test {
    CompoundV3CrossCometSwitcher public switcher;

    // Mainnet addresses
    address constant USDC_COMET = 0xc3d688B66703497DAA19211EEdff47f25384cdc3;
    address constant WETH_COMET = 0xA17581A9E3356d9A858b789D68B4d866e593aE94;
    address constant USDC = 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48;
    address constant WETH = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;

    // Uniswap V3 Pools
    address constant FLASH_POOL = 0x88e6A0c2dDD26FEEb64F039a2c41296FcB3f5640; // 0.05%
    address constant SWAP_POOL = 0x7BeA39867e4169DBe237d55C8242a8f2fcDcc387;  // 1%

    address user;
    address whale; // For getting tokens

    function setUp() public {
        // Create user
        user = makeAddr("user");

        // Use a mainnet whale address to get tokens
        whale = 0x47ac0Fb4F2D84898e4D9E7b4DaB3C24507a6D503; // Binance wallet

        console.log("Mainnet Fork Test Setup");
        console.log("Block:", block.number);
        console.log("User:", user);
    }

    function testMainnetCrossCometSwitch() public {
        console.log("\n=== MAINNET FORK: CROSS-COMET SWITCHING ===\n");

        // Deploy switcher
        switcher = new CompoundV3CrossCometSwitcher(FLASH_POOL, SWAP_POOL);
        console.log("Switcher deployed:", address(switcher));

        // Get tokens for user from whale
        vm.startPrank(whale);
        IERC20(WETH).transfer(user, 10 ether);
        vm.stopPrank();

        console.log("\n1. User has WETH:", IERC20(WETH).balanceOf(user) / 1e18);

        // User creates position in USDC Comet
        vm.startPrank(user);

        console.log("\n2. Creating position in USDC Comet...");
        IERC20(WETH).approve(USDC_COMET, 5 ether);
        IComet(USDC_COMET).supply(WETH, 5 ether);

        console.log("   Collateral supplied: 5 WETH");

        // Borrow USDC
        IComet(USDC_COMET).withdraw(USDC, 5000 * 10**6);
        uint256 debt = IComet(USDC_COMET).borrowBalanceOf(user);
        console.log("   Borrowed:", debt / 10**6, "USDC");

        // Authorize switcher
        console.log("\n3. Authorizing switcher...");
        IComet(USDC_COMET).allow(address(switcher), true);
        IComet(WETH_COMET).allow(address(switcher), true);
        console.log("   Authorized!");

        // Execute switch
        console.log("\n4. Executing cross-Comet switch...");
        console.log("   Flash pool: 0.05% fee");
        console.log("   Swap pool: 1% fee (DIFFERENT POOL!)");

        switcher.switchCollateral(
            user,
            USDC_COMET,
            WETH_COMET,
            WETH,
            5 ether,
            debt * 95 / 100  // 5% slippage
        );

        vm.stopPrank();

        // Verify results
        console.log("\n5. Verifying final state...");

        uint128 sourceCollateral = IComet(USDC_COMET).collateralBalanceOf(user, WETH);
        uint256 sourceDebt = IComet(USDC_COMET).borrowBalanceOf(user);

        console.log("\n   USDC Comet (source):");
        console.log("     Collateral:", sourceCollateral);
        console.log("     Debt:", sourceDebt);

        uint128 targetCollateral = IComet(WETH_COMET).collateralBalanceOf(user, WETH);
        uint256 targetDebt = IComet(WETH_COMET).borrowBalanceOf(user);

        console.log("\n   WETH Comet (target):");
        console.log("     Collateral:", targetCollateral / 1e18, "WETH");
        console.log("     Debt:", targetDebt / 1e18, "WETH");

        // Assertions
        assertEq(sourceCollateral, 0, "Source should have no collateral");
        assertEq(sourceDebt, 0, "Source should have no debt");
        assertTrue(targetCollateral > 0, "Target should have collateral");
        assertTrue(targetDebt > 0, "Target should have debt");

        console.log("\n=== SUCCESS! ===");
        console.log("Cross-Comet switching works on mainnet!\n");
    }
}
```

---

## Step 8: Run the Test

### Terminal 1: Start Fork Node

```bash
# Source your environment
source .env

# Start Anvil fork
anvil --fork-url $MAINNET_RPC_URL --fork-block-number 19000000
```

### Terminal 2: Run Tests

```bash
# Run the mainnet fork test
forge test --match-contract MainnetCrossCometE2ETest --fork-url http://127.0.0.1:8545 -vvv

# Or use the profile
forge test --match-contract MainnetCrossCometE2ETest --profile mainnet-fork -vvv
```

---

## Step 9: What to Expect

### Success Output

```
=== MAINNET FORK: CROSS-COMET SWITCHING ===

Switcher deployed: 0x...

1. User has WETH: 10

2. Creating position in USDC Comet...
   Collateral supplied: 5 WETH
   Borrowed: 5000 USDC

3. Authorizing switcher...
   Authorized!

4. Executing cross-Comet switch...
   Flash pool: 0.05% fee
   Swap pool: 1% fee (DIFFERENT POOL!)

5. Verifying final state...

   USDC Comet (source):
     Collateral: 0
     Debt: 0

   WETH Comet (target):
     Collateral: 5 WETH
     Debt: ~2.5 WETH

=== SUCCESS! ===
Cross-Comet switching works on mainnet!
```

---

## Troubleshooting

### Issue: "missing trie node"

**Solution**: Use a better RPC provider or pin to specific block:

```bash
anvil --fork-url $MAINNET_RPC_URL --fork-block-number 19000000 --no-storage-caching
```

### Issue: "out of gas"

**Solution**: Increase gas limit:

```bash
anvil --fork-url $MAINNET_RPC_URL --gas-limit 30000000
```

### Issue: Slow performance

**Solution**: Use caching:

```bash
# Enable state caching
anvil --fork-url $MAINNET_RPC_URL --state-interval 100
```

---

## Next Steps

Once mainnet fork tests pass:

1. ✅ Verify all scenarios work
2. ✅ Measure actual gas costs
3. ✅ Test edge cases (max amounts, min amounts, high slippage)
4. ✅ Security review
5. 🚀 Deploy to mainnet
6. 🎯 Integrate with ERC-4337

---

## Advantages of Mainnet Fork

✅ **Real infrastructure**: Multiple pools, real liquidity
✅ **Actual state**: Real Compound markets, balances, prices
✅ **No testnet limitations**: All DeFi protocols available
✅ **Realistic testing**: Gas costs, slippage, edge cases
✅ **Safe environment**: Local node, no real funds at risk
✅ **Fast iteration**: Instant block times, unlimited funds
