// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {CentscanRegistry} from "../src/CentscanRegistry.sol";

contract CentscanRegistryTest is Test {
    CentscanRegistry internal registry;

    address internal constant TARGET = address(0xC0FFEE);
    address internal constant OFFICIAL = address(0xA11CE);
    address internal constant OTHER = address(0xB0B);
    bytes32 internal constant HASH_A = keccak256("report-a");
    bytes32 internal constant HASH_B = keccak256("report-b");

    event Attested(
        address indexed target,
        address indexed attester,
        bytes32 indexed reportHash,
        uint64 medianCostMicroUsd,
        uint64 windowEndBlock,
        uint8 flags
    );

    function setUp() public {
        registry = new CentscanRegistry();
        vm.warp(1_791_884_463);
    }

    function _latest(address target, address attester)
        internal
        view
        returns (bytes32 hash, uint64 cost, uint64 windowEnd, uint32 ts, uint8 flags)
    {
        return registry.latest(target, attester);
    }

    function test_attest_storesAllFieldsAndEmits() public {
        vm.expectEmit(true, true, true, true, address(registry));
        emit Attested(TARGET, OFFICIAL, HASH_A, 4_400, 25_732_344, 3);

        vm.prank(OFFICIAL);
        registry.attest(TARGET, HASH_A, 4_400, 25_732_344, 3);

        (bytes32 hash, uint64 cost, uint64 windowEnd, uint32 ts, uint8 flags) = _latest(TARGET, OFFICIAL);
        assertEq(hash, HASH_A);
        assertEq(cost, 4_400);
        assertEq(windowEnd, 25_732_344);
        assertEq(ts, uint32(1_791_884_463));
        assertEq(flags, registry.FLAG_SOURCE_VERIFIED() | registry.FLAG_LIVE());
    }

    function test_attest_revertsOnZeroTarget() public {
        vm.prank(OFFICIAL);
        vm.expectRevert(CentscanRegistry.ZeroTarget.selector);
        registry.attest(address(0), HASH_A, 1, 1, 0);
    }

    function test_attest_revertsOnZeroHash() public {
        vm.prank(OFFICIAL);
        vm.expectRevert(CentscanRegistry.ZeroReportHash.selector);
        registry.attest(TARGET, bytes32(0), 1, 1, 0);
    }

    function test_attest_revertsOnZeroWindowForFirstAttestation() public {
        vm.prank(OFFICIAL);
        vm.expectRevert(abi.encodeWithSelector(CentscanRegistry.StaleWindow.selector, uint64(0), uint64(0)));
        registry.attest(TARGET, HASH_A, 1, 0, 0);
    }

    function test_attest_revertsOnEqualWindow() public {
        vm.startPrank(OFFICIAL);
        registry.attest(TARGET, HASH_A, 1, 100, 0);
        vm.expectRevert(abi.encodeWithSelector(CentscanRegistry.StaleWindow.selector, uint64(100), uint64(100)));
        registry.attest(TARGET, HASH_B, 1, 100, 0);
        vm.stopPrank();
    }

    function test_attest_revertsOnOlderWindow() public {
        vm.startPrank(OFFICIAL);
        registry.attest(TARGET, HASH_A, 1, 100, 0);
        vm.expectRevert(abi.encodeWithSelector(CentscanRegistry.StaleWindow.selector, uint64(100), uint64(99)));
        registry.attest(TARGET, HASH_B, 1, 99, 0);
        vm.stopPrank();
    }

    function test_attest_newerWindowOverwrites() public {
        vm.startPrank(OFFICIAL);
        registry.attest(TARGET, HASH_A, 10, 100, 1);
        registry.attest(TARGET, HASH_B, 20, 200, 2);
        vm.stopPrank();

        (bytes32 hash, uint64 cost, uint64 windowEnd,, uint8 flags) = _latest(TARGET, OFFICIAL);
        assertEq(hash, HASH_B);
        assertEq(cost, 20);
        assertEq(windowEnd, 200);
        assertEq(flags, 2);
    }

    function test_attest_attestersAreIsolated() public {
        vm.prank(OFFICIAL);
        registry.attest(TARGET, HASH_A, 10, 100, 3);
        // A third party with a newer window must not overwrite the official record.
        vm.prank(OTHER);
        registry.attest(TARGET, HASH_B, 1, 500, 0);

        (bytes32 officialHash,, uint64 officialWindow,,) = _latest(TARGET, OFFICIAL);
        (bytes32 otherHash,, uint64 otherWindow,,) = _latest(TARGET, OTHER);
        assertEq(officialHash, HASH_A);
        assertEq(officialWindow, 100);
        assertEq(otherHash, HASH_B);
        assertEq(otherWindow, 500);
    }

    function testFuzz_attest_monotonicWindows(uint64 first, uint64 second) public {
        vm.assume(first > 0);
        vm.startPrank(OFFICIAL);
        registry.attest(TARGET, HASH_A, 1, first, 0);
        if (second <= first) {
            vm.expectRevert(abi.encodeWithSelector(CentscanRegistry.StaleWindow.selector, first, second));
        }
        registry.attest(TARGET, HASH_B, 1, second, 0);
        vm.stopPrank();
    }
}
