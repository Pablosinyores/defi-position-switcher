#!/bin/bash

set -e

echo "=========================================================="
echo "DEPLOYING PAYMASTER TO MAINNET FORK"
echo "=========================================================="
echo ""

# EntryPoint address (exists on mainnet, copied to fork)
ENTRY_POINT="0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789"

# Anvil default private key (has ETH)
DEPLOYER_KEY="0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"

# RPC URL
RPC_URL="http://127.0.0.1:8545"

echo "EntryPoint: $ENTRY_POINT"
echo "RPC URL: $RPC_URL"
echo ""

echo "Deploying SimplePaymaster..."
PAYMASTER_ADDRESS=$(forge create \
  --rpc-url "$RPC_URL" \
  --private-key "$DEPLOYER_KEY" \
  --constructor-args "$ENTRY_POINT" \
  src/SimplePaymaster.sol:SimplePaymaster \
  --json | jq -r '.deployedTo')

if [ -z "$PAYMASTER_ADDRESS" ] || [ "$PAYMASTER_ADDRESS" = "null" ]; then
  echo "❌ Failed to deploy paymaster"
  exit 1
fi

echo ""
echo "✅ Paymaster deployed at: $PAYMASTER_ADDRESS"
echo ""

echo "Funding paymaster with 10 ETH..."
cast send "$PAYMASTER_ADDRESS" \
  "deposit()" \
  --value 10ether \
  --rpc-url "$RPC_URL" \
  --private-key "$DEPLOYER_KEY" > /dev/null

BALANCE=$(cast call "$PAYMASTER_ADDRESS" "getBalance()(uint256)" --rpc-url "$RPC_URL")
echo "✅ Paymaster balance: $BALANCE wei (10 ETH)"
echo ""

# Save address to file
echo "$PAYMASTER_ADDRESS" > .paymaster-address
echo "Saved paymaster address to .paymaster-address"
echo ""

echo "=========================================================="
echo "PAYMASTER READY!"
echo "=========================================================="
echo ""
echo "Address: $PAYMASTER_ADDRESS"
echo "Balance: 10 ETH"
echo "EntryPoint: $ENTRY_POINT"
echo ""
echo "Next: Add smart accounts to sponsorship list"
echo "=========================================================="
