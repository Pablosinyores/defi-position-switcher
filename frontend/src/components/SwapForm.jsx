import { useState } from 'react'
import { ethers } from 'ethers'
import './SwapForm.css'

const TOKENS = {
  USDT: '0xaA8E23Fb1079EA71e0a56F48a2aA51851D8433D0',
  XAUT: '0x...' // Replace with actual XAUT address
}

function SwapForm({ onSwap }) {
  const [fromToken, setFromToken] = useState('USDT')
  const [amount, setAmount] = useState('')
  const [loading, setLoading] = useState(false)

  const toToken = fromToken === 'USDT' ? 'XAUT' : 'USDT'

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (!amount) {
      alert('Please enter amount')
      return
    }

    setLoading(true)
    try {
      await onSwap({
        fromToken: TOKENS[fromToken],
        toToken: TOKENS[toToken],
        amount: ethers.parseUnits(amount, 6)
      })
      setAmount('')
    } finally {
      setLoading(false)
    }
  }

  const estimateOutput = () => {
    if (!amount) return '0'
    const input = parseFloat(amount)

    if (fromToken === 'USDT') {
      // USDT -> XAUT (assuming XAUT = $2000)
      return (input / 2000).toFixed(6)
    } else {
      // XAUT -> USDT
      return (input * 2000).toFixed(2)
    }
  }

  return (
    <div className="swap-form-card">
      <h2>Swap Tokens</h2>

      <form onSubmit={handleSubmit}>
        <div className="swap-container">
          <div className="form-group">
            <label>From</label>
            <div className="input-with-token">
              <input
                type="number"
                step="0.000001"
                placeholder="0.0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              <select
                value={fromToken}
                onChange={(e) => setFromToken(e.target.value)}
              >
                <option value="USDT">USDT</option>
                <option value="XAUT">XAUT</option>
              </select>
            </div>
          </div>

          <div className="swap-arrow">↓</div>

          <div className="form-group">
            <label>To (estimated)</label>
            <div className="output-display">
              <span>{estimateOutput()}</span>
              <span className="token-symbol">{toToken}</span>
            </div>
          </div>
        </div>

        <button type="submit" disabled={loading} className="submit-button">
          {loading ? 'Swapping...' : 'Swap'}
        </button>
      </form>

      <div className="info-box">
        <p>⚡ Gasless transaction via Uniswap V3</p>
        <p>🔄 0.3% pool fee + 0.5% slippage protection</p>
      </div>
    </div>
  )
}

export default SwapForm
