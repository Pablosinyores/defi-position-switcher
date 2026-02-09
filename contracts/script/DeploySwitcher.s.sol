// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "forge-std/Script.sol";
import "forge-std/console.sol";
import "../src/CompoundV3CrossCometSwitcher.sol";

contract DeploySwitcher is Script {
    address constant FLASH_POOL = 0x88e6A0c2dDD26FEEb64F039a2c41296FcB3f5640;
    address constant SWAP_POOL = 0x7BeA39867e4169DBe237d55C8242a8f2fcDcc387;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        console.log("Deploying CompoundV3CrossCometSwitcher...");
        console.log("Deployer:", deployer);

        vm.startBroadcast(deployerPrivateKey);
        CompoundV3CrossCometSwitcher switcher = new CompoundV3CrossCometSwitcher(FLASH_POOL, SWAP_POOL);
        vm.stopBroadcast();

        console.log("Switcher deployed at:", address(switcher));
        console.log("SWITCHER_ADDRESS=", address(switcher));
    }
}
