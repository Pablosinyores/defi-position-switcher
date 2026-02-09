import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react'
import { usePrivy } from '@privy-io/react-auth'
import { authAPI, accountAPI, setTokenGetter, setAuthToken } from '../services/api'
import { toast } from 'react-toastify'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const {
    ready,
    authenticated,
    user,
    login: privyLogin,
    logout: privyLogout,
    getAccessToken
  } = usePrivy()

  const [backendUser, setBackendUser] = useState(null)
  const [smartAccount, setSmartAccount] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [isRegistering, setIsRegistering] = useState(false)

  const didSyncRef = useRef(false)

  // Keep axios token fresh - Privy caches internally, no extra network calls
  useEffect(() => {
    if (authenticated) {
      setTokenGetter(() => getAccessToken())
    } else {
      setTokenGetter(null)
    }
  }, [authenticated, getAccessToken])

  // Get EOA address from Privy user object
  // Note: Don't proactively create wallet - let Privy handle it automatically
  const getEoaAddress = useCallback(() => {
    // Check user.wallet first
    let eoaAddress = user?.wallet?.address

    // Check linked accounts for embedded wallet
    if (!eoaAddress && user?.linkedAccounts) {
      const embeddedWallet = user.linkedAccounts.find(
        (acc) => acc.type === 'wallet' && acc.walletClientType === 'privy'
      )
      eoaAddress = embeddedWallet?.address
    }

    // Don't try to create wallet here - it causes race conditions
    // Privy will create it automatically when needed
    // EOA address is optional for backend registration anyway

    return eoaAddress || null
  }, [user])

  // Single sync function - called ONCE after login
  // Simplified: Always call login endpoint (handles both new and existing users)
  const syncWithBackend = useCallback(async () => {
    if (!authenticated || !user) {
      setBackendUser(null)
      setSmartAccount(null)
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    // Get email from Privy user object
    const email = user.email?.address ||
      user.linkedAccounts?.find((a) => a.type === 'email')?.address

    if (!email) {
      console.log('[AuthContext] No email yet, waiting for Privy...')
      setLoading(false)
      return
    }

    // Wait for token with retry
    let token = null
    for (let i = 0; i < 3; i++) {
      try {
        token = await getAccessToken()
        if (token) break
      } catch (e) {
        console.log(`[AuthContext] Token attempt ${i + 1} failed, retrying...`)
      }
      await new Promise(r => setTimeout(r, 500))
    }

    if (!token) {
      console.error('[AuthContext] Failed to get Privy token after retries')
      setError('Failed to authenticate with Privy')
      setLoading(false)
      return
    }

    setAuthToken(token)

    // Get EOA from user object (sync - no wallet creation)
    const eoaAddress = getEoaAddress()

    console.log('[AuthContext] Syncing with backend:', {
      privyId: user.id,
      email,
      eoaAddress
    })

    try {
      // Always call login - backend handles both new and existing users
      const { data } = await authAPI.login(user.id, email, eoaAddress || '')

      if (data.success) {
        setBackendUser(data.data.user)
        setError(null)
        console.log('[AuthContext] User synced successfully')

        // Check smart account status if user has one
        const userObj = data.data.user
        if (userObj.smartWalletAddress || userObj.smartAccountAddress) {
          try {
            const statusRes = await accountAPI.getStatus()
            if (statusRes.data.success) {
              setSmartAccount(statusRes.data.data)
            }
          } catch (e) {
            // Account not deployed yet - that's fine
          }
        }
      }
    } catch (err) {
      const errorMsg = err.response?.data?.error || err.message

      // If new user and wallet not ready yet, allow retry
      if (errorMsg?.includes('wallet') && errorMsg?.includes('required') && !eoaAddress) {
        console.log('[AuthContext] New user waiting for Privy wallet, will retry on next sync...')
        didSyncRef.current = false // Allow retry
        setError(null) // Don't show error - this is expected
      } else {
        console.error('[AuthContext] Backend sync error:', err.response?.data || err.message)
        setError(errorMsg || 'Failed to sync with backend')
      }
    } finally {
      setLoading(false)
    }
  }, [authenticated, user, getAccessToken, getEoaAddress])

  // Run sync ONCE when user authenticates - no wallets dependency
  useEffect(() => {
    if (!ready) return

    if (authenticated && !didSyncRef.current) {
      didSyncRef.current = true
      syncWithBackend()
    } else if (!authenticated) {
      didSyncRef.current = false
      setBackendUser(null)
      setSmartAccount(null)
      setLoading(false)
    }
  }, [ready, authenticated, syncWithBackend])

  // Activate smart account (deploy + install session key)
  const activateAccount = async () => {
    try {
      setLoading(true)
      toast.info('Activating smart account...')

      const response = await accountAPI.activate()
      if (response.data.success) {
        setSmartAccount(response.data.data)

        // Update backend user with session key status
        setBackendUser(prev => ({
          ...prev,
          hasSessionKey: true,
          sessionKeyExpiry: response.data.data.expiresAt
        }))

        toast.success('Smart account activated!')
        return response.data.data
      }
    } catch (error) {
      console.error('[AuthContext] Activate account error:', error)
      toast.error(error.response?.data?.error || 'Failed to activate smart account')
      throw error
    } finally {
      setLoading(false)
    }
  }

  // Logout
  const handleLogout = async () => {
    try {
      await privyLogout()
      didSyncRef.current = false
      setAuthToken(null)
      setTokenGetter(null)
      setBackendUser(null)
      setSmartAccount(null)
    } catch (err) {
      console.error('[AuthContext] Logout error:', err)
    }
  }

  // Refresh data
  const refresh = async () => {
    didSyncRef.current = false
    await syncWithBackend()
  }

  const value = {
    // State
    ready,
    authenticated,
    loading,
    error,
    isRegistering,

    // User data
    privyUser: user,
    backendUser,
    smartAccount,

    // Computed values
    email: user?.email?.address,
    walletAddress: backendUser?.eoaAddress || backendUser?.privyWalletAddress || user?.wallet?.address,
    smartAccountAddress: smartAccount?.address || backendUser?.smartWalletAddress || backendUser?.smartAccountAddress,
    hasSessionKey: backendUser?.hasSessionKey || smartAccount?.hasSessionKey || false,
    isAccountActive: smartAccount?.deployed || false,

    // Actions
    login: privyLogin,
    logout: handleLogout,
    refresh,
    activateAccount
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

export default AuthContext
