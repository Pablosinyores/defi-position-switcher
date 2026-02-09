// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "forge-std/Script.sol";
import "forge-std/console.sol";
import "../src/SimplePaymasterV06.sol";

contract DeployPaymasterFresh is Script {
    address constant ENTRYPOINT_V06 = 0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        console.log("Deployer:", deployer);
        console.log("Deployer balance:", deployer.balance);

        vm.startBroadcast(deployerPrivateKey);

        // Use salt for CREATE2
        bytes32 salt = keccak256(abi.encodePacked("paymaster-v3", block.timestamp));
        SimplePaymasterV06 paymaster = new SimplePaymasterV06{salt: salt}(ENTRYPOINT_V06);
        console.log("Paymaster deployed at:", address(paymaster));

        // Deposit and stake
        paymaster.deposit{value: 10 ether}();
        paymaster.addStake{value: 1 ether}(86400);

        vm.stopBroadcast();

        console.log("PAYMASTER_V06_ADDRESS=", address(paymaster));
    }
}
