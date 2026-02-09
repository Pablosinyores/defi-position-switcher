// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "forge-std/Script.sol";
import "forge-std/console.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../src/SimpleSmartAccount.sol";
import "../src/SimpleAccountFactory.sol";
import "../src/CompoundV3CrossCometSwitcher.sol";
import "../src/SimplePaymaster.sol";

/**
 * @title DeployPersistent
 * @notice Deploys contracts with PERSISTENT state on fork
 * @dev Use: forge script script/DeployPersistent.s.sol --fork-url http://127.0.0.1:8545 --broadcast
 */
contract DeployPersistent is Script {
    // Mainnet addresses
    address constant WBTC = 0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599;
    address constant USDC = 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48;
    address constant WETH = 0xC02AAa39B223fE8d0A5E5C4f27eaD9083c756cC2;
    address constant USDC_COMET = 0xc3d688B66703497DAA19211EEdff47f25384cdc3;
    address constant WETH_COMET = 0xA17581A9E3356d9A858b789D68B4d866e593aE94;
    address constant FLASH_POOL = 0x88e6A0c2dDD26FEEb64F039a2c41296FcB3f5640;
    address constant SWAP_POOL = 0x7BeA39867e4169DBe237d55C8242a8f2fcDcc387;
    address constant ENTRY_POINT = 0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789;
    address constant WBTC_WHALE = 0x5Ee5bf7ae06D1Be5997A1A72006FE6C607eC6DE8;

    function run() external {
        // Get deployer from env (default to Anvil account #0)
        uint256 deployerKey = vm.envOr("PRIVATE_KEY", uint256(0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80));
        address deployer = vm.addr(deployerKey);

        // Backend key (Anvil account #1)
        uint256 backendKey = 0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d;
        address backend = vm.addr(backendKey);

        console.log("\n========================================================");
        console.log("PERSISTENT DEPLOYMENT TO FORK");
        console.log("========================================================\n");
        console.log("Deployer:", deployer);
        console.log("Backend:", backend);
        console.log("");

        vm.startBroadcast(deployerKey);

        console.log("========================================================");
        console.log("PHASE 1: DEPLOY INFRASTRUCTURE");
        console.log("========================================================\n");

        // Deploy factory
        console.log("[1/4] Deploying Account Factory...");
        SimpleAccountFactory factory = new SimpleAccountFactory();
        console.log("      Factory:", address(factory));

        // Deploy switcher
        console.log("[2/4] Deploying Switcher...");
        CompoundV3CrossCometSwitcher switcher = new CompoundV3CrossCometSwitcher(FLASH_POOL, SWAP_POOL);
        console.log("      Switcher:", address(switcher));

        // Deploy paymaster
        console.log("[3/4] Deploying Paymaster...");
        SimplePaymaster paymaster = new SimplePaymaster(ENTRY_POINT);
        console.log("      Paymaster:", address(paymaster));

        // Fund paymaster
        console.log("[4/4] Funding Paymaster...");
        paymaster.deposit{value: 100 ether}();
        console.log("      Funded: 100 ETH");
        console.log("");

        console.log("========================================================");
        console.log("PHASE 2: DEPLOY USER ACCOUNT");
        console.log("========================================================\n");

        // Deploy smart account via factory
        console.log("[1/3] Deploying Smart Account via Factory...");
        SimpleSmartAccount smartAccount = factory.createAccount(deployer, 0);
        console.log("      Smart Account:", address(smartAccount));

        // Fund smart account
        console.log("[2/3] Funding Smart Account...");
        payable(address(smartAccount)).transfer(10 ether);
        console.log("      Funded: 10 ETH");

        // Authorize in switcher
        console.log("[3/3] Authorizing in Switcher...");
        switcher.authorizeCaller(address(smartAccount), true);
        console.log("      Authorized");
        console.log("");

        // Add to paymaster sponsorship
        paymaster.addSponsoredAccount(address(smartAccount));

        console.log("========================================================");
        console.log("PHASE 3: ADD SESSION KEY");
        console.log("========================================================\n");

        // Add session key
        address[] memory allowedTargets = new address[](6);
        allowedTargets[0] = WBTC;
        allowedTargets[1] = USDC;
        allowedTargets[2] = WETH;
        allowedTargets[3] = USDC_COMET;
        allowedTargets[4] = WETH_COMET;
        allowedTargets[5] = address(switcher);

        uint48 validUntil = uint48(block.timestamp + 30 days);
        uint48 validAfter = uint48(block.timestamp);

        console.log("Adding session key...");
        console.log("  Backend:", backend);
        smartAccount.addSessionKey(backend, validUntil, validAfter, allowedTargets);
        console.log("  [OK] Session key added");
        console.log("");

        vm.stopBroadcast();

        console.log("========================================================");
        console.log("DEPLOYMENT COMPLETE - STATE IS PERSISTENT!");
        console.log("========================================================\n");

        console.log("Deployed Addresses:");
        console.log("  Factory:       ", address(factory));
        console.log("  Smart Account: ", address(smartAccount));
        console.log("  Switcher:      ", address(switcher));
        console.log("  Paymaster:     ", address(paymaster));
        console.log("");

        console.log("Save these addresses:");
        console.log("  export SMART_ACCOUNT=", address(smartAccount));
        console.log("  export SWITCHER=", address(switcher));
        console.log("  export PAYMASTER=", address(paymaster));
        console.log("");

        console.log("Verify deployment (contracts persist on fork):");
        console.log("  cast code", address(smartAccount), "--rpc-url http://127.0.0.1:8545");
        console.log("");

        console.log("Next: Run backend automation script");
        console.log("========================================================\n");
    }
}
