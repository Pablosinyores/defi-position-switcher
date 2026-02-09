// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "forge-std/Test.sol";
import "forge-std/console.sol";
import "../../src/CompoundV3CrossCometSwitcher.sol";

interface IERC20Extended {
    function balanceOf(address) external view returns (uint256);
    function approve(address, uint256) external returns (bool);
    function symbol() external view returns (string memory);
}

interface ICometTest {
    function supply(address asset, uint amount) external;
    function withdraw(address asset, uint amount) external;
    function supplyTo(address dst, address asset, uint amount) external;
    function withdrawFrom(address src, address dst, address asset, uint amount) external;
    function baseToken() external view returns (address);
    function borrowBalanceOf(address account) external view returns (uint256);
    function collateralBalanceOf(address account, address asset) external view returns (uint128);
    function allow(address manager, bool isAllowed) external;
}

interface IWETH {
    function deposit() external payable;
}

contract CompoundV3CrossCometE2ETest is Test {
    CompoundV3CrossCometSwitcher public switcher;

    // Sepolia addresses
    address constant USDC_COMET = 0xAec1F48e02Cfb822Be958B68C7957156EB3F0b6e;
    address constant WETH_COMET = 0x2943ac1216979aD8dB76D9147F64E61adc126e96;
    address constant FLASH_LOAN_POOL = 0xD7822b5A41c3655c6C403167F6B8Aa1533620329;
    address constant SWAP_POOL = 0xD7822b5A41c3655c6C403167F6B8Aa1533620329; // Same pool

    // Compound's tokens
    address constant COMPOUND_WETH = 0x2D5ee574e710219a521449679A4A7f2B43f046ad;
    address constant COMPOUND_USDC = 0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238;

    address user;
    address lp;

    function setUp() public {
        console.log("\n========================================================");
        console.log("  COMPOUND V3 CROSS-COMET SWITCH - E2E TEST");
        console.log("========================================================\n");

        user = makeAddr("user");
        lp = makeAddr("liquidityProvider");

        vm.deal(user, 100 ether);
        vm.deal(lp, 100 ether);

        // Deploy switcher
        switcher = new CompoundV3CrossCometSwitcher(FLASH_LOAN_POOL, SWAP_POOL);
        switcher.authorizeCaller(user, true);

        console.log("Contract Deployed:");
        console.log("  Switcher:", address(switcher));
        console.log("  User:", user);
        console.log("  LP:", lp);
        console.log("");
    }

    function testCrossCometSwitch() public {
        console.log("========================================================");
        console.log("PHASE 1: TOKEN ACQUISITION");
        console.log("========================================================\n");

        // Get WETH for user
        vm.startPrank(user);
        IWETH(COMPOUND_WETH).deposit{value: 10 ether}();
        uint256 userWethBalance = IERC20Extended(COMPOUND_WETH).balanceOf(user);
        console.log("User WETH Balance:", userWethBalance / 1e18, "WETH");
        require(userWethBalance > 0, "User WETH acquisition failed");
        console.log("  Status: OK\n");
        vm.stopPrank();

        // Get tokens for LP
        vm.startPrank(lp);
        IWETH(COMPOUND_WETH).deposit{value: 50 ether}();
        deal(COMPOUND_USDC, lp, 100000 * 10**6);
        uint256 lpWeth = IERC20Extended(COMPOUND_WETH).balanceOf(lp);
        uint256 lpUsdc = IERC20Extended(COMPOUND_USDC).balanceOf(lp);
        console.log("LP WETH Balance:", lpWeth / 1e18, "WETH");
        console.log("LP USDC Balance:", lpUsdc / 10**6, "USDC");
        require(lpWeth > 0 && lpUsdc > 0, "LP token acquisition failed");
        console.log("  Status: OK\n");
        vm.stopPrank();

        console.log("========================================================");
        console.log("PHASE 2: PROVIDE LIQUIDITY TO USDC COMET");
        console.log("========================================================\n");

        vm.startPrank(lp);
        console.log("Supplying 50,000 USDC to USDC Comet...");
        IERC20Extended(COMPOUND_USDC).approve(USDC_COMET, 50000 * 10**6);
        ICometTest(USDC_COMET).supply(COMPOUND_USDC, 50000 * 10**6);
        console.log("  Status: SUCCESS");
        console.log("  Amount: 50,000 USDC\n");
        vm.stopPrank();

        console.log("========================================================");
        console.log("PHASE 3: CREATE USER POSITION IN USDC COMET");
        console.log("========================================================\n");

        vm.startPrank(user);

        console.log("Step 3.1: Supplying 5 WETH collateral to USDC Comet...");
        IERC20Extended(COMPOUND_WETH).approve(USDC_COMET, 5 ether);
        ICometTest(USDC_COMET).supply(COMPOUND_WETH, 5 ether);
        console.log("  Status: SUCCESS");
        console.log("  Amount: 5 WETH\n");

        uint128 collateralBalance = ICometTest(USDC_COMET).collateralBalanceOf(user, COMPOUND_WETH);
        console.log("Step 3.2: Verify collateral...");
        console.log("  Collateral Balance:", collateralBalance / 1e18, "WETH");
        require(collateralBalance > 0, "Collateral not registered");
        console.log("  Status: OK\n");

        console.log("Step 3.3: Borrowing 2,000 USDC from USDC Comet...");
        ICometTest(USDC_COMET).withdraw(COMPOUND_USDC, 2000 * 10**6);
        console.log("  Status: SUCCESS");
        console.log("  Amount: 2,000 USDC\n");

        uint256 userDebt = ICometTest(USDC_COMET).borrowBalanceOf(user);
        console.log("Step 3.4: Verify debt...");
        console.log("  Debt Balance:", userDebt / 10**6, "USDC");
        require(userDebt > 0, "Debt not registered");
        console.log("  Status: OK\n");

        console.log("INITIAL POSITION (USDC COMET):");
        console.log("  Collateral: 5 WETH");
        console.log("  Debt:", userDebt / 10**6, "USDC");
        console.log("");

        vm.stopPrank();

        console.log("========================================================");
        console.log("PHASE 4: PROVIDE LIQUIDITY TO WETH COMET");
        console.log("========================================================\n");

        vm.startPrank(lp);
        console.log("Supplying 25 WETH to WETH Comet...");
        IERC20Extended(COMPOUND_WETH).approve(WETH_COMET, 25 ether);
        ICometTest(WETH_COMET).supply(COMPOUND_WETH, 25 ether);
        console.log("  Status: SUCCESS");
        console.log("  Amount: 25 WETH\n");
        vm.stopPrank();

        console.log("========================================================");
        console.log("PHASE 5: AUTHORIZE SWITCHER");
        console.log("========================================================\n");

        vm.startPrank(user);
        console.log("Authorizing switcher to manage positions...");
        ICometTest(USDC_COMET).allow(address(switcher), true);
        ICometTest(WETH_COMET).allow(address(switcher), true);
        console.log("  Status: SUCCESS - Switcher authorized\n");

        console.log("========================================================");
        console.log("PHASE 6: EXECUTE CROSS-COMET SWITCH");
        console.log("========================================================\n");

        console.log("Switching position from USDC Comet to WETH Comet...");
        console.log("  Source: USDC Comet (borrowing USDC)");
        console.log("  Target: WETH Comet (will borrow WETH)");
        console.log("  Collateral: 5 WETH");
        console.log("  Min Output: 95% of flash loan amount\n");

        uint256 borrowAmount = userDebt * 11 / 10; // Borrow 110% to cover swap slippage
        uint256 minOutput = (userDebt * 9500) / 10000; // Accept 5% slippage

        try switcher.switchCollateral(
            user,
            USDC_COMET,
            WETH_COMET,
            COMPOUND_WETH,
            collateralBalance,
            borrowAmount,
            minOutput
        ) {
            console.log("  Status: SUCCESS!!!");
            console.log("  CROSS-COMET SWITCH COMPLETED!\n");

            console.log("========================================================");
            console.log("PHASE 7: VERIFY FINAL STATE");
            console.log("========================================================\n");

            // Check source Comet (should be empty)
            uint128 sourceCollateral = ICometTest(USDC_COMET).collateralBalanceOf(user, COMPOUND_WETH);
            uint256 sourceDebt = ICometTest(USDC_COMET).borrowBalanceOf(user);

            console.log("USDC Comet (Source - should be empty):");
            console.log("  Collateral:", sourceCollateral / 1e18, "WETH");
            console.log("  Debt:", sourceDebt / 10**6, "USDC");

            if (sourceCollateral == 0 && sourceDebt == 0) {
                console.log("  Status: CLEARED (as expected)\n");
            } else {
                console.log("  Status: WARNING - Not fully cleared\n");
            }

            // Check target Comet (should have position)
            uint128 targetCollateral = ICometTest(WETH_COMET).collateralBalanceOf(user, COMPOUND_WETH);
            uint256 targetDebt = ICometTest(WETH_COMET).borrowBalanceOf(user);

            console.log("WETH Comet (Target - should have position):");
            console.log("  Collateral:", targetCollateral / 1e18, "WETH");
            console.log("  Debt:", targetDebt / 1e18, "WETH");

            if (targetCollateral > 0) {
                console.log("  Status: POSITION CREATED!\n");
            } else {
                console.log("  Status: ERROR - No position found\n");
                revert("Position not created in target Comet");
            }

            console.log("========================================================");
            console.log("FINAL RESULT - SUCCESS!");
            console.log("========================================================\n");

            assertTrue(sourceCollateral == 0, "Source should have no collateral");
            assertTrue(sourceDebt == 0, "Source should have no debt");
            assertTrue(targetCollateral > 0, "Target should have collateral");
            assertTrue(targetDebt > 0, "Target should have debt");

            console.log("SUMMARY:");
            console.log("  - Moved 5 WETH collateral from USDC Comet to WETH Comet");
            console.log("  - Closed USDC debt position (~2,000 USDC)");
            console.log("  - Opened new WETH debt position (~", targetDebt / 1e18, "WETH)");
            console.log("  - All operations executed atomically");
            console.log("  - Used flash loans for zero-capital switching");
            console.log("  - Swapped WETH <-> USDC on Uniswap V3");
            console.log("");
            console.log("RESULT: Position successfully switched between isolated markets!");
            console.log("");

        } catch Error(string memory reason) {
            console.log("  Status: FAILED -", reason);
            vm.stopPrank();
            revert(string(abi.encodePacked("Cross-comet switch failed: ", reason)));
        } catch (bytes memory err) {
            console.log("  Status: FAILED - Low-level error");
            console.logBytes(err);
            vm.stopPrank();
            revert("Cross-comet switch failed with low-level error");
        }

        vm.stopPrank();

        console.log("========================================================\n");
    }
}
