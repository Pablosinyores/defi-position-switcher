import { useEffect } from 'react'
import { usePrivy } from '@privy-io/react-auth'
import { useNavigate } from 'react-router-dom'
import './Login.css'

function Login() {
  const { login, authenticated } = usePrivy()
  const navigate = useNavigate()

  useEffect(() => {
    if (authenticated) {
      navigate('/dashboard')
    }
  }, [authenticated, navigate])

  return (
    <div className="login-container">
      <div className="login-card">
        <h1>DeFi Borrowing App</h1>
        <p>Gasless lending and borrowing with protocol switching</p>

        <div className="features">
          <div className="feature">
            <span>✓</span> Gasless transactions
          </div>
          <div className="feature">
            <span>✓</span> Automatic protocol switching
          </div>
          <div className="feature">
            <span>✓</span> Best rates across Aave & Compound
          </div>
        </div>

        <button className="login-button" onClick={login}>
          Login with Email
        </button>

        <p className="disclaimer">
          No wallet needed. We'll create a smart wallet for you.
        </p>
      </div>
    </div>
  )
}

export default Login
