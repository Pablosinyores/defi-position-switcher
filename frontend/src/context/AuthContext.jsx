import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react'
import { usePrivy, useWallets } from '@privy-io/react-auth'
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

  // Get access to Privy wallets for signing
  const { wallets } = useWallets()

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

  // Get the embedded Privy wallet for signing
  const getEmbeddedWallet = useCallback(() => {
    if (!wallets || wallets.length === 0) return null
    // Find the embedded Privy wallet (not external wallets)
    return wallets.find(w => w.walletClientType === 'privy') || wallets[0]
  }, [wallets])

  /**
   * Activate smart account by registering session key
   *
   * Flow:
   * 1. Get registration data (unsigned UserOp) from backend
   * 2. User signs the UserOp hash with their Privy wallet
   * 3. Submit signature to backend to complete registration
   *
   * This deploys the smart account (if needed) and installs the session key plugin
   */
  const activateAccount = async () => {
    try {
      setLoading(true)

      // Step 1: Get the embedded wallet
      const wallet = getEmbeddedWallet()
      if (!wallet) {
        throw new Error('No wallet available. Please wait for wallet to initialize.')
      }

      console.log('[AuthContext] Using wallet for signing:', wallet.address)

      // Step 2: Get registration data from backend
      toast.info('Preparing session key registration...')
      const regResponse = await authAPI.getSessionKeyRegistrationData()

      if (!regResponse.data.success) {
        throw new Error(regResponse.data.error || 'Failed to get registration data')
      }

      const { userOpHash, alreadyRegistered, sessionKeyAddress } = regResponse.data.data

      // Check if already registered
      if (alreadyRegistered) {
        toast.success('Session key already registered!')
        // Refresh smart account status
        const statusRes = await accountAPI.getStatus()
        if (statusRes.data.success) {
          setSmartAccount(statusRes.data.data)
          setBackendUser(prev => ({
            ...prev,
            hasSessionKey: true
          }))
        }
        return statusRes.data.data
      }

      console.log('[AuthContext] Got UserOp hash to sign:', userOpHash)
      console.log('[AuthContext] Session key address:', sessionKeyAddress)

      // Step 3: Sign the UserOp hash with user's Privy wallet
      toast.info('Please sign to authorize session key...')

      // Get the wallet provider for signing
      const provider = await wallet.getEthereumProvider()

      // Sign the hash using personal_sign (EIP-191)
      // The hash is already computed by the backend
      const signature = await provider.request({
        method: 'personal_sign',
        params: [userOpHash, wallet.address]
      })

      console.log('[AuthContext] Got signature:', signature)

      // Step 4: Submit signature to backend
      toast.info('Registering session key on-chain...')
      const confirmResponse = await authAPI.confirmSessionKeyRegistration(signature, userOpHash)

      if (!confirmResponse.data.success) {
        throw new Error(confirmResponse.data.data?.message || 'Failed to register session key')
      }

      console.log('[AuthContext] Session key registered! Tx:', confirmResponse.data.data.txHash)

      // Update state
      setBackendUser(prev => ({
        ...prev,
        hasSessionKey: true,
        sessionKeyAddress: confirmResponse.data.data.sessionKeyAddress,
        sessionKeyExpiry: confirmResponse.data.data.expiresAt
      }))

      // Refresh smart account status
      const statusRes = await accountAPI.getStatus()
      if (statusRes.data.success) {
        setSmartAccount(statusRes.data.data)
      }

      toast.success('Smart account activated! Session key registered.')
      return confirmResponse.data.data
    } catch (error) {
      console.error('[AuthContext] Activate account error:', error)

      // Handle user rejection
      if (error.code === 4001 || error.message?.includes('rejected')) {
        toast.error('Signature rejected. Please try again.')
      } else {
        toast.error(error.response?.data?.error || error.message || 'Failed to activate smart account')
      }
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
