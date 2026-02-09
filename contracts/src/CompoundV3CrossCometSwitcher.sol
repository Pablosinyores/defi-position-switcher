// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

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

interface IUniswapV3Pool {
    function flash(
        address recipient,
        uint256 amount0,
        uint256 amount1,
        bytes calldata data
    ) external;

    function swap(
        address recipient,
        bool zeroForOne,
        int256 amountSpecified,
        uint160 sqrtPriceLimitX96,
        bytes calldata data
    ) external returns (int256 amount0, int256 amount1);

    function token0() external view returns (address);
    function token1() external view returns (address);
}

/**
 * @title CompoundV3CrossCometSwitcher
 * @notice Enables atomic collateral switching between different Compound V3 Comets
 * @dev Uses Uniswap V3 flash loans and direct pool swaps
 */
contract CompoundV3CrossCometSwitcher is Ownable {
    // Uniswap V3 Pool for flash loans (Compound WETH/USDC 0.3%)
    address public immutable flashLoanPool;

    // Separate pool for swaps (can be same as flash loan pool)
    address public immutable swapPool;

    // Authorization mapping
    mapping(address => bool) public authorizedCallers;

    // Reentrancy guard
    uint256 private constant NOT_ENTERED = 1;
    uint256 private constant ENTERED = 2;
    uint256 private _status;

    // Events
    event CollateralSwitched(
        address indexed user,
        address sourceComet,
        address targetComet,
        address collateralAsset,
        uint256 collateralAmount,
        uint256 flashLoanAmount
    );

    event CallerAuthorized(address indexed caller, bool authorized);

    constructor(address _flashLoanPool, address _swapPool) Ownable(msg.sender) {
        flashLoanPool = _flashLoanPool;
        swapPool = _swapPool;
        _status = NOT_ENTERED;
    }

    modifier nonReentrant() {
        require(_status != ENTERED, "ReentrancyGuard: reentrant call");
        _status = ENTERED;
        _;
        _status = NOT_ENTERED;
    }

    /**
     * @notice Authorize/deauthorize a caller to use this contract
     */
    function authorizeCaller(address caller, bool authorized) external onlyOwner {
        authorizedCallers[caller] = authorized;
        emit CallerAuthorized(caller, authorized);
    }

    /**
     * @notice Switch collateral from one Comet to another atomically
     * @param user The user whose position to switch
     * @param sourceComet The Comet to withdraw collateral from
     * @param targetComet The Comet to supply collateral to
     * @param collateralAsset The collateral asset to switch
     * @param collateralAmount The amount of collateral to switch
     * @param borrowAmount Amount of target token to borrow (caller must estimate based on prices)
     * @param minOutputAmount Minimum amount of source token to receive from swap (slippage protection)
     */
    function switchCollateral(
        address user,
        address sourceComet,
        address targetComet,
        address collateralAsset,
        uint256 collateralAmount,
        uint256 borrowAmount,
        uint256 minOutputAmount
    ) external nonReentrant {
        require(authorizedCallers[msg.sender] || msg.sender == owner(), "Not authorized");
        require(user != address(0), "Invalid user");
        require(sourceComet != targetComet, "Same Comet");

        // Get base tokens and debt
        address sourceBaseToken = IComet(sourceComet).baseToken();
        address targetBaseToken = IComet(targetComet).baseToken();
        uint256 userDebt = IComet(sourceComet).borrowBalanceOf(user);

        require(userDebt > 0, "No debt to repay");
        require(sourceBaseToken != targetBaseToken, "Same base token - use simple switcher");

        // Prepare flash loan data
        bytes memory data = abi.encode(
            user,
            sourceComet,
            targetComet,
            collateralAsset,
            collateralAmount,
            sourceBaseToken,
            targetBaseToken,
            userDebt,
            borrowAmount,
            minOutputAmount
        );

        // Determine which token is token0 and token1 in the pool
        address token0 = IUniswapV3Pool(flashLoanPool).token0();
        address token1 = IUniswapV3Pool(flashLoanPool).token1();

        // Flash loan the source base token to repay debt
        uint256 amount0 = (sourceBaseToken == token0) ? userDebt : 0;
        uint256 amount1 = (sourceBaseToken == token1) ? userDebt : 0;

        IUniswapV3Pool(flashLoanPool).flash(address(this), amount0, amount1, data);

        emit CollateralSwitched(user, sourceComet, targetComet, collateralAsset, collateralAmount, userDebt);
    }

    /**
     * @notice Uniswap V3 flash loan callback
     */
    function uniswapV3FlashCallback(
        uint256 fee0,
        uint256 fee1,
        bytes calldata data
    ) external {
        require(msg.sender == flashLoanPool, "Invalid callback caller");
        require(_status == ENTERED, "Not in nonReentrant");

        // Decode callback data
        (
            address user,
            address sourceComet,
            address targetComet,
            address collateralAsset,
            uint256 collateralAmount,
            address sourceBaseToken,
            address targetBaseToken,
            uint256 userDebt,
            uint256 borrowAmount,
            uint256 minOutputAmount
        ) = abi.decode(data, (address, address, address, address, uint256, address, address, uint256, uint256, uint256));

        // Calculate flash loan fee
        uint256 flashLoanFee = fee0 + fee1;
        uint256 totalRepayment = userDebt + flashLoanFee;

        // STEP 1: Repay user's debt in source Comet
        IERC20(sourceBaseToken).approve(sourceComet, userDebt);
        IComet(sourceComet).supplyTo(user, sourceBaseToken, userDebt);

        // STEP 2: Withdraw collateral from source Comet
        IComet(sourceComet).withdrawFrom(user, address(this), collateralAsset, collateralAmount);

        // STEP 3: Supply collateral to target Comet
        IERC20(collateralAsset).approve(targetComet, collateralAmount);
        IComet(targetComet).supplyTo(user, collateralAsset, collateralAmount);

        // STEP 4: Borrow from target Comet (amount provided by caller based on current prices)
        IComet(targetComet).withdrawFrom(user, address(this), targetBaseToken, borrowAmount);

        // STEP 5: Swap target token to source token
        uint256 receivedAmount = _swapExactInput(
            targetBaseToken,
            sourceBaseToken,
            borrowAmount,
            minOutputAmount
        );

        // Verify we received enough
        require(receivedAmount >= totalRepayment, "Insufficient swap output");

        // STEP 6: Repay flash loan
        IERC20(sourceBaseToken).transfer(flashLoanPool, totalRepayment);

        // Return any excess source token to user
        uint256 excess = receivedAmount - totalRepayment;
        if (excess > 0) {
            IERC20(sourceBaseToken).transfer(user, excess);
        }
    }

    /**
     * @notice Perform exact input swap on Uniswap V3 pool
     * @param tokenIn Token to swap from
     * @param tokenOut Token to swap to
     * @param amountIn Exact amount of tokenIn to swap
     * @param minAmountOut Minimum amount of tokenOut to receive
     * @return amountOut Amount of tokenOut received
     */
    function _swapExactInput(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut
    ) internal returns (uint256 amountOut) {
        // Determine swap direction
        address token0 = IUniswapV3Pool(swapPool).token0();
        address token1 = IUniswapV3Pool(swapPool).token1();

        bool zeroForOne = (tokenIn == token0);
        require(
            (zeroForOne && tokenOut == token1) || (!zeroForOne && tokenOut == token0),
            "Token pair mismatch"
        );

        // Approve pool to spend tokens
        IERC20(tokenIn).approve(swapPool, amountIn);

        // Record balance before swap
        uint256 balanceBefore = IERC20(tokenOut).balanceOf(address(this));

        // Perform swap
        // sqrtPriceLimitX96: Set to extreme values to accept any price
        // For zeroForOne: price goes down, so use MIN_SQRT_RATIO + 1
        // For oneForZero: price goes up, so use MAX_SQRT_RATIO - 1
        uint160 sqrtPriceLimitX96 = zeroForOne
            ? 4295128740  // MIN_SQRT_RATIO + 1
            : 1461446703485210103287273052203988822378723970341; // MAX_SQRT_RATIO - 1

        IUniswapV3Pool(swapPool).swap(
            address(this),
            zeroForOne,
            int256(amountIn),
            sqrtPriceLimitX96,
            ""
        );

        // Calculate amount received
        uint256 balanceAfter = IERC20(tokenOut).balanceOf(address(this));
        amountOut = balanceAfter - balanceBefore;

        // Verify slippage
        require(amountOut >= minAmountOut, "Slippage too high");

        return amountOut;
    }

    /**
     * @notice Uniswap V3 swap callback
     */
    function uniswapV3SwapCallback(
        int256 amount0Delta,
        int256 amount1Delta,
        bytes calldata /* data */
    ) external {
        require(msg.sender == swapPool, "Invalid swap callback caller");
        require(_status == ENTERED, "Not in nonReentrant");

        // Pay the pool what it needs
        if (amount0Delta > 0) {
            address token0 = IUniswapV3Pool(swapPool).token0();
            IERC20(token0).transfer(swapPool, uint256(amount0Delta));
        }
        if (amount1Delta > 0) {
            address token1 = IUniswapV3Pool(swapPool).token1();
            IERC20(token1).transfer(swapPool, uint256(amount1Delta));
        }
    }
}
