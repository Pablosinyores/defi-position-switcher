#!/bin/bash

set -e

RPC_URL="http://127.0.0.1:8545"

echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║  PERSISTENT DEPLOYMENT TO FORK                            ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# Check fork is running
if ! curl -s -X POST -H "Content-Type: application/json" \
  --data '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}' \
  "$RPC_URL" > /dev/null 2>&1; then
  echo "❌ Fork not running at $RPC_URL"
  echo "Start fork with: cd scripts && ./start-mainnet-fork.sh"
  exit 1
fi

echo "✅ Fork running at $RPC_URL"
echo ""

# Get starting block
START_BLOCK=$(~/.foundry/bin/cast block-number --rpc-url "$RPC_URL")
echo "Starting block: $START_BLOCK"
echo ""

echo "╔════════════════════════════════════════════════════════════╗"
echo "║  PHASE 1: DEPLOY CONTRACTS (PERSISTENT)                   ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

cd "$(dirname "$0")/.."

# Deploy with --broadcast (creates persistent state)
~/.foundry/bin/forge script script/DeployPersistent.s.sol \
  --fork-url "$RPC_URL" \
  --broadcast \
  -vv

echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║  PHASE 2: EXTRACT DEPLOYED ADDRESSES                      ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# Extract addresses from broadcast artifacts
BROADCAST_DIR="broadcast/DeployPersistent.s.sol/1"

if [ -d "$BROADCAST_DIR" ]; then
  # Get latest run
  LATEST_RUN=$(ls -t "$BROADCAST_DIR"/run-*.json | head -1)

  if [ -f "$LATEST_RUN" ]; then
    echo "Extracting addresses from: $LATEST_RUN"

    # Parse contract addresses from transactions
    SMART_ACCOUNT=$(jq -r '.transactions[] | select(.contractName == "SimpleSmartAccount") | .contractAddress' "$LATEST_RUN")
    SWITCHER=$(jq -r '.transactions[] | select(.contractName == "CompoundV3CrossCometSwitcher") | .contractAddress' "$LATEST_RUN")
    PAYMASTER=$(jq -r '.transactions[] | select(.contractName == "SimplePaymaster") | .contractAddress' "$LATEST_RUN")

    echo ""
    echo "Deployed Addresses (PERSISTENT):"
    echo "  Smart Account: $SMART_ACCOUNT"
    echo "  Switcher:      $SWITCHER"
    echo "  Paymaster:     $PAYMASTER"
    echo ""

    # Save to env file
    cat > .env.deployed <<EOF
SMART_ACCOUNT=$SMART_ACCOUNT
SWITCHER=$SWITCHER
PAYMASTER=$PAYMASTER
EOF

    echo "✅ Saved to .env.deployed"
    echo ""
  fi
fi

# Get ending block
END_BLOCK=$(~/.foundry/bin/cast block-number --rpc-url "$RPC_URL")
echo "Ending block: $END_BLOCK"
echo "Transactions recorded in blocks: $START_BLOCK - $END_BLOCK"
echo ""

echo "╔════════════════════════════════════════════════════════════╗"
echo "║  VERIFY PERSISTENCE                                       ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

if [ -n "$SMART_ACCOUNT" ]; then
  echo "Verifying smart account exists on fork:"
  CODE=$(~/.foundry/bin/cast code "$SMART_ACCOUNT" --rpc-url "$RPC_URL")

  if [ "$CODE" != "0x" ]; then
    echo "✅ Smart account deployed at: $SMART_ACCOUNT"
    echo "   Bytecode length: ${#CODE} characters"
  else
    echo "❌ Smart account not found"
  fi
fi

echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║  ✅ DEPLOYMENT COMPLETE - STATE IS PERSISTENT!            ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

echo "Next steps:"
echo "  1. Verify deployment:"
echo "     source .env.deployed"
echo "     cast code \$SMART_ACCOUNT --rpc-url $RPC_URL"
echo ""
echo "  2. Execute backend automation:"
echo "     ./scripts/execute-persistent.sh"
echo ""
