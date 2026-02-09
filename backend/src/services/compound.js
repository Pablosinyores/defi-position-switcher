const { ethers } = require('ethers');
const config = require('../config');
const logger = require('../utils/logger');

// Compound V3 Comet ABI
const COMET_ABI = [
  'function supply(address asset, uint amount)',
  'function supplyTo(address dst, address asset, uint amount)',
  'function withdraw(address asset, uint amount)',
  'function withdrawFrom(address src, address to, address asset, uint amount)',
  'function borrowBalanceOf(address account) view returns (uint256)',
  'function collateralBalanceOf(address account, address asset) view returns (uint128)',
  'function getSupplyRate(uint utilization) view returns (uint64)',
  'function getBorrowRate(uint utilization) view returns (uint64)',
  'function getUtilization() view returns (uint)',
  'function totalSupply() view returns (uint256)',
  'function totalBorrow() view returns (uint256)'
];

class CompoundService {
  constructor() {
    this.provider = new ethers.JsonRpcProvider(config.blockchain.rpcUrl);
    this.cometAddress = config.contracts.compoundComet;
    // Only create contract if comet address is configured
    if (this.cometAddress) {
      this.comet = new ethers.Contract(this.cometAddress, COMET_ABI, this.provider);
    } else {
      this.comet = null;
      logger.warn('Compound comet address not configured - Compound service disabled');
    }
  }

  /**
   * Encode Compound operations
   */
  async encodeSupply(asset, amount) {
    const iface = new ethers.Interface(COMET_ABI);
    return iface.encodeFunctionData('supply', [asset, amount]);
  }

  async encodeSupplyTo(dst, asset, amount) {
    const iface = new ethers.Interface(COMET_ABI);
    return iface.encodeFunctionData('supplyTo', [dst, asset, amount]);
  }

  async encodeWithdrawFrom(src, to, asset, amount) {
    const iface = new ethers.Interface(COMET_ABI);
    return iface.encodeFunctionData('withdrawFrom', [src, to, asset, amount]);
  }

  /**
   * Get user position data
   */
  async getUserPosition(userAddress, collateralAsset) {
    try {
      const [borrowBalance, collateralBalance] = await Promise.all([
        this.comet.borrowBalanceOf(userAddress),
        this.comet.collateralBalanceOf(userAddress, collateralAsset)
      ]);

      return {
        borrowBalance: borrowBalance.toString(),
        collateralBalance: collateralBalance.toString()
      };
    } catch (error) {
      logger.error('Error getting user position:', error);
      throw error;
    }
  }

  /**
   * Get market rates
   */
  async getMarketRates() {
    try {
      const utilization = await this.comet.getUtilization();
      const [supplyRate, borrowRate] = await Promise.all([
        this.comet.getSupplyRate(utilization),
        this.comet.getBorrowRate(utilization)
      ]);

      // Convert to APR (rates are per second in Compound)
      const SECONDS_PER_YEAR = 31536000;
      const supplyAPR = (Number(supplyRate) * SECONDS_PER_YEAR / 1e18 * 100).toFixed(2);
      const borrowAPR = (Number(borrowRate) * SECONDS_PER_YEAR / 1e18 * 100).toFixed(2);

      return {
        supplyAPR,
        borrowAPR,
        utilization: (Number(utilization) / 1e18 * 100).toFixed(2)
      };
    } catch (error) {
      logger.error('Error getting market rates:', error);
      throw error;
    }
  }

  /**
   * Get available liquidity
   */
  async getAvailableLiquidity() {
    try {
      const [totalSupply, totalBorrow] = await Promise.all([
        this.comet.totalSupply(),
        this.comet.totalBorrow()
      ]);

      const available = totalSupply - totalBorrow;

      return {
        totalSupply: totalSupply.toString(),
        totalBorrow: totalBorrow.toString(),
        available: available.toString()
      };
    } catch (error) {
      logger.error('Error getting available liquidity:', error);
      throw error;
    }
  }
}

module.exports = new CompoundService();
