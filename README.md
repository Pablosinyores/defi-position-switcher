# DeFi Borrowing App

A full-stack DeFi application enabling **gasless cross-protocol position switching** using ERC-4337 Account Abstraction, Session Keys, and Uniswap V3 Flash Loans on Compound V3.

## Features

- **Gasless Transactions** - Users pay $0 in gas via ERC-4337 Paymaster
- **Email Authentication** - Login with email via Privy (no MetaMask needed)
- **Smart Account** - Each user gets an ERC-4337 MultiOwnerModularAccount
- **Session Keys** - Backend signs transactions on behalf of users
- **Compound V3 Integration** - Supply WBTC collateral, borrow USDC or WETH
- **Cross-Comet Position Switching** - Switch between USDC and WETH Comets atomically via flash loans

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         USER FLOW                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   Email Login (Privy)                                           │
│        ↓                                                        │
│   Privy EOA Wallet (embedded)                                   │
│        ↓                                                        │
│   Smart Account (MultiOwnerModularAccount)                      │
│        ↓                                                        │
│   Session Key Plugin (backend can sign)                         │
│        ↓                                                        │
│   Gasless DeFi Operations                                       │
│        • Supply WBTC to Compound V3                             │
│        • Borrow USDC or WETH                                    │
│        • Switch positions via flash loans                       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Key Components

| Component | Description |
|-----------|-------------|
| **Privy EOA** | User's embedded wallet (email-based login) |
| **Smart Account** | ERC-4337 contract (MultiOwnerModularAccount) holding user funds |
| **Session Key** | Backend key with limited permissions for gasless execution |
| **Paymaster** | Sponsors gas fees for all user operations |
| **Switcher** | Flash loan contract for atomic position switching |

## Tech Stack

| Layer | Technologies |
|-------|--------------|
| **Smart Contracts** | Solidity, Foundry, Uniswap V3 Flash Loans |
| **Backend** | Node.js, Express, MongoDB, Alchemy AA SDK |
| **Frontend** | React, Vite, Privy React SDK |
| **Infrastructure** | Tenderly Virtual TestNet (Mainnet Fork) |

---

## Quick Start

### Prerequisites

1. **Node.js v18+**
2. **MongoDB** (local or Atlas)
3. **Tenderly Account** - [Create Virtual TestNet](https://dashboard.tenderly.co/)
4. **Privy Account** - [Get App ID](https://dashboard.privy.io/)
5. **Alchemy Account** - [Get API Key](https://dashboard.alchemy.com/)

### 1. Clone & Install

```bash
# Install dependencies
cd backend && npm install
cd ../frontend && npm install
cd ../contracts && forge install
```

### 2. Create Tenderly Virtual TestNet

1. Go to [Tenderly Dashboard](https://dashboard.tenderly.co/)
2. Create a new **Virtual TestNet** forked from **Ethereum Mainnet**
3. Copy the RPC URL (e.g., `https://virtual.mainnet.rpc.tenderly.co/xxxx-xxxx`)
4. Note the Fork ID from the URL

### 3. Configure Environment

**Backend** (`backend/.env`):
```bash
# Server
PORT=3001
NODE_ENV=development

# MongoDB
MONGODB_URI=mongodb://localhost:27017/defi-borrowing-app

# Privy
PRIVY_APP_ID=your_privy_app_id
PRIVY_APP_SECRET=your_privy_app_secret

# Alchemy
ALCHEMY_API_KEY=your_alchemy_api_key
ALCHEMY_GAS_POLICY_ID=your_gas_policy_id

# Tenderly Virtual TestNet
CHAIN_ID=1
RPC_URL=https://virtual.mainnet.rpc.tenderly.co/YOUR_FORK_ID

# Will be set by setup script
PAYMASTER_ADDRESS=
SWITCHER_ADDRESS=
```

**Frontend** (`frontend/.env`):
```bash
VITE_PRIVY_APP_ID=your_privy_app_id
VITE_API_URL=http://localhost:3001/api
VITE_RPC_URL=https://virtual.mainnet.rpc.tenderly.co/YOUR_FORK_ID
VITE_TENDERLY_FORK_ID=YOUR_FORK_ID
```

### 4. Deploy Contracts to Tenderly Fork

```bash
cd backend
npm run setup-fork
```

This script:
- Deploys `SimplePaymasterV06` (gas sponsorship)
- Deploys `CompoundV3CrossCometSwitcher` (position switching)
- Funds paymaster with 10 ETH on EntryPoint
- Updates `.env` with deployed addresses

### 5. Start Development Servers

```bash
# Terminal 1 - Backend
cd backend
npm run dev

# Terminal 2 - Frontend
cd frontend
npm run dev
```

Open http://localhost:5173

---

## User Flow (Step by Step)

### Step 1: Login with Email

1. Click **"Login"** on the landing page
2. Enter your email address
3. Complete Privy verification (OTP or magic link)
4. Backend automatically:
   - Creates user in MongoDB
   - Stores Privy wallet address

### Step 2: Activate Smart Account

1. Click **"Activate Account"** button
2. Backend deploys your Smart Account (MultiOwnerModularAccount)
3. Session Key Plugin is installed with backend as authorized signer
4. You now have a gasless-enabled smart wallet

### Step 3: Get Test Tokens

1. Click **"Get Test Tokens"** button
2. Tenderly funds your EOA with:
   - 10 ETH
   - 1 WBTC
   - 10,000 USDC

### Step 4: Transfer to Smart Account

1. Click **"Approve"** for WBTC
2. Your EOA approves and transfers WBTC to your Smart Account
3. Smart Account now holds collateral

### Step 5: Supply Collateral & Borrow

1. Go to **"Supply & Borrow"** tab
2. Select:
   - **Comet**: USDC Comet or WETH Comet
   - **Collateral**: WBTC
   - **Amount**: e.g., 0.01 WBTC
3. Click **"Supply"**
4. After supply, click **"Borrow"**:
   - **Asset**: USDC (if USDC Comet) or WETH (if WETH Comet)
   - **Amount**: e.g., 200 USDC
5. Transactions execute **gaslessly** via session key!

### Step 6: Switch Position Between Comets

1. Go to **"Switch Position"** tab
2. Current position shows your active Comet (e.g., USDC Comet with 200 USDC debt)
3. Click **"Switch to WETH Comet"** (or vice versa)
4. The switcher contract atomically:
   - Takes flash loan to repay debt on source Comet
   - Withdraws collateral from source Comet
   - Supplies collateral to target Comet
   - Borrows equivalent amount on target Comet
   - Swaps tokens and repays flash loan
5. View transaction in **Tenderly Explorer** (link provided)

### Step 7: View Transaction History

The **Transaction History** section shows all your DeFi operations with:
- Transaction type (Supply, Borrow, Switch)
- Amount and asset
- Timestamp
- Link to Tenderly Explorer

---

## API Endpoints

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/login` | Login/register with Privy |
| GET | `/api/auth/profile` | Get user profile |

### Account Management
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/account/activate` | Deploy smart account + session key |
| GET | `/api/account/status` | Get smart account status |
| GET | `/api/account/balances` | Get token balances |
| POST | `/api/account/fund` | Fund EOA with test tokens (Tenderly) |
| POST | `/api/account/approve` | Approve smart account to spend tokens |
| POST | `/api/account/pull` | Transfer tokens from EOA to smart account |

### DeFi Operations
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/defi/position` | Get current Compound V3 position |
| GET | `/api/defi/markets` | Compare USDC vs WETH Comet rates |
| POST | `/api/defi/supply` | Supply collateral to Comet |
| POST | `/api/defi/borrow` | Borrow from Comet |
| POST | `/api/defi/repay` | Repay borrowed amount |
| POST | `/api/defi/withdraw` | Withdraw collateral |
| POST | `/api/defi/switch` | Switch position between Comets |
| GET | `/api/defi/transactions` | Get transaction history |

---

## Contract Addresses (Mainnet)

### Compound V3
| Contract | Address |
|----------|---------|
| USDC Comet | `0xc3d688B66703497DAA19211EEdff47f25384cdc3` |
| WETH Comet | `0xA17581A9E3356d9A858b789D68B4d866e593aE94` |

### Tokens
| Token | Address |
|-------|---------|
| WBTC | `0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599` |
| USDC | `0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48` |
| WETH | `0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2` |

### Uniswap V3 Pools
| Pool | Address | Fee |
|------|---------|-----|
| Flash Pool | `0x88e6A0c2dDD26FEEb64F039a2c41296FcB3f5640` | 0.05% |
| Swap Pool | `0x7BeA39867e4169DBe237d55C8242a8f2fcDcc387` | 1% |

### ERC-4337 Infrastructure
| Contract | Address |
|----------|---------|
| EntryPoint v0.6.0 | `0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789` |
| Session Key Plugin | `0x0000003E0000a96de4058e1E02a62FaaeCf23d8d` |
| Multi Owner Plugin | `0xcE0000007B008F50d762D155002600004cD6c647` |

---

## Project Structure

```
defi-borrowing-app/
├── backend/
│   ├── src/
│   │   ├── controllers/
│   │   │   ├── authController.js      # Privy auth
│   │   │   ├── accountController.js   # Smart account management
│   │   │   └── defiController.js      # DeFi operations
│   │   ├── services/
│   │   │   ├── alchemySmartAccount.service.js  # ERC-4337
│   │   │   ├── alchemyPosition.service.js      # Position queries
│   │   │   ├── compound.js            # Compound V3 integration
│   │   │   └── erc4337.service.js     # UserOp execution
│   │   ├── models/
│   │   │   ├── User.js                # User schema
│   │   │   ├── Position.js            # DeFi positions
│   │   │   └── Transaction.js         # Tx history
│   │   └── routes/
│   ├── setup-tenderly-fork.js         # Deploy contracts to fork
│   └── test-session-key-defi.js       # E2E test
│
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Landing.jsx            # Home page
│   │   │   └── Dashboard.jsx          # Main dashboard
│   │   ├── context/
│   │   │   └── AuthContext.jsx        # Auth state
│   │   ├── services/
│   │   │   └── api.js                 # API client
│   │   └── config/
│   │       └── constants.js           # Contract addresses
│   └── index.html
│
└── contracts/
    ├── src/
    │   ├── CompoundV3CrossCometSwitcher.sol  # Flash loan switcher
    │   └── SimplePaymasterV06.sol            # Gas sponsorship
    ├── test/foundry/
    │   └── MainnetCrossCometE2E.t.sol        # E2E test
    └── scripts/
        ├── start-mainnet-fork.sh             # Start local Anvil fork
        └── test-mainnet-fork.sh              # Run fork tests
```

---

## How Position Switching Works

The `CompoundV3CrossCometSwitcher` performs an atomic cross-Comet switch:

```
1. User calls switchCollateral(USDC_Comet → WETH_Comet)

2. Flash loan USDC from Uniswap (0.05% pool)

3. Repay user's USDC debt on USDC Comet

4. Withdraw WBTC collateral from USDC Comet

5. Supply WBTC to WETH Comet

6. Borrow WETH from WETH Comet

7. Swap WETH → USDC on Uniswap (1% pool)

8. Repay flash loan + fee

9. User now has position on WETH Comet!
```

**Key Design Decisions:**
- Uses **different pools** for flash loan vs swap (avoids reentrancy)
- Uses **WBTC** as collateral (accepted by both Comets)
- Calculates borrow amount dynamically based on current ETH/USDC price

---

## Running Tests

### Backend E2E Test
```bash
cd backend
npm run test:e2e
```

### Contract Tests (Local Fork)
```bash
# Terminal 1: Start Anvil fork
cd contracts/scripts
./start-mainnet-fork.sh

# Terminal 2: Run tests
./test-mainnet-fork.sh
```

---

## Troubleshooting

### "Privy wallet not available"
- Ensure embedded wallets are enabled in Privy dashboard
- Check `PRIVY_APP_ID` matches in frontend and backend

### "Session key not granted"
- Click "Activate Account" to install session key plugin
- Check backend logs for errors

### "Insufficient balance"
- Use "Get Test Tokens" button (Tenderly only)
- Ensure tokens are in Smart Account, not EOA

### "Switch failed"
- Ensure you have an active position (collateral + debt)
- Check Tenderly explorer for detailed error

---

## Security Considerations

- **Session Keys** have limited permissions (only DeFi operations)
- **Session Keys** expire after 7 days
- **Private Keys** are never exposed to frontend
- **Paymaster** only sponsors known contract calls

**Production Deployment:**
- Use proper key management (AWS KMS, HashiCorp Vault)
- Implement rate limiting
- Add transaction amount limits
- Security audit before mainnet

---

## License

MIT

---

## Resources

- [Alchemy Account Kit](https://accountkit.alchemy.com/)
- [ERC-4337 Specification](https://eips.ethereum.org/EIPS/eip-4337)
- [Privy Documentation](https://docs.privy.io/)
- [Compound V3 Docs](https://docs.compound.finance/)
- [Tenderly Virtual TestNets](https://docs.tenderly.co/virtual-testnets)
