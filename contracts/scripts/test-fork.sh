#!/bin/bash

# Test VenusCollateralSwitcher on BSC Testnet Fork

echo "╔════════════════════════════════════════════════════════════╗"
echo "║   Testing Venus Collateral Switcher on BSC Testnet Fork  ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# Enable forking
export FORK_ENABLED=true

# Use BSC testnet RPC (default)
export BSC_TESTNET_RPC_URL="${BSC_TESTNET_RPC_URL:-https://data-seed-prebsc-1-s1.binance.org:8545/}"

echo "🔧 Configuration:"
echo "   Fork: ENABLED"
echo "   Network: BSC Testnet"
echo "   RPC: $BSC_TESTNET_RPC_URL"
echo ""

# Run tests
echo "🧪 Running tests..."
echo ""

npx hardhat test test/VenusCollateralSwitcher.test.js

# Check exit code
if [ $? -eq 0 ]; then
    echo ""
    echo "✅ All tests passed!"
else
    echo ""
    echo "❌ Tests failed!"
    exit 1
fi
