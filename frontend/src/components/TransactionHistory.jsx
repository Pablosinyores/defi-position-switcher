import './TransactionHistory.css'

function TransactionHistory({ transactions }) {
  if (!transactions || transactions.length === 0) {
    return (
      <div className="transaction-history-card">
        <h2>Transaction History</h2>
        <p className="empty-state">No transactions yet</p>
      </div>
    )
  }

  const formatAddress = (address) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`
  }

  const formatDate = (date) => {
    return new Date(date).toLocaleString()
  }

  const getTypeLabel = (type) => {
    return type.replace('_', ' ')
  }

  const getStatusColor = (status) => {
    switch (status) {
      case 'SUCCESS':
        return '#10b981'
      case 'PENDING':
        return '#f59e0b'
      case 'FAILED':
        return '#ef4444'
      default:
        return '#6b7280'
    }
  }

  return (
    <div className="transaction-history-card">
      <h2>Transaction History</h2>

      <div className="transactions-list">
        {transactions.map((tx) => (
          <div key={tx._id} className="transaction-item">
            <div className="tx-header">
              <span className="tx-type">{getTypeLabel(tx.type)}</span>
              <span
                className="tx-status"
                style={{ color: getStatusColor(tx.status) }}
              >
                {tx.status}
              </span>
            </div>

            <div className="tx-details">
              {tx.fromAsset && (
                <div>
                  From: {tx.fromAsset.symbol} {tx.fromAsset.amount}
                </div>
              )}
              {tx.toAsset && (
                <div>
                  To: {tx.toAsset.symbol} {tx.toAsset.amount}
                </div>
              )}
              {tx.protocol && <div>Protocol: {tx.protocol}</div>}
            </div>

            <div className="tx-footer">
              <a
                href={`https://sepolia.etherscan.io/tx/${tx.txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="tx-hash"
              >
                {formatAddress(tx.txHash)} ↗
              </a>
              <span className="tx-date">{formatDate(tx.createdAt)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default TransactionHistory
