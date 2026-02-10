import { useState, useEffect, useRef, useCallback } from 'react'
import { usePrivy, useWallets } from '@privy-io/react-auth'
import { authAPI, accountAPI, setTokenGetter } from '../services/api'

/**
 * useAuth Hook
 *
 * Manages authentication state:
 * - Privy email login
 * - Backend user sync
 * - Smart account status
 * - Session key management
 */
export function useAuth() {
  const {
    ready,
    authenticated,
    user: privyUser,
    login: privyLogin,
    logout: privyLogout,
    getAccessToken,
    createWallet
  } = usePrivy()

  const { wallets } = useWallets()

  const [backendUser, setBackendUser] = useState(null)
  const [smartAccount, setSmartAccount] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const didSyncRef = useRef(false)

  // Set token getter for API calls
  useEffect(() => {
    if (getAccessToken) {
      setTokenGetter(getAccessToken)
    }
  }, [getAccessToken])

  // Get embedded wallet address
  const getWalletAddress = useCallback(async () => {
    // Check user.wallet first
    if (privyUser?.wallet?.address) {
      return privyUser.wallet.address
    }

    // Check linked accounts for embedded wallet
    if (privyUser?.linkedAccounts) {
      const embeddedWallet = privyUser.linkedAccounts.find(
        (acc) => acc.type === 'wallet' && acc.walletClientType === 'privy'
      )
      if (embeddedWallet?.address) {
        return embeddedWallet.address
      }
    }

    // Check useWallets hook
    if (wallets && wallets.length > 0) {
      return wallets[0].address
    }

    // Try to create a wallet
    if (typeof createWallet === 'function') {
      try {
        const newWallet = await createWallet()
        return newWallet.address
      } catch (e) {
        console.error('Failed to create wallet:', e)
      }
    }

    return null
  }, [privyUser, wallets, createWallet])

  // Sync with backend
  const syncWithBackend = useCallback(async () => {
    if (!authenticated || !privyUser || didSyncRef.current) {
      return
    }

    didSyncRef.current = true
    setLoading(true)
    setError(null)

    try {
      // Store token
      const token = await getAccessToken()
      if (token) {
        localStorage.setItem('privy:token', token)
      }

      // Get wallet address
      const walletAddress = await getWalletAddress()
      if (!walletAddress) {
        throw new Error('No wallet address available')
      }

      console.log('Syncing with backend:', {
        privyId: privyUser.id,
        email: privyUser.email?.address,
        wallet: walletAddress
      })

      // Login/register with backend
      const response = await authAPI.login(
        privyUser.id,
        privyUser.email?.address,
        walletAddress
      )

      if (response.data.success) {
        setBackendUser(response.data.data.user)

        // Get smart account status
        try {
          const statusRes = await accountAPI.getStatus()
          if (statusRes.data.success) {
            setSmartAccount(statusRes.data.data)
          }
        } catch (e) {
          // Smart account might not be deployed yet
          console.log('Smart account not yet deployed')
        }
      }
    } catch (err) {
      console.error('Backend sync failed:', err)
      setError(err.message || 'Failed to sync with backend')
      didSyncRef.current = false // Allow retry
    } finally {
      setLoading(false)
    }
  }, [authenticated, privyUser, getAccessToken, getWalletAddress])

  // Sync when authenticated
  useEffect(() => {
    if (ready && authenticated && privyUser) {
      syncWithBackend()
    } else if (ready && !authenticated) {
      setLoading(false)
      setBackendUser(null)
      setSmartAccount(null)
      didSyncRef.current = false
    }
  }, [ready, authenticated, privyUser, syncWithBackend])

  // Login function
  const login = useCallback(async () => {
    try {
      await privyLogin()
    } catch (err) {
      console.error('Login failed:', err)
      setError(err.message || 'Login failed')
    }
  }, [privyLogin])

  // Logout function
  const logout = useCallback(async () => {
    try {
      await privyLogout()
      setBackendUser(null)
      setSmartAccount(null)
      didSyncRef.current = false
      localStorage.removeItem('privy:token')
    } catch (err) {
      console.error('Logout failed:', err)
    }
  }, [privyLogout])

  // Refresh user data
  const refresh = useCallback(async () => {
    didSyncRef.current = false
    await syncWithBackend()
  }, [syncWithBackend])

  // Get embedded Privy wallet for signing
  const getEmbeddedWallet = useCallback(() => {
    if (!wallets || wallets.length === 0) return null
    return wallets.find(w => w.walletClientType === 'privy') || wallets[0]
  }, [wallets])

  /**
   * Activate smart account by registering session key
   * User must sign with their Privy wallet
   */
  const activateAccount = useCallback(async () => {
    try {
      setLoading(true)

      // Get embedded wallet for signing
      const wallet = getEmbeddedWallet()
      if (!wallet) {
        throw new Error('No wallet available')
      }

      // Get registration data from backend
      const regResponse = await authAPI.getSessionKeyRegistrationData()
      if (!regResponse.data.success) {
        throw new Error(regResponse.data.error || 'Failed to get registration data')
      }

      const { userOpHash, alreadyRegistered } = regResponse.data.data

      if (alreadyRegistered) {
        const statusRes = await accountAPI.getStatus()
        if (statusRes.data.success) {
          setSmartAccount(statusRes.data.data)
          setBackendUser(prev => ({ ...prev, hasSessionKey: true }))
        }
        return statusRes.data.data
      }

      // Sign with Privy wallet
      const provider = await wallet.getEthereumProvider()
      const signature = await provider.request({
        method: 'personal_sign',
        params: [userOpHash, wallet.address]
      })

      // Submit signature to backend
      const confirmResponse = await authAPI.confirmSessionKeyRegistration(signature, userOpHash)
      if (!confirmResponse.data.success) {
        throw new Error('Failed to register session key')
      }

      // Update state
      setBackendUser(prev => ({
        ...prev,
        hasSessionKey: true,
        sessionKeyExpiry: confirmResponse.data.data.expiresAt
      }))

      const statusRes = await accountAPI.getStatus()
      if (statusRes.data.success) {
        setSmartAccount(statusRes.data.data)
      }

      return confirmResponse.data.data
    } catch (err) {
      console.error('Failed to activate account:', err)
      setError(err.message || 'Failed to activate account')
      throw err
    } finally {
      setLoading(false)
    }
  }, [getEmbeddedWallet])

  return {
    // Auth state
    ready,
    authenticated,
    loading,
    error,

    // User data
    privyUser,
    backendUser,
    smartAccount,

    // Computed values
    email: privyUser?.email?.address,
    walletAddress: backendUser?.eoaAddress || privyUser?.wallet?.address,
    smartAccountAddress: smartAccount?.address || backendUser?.smartWalletAddress,
    hasSessionKey: backendUser?.hasSessionKey || false,
    isAccountActive: smartAccount?.deployed || false,

    // Actions
    login,
    logout,
    refresh,
    activateAccount
  }
}

export default useAuth
