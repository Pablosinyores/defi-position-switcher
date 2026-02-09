// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "forge-std/Test.sol";
import "forge-std/console.sol";

interface IERC20 {
    function balanceOf(address) external view returns (uint256);
    function approve(address, uint256) external returns (bool);
    function transfer(address, uint256) external returns (bool);
}

interface IComet {
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

interface IUniswapV3Pool {
    function flash(address recipient, uint256 amount0, uint256 amount1, bytes calldata data) external;
    function token0() external view returns (address);
    function token1() external view returns (address);
}

/**
 * @title SimpleCollateralSwitcher
 * @notice Simplified switcher for testing - same base token only
 */
contract SimpleCollateralSwitcher {
    address public immutable flashLoanPool;
    bool private inCallback;

    constructor(address _flashLoanPool) {
        flashLoanPool = _flashLoanPool;
    }

    function switchCollateral(
        address user,
        address comet,
        address fromCollateral,
        address toCollateral,
        uint256 fromAmount,
        uint256 toAmount
    ) external {
        address baseToken = IComet(comet).baseToken();
        uint256 userDebt = IComet(comet).borrowBalanceOf(user);

        require(userDebt > 0, "No debt");

        bytes memory data = abi.encode(user, comet, fromCollateral, toCollateral, fromAmount, toAmount, baseToken, userDebt);

        address token0 = IUniswapV3Pool(flashLoanPool).token0();
        address token1 = IUniswapV3Pool(flashLoanPool).token1();

        uint256 amount0 = (baseToken == token0) ? userDebt : 0;
        uint256 amount1 = (baseToken == token1) ? userDebt : 0;

        inCallback = true;
        IUniswapV3Pool(flashLoanPool).flash(address(this), amount0, amount1, data);
        inCallback = false;
    }

    function uniswapV3FlashCallback(uint256 fee0, uint256 fee1, bytes calldata data) external {
        require(msg.sender == flashLoanPool && inCallback, "Invalid callback");

        (address user, address comet, address fromCollateral, address toCollateral, uint256 fromAmount, uint256 toAmount, address baseToken, uint256 userDebt) =
            abi.decode(data, (address, address, address, address, uint256, uint256, address, uint256));

        uint256 totalRepayment = userDebt + fee0 + fee1;

        // 1. Repay debt
        IERC20(baseToken).approve(comet, userDebt);
        IComet(comet).supplyTo(user, baseToken, userDebt);

        // 2. Withdraw old collateral
        IComet(comet).withdrawFrom(user, address(this), fromCollateral, fromAmount);

        // 3. Supply new collateral
        IERC20(toCollateral).approve(comet, toAmount);
        IComet(comet).supplyTo(user, toCollateral, toAmount);

        // 4. Borrow to repay flash loan
        IComet(comet).withdrawFrom(user, address(this), baseToken, totalRepayment);

        // 5. Repay flash loan
        IERC20(baseToken).transfer(flashLoanPool, totalRepayment);
    }
}

contract CompoundV3SimpleSwitchTest is Test {
    address constant USDC_COMET = 0xAec1F48e02Cfb822Be958B68C7957156EB3F0b6e;
    address constant FLASH_POOL = 0xD7822b5A41c3655c6C403167F6B8Aa1533620329;
    address constant COMPOUND_WETH = 0x2D5ee574e710219a521449679A4A7f2B43f046ad;
    address constant COMPOUND_USDC = 0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238;

    // Add another collateral asset for testing (if available)
    address constant WBTC = 0xf864F011C5A97fD8Da79baEd78ba77b47112935a; // Compound's WBTC on Sepolia

    SimpleCollateralSwitcher switcher;
    address user;
    address lp;

    function setUp() public {
        user = makeAddr("user");
        lp = makeAddr("lp");
        vm.deal(user, 100 ether);
        vm.deal(lp, 100 ether);

        switcher = new SimpleCollateralSwitcher(FLASH_POOL);
    }

    function testSimpleSwitch() public {
        console.log("\n========================================================");
        console.log("SIMPLE COLLATERAL SWITCH TEST");
        console.log("========================================================\n");

        // LP provides liquidity
        vm.startPrank(lp);
        deal(COMPOUND_USDC, lp, 100000 * 10**6);
        IERC20(COMPOUND_USDC).approve(USDC_COMET, 100000 * 10**6);
        IComet(USDC_COMET).supply(COMPOUND_USDC, 50000 * 10**6);
        console.log("LP supplied 50,000 USDC\n");
        vm.stopPrank();

        // User creates position with WETH collateral
        vm.startPrank(user);
        IWETH(COMPOUND_WETH).deposit{value: 10 ether}();
        IERC20(COMPOUND_WETH).approve(USDC_COMET, 10 ether);
        IComet(USDC_COMET).supply(COMPOUND_WETH, 5 ether);

        uint128 initialCollateral = IComet(USDC_COMET).collateralBalanceOf(user, COMPOUND_WETH);
        console.log("Initial WETH collateral:", initialCollateral / 1e18);

        // Borrow
        IComet(USDC_COMET).withdraw(COMPOUND_USDC, 2000 * 10**6);
        uint256 initialDebt = IComet(USDC_COMET).borrowBalanceOf(user);
        console.log("Initial debt:", initialDebt / 10**6, "USDC\n");

        // Authorize switcher
        IComet(USDC_COMET).allow(address(switcher), true);

        // Try to switch collateral (withdraw 2 WETH, keep 3 WETH)
        console.log("Attempting to withdraw 2 WETH (keep 3)...");

        try switcher.switchCollateral(
            user,
            USDC_COMET,
            COMPOUND_WETH,
            COMPOUND_WETH,
            2 ether,
            0 // Don't add new collateral, just withdraw some
        ) {
            console.log("  Status: SUCCESS\n");

            uint128 finalCollateral = IComet(USDC_COMET).collateralBalanceOf(user, COMPOUND_WETH);
            uint256 finalDebt = IComet(USDC_COMET).borrowBalanceOf(user);

            console.log("Final WETH collateral:", finalCollateral / 1e18);
            console.log("Final debt:", finalDebt / 10**6, "USDC");
            console.log("\nCollateral reduced by:", (initialCollateral - finalCollateral) / 1e18, "WETH");
            console.log("Debt increased by:", (finalDebt - initialDebt) / 10**6, "USDC (flash loan fee)");

        } catch Error(string memory reason) {
            console.log("  Status: FAILED -", reason);
        } catch (bytes memory err) {
            console.log("  Status: FAILED - Low-level error");
            console.logBytes(err);
        }

        vm.stopPrank();

        console.log("\n========================================================\n");
    }
}
