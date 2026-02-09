#!/bin/bash

# Test on Mainnet Fork Script
# Runs comprehensive tests on the local mainnet fork

set -e

echo "=========================================="
echo "Testing on Mainnet Fork"
echo "=========================================="
echo ""

# Check if fork is running
echo "Checking if mainnet fork is running..."
if ! curl -s http://127.0.0.1:8545 > /dev/null 2>&1; then
    echo ""
    echo "Error: No node running at http://127.0.0.1:8545"
    echo ""
    echo "Please start the mainnet fork first:"
    echo "  cd contracts/scripts"
    echo "  ./start-mainnet-fork.sh"
    echo ""
    exit 1
fi

echo "Fork is running!"
echo ""

# Get block number to verify
BLOCK=$(/Users/jitendersingh/.foundry/bin/cast block-number --rpc-url http://127.0.0.1:8545)
echo "Connected to mainnet fork at block: $BLOCK"
echo ""

echo "=========================================="
echo "Running Tests"
echo "=========================================="
echo ""

# Run the mainnet fork tests
/Users/jitendersingh/.foundry/bin/forge test \
    --match-contract MainnetCrossCometE2ETest \
    --fork-url http://127.0.0.1:8545 \
    -vvv

echo ""
echo "=========================================="
echo "Tests Complete!"
echo "=========================================="
