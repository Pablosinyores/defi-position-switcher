const mongoose = require('mongoose');

const positionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  smartWalletAddress: {
    type: String,
    required: true,
    lowercase: true
  },
  protocol: {
    type: String,
    required: true,
    enum: ['AAVE', 'COMPOUND']
  },
  protocolAddress: {
    type: String,
    required: true,
    lowercase: true
  },
  collateral: {
    asset: {
      type: String,
      required: true,
      lowercase: true
    },
    amount: {
      type: String,
      required: true
    },
    symbol: String,
    decimals: Number
  },
  debt: {
    asset: {
      type: String,
      required: true,
      lowercase: true
    },
    amount: {
      type: String,
      required: true
    },
    symbol: String,
    decimals: Number
  },
  healthFactor: {
    type: String,
    default: '0'
  },
  borrowAPR: {
    type: String,
    default: '0'
  },
  supplyAPR: {
    type: String,
    default: '0'
  },
  status: {
    type: String,
    enum: ['ACTIVE', 'CLOSED', 'LIQUIDATED'],
    default: 'ACTIVE'
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  closedAt: Date
});

// Only one active position per user
positionSchema.index({ userId: 1, status: 1 }, { unique: true, partialFilterExpression: { status: 'ACTIVE' } });

// Update timestamp on save
positionSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model('Position', positionSchema);
