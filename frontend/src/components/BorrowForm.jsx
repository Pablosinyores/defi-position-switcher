import { useState } from 'react'
import { ethers } from 'ethers'
import './BorrowForm.css'

const TOKENS = {
  USDT: '0xaA8E23Fb1079EA71e0a56F48a2aA51851D8433D0',
  XAUT: '0x...' // Replace with actual XAUT address
}

function BorrowForm({ onBorrow, markets }) {
  const [protocol, setProtocol] = useState('AAVE')
  const [collateralAmount, setCollateralAmount] = useState('')
  const [borrowAmount, setBorrowAmount] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (!collateralAmount || !borrowAmount) {
      alert('Please enter all amounts')
      return
    }

    setLoading(true)
    try {
      await onBorrow({
        protocol,
        collateralAsset: TOKENS.XAUT,
        collateralAmount: ethers.parseUnits(collateralAmount, 6),
        borrowAsset: TOKENS.USDT,
        borrowAmount: ethers.parseUnits(borrowAmount, 6)
      })
      setCollateralAmount('')
      setBorrowAmount('')
    } finally {
      setLoading(false)
    }
  }

  const calculateMaxBorrow = () => {
    if (!collateralAmount) return '0'
    // Assuming XAUT = $2000, LTV = 80%
    const collateral = parseFloat(collateralAmount)
    const maxBorrow = collateral * 2000 * 0.8
    return maxBorrow.toFixed(2)
  }

  return (
    <div className="borrow-form-card">
      <h2>Borrow Against Collateral</h2>

      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label>Protocol</label>
          <select
            value={protocol}
            onChange={(e) => setProtocol(e.target.value)}
          >
            <option value="AAVE">
              Aave V3 {markets && `(${markets.aave.borrowAPR}%)`}
            </option>
            <option value="COMPOUND">
              Compound V3 {markets && `(${markets.compound.borrowAPR}%)`}
            </option>
          </select>
        </div>

        <div className="form-group">
          <label>Collateral Amount (XAUT)</label>
          <input
            type="number"
            step="0.000001"
            placeholder="0.0"
            value={collateralAmount}
            onChange={(e) => setCollateralAmount(e.target.value)}
          />
          <small>Supply XAUT as collateral</small>
        </div>

        <div className="form-group">
          <label>Borrow Amount (USDT)</label>
          <input
            type="number"
            step="0.01"
            placeholder="0.0"
            value={borrowAmount}
            onChange={(e) => setBorrowAmount(e.target.value)}
          />
          <small>Max: {calculateMaxBorrow()} USDT (80% LTV)</small>
        </div>

        <button type="submit" disabled={loading} className="submit-button">
          {loading ? 'Processing...' : 'Borrow'}
        </button>
      </form>

      <div className="info-box">
        <p>⚡ This transaction is gasless</p>
        <p>🔒 Your collateral is secured in the protocol</p>
      </div>
    </div>
  )
}

export default BorrowForm
