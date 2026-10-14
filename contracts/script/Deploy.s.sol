// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Script, console2} from "forge-std/Script.sol";
import {CentscanRegistry} from "../src/CentscanRegistry.sol";

/// Usage:
///   DEPLOYER_PRIVATE_KEY=0x... arc-forge script script/Deploy.s.sol --rpc-url arc --broadcast
contract Deploy is Script {
    uint256 internal constant ARC_MAINNET_CHAIN_ID = 5042;

    function run() external returns (CentscanRegistry registry) {
        require(block.chainid == ARC_MAINNET_CHAIN_ID, "Deploy: not Arc mainnet (5042)");
        uint256 key = vm.envUint("DEPLOYER_PRIVATE_KEY");
        vm.startBroadcast(key);
        registry = new CentscanRegistry();
        vm.stopBroadcast();
        console2.log("CentscanRegistry deployed at", address(registry));
    }
}
