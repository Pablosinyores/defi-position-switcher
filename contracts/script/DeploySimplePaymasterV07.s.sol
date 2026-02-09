// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "forge-std/Script.sol";
import "../src/SimplePaymasterV07.sol";
import "@account-abstraction/contracts/interfaces/IEntryPoint.sol";

/**
 * @title DeploySimplePaymasterV07
 * @notice Deploys SimplePaymaster for EntryPoint v0.7.0
 *
 * Usage:
 *   forge script script/DeploySimplePaymasterV07.s.sol:DeploySimplePaymasterV07 \
 *     --rpc-url http://127.0.0.1:8545 \
 *     --broadcast \
 *     --private-key $DEPLOYER_PRIVATE_KEY
 */
contract DeploySimplePaymasterV07 is Script {
    // EntryPoint v0.7.0 address (same on all networks)
    address constant ENTRYPOINT_V07 = 0x0000000071727De22E5E9d8BAf0edAc6f37da032;

    // Initial deposit amount (10 ETH)
    uint256 constant INITIAL_DEPOSIT = 10 ether;

    // Stake amount and unstake delay
    uint256 constant STAKE_AMOUNT = 1 ether;
    uint32 constant UNSTAKE_DELAY = 1 days;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        console.log("===========================================");
        console.log("Deploying SimplePaymasterV07");
        console.log("===========================================");
        console.log("Deployer:", deployer);
        console.log("EntryPoint v0.7.0:", ENTRYPOINT_V07);
        console.log("Initial Deposit:", INITIAL_DEPOSIT / 1 ether, "ETH");
        console.log("Stake:", STAKE_AMOUNT / 1 ether, "ETH");
        console.log("Unstake Delay:", UNSTAKE_DELAY / 1 days, "days");
        console.log("");

        vm.startBroadcast(deployerPrivateKey);

        // Deploy paymaster
        console.log("Deploying SimplePaymasterV07...");
        SimplePaymasterV07 paymaster = new SimplePaymasterV07(IEntryPoint(ENTRYPOINT_V07));
        console.log("Paymaster deployed at:", address(paymaster));
        console.log("");

        // Deposit ETH for gas sponsorship
        console.log("Depositing", INITIAL_DEPOSIT / 1 ether, "ETH to EntryPoint...");
        paymaster.deposit{value: INITIAL_DEPOSIT}();
        console.log("Deposit successful");
        console.log("");

        // Add stake (required for paymaster to be accepted by bundlers)
        console.log("Adding stake of", STAKE_AMOUNT / 1 ether, "ETH...");
        paymaster.addStake{value: STAKE_AMOUNT}(UNSTAKE_DELAY);
        console.log("Stake added successfully");
        console.log("");

        vm.stopBroadcast();

        // Verify deployment
        console.log("===========================================");
        console.log("Deployment Summary");
        console.log("===========================================");
        console.log("Paymaster Address:", address(paymaster));
        console.log("EntryPoint:", address(paymaster.entryPoint()));
        console.log("Owner:", paymaster.owner());
        console.log("Deposit Balance:", paymaster.getDeposit() / 1 ether, "ETH");

        uint256 totalBalance = paymaster.getStakeInfo();
        console.log("Total Balance:", totalBalance / 1 ether, "ETH");
        console.log("");

        console.log("[SUCCESS] Deployment complete!");
        console.log("");
        console.log("Add to backend/.env:");
        console.log("PAYMASTER_ADDRESS=%s", address(paymaster));
        console.log("===========================================");
    }
}
