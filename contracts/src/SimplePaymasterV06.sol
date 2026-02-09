// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

/**
 * @title SimplePaymasterV06
 * @notice Paymaster for EntryPoint v0.6.0 that sponsors gas for all accounts
 * @dev Works with Alchemy's ModularAccount (ERC-6900)
 */

// EntryPoint v0.6.0 UserOperation struct
struct UserOperation {
    address sender;
    uint256 nonce;
    bytes initCode;
    bytes callData;
    uint256 callGasLimit;
    uint256 verificationGasLimit;
    uint256 preVerificationGas;
    uint256 maxFeePerGas;
    uint256 maxPriorityFeePerGas;
    bytes paymasterAndData;
    bytes signature;
}

// EntryPoint v0.6.0 interface (minimal)
interface IEntryPointV06 {
    function depositTo(address account) external payable;
    function addStake(uint32 unstakeDelaySec) external payable;
    function unlockStake() external;
    function withdrawStake(address payable withdrawAddress) external;
    function withdrawTo(address payable withdrawAddress, uint256 withdrawAmount) external;
    function balanceOf(address account) external view returns (uint256);
    function getDepositInfo(address account) external view returns (
        uint112 deposit,
        bool staked,
        uint112 stake,
        uint32 unstakeDelaySec,
        uint48 withdrawTime
    );
}

// Paymaster interface for v0.6.0
interface IPaymasterV06 {
    enum PostOpMode {
        opSucceeded,
        opReverted,
        postOpReverted
    }

    function validatePaymasterUserOp(
        UserOperation calldata userOp,
        bytes32 userOpHash,
        uint256 maxCost
    ) external returns (bytes memory context, uint256 validationData);

    function postOp(
        PostOpMode mode,
        bytes calldata context,
        uint256 actualGasCost
    ) external;
}

contract SimplePaymasterV06 is IPaymasterV06 {
    IEntryPointV06 public immutable entryPoint;
    address public owner;

    // EntryPoint v0.6.0 address on mainnet
    address constant ENTRYPOINT_V06 = 0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789;

    event Deposited(address indexed from, uint256 amount);
    event Withdrawn(address indexed to, uint256 amount);
    event GasSponsored(address indexed sender, bytes32 indexed userOpHash, uint256 maxCost);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    modifier onlyEntryPoint() {
        require(msg.sender == address(entryPoint), "Not from EntryPoint");
        _;
    }

    constructor(address _entryPoint) {
        entryPoint = IEntryPointV06(_entryPoint);
        owner = msg.sender;
    }

    /**
     * @notice Payment validation for EntryPoint v0.6.0
     * @param userOp The UserOperation (v0.6.0 format - unpacked)
     * @param userOpHash Hash of the user operation
     * @param maxCost Maximum cost of this transaction
     * @return context Context to pass to postOp (empty for simple paymaster)
     * @return validationData Validation result (0 = success)
     */
    function validatePaymasterUserOp(
        UserOperation calldata userOp,
        bytes32 userOpHash,
        uint256 maxCost
    ) external override onlyEntryPoint returns (bytes memory context, uint256 validationData) {
        // Check we have enough deposit to cover the max cost
        require(entryPoint.balanceOf(address(this)) >= maxCost, "Insufficient deposit");

        emit GasSponsored(userOp.sender, userOpHash, maxCost);

        // Return empty context and 0 validation data (success)
        return ("", 0);
    }

    /**
     * @notice Post-operation handler for EntryPoint v0.6.0
     * @param mode Whether op succeeded, reverted, or postOp reverted
     * @param context Context from validatePaymasterUserOp
     * @param actualGasCost Actual gas cost
     */
    function postOp(
        PostOpMode mode,
        bytes calldata context,
        uint256 actualGasCost
    ) external override onlyEntryPoint {
        // Simple paymaster - no post-op logic needed
        // In production, you might:
        // - Charge user in ERC-20 tokens
        // - Update usage tracking
        // - Refund excess gas
    }

    /**
     * @notice Deposit ETH to EntryPoint for gas sponsorship
     */
    function deposit() external payable {
        entryPoint.depositTo{value: msg.value}(address(this));
        emit Deposited(msg.sender, msg.value);
    }

    /**
     * @notice Add stake to EntryPoint (required for paymaster)
     * @param unstakeDelaySec Delay before unstaking is allowed
     */
    function addStake(uint32 unstakeDelaySec) external payable onlyOwner {
        entryPoint.addStake{value: msg.value}(unstakeDelaySec);
    }

    /**
     * @notice Unlock stake (must wait unstakeDelaySec before withdrawing)
     */
    function unlockStake() external onlyOwner {
        entryPoint.unlockStake();
    }

    /**
     * @notice Withdraw stake after unlock delay
     * @param withdrawAddress Address to receive the stake
     */
    function withdrawStake(address payable withdrawAddress) external onlyOwner {
        entryPoint.withdrawStake(withdrawAddress);
    }

    /**
     * @notice Withdraw deposit from EntryPoint
     * @param withdrawAddress Address to receive the deposit
     * @param amount Amount to withdraw
     */
    function withdrawTo(address payable withdrawAddress, uint256 amount) external onlyOwner {
        entryPoint.withdrawTo(withdrawAddress, amount);
        emit Withdrawn(withdrawAddress, amount);
    }

    /**
     * @notice Get deposit balance in EntryPoint
     */
    function getDeposit() external view returns (uint256) {
        return entryPoint.balanceOf(address(this));
    }

    /**
     * @notice Get stake info
     */
    function getStakeInfo() external view returns (
        uint112 deposit,
        bool staked,
        uint112 stake,
        uint32 unstakeDelaySec,
        uint48 withdrawTime
    ) {
        return entryPoint.getDepositInfo(address(this));
    }

    /**
     * @notice Allow contract to receive ETH
     */
    receive() external payable {
        emit Deposited(msg.sender, msg.value);
    }
}
