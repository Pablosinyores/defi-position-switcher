const { ethers } = require('ethers');
const axios = require('axios');
const config = require('../config');
const logger = require('../utils/logger');

const UNISWAP_V3_ROUTER_ABI = [
  'function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) external payable returns (uint256 amountOut)'
];

class SwapService {
  constructor() {
    this.provider = new ethers.JsonRpcProvider(config.blockchain.rpcUrl);
    this.routerAddress = config.contracts.uniswapV3Router;
    // Only create contract if router address is configured
    if (this.routerAddress) {
      this.router = new ethers.Contract(this.routerAddress, UNISWAP_V3_ROUTER_ABI, this.provider);
    } else {
      this.router = null;
      logger.warn('Uniswap V3 router address not configured - Swap service disabled');
    }
  }

  /**
   * Get quote for swap
   */
  async getQuote(tokenIn, tokenOut, amountIn) {
    try {
      // In production, use Uniswap Quoter contract or API
      // For simplicity, we'll estimate based on common pairs

      // Simplified pricing logic for testnet
      // USDC -> WETH: ~1 WETH = $3000 USDC
      // In production, use Uniswap Quoter contract or Chainlink price feeds

      let amountOut;
      let inputDecimals = 6;  // Default USDC/USDT decimals
      let outputDecimals = 18; // Default WETH decimals

      // Determine decimals based on token
      if (tokenIn.toLowerCase() === config.tokens.weth?.toLowerCase()) {
        inputDecimals = 18;
      }
      if (tokenOut.toLowerCase() === config.tokens.weth?.toLowerCase()) {
        outputDecimals = 18;
      }

      const amountInFormatted = Number(ethers.formatUnits(amountIn, inputDecimals));

      // Pricing logic
      if (tokenIn.toLowerCase() === config.tokens.usdc?.toLowerCase() &&
          tokenOut.toLowerCase() === config.tokens.weth?.toLowerCase()) {
        // USDC -> WETH (1 WETH ~= $3000)
        amountOut = amountInFormatted / 3000;
      } else if (tokenIn.toLowerCase() === config.tokens.weth?.toLowerCase() &&
                 tokenOut.toLowerCase() === config.tokens.usdc?.toLowerCase()) {
        // WETH -> USDC
        amountOut = amountInFormatted * 3000;
      } else {
        // Default 1:1 for same-decimal tokens
        amountOut = amountInFormatted;
      }

      return {
        amountOut: ethers.parseUnits(amountOut.toFixed(outputDecimals === 18 ? 18 : 6), outputDecimals).toString(),
        estimatedGas: '300000',
        priceImpact: '0.1'
      };
    } catch (error) {
      logger.error('Error getting swap quote:', error);
      throw error;
    }
  }

  /**
   * Encode swap transaction
   */
  async encodeSwap(tokenIn, tokenOut, amountIn, minAmountOut, recipient) {
    try {
      const params = {
        tokenIn,
        tokenOut,
        fee: 3000, // 0.3% fee tier
        recipient,
        deadline: Math.floor(Date.now() / 1000) + 1800, // 30 minutes
        amountIn,
        amountOutMinimum: minAmountOut,
        sqrtPriceLimitX96: 0
      };

      const iface = new ethers.Interface(UNISWAP_V3_ROUTER_ABI);
      return iface.encodeFunctionData('exactInputSingle', [params]);
    } catch (error) {
      logger.error('Error encoding swap:', error);
      throw error;
    }
  }

  /**
   * Calculate slippage
   */
  calculateMinAmountOut(expectedAmount, slippagePercent = 0.5) {
    const slippage = BigInt(Math.floor(slippagePercent * 100)); // 0.5% = 50
    const amount = BigInt(expectedAmount);
    return (amount * (10000n - slippage)) / 10000n;
  }
}

module.exports = new SwapService();
