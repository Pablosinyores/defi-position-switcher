// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "forge-std/Test.sol";
import "forge-std/console.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../../src/CompoundV3CrossCometSwitcher.sol";

// Use IComet from the imported contract
// IERC20 is already imported from OpenZeppelin

/**
 * @title MainnetCrossCometE2ETest
 * @notice Complete end-to-end test of cross-Comet switching on Ethereum Mainnet fork
 * @dev This test uses REAL mainnet contracts and state
 */
contract MainnetCrossCometE2ETest is Test {
    CompoundV3CrossCometSwitcher public switcher;

    // Mainnet Compound V3 addresses
    address constant USDC_COMET = 0xc3d688B66703497DAA19211EEdff47f25384cdc3;
    address constant WETH_COMET = 0xA17581A9E3356d9A858b789D68B4d866e593aE94;

    // Mainnet token addresses
    address constant USDC = 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48;
    address constant WETH = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;
    address constant WBTC = 0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599;

    // Uniswap V3 Pools - DIFFERENT fee tiers!
    address constant FLASH_POOL = 0x88e6A0c2dDD26FEEb64F039a2c41296FcB3f5640; // 0.05% fee
    address constant SWAP_POOL = 0x7BeA39867e4169DBe237d55C8242a8f2fcDcc387;  // 1% fee

    // Mainnet whale addresses for getting tokens
    address constant WETH_WHALE = 0x8EB8a3b98659Cce290402893d0123abb75E3ab28; // Avalanche Bridge
    address constant WBTC_WHALE = 0x5Ee5bf7ae06D1Be5997A1A72006FE6C607eC6DE8; // Binance 7
    address constant USDC_WHALE = 0x47ac0Fb4F2D84898e4D9E7b4DaB3C24507a6D503; // Binance

    address user;

    function setUp() public {
        user = makeAddr("user");

        console.log("\n========================================================");
        console.log("MAINNET FORK: CROSS-COMET SWITCHING E2E TEST");
        console.log("========================================================\n");
        console.log("Network: Ethereum Mainnet Fork");
        console.log("Block:", block.number);
        console.log("User:", user);
        console.log("");
    }

    function testCrossCometSwitchMainnet() public {
        console.log("========================================================");
        console.log("STEP 1: DEPLOY SWITCHER CONTRACT");
        console.log("========================================================\n");

        switcher = new CompoundV3CrossCometSwitcher(FLASH_POOL, SWAP_POOL);
        console.log("Switcher deployed:", address(switcher));
        console.log("Flash loan pool (0.05%):", FLASH_POOL);
        console.log("Swap pool (1%):", SWAP_POOL);
        console.log("Status: Different pools - NO REENTRANCY!");
        console.log("");

        // Authorize user to call the switcher
        switcher.authorizeCaller(user, true);
        console.log("User authorized to call switcher");
        console.log("");

        console.log("========================================================");
        console.log("STEP 2: ACQUIRE TOKENS FOR USER");
        console.log("========================================================\n");

        // Get WBTC from whale
        vm.prank(WBTC_WHALE);
        IERC20(WBTC).transfer(user, 1 * 10**8); // 1 WBTC (8 decimals)

        uint256 userWbtc = IERC20(WBTC).balanceOf(user);
        console.log("User acquired:", userWbtc / 10**8, "WBTC");
        console.log("Source: Mainnet whale");
        console.log("");

        console.log("========================================================");
        console.log("STEP 3: CREATE POSITION IN USDC COMET");
        console.log("========================================================\n");

        vm.startPrank(user);

        console.log("[3.1] Supplying WBTC collateral to USDC Comet...");
        IERC20(WBTC).approve(USDC_COMET, 1 * 10**8); // 1 WBTC
        IComet(USDC_COMET).supply(WBTC, 1 * 10**8);

        uint128 initialCollateral = IComet(USDC_COMET).collateralBalanceOf(user, WBTC);
        console.log("      Collateral supplied:", initialCollateral / 10**8, "WBTC");
        console.log("      Status: SUCCESS");
        console.log("");

        console.log("[3.2] Borrowing USDC from USDC Comet...");
        IComet(USDC_COMET).withdraw(USDC, 40000 * 10**6); // Borrow 40K USDC

        uint256 initialDebt = IComet(USDC_COMET).borrowBalanceOf(user);
        console.log("      Borrowed:", initialDebt / 10**6, "USDC");
        console.log("      Status: SUCCESS");
        console.log("");

        console.log("INITIAL POSITION:");
        console.log("  Location: USDC Comet");
        console.log("  Collateral: 1 WBTC");
        console.log("  Debt:", initialDebt / 10**6, "USDC");
        console.log("");

        console.log("========================================================");
        console.log("STEP 4: AUTHORIZE SWITCHER");
        console.log("========================================================\n");

        console.log("[4.1] Authorizing switcher in USDC Comet...");
        IComet(USDC_COMET).allow(address(switcher), true);
        console.log("      Status: AUTHORIZED");
        console.log("");

        console.log("[4.2] Authorizing switcher in WETH Comet...");
        IComet(WETH_COMET).allow(address(switcher), true);
        console.log("      Status: AUTHORIZED");
        console.log("");

        console.log("========================================================");
        console.log("STEP 5: EXECUTE CROSS-COMET SWITCH");
        console.log("========================================================\n");

        console.log("Switching from USDC Comet to WETH Comet...");
        console.log("  Source: USDC Comet (1 WBTC collateral,", initialDebt / 10**6, "USDC debt)");
        console.log("  Target: WETH Comet");
        console.log("  Flash loan: From 0.05% pool");
        console.log("  Swap: On 1% pool (DIFFERENT!)");
        console.log("  Slippage tolerance: 5%");
        console.log("");

        // Calculate borrow amount: Empirically 15 ETH → 28,829 USDC on 1% pool
        // Need 40,020 USDC (including flash fee), so: (40,020 / 28,829) * 15 = 20.82 ETH
        uint256 borrowAmount = 22 ether; // 22 ETH with buffer for safety
        uint256 minSwapOutput = (initialDebt * 95) / 100; // 95% of debt (5% slippage)

        console.log("  Borrow amount:", borrowAmount / 1e18, "WETH");
        console.log("  Min swap output:", minSwapOutput / 10**6, "USDC");
        console.log("");
        console.log("Calling switchCollateral()...");
        console.log("");

        switcher.switchCollateral(
            user,
            USDC_COMET,
            WETH_COMET,
            WBTC, // Use WBTC as collateral (accepted by both Comets)
            initialCollateral,
            borrowAmount,
            minSwapOutput
        );

        console.log("Switch completed successfully!");
        console.log("");

        vm.stopPrank();

        console.log("========================================================");
        console.log("STEP 6: VERIFY FINAL STATE");
        console.log("========================================================\n");

        // Check source Comet
        uint128 sourceCollateral = IComet(USDC_COMET).collateralBalanceOf(user, WBTC);
        uint256 sourceDebt = IComet(USDC_COMET).borrowBalanceOf(user);

        console.log("[6.1] USDC Comet (source) state:");
        console.log("      Collateral:", sourceCollateral, "WBTC");
        console.log("      Debt:", sourceDebt, "USDC");

        if (sourceCollateral == 0 && sourceDebt == 0) {
            console.log("      Status: CLEARED (as expected)");
        } else {
            console.log("      Status: ERROR - not cleared!");
        }
        console.log("");

        // Check target Comet
        uint128 targetCollateral = IComet(WETH_COMET).collateralBalanceOf(user, WBTC);
        uint256 targetDebt = IComet(WETH_COMET).borrowBalanceOf(user);

        console.log("[6.2] WETH Comet (target) state:");
        console.log("      Collateral:", targetCollateral / 10**8, "WBTC");
        console.log("      Debt:", targetDebt / 1e18, "WETH");

        if (targetCollateral > 0 && targetDebt > 0) {
            console.log("      Status: POSITION CREATED (as expected)");
        } else {
            console.log("      Status: ERROR - no position!");
        }
        console.log("");

        console.log("========================================================");
        console.log("FINAL RESULT");
        console.log("========================================================\n");

        console.log("SUCCESS! Cross-Comet switching works on mainnet!");
        console.log("");
        console.log("What happened:");
        console.log("  1. Flash loaned", initialDebt / 10**6, "USDC from 0.05% pool");
        console.log("  2. Repaid USDC debt in USDC Comet");
        console.log("  3. Withdrew 1 WBTC collateral from USDC Comet");
        console.log("  4. Supplied 1 WBTC to WETH Comet");
        console.log("  5. Borrowed", targetDebt / 1e18, "WETH from WETH Comet");
        console.log("  6. Swapped WETH -> USDC on 1% pool (different pool!)");
        console.log("  7. Repaid flash loan to 0.05% pool");
        console.log("");
        console.log("Position successfully moved:");
        console.log("  From: USDC Comet (USDC debt)");
        console.log("  To:   WETH Comet (WETH debt)");
        console.log("");
        console.log("Key: Different pools = NO reentrancy conflict!");
        console.log("");

        // Assertions
        assertEq(sourceCollateral, 0, "Source should have no collateral");
        assertEq(sourceDebt, 0, "Source should have no debt");
        assertTrue(targetCollateral > 0, "Target should have collateral");
        assertTrue(targetDebt > 0, "Target should have debt");

        console.log("All assertions passed!");
        console.log("\n========================================================\n");
    }

    function testVerifyPoolsAreDifferent() public {
        console.log("\n=== VERIFICATION: Pools Are Different ===\n");
        console.log("Flash loan pool:", FLASH_POOL);
        console.log("Swap pool:      ", SWAP_POOL);
        console.log("");
        console.log("Are they different?", FLASH_POOL != SWAP_POOL ? "YES" : "NO");
        console.log("");

        assertTrue(FLASH_POOL != SWAP_POOL, "Pools must be different");
    }
}
