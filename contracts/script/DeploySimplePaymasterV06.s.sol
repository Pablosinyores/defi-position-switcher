// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "forge-std/Script.sol";
import "forge-std/console.sol";
import "../src/SimplePaymasterV06.sol";

/**
 * @title DeploySimplePaymasterV06
 * @notice Deploy SimplePaymasterV06 for EntryPoint v0.6.0 (ModularAccount)
 * @dev Usage: DEPLOYER_PRIVATE_KEY=0x... forge script script/DeploySimplePaymasterV06.s.sol --rpc-url http://127.0.0.1:8545 --broadcast
 */
contract DeploySimplePaymasterV06 is Script {
    // EntryPoint v0.6.0 address (used by ModularAccount)
    address constant ENTRYPOINT_V06 = 0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        console.log("===========================================");
        console.log("Deploying SimplePaymasterV06");
        console.log("===========================================");
        console.log("Deployer:", deployer);
        console.log("EntryPoint v0.6.0:", ENTRYPOINT_V06);
        console.log("");

        vm.startBroadcast(deployerPrivateKey);

        // Deploy paymaster
        console.log("Deploying SimplePaymasterV06...");
        SimplePaymasterV06 paymaster = new SimplePaymasterV06(ENTRYPOINT_V06);
        console.log("Paymaster deployed at:", address(paymaster));
        console.log("");

        // Deposit 10 ETH for gas sponsorship
        console.log("Depositing 10 ETH to EntryPoint...");
        paymaster.deposit{value: 10 ether}();
        console.log("Deposit successful");
        console.log("");

        // Stake 1 ETH (required for paymaster)
        console.log("Adding 1 ETH stake (1 day delay)...");
        paymaster.addStake{value: 1 ether}(86400); // 1 day unstake delay
        console.log("Stake added successfully");
        console.log("");

        vm.stopBroadcast();

        console.log("===========================================");
        console.log("Deployment Summary");
        console.log("===========================================");
        console.log("Paymaster Address:", address(paymaster));
        console.log("EntryPoint v0.6.0:", ENTRYPOINT_V06);
        console.log("Owner:", deployer);
        console.log("");
        console.log("[SUCCESS] Deployment complete!");
        console.log("");
        console.log("Add to backend/.env:");
        console.log("PAYMASTER_V06_ADDRESS=", address(paymaster));
        console.log("===========================================");
    }
}
