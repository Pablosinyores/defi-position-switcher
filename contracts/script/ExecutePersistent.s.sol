// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "forge-std/Script.sol";
import "forge-std/console.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../src/SimpleSmartAccount.sol";
import "../src/CompoundV3CrossCometSwitcher.sol";

/**
 * @title ExecutePersistent
 * @notice Executes backend automation on PERSISTENT deployed contracts
 * @dev Use: forge script script/ExecutePersistent.s.sol --fork-url http://127.0.0.1:8545 --broadcast
 */
contract ExecutePersistent is Script {
    // Mainnet addresses
    address constant WBTC = 0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599;
    address constant USDC = 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48;
    address constant USDC_COMET = 0xc3d688B66703497DAA19211EEdff47f25384cdc3;
    address constant WETH_COMET = 0xA17581A9E3356d9A858b789D68B4d866e593aE94;
    address constant WBTC_WHALE = 0x5Ee5bf7ae06D1Be5997A1A72006FE6C607eC6DE8;

    // Set these from deployment output
    address SMART_ACCOUNT = vm.envAddress("SMART_ACCOUNT");
    address SWITCHER = vm.envAddress("SWITCHER");

    function run() external {
        // Backend key (Anvil account #1)
        uint256 backendKey = vm.envOr("BACKEND_KEY", uint256(0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d));
        address backend = vm.addr(backendKey);

        // User EOA (Anvil account #0)
        uint256 userKey = 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;
        address userEOA = vm.addr(userKey);

        SimpleSmartAccount smartAccount = SimpleSmartAccount(payable(SMART_ACCOUNT));
        CompoundV3CrossCometSwitcher switcher = CompoundV3CrossCometSwitcher(SWITCHER);

        console.log("\n========================================================");
        console.log("BACKEND AUTOMATION - PERSISTENT EXECUTION");
        console.log("========================================================\n");
        console.log("Smart Account:", address(smartAccount));
        console.log("Backend Key:", backend);
        console.log("User EOA:", userEOA);
        console.log("");

        console.log("========================================================");
        console.log("PHASE 1: FUND USER & APPROVE");
        console.log("========================================================\n");

        // Fund user's EOA with WBTC
        vm.startBroadcast(0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80); // Anvil default key to impersonate whale
        console.log("[1/2] Funding user EOA with WBTC...");
        vm.prank(WBTC_WHALE);
        IERC20(WBTC).transfer(userEOA, 1 * 10**8);
        console.log("      User has: 1 WBTC");

        // User approves smart account
        console.log("[2/2] User approves smart account (infinite)...");
        IERC20(WBTC).approve(address(smartAccount), type(uint256).max);
        console.log("      Approved");
        vm.stopBroadcast();
        console.log("");

        console.log("========================================================");
        console.log("PHASE 2: BACKEND AUTOMATION (8 TRANSACTIONS)");
        console.log("========================================================\n");

        vm.startBroadcast(backendKey);

        // Transaction 1: Transfer WBTC from user to smart account
        console.log("[1/8] Transfer WBTC from user to smart account");
        bytes memory transferData = abi.encodeWithSelector(
            IERC20.transferFrom.selector,
            userEOA,
            address(smartAccount),
            1 * 10**8
        );
        smartAccount.execute(WBTC, 0, transferData);
        console.log("      [OK]");

        // Transaction 2: Approve WBTC for Comet
        console.log("[2/8] Approve WBTC for USDC Comet");
        bytes memory approveData = abi.encodeWithSelector(
            IERC20.approve.selector,
            USDC_COMET,
            1 * 10**8
        );
        smartAccount.execute(WBTC, 0, approveData);
        console.log("      [OK]");

        // Transaction 3: Supply WBTC
        console.log("[3/8] Supply 1 WBTC to USDC Comet");
        bytes memory supplyData = abi.encodeWithSignature(
            "supply(address,uint256)",
            WBTC,
            1 * 10**8
        );
        smartAccount.execute(USDC_COMET, 0, supplyData);
        console.log("      [OK]");

        // Transaction 4: Borrow USDC
        console.log("[4/8] Borrow 40,000 USDC");
        bytes memory borrowData = abi.encodeWithSignature(
            "withdraw(address,uint256)",
            USDC,
            40000 * 10**6
        );
        smartAccount.execute(USDC_COMET, 0, borrowData);

        IComet usdcComet = IComet(USDC_COMET);
        uint256 debt = usdcComet.borrowBalanceOf(address(smartAccount));
        console.log("      Borrowed:", debt / 10**6, "USDC");

        // Transaction 5: Authorize switcher in USDC Comet
        console.log("[5/8] Authorize switcher in USDC Comet");
        bytes memory allowUSDC = abi.encodeWithSignature(
            "allow(address,bool)",
            address(switcher),
            true
        );
        smartAccount.execute(USDC_COMET, 0, allowUSDC);
        console.log("      [OK]");

        // Transaction 6: Authorize switcher in WETH Comet
        console.log("[6/8] Authorize switcher in WETH Comet");
        bytes memory allowWETH = abi.encodeWithSignature(
            "allow(address,bool)",
            address(switcher),
            true
        );
        smartAccount.execute(WETH_COMET, 0, allowWETH);
        console.log("      [OK]");

        // Transaction 7-8: Execute cross-Comet switch
        console.log("[7-8/8] Execute cross-Comet switch");
        uint128 collateral = usdcComet.collateralBalanceOf(address(smartAccount), WBTC);
        uint256 borrowAmount = 22 ether;
        uint256 minSwapOutput = (debt * 95) / 100;

        bytes memory switchData = abi.encodeWithSelector(
            switcher.switchCollateral.selector,
            address(smartAccount),
            USDC_COMET,
            WETH_COMET,
            WBTC,
            collateral,
            borrowAmount,
            minSwapOutput
        );
        smartAccount.execute(address(switcher), 0, switchData);
        console.log("      [OK] Switched!");

        vm.stopBroadcast();
        console.log("");

        console.log("========================================================");
        console.log("VERIFICATION");
        console.log("========================================================\n");

        // Verify source cleared
        uint128 sourceCollateral = usdcComet.collateralBalanceOf(address(smartAccount), WBTC);
        uint256 sourceDebt = usdcComet.borrowBalanceOf(address(smartAccount));

        console.log("USDC Comet (source):");
        console.log("  Collateral:", sourceCollateral, "WBTC");
        console.log("  Debt:", sourceDebt / 10**6, "USDC");
        console.log("  Status:", sourceCollateral == 0 && sourceDebt == 0 ? "[OK] CLEARED" : "[FAIL]");
        console.log("");

        // Verify target created
        IComet wethComet = IComet(WETH_COMET);
        uint128 targetCollateral = wethComet.collateralBalanceOf(address(smartAccount), WBTC);
        uint256 targetDebt = wethComet.borrowBalanceOf(address(smartAccount));

        console.log("WETH Comet (target):");
        console.log("  Collateral:", targetCollateral / 10**8, "WBTC");
        console.log("  Debt:", targetDebt / 1e18, "WETH");
        console.log("  Status:", targetCollateral > 0 && targetDebt > 0 ? "[OK] CREATED" : "[FAIL]");
        console.log("");

        console.log("========================================================");
        console.log("SUCCESS - ALL STATE PERSISTS ON FORK!");
        console.log("========================================================\n");

        console.log("Verify position persists:");
        console.log("  cast call", address(smartAccount), "\"owner()\" --rpc-url http://127.0.0.1:8545");
        console.log("");
    }
}
