const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  privyId: {
    type: String,
    required: true,
    unique: true  // unique: true already creates an index
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true
  },
  // Privy's embedded EOA wallet (user controls via Privy)
  privyWalletAddress: {
    type: String,
    required: true,
    lowercase: true
  },
  // ERC-4337 Smart Account contract address
  smartAccountAddress: {
    type: String,
    required: true,
    unique: true,
    lowercase: true
  },
  // Owner's encrypted private key (controls the Smart Account)
  // In production, this would ideally be managed by Privy, but for now we manage it
  encryptedOwnerKey: {
    type: String,
    required: true
  },
  // Session key for backend to execute transactions
  sessionKey: {
    address: {
      type: String,
      lowercase: true
    },
    encryptedPrivateKey: String,
    expiresAt: Date,
    permissions: [{
      type: String,
      enum: ['SWAP', 'SUPPLY', 'BORROW', 'REPAY', 'SWITCH_PROTOCOL']
    }],
    isGranted: {
      type: Boolean,
      default: false
    }
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Update timestamp on save
userSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model('User', userSchema);
