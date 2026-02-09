import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { defiAPI, accountAPI } from '../services/api'
import { toast } from 'react-toastify'
import { formatAddress, formatAmount, COMETS, TENDERLY_EXPLORER } from '../config/constants'
import './Dashboard.css'

function Dashboard() {
  const {
    logout,
    backendUser,
    smartAccountAddress,
    walletAddress,
    hasSessionKey,
    isAccountActive,
    activateAccount,
    loading: authLoading,
    email
  } = useAuth()

  const [positions, setPositions] = useState(null)
  const [balances, setBalances] = useState(null)
  const [eoaBalances, setEoaBalances] = useState(null)
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(true)
  const [switching, setSwitching] = useState(false)
  const [activeTab, setActiveTab] = useState('overview')

  // DeFi action states
  const [actionLoading, setActionLoading] = useState(false)
  const [fundingLoading, setFundingLoading] = useState(false)
  const [transferLoading, setTransferLoading] = useState(false)
  const [selectedComet, setSelectedComet] = useState('USDC')
  const [supplyAmount, setSupplyAmount] = useState('')
  const [borrowAmount, setBorrowAmount] = useState('')
  const [transferAmount, setTransferAmount] = useState('')

  useEffect(() => {
    if (backendUser && smartAccountAddress) {
      loadData()
    } else {
      setLoading(false)
    }
  }, [backendUser, smartAccountAddress])

  const loadData = async () => {
    try {
      setLoading(true)

      const [posRes, balRes, eoaBalRes, txRes] = await Promise.all([
        defiAPI.getPosition().catch(() => ({ data: { success: false } })),
        accountAPI.getBalances().catch(() => ({ data: { success: false } })),
        accountAPI.getEOABalances().catch(() => ({ data: { success: false } })),
        defiAPI.getTransactions(10).catch(() => ({ data: { success: false } }))
      ])

      if (posRes.data.success && posRes.data.data?.positions) {
        const backendPos = posRes.data.data.positions
        setPositions({
          usdcComet: backendPos.USDC ? {
            collateral: backendPos.USDC.collateral?.balance,
            debt: backendPos.USDC.borrowed?.balance,
            healthFactor: 'N/A'
          } : null,
          wethComet: backendPos.WETH ? {
            collateral: backendPos.WETH.collateral?.balance,
            debt: backendPos.WETH.borrowed?.balance,
            healthFactor: 'N/A'
          } : null
        })
      }
      if (balRes.data.success) {
        setBalances(balRes.data.data)
      }
      if (eoaBalRes.data.success) {
        setEoaBalances(eoaBalRes.data.data)
      }
      if (txRes.data.success) {
        setTransactions(txRes.data.data.transactions || [])
      }
    } catch (error) {
      console.error('Failed to load data:', error)
    } finally {
      setLoading(false)
    }
  }

  // Fund EOA with test tokens via Tenderly
  const handleFundEOA = async () => {
    if (fundingLoading) return

    try {
      setFundingLoading(true)
      toast.info('Funding your EOA with test tokens...')

      const response = await accountAPI.fundEOA(['WBTC', 'USDC', 'WETH'])

      if (response.data.success) {
        toast.success('EOA funded with test tokens!')
        setEoaBalances(response.data.data.balances)
      }
    } catch (error) {
      console.error('Fund failed:', error)
      toast.error(error.response?.data?.error || 'Failed to fund EOA')
    } finally {
      setFundingLoading(false)
    }
  }

  // Approve smart account to spend EOA tokens
  const [approving, setApproving] = useState(false)
  const [isApproved, setIsApproved] = useState(false)

  const handleApprove = async () => {
    if (approving) return

    try {
      setApproving(true)
      toast.info('Approving smart account to spend your tokens...')

      const response = await accountAPI.approveSmartAccount(['WBTC', 'USDC'])

      if (response.data.success) {
        toast.success('Approval successful! You can now pull tokens to smart account.')
        setIsApproved(true)
      }
    } catch (error) {
      console.error('Approve failed:', error)
      toast.error(error.response?.data?.error || 'Failed to approve')
    } finally {
      setApproving(false)
    }
  }

  // Pull WBTC from EOA to Smart Account (gasless via session key!)
  const handlePullFromEOA = async () => {
    if (transferLoading || !transferAmount) return

    try {
      setTransferLoading(true)
      toast.info(`Pulling ${transferAmount} WBTC to Smart Account (gasless)...`)

      const response = await accountAPI.pullFromEOA('WBTC', transferAmount)

      if (response.data.success) {
        toast.success('Pull successful!')
        setTransferAmount('')
        setBalances(prev => ({ ...prev, ...response.data.data.smartAccountBalances }))
        setEoaBalances(response.data.data.eoaBalances)
      }
    } catch (error) {
      console.error('Pull failed:', error)
      toast.error(error.response?.data?.error || 'Pull failed')
    } finally {
      setTransferLoading(false)
    }
  }

  const handleActivate = async () => {
    try {
      await activateAccount()
      await loadData()
    } catch (error) {
      // Error handled in context
    }
  }

  const handleSupply = async () => {
    if (!supplyAmount || actionLoading) return

    try {
      setActionLoading(true)
      toast.info(`Supplying ${supplyAmount} WBTC to ${selectedComet} Comet...`)

      const response = await defiAPI.supply(selectedComet, 'WBTC', supplyAmount)

      if (response.data.success) {
        toast.success('Supply successful!')
        setSupplyAmount('')
        await loadData()
      }
    } catch (error) {
      console.error('Supply failed:', error)
      toast.error(error.response?.data?.error || 'Supply failed')
    } finally {
      setActionLoading(false)
    }
  }

  const handleBorrow = async () => {
    if (!borrowAmount || actionLoading) return

    try {
      setActionLoading(true)
      const borrowToken = selectedComet === 'USDC' ? 'USDC' : 'WETH'
      toast.info(`Borrowing ${borrowAmount} ${borrowToken} from ${selectedComet} Comet...`)

      const response = await defiAPI.borrow(selectedComet, borrowToken, borrowAmount)

      if (response.data.success) {
        toast.success('Borrow successful!')
        setBorrowAmount('')
        await loadData()
      }
    } catch (error) {
      console.error('Borrow failed:', error)
      toast.error(error.response?.data?.error || 'Borrow failed')
    } finally {
      setActionLoading(false)
    }
  }

  const handleSwitch = async (fromComet, toComet) => {
    if (switching) return

    try {
      setSwitching(true)
      toast.info(`Switching position from ${fromComet} to ${toComet} Comet...`)

      const response = await defiAPI.switchPosition(fromComet, toComet, 'WBTC', null)

      if (response.data.success) {
        toast.success('Position switched successfully!')
        await loadData()
      }
    } catch (error) {
      console.error('Switch failed:', error)
      toast.error(error.response?.data?.error || 'Failed to switch position')
    } finally {
      setSwitching(false)
    }
  }

  if (authLoading || loading) {
    return (
      <div className="dashboard-loading">
        <div className="spinner"></div>
        <p>Loading...</p>
      </div>
    )
  }

  const hasUsdcPosition = positions?.usdcComet?.collateral && BigInt(positions.usdcComet.collateral) > 0n
  const hasWethPosition = positions?.wethComet?.collateral && BigInt(positions.wethComet.collateral) > 0n
  const hasAnyPosition = hasUsdcPosition || hasWethPosition

  return (
    <div className="dashboard">
      {/* Header */}
      <header className="dashboard-header">
        <div className="header-left">
          <h1>DeFi Position Switcher</h1>
          <span className="subtitle">Powered by ERC-4337 Account Abstraction</span>
        </div>
        <div className="header-right">
          <div className="user-info">
            <span className="user-email">{email}</span>
            <button className="btn-logout" onClick={logout}>Logout</button>
          </div>
        </div>
      </header>

      <div className="dashboard-content">
        {/* Wallet Cards */}
        <div className="wallet-section">
          <div className="wallet-card eoa-card">
            <div className="wallet-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                <circle cx="12" cy="7" r="4"/>
              </svg>
            </div>
            <div className="wallet-details">
              <span className="wallet-label">Privy EOA Wallet</span>
              <span className="wallet-address">{formatAddress(walletAddress)}</span>
            </div>
            <span className="wallet-badge eoa">Owner</span>
          </div>

          <div className="wallet-card smart-card">
            <div className="wallet-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
            </div>
            <div className="wallet-details">
              <span className="wallet-label">Smart Account (ERC-4337)</span>
              <span className="wallet-address">{formatAddress(smartAccountAddress)}</span>
            </div>
            <span className={`wallet-badge ${isAccountActive ? 'active' : 'inactive'}`}>
              {isAccountActive ? 'Active' : 'Not Deployed'}
            </span>
          </div>

          <div className="wallet-card session-card">
            <div className="wallet-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2L2 7l10 5 10-5-10-5z"/>
                <path d="M2 17l10 5 10-5"/>
                <path d="M2 12l10 5 10-5"/>
              </svg>
            </div>
            <div className="wallet-details">
              <span className="wallet-label">Session Key</span>
              <span className="wallet-status">{hasSessionKey ? 'Active (30 days)' : 'Not Installed'}</span>
            </div>
            <span className={`wallet-badge ${hasSessionKey ? 'active' : 'inactive'}`}>
              {hasSessionKey ? 'Gasless' : 'Setup Required'}
            </span>
          </div>
        </div>

        {/* Activation Banner */}
        {!isAccountActive && (
          <div className="activation-banner">
            <div className="banner-content">
              <h3>Activate Your Smart Account</h3>
              <p>Deploy your ERC-4337 smart account and install session key for gasless transactions</p>
            </div>
            <button className="btn-activate" onClick={handleActivate} disabled={authLoading}>
              {authLoading ? 'Activating...' : 'Activate Now'}
            </button>
          </div>
        )}

        {/* Main Content */}
        {isAccountActive && (
          <>
            {/* Balances Section */}
            <div className="balances-section">
              <div className="balances-header">
                <h2>Token Balances</h2>
                <button
                  className="btn-fund"
                  onClick={handleFundEOA}
                  disabled={fundingLoading}
                >
                  {fundingLoading ? 'Funding...' : 'Get Test Tokens'}
                </button>
              </div>

              {/* EOA Balances */}
              <div className="balance-group">
                <h3 className="balance-group-title">
                  <span className="badge eoa">EOA</span>
                  Privy Wallet
                </h3>
                <div className="balances-grid">
                  <div className="balance-card">
                    <span className="token-name">ETH</span>
                    <span className="token-balance">{formatAmount(eoaBalances?.eth || '0', 18)}</span>
                  </div>
                  <div className="balance-card highlight">
                    <span className="token-name">WBTC</span>
                    <span className="token-balance">{formatAmount(eoaBalances?.wbtc || '0', 8)}</span>
                  </div>
                  <div className="balance-card">
                    <span className="token-name">USDC</span>
                    <span className="token-balance">{formatAmount(eoaBalances?.usdc || '0', 6)}</span>
                  </div>
                </div>
              </div>

              {/* Transfer Section - Approve + Pull Flow */}
              <div className="transfer-section">
                <div className="transfer-flow">
                  {/* Step 1: Approve */}
                  <div className="transfer-step">
                    <span className="step-label">Step 1: Approve</span>
                    <button
                      className="btn-approve"
                      onClick={handleApprove}
                      disabled={approving || isApproved}
                    >
                      {approving ? 'Approving...' : isApproved ? 'Approved' : 'Approve Tokens'}
                    </button>
                  </div>

                  {/* Step 2: Pull */}
                  <div className="transfer-step">
                    <span className="step-label">Step 2: Pull (Gasless)</span>
                    <div className="transfer-input">
                      <input
                        type="number"
                        placeholder="Amount WBTC"
                        value={transferAmount}
                        onChange={(e) => setTransferAmount(e.target.value)}
                        disabled={transferLoading}
                      />
                      <button
                        className="btn-transfer"
                        onClick={handlePullFromEOA}
                        disabled={transferLoading || !transferAmount}
                      >
                        {transferLoading ? 'Pulling...' : 'Pull to Smart Account'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Smart Account Balances */}
              <div className="balance-group">
                <h3 className="balance-group-title">
                  <span className="badge smart">4337</span>
                  Smart Account
                </h3>
                <div className="balances-grid">
                  <div className="balance-card">
                    <span className="token-name">ETH</span>
                    <span className="token-balance">{formatAmount(balances?.eth || '0', 18)}</span>
                  </div>
                  <div className="balance-card highlight">
                    <span className="token-name">WBTC</span>
                    <span className="token-balance">{formatAmount(balances?.wbtc || '0', 8)}</span>
                  </div>
                  <div className="balance-card">
                    <span className="token-name">USDC</span>
                    <span className="token-balance">{formatAmount(balances?.usdc || '0', 6)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Tabs */}
            <div className="tabs-container">
              <div className="tabs">
                <button
                  className={activeTab === 'overview' ? 'active' : ''}
                  onClick={() => setActiveTab('overview')}
                >
                  Positions
                </button>
                <button
                  className={activeTab === 'defi' ? 'active' : ''}
                  onClick={() => setActiveTab('defi')}
                >
                  Supply & Borrow
                </button>
                <button
                  className={activeTab === 'switch' ? 'active' : ''}
                  onClick={() => setActiveTab('switch')}
                >
                  Switch Position
                </button>
              </div>
            </div>

            {/* Tab Content */}
            <div className="tab-content">
              {activeTab === 'overview' && (
                <PositionsView positions={positions} onRefresh={loadData} />
              )}

              {activeTab === 'defi' && (
                <DefiActionsView
                  selectedComet={selectedComet}
                  setSelectedComet={setSelectedComet}
                  supplyAmount={supplyAmount}
                  setSupplyAmount={setSupplyAmount}
                  borrowAmount={borrowAmount}
                  setBorrowAmount={setBorrowAmount}
                  onSupply={handleSupply}
                  onBorrow={handleBorrow}
                  actionLoading={actionLoading}
                  balances={balances}
                />
              )}

              {activeTab === 'switch' && (
                <SwitchView
                  positions={positions}
                  hasUsdcPosition={hasUsdcPosition}
                  hasWethPosition={hasWethPosition}
                  switching={switching}
                  onSwitch={handleSwitch}
                />
              )}
            </div>

            {/* Transaction History - Always visible as 4th section */}
            <TransactionHistoryView
              transactions={transactions}
              onRefresh={loadData}
            />
          </>
        )}
      </div>
    </div>
  )
}

// Positions View Component
function PositionsView({ positions, onRefresh }) {
  return (
    <div className="positions-section">
      <div className="section-header">
        <h3>Your Compound V3 Positions</h3>
        <button className="btn-refresh" onClick={onRefresh}>Refresh</button>
      </div>

      <div className="positions-grid">
        {/* USDC Comet */}
        <div className="position-card">
          <div className="position-header">
            <div className="comet-info">
              <span className="comet-icon usdc">$</span>
              <div>
                <h4>USDC Comet</h4>
                <span className="comet-address">{formatAddress(COMETS.USDC.address)}</span>
              </div>
            </div>
          </div>
          <div className="position-body">
            <div className="position-stat">
              <span className="stat-label">Collateral (WBTC)</span>
              <span className="stat-value">
                {positions?.usdcComet?.collateral
                  ? formatAmount(positions.usdcComet.collateral, 8)
                  : '0'}
              </span>
            </div>
            <div className="position-stat">
              <span className="stat-label">Borrowed (USDC)</span>
              <span className="stat-value debt">
                {positions?.usdcComet?.debt
                  ? formatAmount(positions.usdcComet.debt, 6)
                  : '0'}
              </span>
            </div>
          </div>
        </div>

        {/* WETH Comet */}
        <div className="position-card">
          <div className="position-header">
            <div className="comet-info">
              <span className="comet-icon weth">E</span>
              <div>
                <h4>WETH Comet</h4>
                <span className="comet-address">{formatAddress(COMETS.WETH.address)}</span>
              </div>
            </div>
          </div>
          <div className="position-body">
            <div className="position-stat">
              <span className="stat-label">Collateral (WBTC)</span>
              <span className="stat-value">
                {positions?.wethComet?.collateral
                  ? formatAmount(positions.wethComet.collateral, 8)
                  : '0'}
              </span>
            </div>
            <div className="position-stat">
              <span className="stat-label">Borrowed (WETH)</span>
              <span className="stat-value debt">
                {positions?.wethComet?.debt
                  ? formatAmount(positions.wethComet.debt, 18)
                  : '0'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// DeFi Actions View
function DefiActionsView({
  selectedComet,
  setSelectedComet,
  supplyAmount,
  setSupplyAmount,
  borrowAmount,
  setBorrowAmount,
  onSupply,
  onBorrow,
  actionLoading,
  balances
}) {
  return (
    <div className="defi-actions-section">
      <div className="comet-selector">
        <h3>Select Comet Pool</h3>
        <div className="selector-buttons">
          <button
            className={selectedComet === 'USDC' ? 'active' : ''}
            onClick={() => setSelectedComet('USDC')}
          >
            <span className="comet-icon usdc">$</span>
            USDC Comet
          </button>
          <button
            className={selectedComet === 'WETH' ? 'active' : ''}
            onClick={() => setSelectedComet('WETH')}
          >
            <span className="comet-icon weth">E</span>
            WETH Comet
          </button>
        </div>
      </div>

      <div className="actions-grid">
        {/* Supply Card */}
        <div className="action-card">
          <h4>Supply Collateral</h4>
          <p className="action-desc">Supply WBTC as collateral to borrow against</p>

          <div className="input-group">
            <label>Amount (WBTC)</label>
            <div className="input-with-max">
              <input
                type="number"
                placeholder="0.00"
                value={supplyAmount}
                onChange={(e) => setSupplyAmount(e.target.value)}
                disabled={actionLoading}
              />
              <button
                className="btn-max"
                onClick={() => setSupplyAmount(formatAmount(balances?.wbtc || '0', 8))}
              >
                MAX
              </button>
            </div>
            <span className="balance-hint">
              Balance: {formatAmount(balances?.wbtc || '0', 8)} WBTC
            </span>
          </div>

          <button
            className="btn-action supply"
            onClick={onSupply}
            disabled={actionLoading || !supplyAmount}
          >
            {actionLoading ? 'Processing...' : 'Supply WBTC'}
          </button>
        </div>

        {/* Borrow Card */}
        <div className="action-card">
          <h4>Borrow {selectedComet === 'USDC' ? 'USDC' : 'WETH'}</h4>
          <p className="action-desc">Borrow against your collateral (gasless!)</p>

          <div className="input-group">
            <label>Amount ({selectedComet === 'USDC' ? 'USDC' : 'WETH'})</label>
            <div className="input-with-max">
              <input
                type="number"
                placeholder="0.00"
                value={borrowAmount}
                onChange={(e) => setBorrowAmount(e.target.value)}
                disabled={actionLoading}
              />
            </div>
            <span className="balance-hint">
              Borrow up to 80% of your collateral value
            </span>
          </div>

          <button
            className="btn-action borrow"
            onClick={onBorrow}
            disabled={actionLoading || !borrowAmount}
          >
            {actionLoading ? 'Processing...' : `Borrow ${selectedComet === 'USDC' ? 'USDC' : 'WETH'}`}
          </button>
        </div>
      </div>

      <div className="gasless-notice">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
        </svg>
        <span>All transactions are gasless - sponsored by Paymaster</span>
      </div>
    </div>
  )
}

// Transaction History View Component
function TransactionHistoryView({ transactions, onRefresh }) {
  const formatDate = (dateString) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const getTypeIcon = (type) => {
    switch (type) {
      case 'SUPPLY': return '📥'
      case 'BORROW': return '💵'
      case 'REPAY': return '💰'
      case 'WITHDRAW': return '📤'
      case 'SWITCH':
      case 'SWITCH_PROTOCOL': return '🔄'
      case 'SWAP': return '↔️'
      default: return '📋'
    }
  }

  const getStatusClass = (status) => {
    switch (status) {
      case 'SUCCESS': return 'status-success'
      case 'FAILED': return 'status-failed'
      case 'PENDING': return 'status-pending'
      default: return ''
    }
  }

  return (
    <div className="transaction-history-section">
      <div className="section-header">
        <h3>Transaction History</h3>
        <button className="btn-refresh" onClick={onRefresh}>Refresh</button>
      </div>

      {transactions.length === 0 ? (
        <div className="no-transactions">
          <span className="empty-icon">📝</span>
          <p>No transactions yet</p>
          <p className="hint">Your DeFi transactions will appear here</p>
        </div>
      ) : (
        <div className="transactions-list">
          {transactions.map((tx) => (
            <div key={tx._id || tx.txHash} className="transaction-item">
              <div className="tx-icon">{getTypeIcon(tx.type)}</div>
              <div className="tx-details">
                <div className="tx-type">
                  {tx.type.replace(/_/g, ' ')}
                  {tx.protocol && <span className="tx-protocol">{tx.protocol}</span>}
                </div>
                <div className="tx-meta">
                  <span className="tx-date">{formatDate(tx.createdAt)}</span>
                  {tx.amount && tx.asset && (
                    <span className="tx-amount">
                      {parseFloat(tx.amount).toLocaleString('en-US', { maximumFractionDigits: 6 })} {tx.asset}
                    </span>
                  )}
                </div>
              </div>
              <div className="tx-status-actions">
                <span className={`tx-status ${getStatusClass(tx.status)}`}>
                  {tx.status}
                </span>
                <a
                  href={TENDERLY_EXPLORER.getTxUrl(tx.txHash)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="tx-explorer-link"
                  title="View on Tenderly Explorer"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                    <polyline points="15 3 21 3 21 9" />
                    <line x1="10" y1="14" x2="21" y2="3" />
                  </svg>
                </a>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// Switch View Component
function SwitchView({ positions, hasUsdcPosition, hasWethPosition, switching, onSwitch }) {
  return (
    <div className="switch-section">
      <div className="switch-header">
        <h3>Cross-Comet Position Switch</h3>
        <p>Atomically move your entire position between Compound V3 Comets using flash loans</p>
      </div>

      <div className="switch-explainer">
        <div className="step">
          <span className="step-num">1</span>
          <span>Flash loan repays your debt</span>
        </div>
        <div className="step-arrow">&#8594;</div>
        <div className="step">
          <span className="step-num">2</span>
          <span>Withdraw collateral</span>
        </div>
        <div className="step-arrow">&#8594;</div>
        <div className="step">
          <span className="step-num">3</span>
          <span>Supply to new Comet</span>
        </div>
        <div className="step-arrow">&#8594;</div>
        <div className="step">
          <span className="step-num">4</span>
          <span>Borrow to repay flash loan</span>
        </div>
      </div>

      {hasUsdcPosition || hasWethPosition ? (
        <div className="switch-options">
          {hasUsdcPosition && (
            <div className="switch-card">
              <div className="switch-from">
                <span className="comet-icon usdc">$</span>
                <div>
                  <h4>USDC Comet</h4>
                  <p>{formatAmount(positions?.usdcComet?.collateral || '0', 8)} WBTC collateral</p>
                  <p>{formatAmount(positions?.usdcComet?.debt || '0', 6)} USDC debt</p>
                </div>
              </div>
              <div className="switch-arrow">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M5 12h14M12 5l7 7-7 7"/>
                </svg>
              </div>
              <div className="switch-to">
                <span className="comet-icon weth">E</span>
                <div>
                  <h4>WETH Comet</h4>
                  <p>Same WBTC collateral</p>
                  <p>Equivalent WETH debt</p>
                </div>
              </div>
              <button
                className="btn-switch"
                onClick={() => onSwitch('USDC', 'WETH')}
                disabled={switching}
              >
                {switching ? 'Switching...' : 'Switch to WETH'}
              </button>
            </div>
          )}

          {hasWethPosition && (
            <div className="switch-card">
              <div className="switch-from">
                <span className="comet-icon weth">E</span>
                <div>
                  <h4>WETH Comet</h4>
                  <p>{formatAmount(positions?.wethComet?.collateral || '0', 8)} WBTC collateral</p>
                  <p>{formatAmount(positions?.wethComet?.debt || '0', 18)} WETH debt</p>
                </div>
              </div>
              <div className="switch-arrow">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M5 12h14M12 5l7 7-7 7"/>
                </svg>
              </div>
              <div className="switch-to">
                <span className="comet-icon usdc">$</span>
                <div>
                  <h4>USDC Comet</h4>
                  <p>Same WBTC collateral</p>
                  <p>Equivalent USDC debt</p>
                </div>
              </div>
              <button
                className="btn-switch"
                onClick={() => onSwitch('WETH', 'USDC')}
                disabled={switching}
              >
                {switching ? 'Switching...' : 'Switch to USDC'}
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="no-position-notice">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/>
            <path d="M12 8v4M12 16h.01"/>
          </svg>
          <h4>No Active Position</h4>
          <p>Supply collateral and borrow from a Comet pool first to enable position switching</p>
        </div>
      )}
    </div>
  )
}

export default Dashboard
