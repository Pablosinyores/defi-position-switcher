import './MarketComparison.css'

function MarketComparison({ markets }) {
  if (!markets) return null

  return (
    <div className="market-comparison">
      <h3>Market Rates</h3>
      <div className="markets">
        <div className="market-card">
          <div className="market-name">Aave V3</div>
          <div className="market-rates">
            <div className="rate">
              <span>Borrow APR:</span>
              <strong>{markets.aave.borrowAPR}%</strong>
            </div>
            <div className="rate">
              <span>Supply APR:</span>
              <strong>{markets.aave.supplyAPR}%</strong>
            </div>
          </div>
        </div>

        <div className="market-card">
          <div className="market-name">Compound V3</div>
          <div className="market-rates">
            <div className="rate">
              <span>Borrow APR:</span>
              <strong>{markets.compound.borrowAPR}%</strong>
            </div>
            <div className="rate">
              <span>Supply APR:</span>
              <strong>{markets.compound.supplyAPR}%</strong>
            </div>
            <div className="rate">
              <span>Utilization:</span>
              <strong>{markets.compound.utilization}%</strong>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default MarketComparison
