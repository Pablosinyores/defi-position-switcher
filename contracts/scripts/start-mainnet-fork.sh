#!/bin/bash

# Start Mainnet Fork Script
# This starts a local Ethereum mainnet fork using Anvil

set -e

echo "=========================================="
echo "Starting Ethereum Mainnet Fork"
echo "=========================================="
echo ""

# Check if .env exists
if [ ! -f ../.env ]; then
    echo "Error: .env file not found!"
    echo ""
    echo "Please create .env file with:"
    echo "  MAINNET_RPC_URL=<your-alchemy-or-infura-url>"
    echo ""
    exit 1
fi

# Load environment variables
source ../.env

# Check if MAINNET_RPC_URL is set
if [ -z "$MAINNET_RPC_URL" ]; then
    echo "Error: MAINNET_RPC_URL not set in .env"
    echo ""
    echo "Please add to .env:"
    echo "  MAINNET_RPC_URL=https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY"
    echo ""
    exit 1
fi

echo "Configuration:"
echo "  RPC URL: ${MAINNET_RPC_URL:0:50}..."
echo "  Port: 8545"
echo "  Chain ID: 1"
echo "  Block: Latest"
echo ""

echo "Starting Anvil..."
echo ""
echo "Note: Keep this terminal open. Run tests in a new terminal."
echo ""
echo "=========================================="
echo ""

# Start Anvil with mainnet fork
/Users/jitendersingh/.foundry/bin/anvil \
    --fork-url "$MAINNET_RPC_URL" \
    --port 8545 \
    --chain-id 1 \
    --accounts 10 \
    --balance 10000 \
    --gas-limit 30000000 \
    --code-size-limit 50000 \
    --no-rate-limit
