const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  privyId: {
    type: String,
    required: true,
    unique: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true
  },
  // Privy's embedded EOA wallet - THIS IS THE OWNER of the smart account
  privyWalletAddress: {
    type: String,
    required: true,
    lowercase: true
  },
  // ERC-4337 Smart Account contract address (owned by privyWalletAddress)
  smartAccountAddress: {
    type: String,
    unique: true,
    sparse: true,  // Allow null until account is created
    lowercase: true
  },
  // Per-user session key for backend to execute transactions
  // Backend generates this, user must sign to register it on their smart account
  sessionKey: {
    address: {
      type: String,
      lowercase: true
    },
    // Encrypted private key - ONLY the backend can decrypt and use this
    encryptedPrivateKey: String,
    expiresAt: Date,
    permissions: [{
      type: String,
      enum: ['SWAP', 'SUPPLY', 'BORROW', 'REPAY', 'SWITCH_PROTOCOL']
    }],
    // True only after user has signed the registration UserOp
    isGranted: {
      type: Boolean,
      default: false
    },
    // Temporary storage for pending registration UserOp (cleared after confirmation)
    pendingUserOp: {
      type: String  // JSON stringified UserOp data
    },
    pendingUserOpHash: String
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
