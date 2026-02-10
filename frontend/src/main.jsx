import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { PrivyProvider } from '@privy-io/react-auth'
import { ToastContainer } from 'react-toastify'
import App from './App'
import './index.css'
import 'react-toastify/dist/ReactToastify.css'

const privyAppId = import.meta.env.VITE_PRIVY_APP_ID

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <PrivyProvider
      appId={privyAppId}
      config={{
        loginMethods: ['email'],
        appearance: {
          theme: 'light',
          accentColor: '#676FFF'
        },
        embeddedWallets: {
          createOnLogin: 'all-users', // Force create wallet for ALL users
          noPromptOnSignature: false, // Prompt for session key registration signature
          requireUserPasswordOnCreate: false // Don't require password for wallet creation
        }
      }}
    >
      <BrowserRouter>
        <App />
        <ToastContainer position="top-right" autoClose={5000} />
      </BrowserRouter>
    </PrivyProvider>
  </React.StrictMode>
)
