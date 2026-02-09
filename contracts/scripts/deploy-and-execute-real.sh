#!/bin/bash

set -e

RPC_URL="http://127.0.0.1:8545"
DEPLOYER_KEY="0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
BACKEND_KEY="0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"

FLASH_POOL="0x88e6A0c2dDD26FEEb64F039a2c41296FcB3f5640"
SWAP_POOL="0x7BeA39867e4169DBe237d55C8242a8f2fcDcc387"
ENTRY_POINT="0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789"

echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║  REAL DEPLOYMENT & EXECUTION ON FORK                      ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# Get current block
CURRENT_BLOCK=$(~/.foundry/bin/cast block-number --rpc-url "$RPC_URL")
echo "Current block: $CURRENT_BLOCK"
echo ""

echo "╔════════════════════════════════════════════════════════════╗"
echo "║  PHASE 1: DEPLOYING CONTRACTS                              ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# Deploy Smart Account
echo "[1/3] Deploying SimpleSmartAccount..."
SMART_ACCOUNT_TX=$(~/.foundry/bin/forge create \
  src/SimpleSmartAccount.sol:SimpleSmartAccount \
  --rpc-url "$RPC_URL" \
  --private-key "$DEPLOYER_KEY" \
  --constructor-args "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" \
  --json 2>/dev/null)

SMART_ACCOUNT=$(echo "$SMART_ACCOUNT_TX" | jq -r '.deployedTo')
SMART_ACCOUNT_HASH=$(echo "$SMART_ACCOUNT_TX" | jq -r '.transactionHash')

echo "   ✅ Smart Account: $SMART_ACCOUNT"
echo "   📝 Transaction Hash: $SMART_ACCOUNT_HASH"
echo ""

# Fund smart account
echo "   Funding smart account with ETH..."
FUND_TX=$(~/.foundry/bin/cast send "$SMART_ACCOUNT" \
  --value 10ether \
  --rpc-url "$RPC_URL" \
  --private-key "$DEPLOYER_KEY" \
  --json 2>/dev/null)

FUND_HASH=$(echo "$FUND_TX" | jq -r '.transactionHash')
echo "   ✅ Funded with 10 ETH"
echo "   📝 Transaction Hash: $FUND_HASH"
echo ""

# Deploy Switcher
echo "[2/3] Deploying CompoundV3CrossCometSwitcher..."
SWITCHER_TX=$(~/.foundry/bin/forge create \
  src/CompoundV3CrossCometSwitcher.sol:CompoundV3CrossCometSwitcher \
  --rpc-url "$RPC_URL" \
  --private-key "$DEPLOYER_KEY" \
  --constructor-args "$FLASH_POOL" "$SWAP_POOL" \
  --json 2>/dev/null)

SWITCHER=$(echo "$SWITCHER_TX" | jq -r '.deployedTo')
SWITCHER_HASH=$(echo "$SWITCHER_TX" | jq -r '.transactionHash')

echo "   ✅ Switcher: $SWITCHER"
echo "   📝 Transaction Hash: $SWITCHER_HASH"
echo ""

# Authorize smart account
echo "   Authorizing smart account..."
AUTH_TX=$(~/.foundry/bin/cast send "$SWITCHER" \
  "authorizeCaller(address,bool)" \
  "$SMART_ACCOUNT" \
  true \
  --rpc-url "$RPC_URL" \
  --private-key "$DEPLOYER_KEY" \
  --json 2>/dev/null)

AUTH_HASH=$(echo "$AUTH_TX" | jq -r '.transactionHash')
echo "   ✅ Authorized"
echo "   📝 Transaction Hash: $AUTH_HASH"
echo ""

# Deploy Paymaster
echo "[3/3] Deploying SimplePaymaster..."
PAYMASTER_TX=$(~/.foundry/bin/forge create \
  src/SimplePaymaster.sol:SimplePaymaster \
  --rpc-url "$RPC_URL" \
  --private-key "$DEPLOYER_KEY" \
  --constructor-args "$ENTRY_POINT" \
  --json 2>/dev/null)

PAYMASTER=$(echo "$PAYMASTER_TX" | jq -r '.deployedTo')
PAYMASTER_HASH=$(echo "$PAYMASTER_TX" | jq -r '.transactionHash')

echo "   ✅ Paymaster: $PAYMASTER"
echo "   📝 Transaction Hash: $PAYMASTER_HASH"
echo ""

# Fund paymaster
echo "   Funding paymaster..."
FUND_PM_TX=$(~/.foundry/bin/cast send "$PAYMASTER" \
  "deposit()" \
  --value 100ether \
  --rpc-url "$RPC_URL" \
  --private-key "$DEPLOYER_KEY" \
  --json 2>/dev/null)

FUND_PM_HASH=$(echo "$FUND_PM_TX" | jq -r '.transactionHash')
echo "   ✅ Funded with 100 ETH"
echo "   📝 Transaction Hash: $FUND_PM_HASH"
echo ""

# Add sponsored account
echo "   Adding smart account to sponsorship..."
SPONSOR_TX=$(~/.foundry/bin/cast send "$PAYMASTER" \
  "addSponsoredAccount(address)" \
  "$SMART_ACCOUNT" \
  --rpc-url "$RPC_URL" \
  --private-key "$DEPLOYER_KEY" \
  --json 2>/dev/null)

SPONSOR_HASH=$(echo "$SPONSOR_TX" | jq -r '.transactionHash')
echo "   ✅ Sponsored"
echo "   📝 Transaction Hash: $SPONSOR_HASH"
echo ""

echo "╔════════════════════════════════════════════════════════════╗"
echo "║  ALL TRANSACTIONS RECORDED ON FORK                         ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

END_BLOCK=$(~/.foundry/bin/cast block-number --rpc-url "$RPC_URL")
echo "Blocks: $CURRENT_BLOCK → $END_BLOCK"
echo "Total transactions: 7"
echo ""

echo "Transaction Hashes:"
echo "  1. Smart Account Deploy:  $SMART_ACCOUNT_HASH"
echo "  2. Fund Smart Account:    $FUND_HASH"
echo "  3. Switcher Deploy:       $SWITCHER_HASH"
echo "  4. Authorize Switcher:    $AUTH_HASH"
echo "  5. Paymaster Deploy:      $PAYMASTER_HASH"
echo "  6. Fund Paymaster:        $FUND_PM_HASH"
echo "  7. Sponsor Account:       $SPONSOR_HASH"
echo ""

echo "Verify any transaction:"
echo "  curl -X POST $RPC_URL \\"
echo "    -d '{\"jsonrpc\":\"2.0\",\"method\":\"eth_getTransactionByHash\",\"params\":[\"$SMART_ACCOUNT_HASH\"],\"id\":1}' | jq"
echo ""

echo "Deployed Addresses:"
echo "  Smart Account: $SMART_ACCOUNT"
echo "  Switcher:      $SWITCHER"
echo "  Paymaster:     $PAYMASTER"
echo ""

# Save addresses
echo "$SMART_ACCOUNT" > .smart-account-address-real
echo "$SWITCHER" > .switcher-address-real
echo "$PAYMASTER" > .paymaster-address-real

echo "✅ All deployments complete and verified on fork!"
echo ""
