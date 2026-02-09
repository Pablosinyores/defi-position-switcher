import './Header.css'

function Header({ userData, onLogout }) {
  if (!userData) return null

  const formatAddress = (address) => {
    if (!address) return 'Not available'
    return `${address.slice(0, 6)}...${address.slice(-4)}`
  }

  return (
    <header className="header">
      <div className="header-content">
        <h1>DeFi Borrowing</h1>

        <div className="header-right">
          <div className="wallet-info">
            <div className="wallet-label">Smart Wallet</div>
            <div className="wallet-address">
              {formatAddress(userData?.smartWalletAddress || userData?.smartAccountAddress || '')}
            </div>
          </div>

          <div className="user-email">{userData?.email || ''}</div>

          <button className="logout-button" onClick={onLogout}>
            Logout
          </button>
        </div>
      </div>
    </header>
  )
}

export default Header
