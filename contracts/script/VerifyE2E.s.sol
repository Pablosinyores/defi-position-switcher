// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "forge-std/Script.sol";
import "forge-std/console.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../src/SimpleSmartAccount.sol";
import "../src/CompoundV3CrossCometSwitcher.sol";

/**
 * @title VerifyE2E
 * @notice Complete E2E verification with gas tracking
 */
contract VerifyE2E is Script {
    address constant WBTC = 0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599;
    address constant USDC = 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48;
    address constant USDC_COMET = 0xc3d688B66703497DAA19211EEdff47f25384cdc3;
    address constant WETH_COMET = 0xA17581A9E3356d9A858b789D68B4d866e593aE94;
    address constant WBTC_WHALE = 0x5Ee5bf7ae06D1Be5997A1A72006FE6C607eC6DE8;

    function run() external {
        // Get deployed addresses
        address SMART_ACCOUNT = 0x3D5DC5B72FCB34595b6882890e5a87D8C0FFF5D2;
        address SWITCHER = 0x9ABa4668d35e460beB6c1A92911A27BBfE76325B;

        uint256 userKey = 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;
        address userEOA = vm.addr(userKey);

        uint256 backendKey = 0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d;
        address backend = vm.addr(backendKey);

        SimpleSmartAccount smartAccount = SimpleSmartAccount(payable(SMART_ACCOUNT));
        CompoundV3CrossCometSwitcher switcher = CompoundV3CrossCometSwitcher(SWITCHER);

        console.log("\n========================================================");
        console.log("E2E VERIFICATION - PERSISTENT DEPLOYMENT");
        console.log("========================================================\n");
        console.log("User EOA:", userEOA);
        console.log("Backend:", backend);
        console.log("Smart Account:", address(smartAccount));
        console.log("Switcher:", address(switcher));
        console.log("");

        // Track balances
        uint256 userStartBalance = userEOA.balance;
        uint256 backendStartBalance = backend.balance;

        console.log("Starting Balances:");
        console.log("  User EOA:", userStartBalance / 1e18, "ETH");
        console.log("  Backend:", backendStartBalance / 1e18, "ETH");
        console.log("");

        console.log("========================================================");
        console.log("STEP 1: VERIFY DEPLOYMENT");
        console.log("========================================================\n");

        address owner = smartAccount.owner();
        console.log("[CHECK] Smart Account Owner:", owner);
        require(owner == userEOA, "Owner mismatch!");
        console.log("        [OK] Owner is User EOA");
        console.log("");

        console.log("========================================================");
        console.log("STEP 2: VERIFY SESSION KEY");
        console.log("========================================================\n");

        (bool isActive, uint48 validUntil, uint48 validAfter, address[] memory targets) = smartAccount.getSessionKeyInfo(backend);
        console.log("[CHECK] Backend Session Key:");
        console.log("        Active:", isActive ? "YES" : "NO");
        console.log("        Valid Until:", validUntil);
        console.log("        Allowed Targets:", targets.length);
        require(isActive, "Session key not active!");
        console.log("        [OK] Session key is active");
        console.log("");

        console.log("========================================================");
        console.log("STEP 3: FUND USER EOA WITH WBTC");
        console.log("========================================================\n");

        // Use whale to fund user (simulating user already has WBTC)
        vm.prank(WBTC_WHALE);
        IERC20(WBTC).transfer(userEOA, 1 * 10**8);

        uint256 userWBTC = IERC20(WBTC).balanceOf(userEOA);
        console.log("[ACTION] Transferred 1 WBTC to user");
        console.log("         User WBTC Balance:", userWBTC / 10**8, "WBTC");
        console.log("         [OK] User has collateral");
        console.log("");

        console.log("========================================================");
        console.log("STEP 4: USER APPROVES SMART ACCOUNT");
        console.log("Gas Paid By: USER EOA");
        console.log("========================================================\n");

        vm.startBroadcast(userKey);
        IERC20(WBTC).approve(address(smartAccount), type(uint256).max);
        vm.stopBroadcast();

        uint256 allowance = IERC20(WBTC).allowance(userEOA, address(smartAccount));
        console.log("[TXN 1] User approves smart account");
        console.log("        Allowance:", allowance > 1e30 ? "INFINITE" : "LIMITED");
        console.log("        [OK] Approval successful");
        console.log("        [GAS] Gas paid by: USER EOA");
        console.log("");

        uint256 userAfterApproval = userEOA.balance;
        console.log("        User ETH after approval:", userAfterApproval / 1e18, "ETH");
        console.log("        Gas cost:", (userStartBalance - userAfterApproval) / 1e15, "finney");
        console.log("");

        console.log("========================================================");
        console.log("STEP 5-12: BACKEND AUTOMATION (8 TRANSACTIONS)");
        console.log("Gas Paid By: BACKEND (via session key)");
        console.log("========================================================\n");

        vm.startBroadcast(backendKey);

        // Transaction 1: Transfer WBTC
        console.log("[TXN 2] Backend: Transfer WBTC from user to smart account");
        bytes memory transferData = abi.encodeWithSelector(
            IERC20.transferFrom.selector,
            userEOA,
            address(smartAccount),
            1 * 10**8
        );
        smartAccount.execute(WBTC, 0, transferData);
        console.log("        [OK] Transferred");
        console.log("        [GAS] Gas paid by: BACKEND");
        console.log("");

        // Transaction 2: Approve for Comet
        console.log("[TXN 3] Backend: Approve WBTC for USDC Comet");
        bytes memory approveData = abi.encodeWithSelector(
            IERC20.approve.selector,
            USDC_COMET,
            1 * 10**8
        );
        smartAccount.execute(WBTC, 0, approveData);
        console.log("        [OK] Approved");
        console.log("        [GAS] Gas paid by: BACKEND");
        console.log("");

        // Transaction 3: Supply
        console.log("[TXN 4] Backend: Supply 1 WBTC to USDC Comet");
        bytes memory supplyData = abi.encodeWithSignature(
            "supply(address,uint256)",
            WBTC,
            1 * 10**8
        );
        smartAccount.execute(USDC_COMET, 0, supplyData);

        IComet usdcComet = IComet(USDC_COMET);
        uint128 supplied = usdcComet.collateralBalanceOf(address(smartAccount), WBTC);
        console.log("        Supplied:", supplied / 10**8, "WBTC");
        console.log("        [OK] Supply successful");
        console.log("        [GAS] Gas paid by: BACKEND");
        console.log("");

        // Transaction 4: Borrow
        console.log("[TXN 5] Backend: Borrow 40,000 USDC");
        bytes memory borrowData = abi.encodeWithSignature(
            "withdraw(address,uint256)",
            USDC,
            40000 * 10**6
        );
        smartAccount.execute(USDC_COMET, 0, borrowData);

        uint256 debt = usdcComet.borrowBalanceOf(address(smartAccount));
        console.log("        Borrowed:", debt / 10**6, "USDC");
        console.log("        [OK] Borrow successful");
        console.log("        [GAS] Gas paid by: BACKEND");
        console.log("");

        // Transaction 5-6: Authorize switcher
        console.log("[TXN 6] Backend: Authorize switcher in USDC Comet");
        bytes memory allowUSDC = abi.encodeWithSignature(
            "allow(address,bool)",
            address(switcher),
            true
        );
        smartAccount.execute(USDC_COMET, 0, allowUSDC);
        console.log("        [OK] Authorized");
        console.log("        [GAS] Gas paid by: BACKEND");
        console.log("");

        console.log("[TXN 7] Backend: Authorize switcher in WETH Comet");
        bytes memory allowWETH = abi.encodeWithSignature(
            "allow(address,bool)",
            address(switcher),
            true
        );
        smartAccount.execute(WETH_COMET, 0, allowWETH);
        console.log("        [OK] Authorized");
        console.log("        [GAS] Gas paid by: BACKEND");
        console.log("");

        // Transaction 7-8: Execute switch
        console.log("[TXN 8-9] Backend: Execute cross-Comet switch");
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
        console.log("        [OK] Switch executed");
        console.log("        [GAS] Gas paid by: BACKEND");
        console.log("");

        vm.stopBroadcast();

        console.log("========================================================");
        console.log("STEP 13: VERIFY FINAL STATE");
        console.log("========================================================\n");

        // Check source cleared
        uint128 sourceCollateral = usdcComet.collateralBalanceOf(address(smartAccount), WBTC);
        uint256 sourceDebt = usdcComet.borrowBalanceOf(address(smartAccount));

        console.log("USDC Comet (source):");
        console.log("  Collateral:", sourceCollateral, "WBTC");
        console.log("  Debt:", sourceDebt / 10**6, "USDC");
        console.log("  Status:", sourceCollateral == 0 && sourceDebt == 0 ? "[OK] CLEARED" : "[FAIL] NOT CLEARED");
        require(sourceCollateral == 0 && sourceDebt == 0, "Source not cleared!");
        console.log("");

        // Check target created
        IComet wethComet = IComet(WETH_COMET);
        uint128 targetCollateral = wethComet.collateralBalanceOf(address(smartAccount), WBTC);
        uint256 targetDebt = wethComet.borrowBalanceOf(address(smartAccount));

        console.log("WETH Comet (target):");
        console.log("  Collateral:", targetCollateral / 10**8, "WBTC");
        console.log("  Debt:", targetDebt / 1e18, "WETH");
        console.log("  Status:", targetCollateral > 0 && targetDebt > 0 ? "[OK] CREATED" : "[FAIL] NOT CREATED");
        require(targetCollateral > 0 && targetDebt > 0, "Target not created!");
        console.log("");

        console.log("========================================================");
        console.log("GAS COST BREAKDOWN");
        console.log("========================================================\n");

        uint256 userFinalBalance = userEOA.balance;
        uint256 backendFinalBalance = backend.balance;

        uint256 userGasCost = userStartBalance - userFinalBalance;
        uint256 backendGasCost = backendStartBalance - backendFinalBalance;

        console.log("User EOA:");
        console.log("  Starting:", userStartBalance / 1e18, "ETH");
        console.log("  Ending:", userFinalBalance / 1e18, "ETH");
        console.log("  Gas Paid:", userGasCost / 1e15, "finney");
        console.log("  Transactions: 1 (approval only)");
        console.log("");

        console.log("Backend:");
        console.log("  Starting:", backendStartBalance / 1e18, "ETH");
        console.log("  Ending:", backendFinalBalance / 1e18, "ETH");
        console.log("  Gas Paid:", backendGasCost / 1e15, "finney");
        console.log("  Transactions: 8 (all automation)");
        console.log("");

        console.log("========================================================");
        console.log("[OK] E2E VERIFICATION COMPLETE - ALL CHECKS PASSED!");
        console.log("========================================================\n");

        console.log("Summary:");
        console.log("  [OK] Smart account deployed");
        console.log("  [OK] Session key registered");
        console.log("  [OK] User approved smart account");
        console.log("  [OK] Backend transferred assets");
        console.log("  [OK] Position created in USDC Comet");
        console.log("  [OK] Position switched to WETH Comet");
        console.log("  [OK] All state persists on fork");
        console.log("");

        console.log("Gas Responsibility:");
        console.log("  User:    1 txn  (approval)");
        console.log("  Backend: 8 txns (automation)");
        console.log("  Total:   9 txns");
        console.log("");
    }
}
