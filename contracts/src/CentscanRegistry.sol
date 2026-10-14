// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/// @title CentscanRegistry
/// @notice Append-only attestations of Centscan cost reports for Arc contracts.
/// @dev No owner, no upgrade path, holds no funds. Attestations are keyed by (target, attester) so that
///      anyone may attest without overwriting another attester; readers decide which attesters to trust.
contract CentscanRegistry {
    struct Attestation {
        bytes32 reportHash;
        uint64 medianCostMicroUsd;
        uint64 windowEndBlock;
        uint32 timestamp;
        uint8 flags;
    }

    uint8 public constant FLAG_SOURCE_VERIFIED = 1;
    uint8 public constant FLAG_LIVE = 2;

    mapping(address target => mapping(address attester => Attestation)) public latest;

    event Attested(
        address indexed target,
        address indexed attester,
        bytes32 indexed reportHash,
        uint64 medianCostMicroUsd,
        uint64 windowEndBlock,
        uint8 flags
    );

    error ZeroTarget();
    error ZeroReportHash();
    error StaleWindow(uint64 previous, uint64 given);

    function attest(
        address target,
        bytes32 reportHash,
        uint64 medianCostMicroUsd,
        uint64 windowEndBlock,
        uint8 flags
    ) external {
        if (target == address(0)) revert ZeroTarget();
        if (reportHash == bytes32(0)) revert ZeroReportHash();
        uint64 previous = latest[target][msg.sender].windowEndBlock;
        // Prevents replaying an older (possibly more flattering) report over a newer one.
        if (windowEndBlock <= previous) revert StaleWindow(previous, windowEndBlock);

        latest[target][msg.sender] = Attestation({
            reportHash: reportHash,
            medianCostMicroUsd: medianCostMicroUsd,
            windowEndBlock: windowEndBlock,
            timestamp: uint32(block.timestamp),
            flags: flags
        });
        emit Attested(target, msg.sender, reportHash, medianCostMicroUsd, windowEndBlock, flags);
    }
}
