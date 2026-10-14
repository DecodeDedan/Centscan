# CentscanRegistry contracts

`src/CentscanRegistry.sol` is an append-only on-chain record of Centscan cost reports for Arc mainnet
(chain id 5042). It has no owner, no upgrade path and holds no funds.

## What it stores

`attest(target, reportHash, medianCostMicroUsd, windowEndBlock, flags)` writes one `Attestation` into
`latest[target][msg.sender]` and emits `Attested`.

- **Keyed by `(target, attester)`.** Anyone can attest any contract without overwriting another
  attester. The Centscan app trusts only the address in `ATTESTER_ADDRESS` and labels the rest as
  third-party.
- **Monotonic windows.** `windowEndBlock` must be strictly greater than the attester's previous one for
  that target, otherwise the call reverts with `StaleWindow(previous, given)`. This stops an older,
  possibly more flattering report replacing a newer one.
- **Input checks.** `ZeroTarget()` if `target == address(0)`; `ZeroReportHash()` if `reportHash == 0`.
- **Flags** (bitmask): `FLAG_SOURCE_VERIFIED = 1` (source verified on Sourcify), `FLAG_LIVE = 2`.
- `timestamp` is set from `block.timestamp`, not from the caller.

## Toolchain

Arc requires **Arc Foundry**: `arc-forge`, `arc-cast` and `arc-anvil`. Install them from the release
tarball as described in https://docs.arc.io/arc/tutorials/install-arc-foundry. CI pins `v0.8.0-2` and
checks the release SHA-256 (see `.github/workflows/ci.yml`). Solidity is pinned to 0.8.30 in
`foundry.toml`. `forge-std` is vendored in `lib/forge-std`.

## Build and test

```shell
cd contracts
arc-forge build
arc-forge test -vv
```

The tests in `test/CentscanRegistry.t.sol` cover storage and event fields, attester isolation, zero
target, zero hash, equal and older windows, and a fuzzed monotonic-window property. You can also run
`pnpm test:contracts` from the repo root.

## Deploy (Arc mainnet)

`script/Deploy.s.sol` refuses any chain other than 5042 and reads the deployer key from
`DEPLOYER_PRIVATE_KEY`. Use a dedicated deployer key, not the attester's hot wallet. It needs a little
USDC for gas.

```shell
cd contracts
read -rs DEPLOYER_PRIVATE_KEY && export DEPLOYER_PRIVATE_KEY   # keeps the key out of shell history
arc-forge script script/Deploy.s.sol --rpc-url https://rpc.mainnet.arc.io --broadcast
unset DEPLOYER_PRIVATE_KEY
```

`--rpc-url arc` works too. It uses the `[rpc_endpoints]` alias in `foundry.toml`, which reads
`ARC_RPC_URL`. The script logs `CentscanRegistry deployed at <address>`. Put that address into the
app's `REGISTRY_ADDRESS`.

## Verify on Sourcify

```shell
arc-forge verify-contract "$REGISTRY_ADDRESS" src/CentscanRegistry.sol:CentscanRegistry \
  --chain-id 5042 --verifier sourcify
```

Sourcify is used instead of the Blockscout API path because of the open issue circlefin/arc-node#210.

## Smoke test with arc-cast

```shell
# Constants. Expect 1 and 2.
arc-cast call "$REGISTRY_ADDRESS" "FLAG_SOURCE_VERIFIED()(uint8)" --rpc-url https://rpc.mainnet.arc.io
arc-cast call "$REGISTRY_ADDRESS" "FLAG_LIVE()(uint8)" --rpc-url https://rpc.mainnet.arc.io

# Latest attestation by the official attester for a target. All zeros until the first attest.
arc-cast call "$REGISTRY_ADDRESS" \
  "latest(address,address)(bytes32,uint64,uint64,uint32,uint8)" \
  "$TARGET_ADDRESS" "$ATTESTER_ADDRESS" --rpc-url https://rpc.mainnet.arc.io
```
