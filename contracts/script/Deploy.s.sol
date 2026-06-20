// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Script, console} from "forge-std/Script.sol";
import {Subnet0} from "../src/Subnet0.sol";

/// @notice Deploy Subnet0 to Monad testnet.
/// Usage:
///   forge script script/Deploy.s.sol:Deploy \
///     --rpc-url monad_testnet --broadcast --private-key $PRIVATE_KEY
contract Deploy is Script {
    function run() external returns (Subnet0 sn) {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(pk);
        sn = new Subnet0();
        vm.stopBroadcast();
        console.log("Subnet0 deployed at:", address(sn));
    }
}
