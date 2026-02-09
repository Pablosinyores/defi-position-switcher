// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "forge-std/Script.sol";
import "forge-std/console.sol";
import "../src/SimplePaymasterV06.sol";

contract DeployPaymasterSimple is Script {
    address constant ENTRYPOINT_V06 = 0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");

        vm.startBroadcast(deployerPrivateKey);
        SimplePaymasterV06 paymaster = new SimplePaymasterV06(ENTRYPOINT_V06);
        paymaster.deposit{value: 10 ether}();
        paymaster.addStake{value: 1 ether}(86400);
        vm.stopBroadcast();

        console.log("PAYMASTER_ADDRESS=", address(paymaster));
    }
}
