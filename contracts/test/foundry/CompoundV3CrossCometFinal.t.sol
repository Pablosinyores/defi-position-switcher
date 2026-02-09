// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "forge-std/Test.sol";
import "forge-std/console.sol";
import "../../src/CompoundV3CrossCometSwitcher.sol";

interface IERC20Extended {
    function balanceOf(address) external view returns (uint256);
    function approve(address, uint256) external returns (bool);
}

interface ICometTest {
    function supply(address asset, uint amount) external;
    function withdraw(address asset, uint amount) external;
    function borrowBalanceOf(address account) external view returns (uint256);
    function collateralBalanceOf(address account, address asset) external view returns (uint128);
    function allow(address manager, bool isAllowed) external;
}

interface IWETH {
    function deposit() external payable;
}

/**
 * @title CompoundV3CrossCometFinalTest
 * @notice Complete end-to-end test with detailed step-by-step verification
 */
contract CompoundV3CrossCometFinalTest is Test {
    CompoundV3CrossCometSwitcher public switcher;

    address constant USDC_COMET = 0xAec1F48e02Cfb822Be958B68C7957156EB3F0b6e;
    address constant WETH_COMET = 0x2943ac1216979aD8dB76D9147F64E61adc126e96;
    address constant FLASH_POOL = 0xD7822b5A41c3655c6C403167F6B8Aa1533620329;
    address constant SWAP_POOL = 0xD7822b5A41c3655c6C403167F6B8Aa1533620329;
    address constant COMPOUND_WETH = 0x2D5ee574e710219a521449679A4A7f2B43f046ad;
    address constant COMPOUND_USDC = 0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238;

    address user;
    address lp;

    function setUp() public {
        console.log("\n========================================================");
        console.log("COMPOUND V3 CROSS-COMET SWITCH - COMPLETE E2E TEST");
        console.log("========================================================\n");

        user = makeAddr("user");
        lp = makeAddr("lp");
        vm.deal(user, 100 ether);
        vm.deal(lp, 100 ether);

        switcher = new CompoundV3CrossCometSwitcher(FLASH_POOL, SWAP_POOL);
        switcher.authorizeCaller(user, true);

        console.log("Setup:");
        console.log("  Switcher:", address(switcher));
        console.log("  User:", user);
        console.log("  LP:", lp);
        console.log("");
    }

    function testCompleteCrossCometSwitch() public {
        console.log("========================================================");
        console.log("STEP 1: TOKEN ACQUISITION & LIQUIDITY");
        console.log("========================================================\n");

        // User gets WETH
        vm.startPrank(user);
        IWETH(COMPOUND_WETH).deposit{value: 10 ether}();
        uint256 userWeth = IERC20Extended(COMPOUND_WETH).balanceOf(user);
        console.log("[STEP 1.1] User wrapped ETH to WETH");
        console.log("  Amount:", userWeth / 1e18, "WETH");
        console.log("  Status: OK\n");
        vm.stopPrank();

        // LP gets tokens
        vm.startPrank(lp);
        IWETH(COMPOUND_WETH).deposit{value: 50 ether}();
        deal(COMPOUND_USDC, lp, 100000 * 10**6);
        console.log("[STEP 1.2] LP acquired tokens");
        console.log("  WETH:", IERC20Extended(COMPOUND_WETH).balanceOf(lp) / 1e18);
        console.log("  USDC:", IERC20Extended(COMPOUND_USDC).balanceOf(lp) / 10**6);
        console.log("  Status: OK\n");

        // LP supplies to USDC Comet
        console.log("[STEP 1.3] LP supplying liquidity to USDC Comet");
        IERC20Extended(COMPOUND_USDC).approve(USDC_COMET, 50000 * 10**6);
        ICometTest(USDC_COMET).supply(COMPOUND_USDC, 50000 * 10**6);
        console.log("  Amount: 50,000 USDC");
        console.log("  Status: SUCCESS\n");

        // LP supplies to WETH Comet
        console.log("[STEP 1.4] LP supplying liquidity to WETH Comet");
        IERC20Extended(COMPOUND_WETH).approve(WETH_COMET, 25 ether);
        ICometTest(WETH_COMET).supply(COMPOUND_WETH, 25 ether);
        console.log("  Amount: 25 WETH");
        console.log("  Status: SUCCESS\n");
        vm.stopPrank();

        console.log("========================================================");
        console.log("STEP 2: CREATE INITIAL POSITION IN USDC COMET");
        console.log("========================================================\n");

        vm.startPrank(user);

        console.log("[STEP 2.1] Supplying WETH collateral to USDC Comet");
        IERC20Extended(COMPOUND_WETH).approve(USDC_COMET, 5 ether);
        ICometTest(USDC_COMET).supply(COMPOUND_WETH, 5 ether);

        uint128 initialCollateral = ICometTest(USDC_COMET).collateralBalanceOf(user, COMPOUND_WETH);
        console.log("  Collateral supplied:", initialCollateral / 1e18, "WETH");
        console.log("  Status: SUCCESS\n");

        console.log("[STEP 2.2] Borrowing USDC from USDC Comet");
        ICometTest(USDC_COMET).withdraw(COMPOUND_USDC, 2000 * 10**6);

        uint256 initialDebt = ICometTest(USDC_COMET).borrowBalanceOf(user);
        console.log("  Debt borrowed:", initialDebt / 10**6, "USDC");
        console.log("  Status: SUCCESS\n");

        console.log("INITIAL POSITION SUMMARY:");
        console.log("  Location: USDC Comet");
        console.log("  Collateral: 5 WETH");
        console.log("  Debt:", initialDebt / 10**6, "USDC");
        console.log("");

        console.log("========================================================");
        console.log("STEP 3: AUTHORIZE SWITCHER CONTRACT");
        console.log("========================================================\n");

        console.log("[STEP 3.1] Authorizing switcher in USDC Comet");
        ICometTest(USDC_COMET).allow(address(switcher), true);
        console.log("  Status: AUTHORIZED\n");

        console.log("[STEP 3.2] Authorizing switcher in WETH Comet");
        ICometTest(WETH_COMET).allow(address(switcher), true);
        console.log("  Status: AUTHORIZED\n");

        console.log("========================================================");
        console.log("STEP 4: EXECUTE CROSS-COMET SWITCH");
        console.log("========================================================\n");

        console.log("Initiating cross-Comet collateral switch...");
        console.log("  Source: USDC Comet");
        console.log("  Target: WETH Comet");
        console.log("  Collateral: 5 WETH");
        console.log("  Flash loan: ~2000 USDC");
        console.log("  Slippage: 5%\n");

        uint256 borrowAmount = 1 ether; // Borrow 1 WETH (estimated to cover ~2000 USDC)
        uint256 minOutput = (initialDebt * 9500) / 10000;

        console.log("Calling switchCollateral()...\n");

        bool switchSuccess = false;
        string memory failureReason = "";

        try switcher.switchCollateral(
            user,
            USDC_COMET,
            WETH_COMET,
            COMPOUND_WETH,
            initialCollateral,
            borrowAmount,
            minOutput
        ) {
            switchSuccess = true;
            console.log("  [SWITCH] Status: SUCCESS!");
            console.log("  [SWITCH] All operations completed atomically\n");
        } catch Error(string memory reason) {
            failureReason = reason;
            console.log("  [SWITCH] Status: FAILED");
            console.log("  [SWITCH] Reason:", reason);
            console.log("");
        } catch (bytes memory err) {
            console.log("  [SWITCH] Status: FAILED (low-level error)");
            console.logBytes(err);
            console.log("");
        }

        vm.stopPrank();

        console.log("========================================================");
        console.log("STEP 5: VERIFY FINAL STATE");
        console.log("========================================================\n");

        // Check source Comet
        uint128 sourceCollateral = ICometTest(USDC_COMET).collateralBalanceOf(user, COMPOUND_WETH);
        uint256 sourceDebt = ICometTest(USDC_COMET).borrowBalanceOf(user);

        console.log("[VERIFICATION 5.1] USDC Comet (source):");
        console.log("  Collateral:", sourceCollateral / 1e18, "WETH");
        console.log("  Debt:", sourceDebt / 10**6, "USDC");

        if (sourceCollateral == 0 && sourceDebt == 0) {
            console.log("  Status: CLEARED (expected)\n");
        } else {
            console.log("  Status: NOT CLEARED (unexpected!)\n");
        }

        // Check target Comet
        uint128 targetCollateral = ICometTest(WETH_COMET).collateralBalanceOf(user, COMPOUND_WETH);
        uint256 targetDebt = ICometTest(WETH_COMET).borrowBalanceOf(user);

        console.log("[VERIFICATION 5.2] WETH Comet (target):");
        console.log("  Collateral:", targetCollateral / 1e18, "WETH");
        console.log("  Debt:", targetDebt / 1e18, "WETH");

        if (targetCollateral > 0 && targetDebt > 0) {
            console.log("  Status: POSITION CREATED (expected)\n");
        } else {
            console.log("  Status: NO POSITION (unexpected!)\n");
        }

        console.log("========================================================");
        console.log("FINAL RESULT");
        console.log("========================================================\n");

        if (switchSuccess) {
            console.log("RESULT: COMPLETE SUCCESS!");
            console.log("");
            console.log("What happened:");
            console.log("  1. Flash loaned ~2000 USDC from Uniswap V3");
            console.log("  2. Repaid USDC debt in USDC Comet");
            console.log("  3. Withdrew 5 WETH collateral from USDC Comet");
            console.log("  4. Supplied 5 WETH collateral to WETH Comet");
            console.log("  5. Borrowed WETH from WETH Comet");
            console.log("  6. Swapped WETH -> USDC on Uniswap V3");
            console.log("  7. Repaid USDC flash loan");
            console.log("");
            console.log("Position successfully moved:");
            console.log("  From: USDC Comet (5 WETH collateral, ~2000 USDC debt)");
            console.log("  To:   WETH Comet (5 WETH collateral,", targetDebt / 1e18, "WETH debt)");
            console.log("");
            console.log("All operations executed atomically on-chain!");

            // Assertions
            assertTrue(sourceCollateral == 0, "Source should have no collateral");
            assertTrue(sourceDebt == 0, "Source should have no debt");
            assertTrue(targetCollateral > 0, "Target should have collateral");
            assertTrue(targetDebt > 0, "Target should have debt");

        } else {
            console.log("RESULT: SWITCH FAILED");
            console.log("");
            console.log("Reason:", failureReason);
            console.log("");
            console.log("This means one of the following failed:");
            console.log("  - Flash loan initiation");
            console.log("  - Debt repayment in source Comet");
            console.log("  - Collateral withdrawal from source Comet");
            console.log("  - Collateral supply to target Comet");
            console.log("  - Borrowing from target Comet");
            console.log("  - WETH -> USDC swap");
            console.log("  - Flash loan repayment");
            console.log("");
            console.log("Debug: Check the error message above for specifics");

            revert(string(abi.encodePacked("Cross-comet switch failed: ", failureReason)));
        }

        console.log("\n========================================================\n");
    }
}
