#!/bin/bash

set -e

echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║  FULL AA DEMO: REAL EXECUTION ON MAINNET FORK             ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# Check if fork is running
echo "[1/2] Checking if mainnet fork is running..."
if ! curl -s -X POST -H "Content-Type: application/json" \
  --data '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}' \
  http://127.0.0.1:8545 > /dev/null 2>&1; then
  echo "❌ Fork not running!"
  echo ""
  echo "Start the fork in another terminal:"
  echo "  cd contracts/scripts"
  echo "  ./start-mainnet-fork.sh"
  echo ""
  exit 1
fi

echo "✅ Fork is running"
echo ""

# Run the full integration test
echo "[2/2] Running full integration test..."
echo ""
echo "This will:"
echo "  ✅ Deploy smart account, switcher, paymaster"
echo "  ✅ Add session key"
echo "  ✅ Execute 7 transactions as backend"
echo "  ✅ Complete cross-Comet switch"
echo ""

cd "$(dirname "$0")/.."

~/.foundry/bin/forge test --match-contract AAFullIntegration --fork-url http://127.0.0.1:8545 -vv

if [ $? -eq 0 ]; then
  echo ""
  echo "╔════════════════════════════════════════════════════════════╗"
  echo "║  ✅ SUCCESS! FULL AA INTEGRATION WORKING!                  ║"
  echo "╚════════════════════════════════════════════════════════════╝"
  echo ""
  echo "Deployed addresses saved to:"
  echo "  - .smart-account-address"
  echo "  - .switcher-address"
  echo "  - .paymaster-address"
  echo ""
  echo "Next: Run backend service to interact with deployed contracts"
  echo "  cd backend"
  echo "  npm install"
  echo "  npm run aa:demo"
  echo ""
else
  echo ""
  echo "❌ Test failed. Check output above for errors."
  echo ""
  exit 1
fi
