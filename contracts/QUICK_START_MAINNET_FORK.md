# Quick Start: Mainnet Fork Testing

**Goal**: Test cross-Comet switching on Ethereum Mainnet fork in under 5 minutes

---

## Prerequisites Checklist

- [ ] Foundry installed (`forge --version`)
- [ ] Ethereum Mainnet RPC URL (Alchemy, Infura, etc.)
- [ ] `.env` file configured

---

## Step 1: Get Mainnet RPC URL (2 minutes)

### Option A: Alchemy (Recommended - Free)

1. Go to https://www.alchemy.com/
2. Sign up / Log in
3. Click "Create New App"
4. Select "Ethereum" → "Mainnet"
5. Copy your HTTPS URL

### Option B: Public RPC (Rate Limited)

```
https://rpc.ankr.com/eth
```

---

## Step 2: Configure Environment (1 minute)

Add to your `.env` file (create if it doesn't exist):

```bash
# In /Users/jitendersingh/defi-borrowing-app/.env
MAINNET_RPC_URL=https://eth-mainnet.g.alchemy.com/v2/YOUR_API_KEY
```

Replace `YOUR_API_KEY` with your actual Alchemy API key.

---

## Step 3: Start Mainnet Fork (30 seconds)

### Terminal 1:

```bash
cd /Users/jitendersingh/defi-borrowing-app/contracts/scripts
./start-mainnet-fork.sh
```

You should see:
```
==========================================
Starting Ethereum Mainnet Fork
==========================================

Configuration:
  RPC URL: https://eth-mainnet.g.alchemy.com/v2/...
  Port: 8545
  Chain ID: 1
  Block: Latest

Starting Anvil...
```

**Keep this terminal open!**

---

## Step 4: Run Tests (1 minute)

### Terminal 2 (New Terminal):

```bash
cd /Users/jitendersingh/defi-borrowing-app/contracts/scripts
./test-mainnet-fork.sh
```

You should see tests running with detailed output showing:
- ✅ Deploying contracts
- ✅ Getting tokens from mainnet whales
- ✅ Creating position in USDC Comet
- ✅ Executing cross-Comet switch
- ✅ Verifying final state

---

## Expected Output

```
========================================================
MAINNET FORK: CROSS-COMET SWITCHING E2E TEST
========================================================

Network: Ethereum Mainnet Fork
Block: 19123456
User: 0x...

========================================================
STEP 1: DEPLOY SWITCHER CONTRACT
========================================================

Switcher deployed: 0x...
Flash loan pool (0.05%): 0x88e6A0c2dDD26FEEb64F039a2c41296FcB3f5640
Swap pool (1%): 0x7BeA39867e4169DBe237d55C8242a8f2fcDcc387
Status: Different pools - NO REENTRANCY!

... [detailed execution steps] ...

========================================================
FINAL RESULT
========================================================

SUCCESS! Cross-Comet switching works on mainnet!

What happened:
  1. Flash loaned 5000 USDC from 0.05% pool
  2. Repaid USDC debt in USDC Comet
  3. Withdrew 5 WETH collateral from USDC Comet
  4. Supplied 5 WETH to WETH Comet
  5. Borrowed ~2.5 WETH from WETH Comet
  6. Swapped WETH -> USDC on 1% pool (different pool!)
  7. Repaid flash loan to 0.05% pool

Position successfully moved:
  From: USDC Comet (USDC debt)
  To:   WETH Comet (WETH debt)

Key: Different pools = NO reentrancy conflict!

All assertions passed!
```

---

## Troubleshooting

### Error: "MAINNET_RPC_URL not set"

**Solution**: Add to `.env` file:
```bash
MAINNET_RPC_URL=https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY
```

### Error: "No node running at http://127.0.0.1:8545"

**Solution**: Start the fork in Terminal 1:
```bash
cd contracts/scripts
./start-mainnet-fork.sh
```

### Error: "missing trie node" or "header not found"

**Solution**: Your RPC provider might not support archive data. Try:
1. Use Alchemy (best archive support)
2. Or add to start script: `--fork-block-number 19000000`

### Slow Performance

**Solution**: The first run might be slow as it fetches state. Subsequent runs will be faster due to caching.

---

## What This Tests

✅ **Flash Loans**: Using Uniswap V3 0.05% pool
✅ **Token Swaps**: Using Uniswap V3 1% pool (different pool!)
✅ **Compound V3**: Real mainnet USDC and WETH Comets
✅ **Reentrancy Solution**: Proves different pools avoid reentrancy
✅ **Atomic Execution**: All-or-nothing transaction
✅ **Real Liquidity**: Actual mainnet state and prices
✅ **Gas Costs**: Realistic gas measurements

---

## Next Steps After Tests Pass

1. ✅ Verify gas costs are acceptable
2. ✅ Test edge cases (max amounts, high slippage)
3. ✅ Security review
4. 🚀 Deploy to mainnet
5. 🎯 Integrate with ERC-4337

---

## Manual Testing (Optional)

If you want to test manually:

```bash
# Terminal 1: Start fork
cd contracts/scripts
./start-mainnet-fork.sh

# Terminal 2: Use cast to interact
# Check block number
cast block-number --rpc-url http://127.0.0.1:8545

# Check Compound USDC Comet
cast call 0xc3d688B66703497DAA19211EEdff47f25384cdc3 \
  "baseToken()(address)" \
  --rpc-url http://127.0.0.1:8545

# Deploy contract
forge create src/CompoundV3CrossCometSwitcher.sol:CompoundV3CrossCometSwitcher \
  --constructor-args \
    0x88e6A0c2dDD26FEEb64F039a2c41296FcB3f5640 \
    0x7BeA39867e4169DBe237d55C8242a8f2fcDcc387 \
  --rpc-url http://127.0.0.1:8545 \
  --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
```

---

## Stop Fork

When done testing:

```bash
# In Terminal 1 where fork is running
Ctrl + C
```

---

## Files Created

- `MainnetCrossCometE2E.t.sol` - Comprehensive E2E test
- `start-mainnet-fork.sh` - Helper script to start fork
- `test-mainnet-fork.sh` - Helper script to run tests
- `MAINNET_FORK_SETUP.md` - Detailed setup guide
- `QUICK_START_MAINNET_FORK.md` - This quick start guide

---

## Support

If you encounter issues:

1. Check `.env` file has `MAINNET_RPC_URL`
2. Ensure fork is running (Terminal 1)
3. Try a different RPC provider
4. Check [MAINNET_FORK_SETUP.md](MAINNET_FORK_SETUP.md) for detailed troubleshooting

---

**Ready to test? Run the commands above!** 🚀
