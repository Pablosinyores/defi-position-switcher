const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  smartAccountAddress: {
    type: String,
    lowercase: true
  },
  type: {
    type: String,
    required: true,
    enum: ['DEPOSIT', 'SWAP', 'SUPPLY', 'BORROW', 'REPAY', 'WITHDRAW', 'SWITCH', 'SWITCH_PROTOCOL']
  },
  protocol: {
    type: String,
    enum: ['AAVE', 'COMPOUND', 'COMPOUND_USDC', 'COMPOUND_WETH', 'UNISWAP', null]
  },
  asset: {
    type: String
  },
  amount: {
    type: String
  },
  fromAsset: {
    address: {
      type: String,
      lowercase: true
    },
    symbol: String,
    amount: String
  },
  toAsset: {
    address: {
      type: String,
      lowercase: true
    },
    symbol: String,
    amount: String
  },
  txHash: {
    type: String,
    required: true,
    lowercase: true
  },
  userOpHash: {
    type: String,
    lowercase: true
  },
  status: {
    type: String,
    enum: ['PENDING', 'SUCCESS', 'FAILED'],
    default: 'PENDING'
  },
  gasUsed: String,
  gasCost: String,
  blockNumber: Number,
  error: String,
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  confirmedAt: Date
});

// Index for efficient queries
transactionSchema.index({ user: 1, createdAt: -1 });
transactionSchema.index({ txHash: 1 });

module.exports = mongoose.model('Transaction', transactionSchema);
