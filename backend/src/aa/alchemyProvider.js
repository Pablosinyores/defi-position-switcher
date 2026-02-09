const { createModularAccountAlchemyClient } = require('@alchemy/aa-alchemy')
const { LocalAccountSigner } = require('@alchemy/aa-core')
const { sepolia, mainnet } = require('viem/chains')

// Mainnet fork chain config
const mainnetFork = {
  ...mainnet,
  id: 1,
  name: 'Mainnet Fork',
  network: 'mainnet-fork',
  rpcUrls: {
    default: {
      http: [process.env.RPC_URL || 'http://localhost:8545']
    },
    public: {
      http: [process.env.RPC_URL || 'http://localhost:8545']
    }
  }
}

/**
 * Create Alchemy Modular Account with custom infrastructure
 * - Uses YOUR fork RPC
 * - Uses YOUR local bundler
 * - Uses YOUR paymaster for gas sponsorship
 */
async function createAlchemySmartAccount(privyEOAPrivateKey) {
  try {
    console.log('Creating Alchemy smart account...')
    console.log('RPC:', process.env.RPC_URL)
    console.log('Bundler:', process.env.BUNDLER_URL)
    console.log('Paymaster:', process.env.PAYMASTER_ADDRESS)

    // Create signer from Privy EOA private key
    const owner = LocalAccountSigner.privateKeyToAccountSigner(privyEOAPrivateKey)
    const ownerAddress = await owner.getAddress()
    console.log('Owner (Privy EOA):', ownerAddress)

    // Create Alchemy Modular Account client
    const client = await createModularAccountAlchemyClient({
      // Custom RPC (your fork)
      chain: mainnetFork,

      // Account signer (Privy EOA)
      signer: owner,

      // Custom bundler URL (local)
      opts: {
        txMaxRetries: 10,
        txRetryIntervalMs: 2000,
        txRetryMultiplier: 1.5
      }
    })

    // Override transport to use custom RPC and bundler
    const accountAddress = client.getAddress()

    console.log('✅ Alchemy smart account created!')
    console.log('Smart Account Address:', accountAddress)

    return {
      client,
      address: accountAddress,
      owner: ownerAddress
    }
  } catch (error) {
    console.error('Failed to create Alchemy smart account:', error)
    throw error
  }
}

/**
 * Create client for executing with session key
 * Backend signs, not the user!
 */
async function createSessionKeyClient(smartAccountAddress) {
  try {
    const sessionKeySigner = LocalAccountSigner.privateKeyToAccountSigner(
      process.env.SESSION_KEY_PRIVATE_KEY
    )

    const client = await createModularAccountAlchemyClient({
      chain: mainnetFork,
      signer: sessionKeySigner,
      accountAddress: smartAccountAddress,

      opts: {
        txMaxRetries: 10
      }
    })

    console.log('✅ Session key client created')
    console.log('Session Key:', await sessionKeySigner.getAddress())

    return client
  } catch (error) {
    console.error('Failed to create session key client:', error)
    throw error
  }
}

module.exports = {
  createAlchemySmartAccount,
  createSessionKeyClient,
  mainnetFork
}
