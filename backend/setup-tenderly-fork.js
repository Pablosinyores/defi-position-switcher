#!/usr/bin/env node
/**
 * Tenderly Fork Setup Script
 *
 * This script sets up everything needed for a new Tenderly Virtual Testnet fork:
 * 1. Deploys SimplePaymasterV06 (for gas sponsorship)
 * 2. Deploys CompoundV3CrossCometSwitcher (for DeFi switching)
 * 3. Funds the paymaster with ETH
 * 4. Updates .env file with new contract addresses
 *
 * Usage:
 *   node setup-tenderly-fork.js [--rpc-url <url>]
 *
 * If --rpc-url is not provided, uses RPC_URL from .env
 */

require('dotenv').config({ path: __dirname + '/.env' })
const { ethers } = require('ethers')
const fs = require('fs')
const path = require('path')

// Contract ABIs and Bytecodes
const SIMPLE_PAYMASTER_V06_ABI = [
  'constructor(address _entryPoint)',
  'function deposit() payable',
  'function getDeposit() view returns (uint256)',
  'function owner() view returns (address)',
  'function entryPoint() view returns (address)',
]

// SimplePaymasterV06 bytecode (compiled)
const SIMPLE_PAYMASTER_V06_BYTECODE = '0x608060405234801561001057600080fd5b506040516105cf3803806105cf83398101604081905261002f91610054565b600080546001600160a01b03199081163317909155600180549091166001600160a01b0392909216919091179055610084565b60006020828403121561006657600080fd5b81516001600160a01b038116811461007d57600080fd5b9392505050565b61053c806100936000396000f3fe6080604052600436106100555760003560e01c80630396cb601461005a578063205c28781461006f578063b0d691fe14610082578063c23a5cea146100b3578063d0e30db0146100d3578063f2fde38b146100db575b600080fd5b61006d610068366004610441565b6100fb565b005b61006d61007d366004610460565b610194565b34801561008e57600080fd5b506001546001600160a01b03165b6040516001600160a01b0390911681526020015b60405180910390f35b3480156100bf57600080fd5b5061006d6100ce3660046104a0565b610228565b61006d6102b1565b3480156100e757600080fd5b5061006d6100f63660046104a0565b6102f3565b6000546001600160a01b0316331461012e5760405162461bcd60e51b8152600401610125906104c2565b60405180910390fd5b6001546040516305d043bb60e01b8152600481018390526001600160a01b039091169063051833f39082906305d043bb90602401600060405180830381600087803b15801561017c57600080fd5b505af1158015610190573d6000803e3d6000fd5b5050505b5050565b6000546001600160a01b031633146101c25760405162461bcd60e51b8152600401610125906104c2565b6001600160a01b0382166101e85760405162461bcd60e51b8152600401610125906104c2565b6040516001600160a01b0383169082156108fc029083906000818181858888f19350505050158015610223573d6000803e3d6000fd5b505050565b6000546001600160a01b031633146102525760405162461bcd60e51b8152600401610125906104c2565b6001600160a01b0381166102785760405162461bcd60e51b8152600401610125906104c2565b600154604051631b2ce7f360e11b81526001600160a01b03838116600483015290911690633659cfe690602401600060405180830381600087803b15801561017c57600080fd5b6001546040516001600160a01b039091169034156108fc0290349060009081818185888388f193505050501580156102f0573d6000803e3d6000fd5b50565b6000546001600160a01b031633146103235760405162461bcd60e51b8152600401610125906104c2565b6001600160a01b03811661038b5760405162461bcd60e51b815260206004820152602960248201527f4f776e61626c653a206e6577206f776e657220697320746865207a65726f206160448201526864647265737360b81b6064820152608401610125565b600080546040516001600160a01b03808516939216917f8be0079c531659141344cd1fd0a4f28419497f9722a3daafe3b4186f6b6457e091a3600080546001600160a01b0319166001600160a01b0392909216919091179055565b634e487b7160e01b600052604160045260246000fd5b80356001600160a01b038116811461041357600080fd5b919050565b60006020828403121561042a57600080fd5b61043382610406565b939250505056fea164736f6c6343000817000a'

// CompoundV3CrossCometSwitcher bytecode needs to be loaded from compiled artifacts
const SWITCHER_ABI = [
  'constructor(address _flashLoanPool, address _swapPool)',
  'function authorizeCaller(address caller, bool authorized) external',
  'function authorizedCallers(address) view returns (bool)',
  'function owner() view returns (address)',
  'function switchCollateral(address user, address sourceComet, address targetComet, address collateralAsset, uint256 collateralAmount, uint256 borrowAmount, uint256 minOutputAmount) external',
]

// Mainnet addresses (constant)
const MAINNET_ADDRESSES = {
  ENTRYPOINT_V06: '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789',
  USDC_COMET: '0xc3d688B66703497DAA19211EEdff47f25384cdc3',
  WETH_COMET: '0xA17581A9E3356d9A858b789D68B4d866e593aE94',
  FLASH_POOL: '0x88e6A0c2dDD26FEEb64F039a2c41296FcB3f5640', // 0.05% USDC/WETH
  SWAP_POOL: '0x7BeA39867e4169DBe237d55C8242a8f2fcDcc387',  // 1% USDC/WETH
  USDC: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  WETH: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
  WBTC: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
}

async function main() {
  // Parse command line args
  const args = process.argv.slice(2)
  let rpcUrl = process.env.RPC_URL

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--rpc-url' && args[i + 1]) {
      rpcUrl = args[i + 1]
      i++
    }
  }

  if (!rpcUrl) {
    console.error('Error: No RPC URL provided. Set RPC_URL in .env or use --rpc-url flag')
    process.exit(1)
  }

  console.log('\n╔════════════════════════════════════════════════════════════╗')
  console.log('║           Tenderly Fork Setup Script                       ║')
  console.log('╚════════════════════════════════════════════════════════════╝\n')

  console.log('RPC URL:', rpcUrl)

  const provider = new ethers.JsonRpcProvider(rpcUrl)
  const deployerKey = process.env.DEPLOYER_PRIVATE_KEY

  if (!deployerKey) {
    console.error('Error: DEPLOYER_PRIVATE_KEY not set in .env')
    process.exit(1)
  }

  const deployer = new ethers.Wallet(deployerKey, provider)
  console.log('Deployer:', deployer.address)

  // Check connection
  try {
    const blockNumber = await provider.getBlockNumber()
    console.log('Connected to fork at block:', blockNumber)
  } catch (e) {
    console.error('Failed to connect to RPC:', e.message)
    process.exit(1)
  }

  // Fund deployer with ETH via Tenderly
  console.log('\n--- Step 1: Funding deployer ---')
  try {
    await provider.send('tenderly_setBalance', [
      [deployer.address],
      '0x56BC75E2D63100000' // 100 ETH
    ])
    const balance = await provider.getBalance(deployer.address)
    console.log('Deployer balance:', ethers.formatEther(balance), 'ETH')
  } catch (e) {
    console.error('Failed to fund deployer:', e.message)
    // Try single address format
    try {
      await provider.send('tenderly_setBalance', [deployer.address, '0x56BC75E2D63100000'])
      console.log('Funded deployer (fallback format)')
    } catch (e2) {
      console.error('Failed to fund deployer (both formats):', e2.message)
      process.exit(1)
    }
  }

  // Deploy SimplePaymasterV06
  console.log('\n--- Step 2: Deploying SimplePaymasterV06 ---')
  let paymasterAddress
  try {
    // Try to load compiled bytecode from Foundry artifacts
    const artifactPath = path.join(__dirname, '../contracts/out/SimplePaymasterV06.sol/SimplePaymasterV06.json')
    let bytecode

    if (fs.existsSync(artifactPath)) {
      const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'))
      bytecode = artifact.bytecode.object
      console.log('Loaded bytecode from Foundry artifacts')
    } else {
      console.log('Foundry artifacts not found, using embedded bytecode')
      bytecode = SIMPLE_PAYMASTER_V06_BYTECODE
    }

    const factory = new ethers.ContractFactory(
      SIMPLE_PAYMASTER_V06_ABI,
      bytecode,
      deployer
    )

    const paymaster = await factory.deploy(MAINNET_ADDRESSES.ENTRYPOINT_V06)
    await paymaster.waitForDeployment()
    paymasterAddress = await paymaster.getAddress()
    console.log('Paymaster deployed at:', paymasterAddress)

    // Fund paymaster deposit on EntryPoint (required for ERC-4337)
    console.log('Depositing 10 ETH to EntryPoint for paymaster...')

    // EntryPoint v0.6.0 depositTo function
    const entryPointAbi = ['function depositTo(address account) payable']
    const entryPoint = new ethers.Contract(MAINNET_ADDRESSES.ENTRYPOINT_V06, entryPointAbi, deployer)

    const depositTx = await entryPoint.depositTo(paymasterAddress, {
      value: ethers.parseEther('10')
    })
    await depositTx.wait()
    console.log('Paymaster deposit on EntryPoint: 10 ETH')

    // Verify deposit
    const getDepositAbi = ['function balanceOf(address account) view returns (uint256)']
    const entryPointRead = new ethers.Contract(MAINNET_ADDRESSES.ENTRYPOINT_V06, getDepositAbi, provider)
    const deposit = await entryPointRead.balanceOf(paymasterAddress)
    console.log('Verified paymaster deposit:', ethers.formatEther(deposit), 'ETH')
  } catch (e) {
    console.error('Failed to deploy paymaster:', e.message)
    console.log('You may need to compile contracts first: cd contracts && forge build')
    process.exit(1)
  }

  // Deploy CompoundV3CrossCometSwitcher
  console.log('\n--- Step 3: Deploying CompoundV3CrossCometSwitcher ---')
  let switcherAddress
  try {
    const artifactPath = path.join(__dirname, '../contracts/out/CompoundV3CrossCometSwitcher.sol/CompoundV3CrossCometSwitcher.json')

    if (!fs.existsSync(artifactPath)) {
      console.error('Switcher artifact not found. Run: cd contracts && forge build')
      process.exit(1)
    }

    const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'))

    const factory = new ethers.ContractFactory(
      artifact.abi,
      artifact.bytecode.object,
      deployer
    )

    const switcher = await factory.deploy(
      MAINNET_ADDRESSES.FLASH_POOL,
      MAINNET_ADDRESSES.SWAP_POOL
    )
    await switcher.waitForDeployment()
    switcherAddress = await switcher.getAddress()
    console.log('Switcher deployed at:', switcherAddress)
    console.log('Switcher owner:', deployer.address)
  } catch (e) {
    console.error('Failed to deploy switcher:', e.message)
    process.exit(1)
  }

  // Update .env file
  console.log('\n--- Step 4: Updating .env file ---')
  const envPath = path.join(__dirname, '.env')
  let envContent = fs.readFileSync(envPath, 'utf8')

  // Update addresses (only the ones actually used)
  const updates = {
    'PAYMASTER_V06_ADDRESS': paymasterAddress,
    'SWITCHER_ADDRESS': switcherAddress,
    'RPC_URL': rpcUrl,
  }

  for (const [key, value] of Object.entries(updates)) {
    const regex = new RegExp(`^${key}=.*$`, 'm')
    if (regex.test(envContent)) {
      envContent = envContent.replace(regex, `${key}=${value}`)
    } else {
      envContent += `\n${key}=${value}`
    }
  }

  fs.writeFileSync(envPath, envContent)
  console.log('.env file updated')

  // Print summary
  console.log('\n╔════════════════════════════════════════════════════════════╗')
  console.log('║                    Setup Complete!                         ║')
  console.log('╚════════════════════════════════════════════════════════════╝\n')

  console.log('Deployed Contracts:')
  console.log('  Paymaster (v0.6.0):', paymasterAddress)
  console.log('  Switcher:', switcherAddress)
  console.log('')
  console.log('Mainnet Addresses (unchanged):')
  console.log('  EntryPoint v0.6.0:', MAINNET_ADDRESSES.ENTRYPOINT_V06)
  console.log('  USDC Comet:', MAINNET_ADDRESSES.USDC_COMET)
  console.log('  WETH Comet:', MAINNET_ADDRESSES.WETH_COMET)
  console.log('  WBTC:', MAINNET_ADDRESSES.WBTC)
  console.log('  USDC:', MAINNET_ADDRESSES.USDC)
  console.log('  WETH:', MAINNET_ADDRESSES.WETH)
  console.log('')
  // Verify WETH contract exists
  console.log('\n--- Verifying Mainnet Contracts ---')
  const wethCode = await provider.getCode(MAINNET_ADDRESSES.WETH)
  if (wethCode === '0x' || wethCode.length <= 2) {
    console.log('⚠️  WARNING: WETH contract is MISSING from this fork!')
    console.log('   This may cause WETH balance errors but won\'t block core functionality.')
    console.log('   Consider creating a fresh Tenderly fork if WETH operations are needed.')
  } else {
    console.log('✓ WETH contract verified')
  }

  console.log('')
  console.log('Next steps:')
  console.log('  1. Restart the backend: npm run dev')
  console.log('  2. Users need to re-register and activate their accounts')
  console.log('  3. Fund users with test tokens via "Get Test Tokens" button')
  console.log('')
}

main().catch(console.error)
