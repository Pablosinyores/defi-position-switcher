import { Routes, Route, Navigate } from 'react-router-dom'
import { usePrivy } from '@privy-io/react-auth'
import { AuthProvider } from './context/AuthContext'
import Dashboard from './pages/Dashboard'
import Login from './pages/Login'
import './App.css'

function PrivateRoute({ children }) {
  const { authenticated } = usePrivy()
  return authenticated ? children : <Navigate to="/login" />
}

function App() {
  return (
    <AuthProvider>
      <div className="app">
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/dashboard"
            element={
              <PrivateRoute>
                <Dashboard />
              </PrivateRoute>
            }
          />
          <Route path="/" element={<Navigate to="/dashboard" />} />
        </Routes>
      </div>
    </AuthProvider>
  )
}

export default App
