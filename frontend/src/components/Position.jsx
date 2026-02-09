import { useState } from 'react'
import './Position.css'

function Position({ position, onSwitch, loading }) {
  const [switching, setSwitching] = useState(false)

  if (loading) {
    return <div className="position-card">Loading position...</div>
  }

  if (!position) {
    return (
      <div className="position-card">
        <h2>No Active Position</h2>
        <p>Create a position by borrowing against collateral.</p>
      </div>
    )
  }

  const handleSwitch = async () => {
    const toProtocol = position.protocol === 'AAVE' ? 'COMPOUND' : 'AAVE'

    if (window.confirm(`Switch position to ${toProtocol}?`)) {
      setSwitching(true)
      try {
        await onSwitch(toProtocol)
      } finally {
        setSwitching(false)
      }
    }
  }

  const formatAmount = (amount, decimals) => {
    return (Number(amount) / Math.pow(10, decimals)).toFixed(6)
  }

  const healthFactorColor = (hf) => {
    const factor = parseFloat(hf)
    if (factor >= 2) return '#10b981'
    if (factor >= 1.5) return '#f59e0b'
    return '#ef4444'
  }

  return (
    <div className="position-card">
      <div className="position-header">
        <h2>Active Position</h2>
        <div className="protocol-badge">{position.protocol}</div>
      </div>

      <div className="position-stats">
        <div className="stat">
          <div className="stat-label">Collateral</div>
          <div className="stat-value">
            {formatAmount(position.collateral.amount, position.collateral.decimals)} {position.collateral.symbol}
          </div>
        </div>

        <div className="stat">
          <div className="stat-label">Debt</div>
          <div className="stat-value">
            {formatAmount(position.debt.amount, position.debt.decimals)} {position.debt.symbol}
          </div>
        </div>

        <div className="stat">
          <div className="stat-label">Health Factor</div>
          <div
            className="stat-value"
            style={{ color: healthFactorColor(position.healthFactor) }}
          >
            {parseFloat(position.healthFactor).toFixed(2)}
          </div>
        </div>

        <div className="stat">
          <div className="stat-label">Borrow APR</div>
          <div className="stat-value">{position.borrowAPR}%</div>
        </div>
      </div>

      <button
        className="switch-button"
        onClick={handleSwitch}
        disabled={switching}
      >
        {switching
          ? 'Switching...'
          : `Switch to ${position.protocol === 'AAVE' ? 'Compound' : 'Aave'}`}
      </button>

      <p className="switch-info">
        Protocol switching uses flash loans to move your position atomically.
        This operation is gasless.
      </p>
    </div>
  )
}

export default Position
