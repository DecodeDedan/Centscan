# Centscan: pricing smart contract functions on a dollar-denominated chain

*Version 1.0 · 13 October 2026*

## Abstract
Arc is the first general-purpose EVM chain where the gas token is a dollar stablecoin. A transaction fee on Arc is therefore not a quantity of a volatile asset but a price in USD. Centscan turns that property into a public measurement: for any Arc mainnet contract, it reports the observed cost of each function in cents, alongside whether its source is verified and whether it is actually being used. Each report is hashed and attested on Arc, so anyone can check that a published number is the one that was measured. This paper describes the measurement method, the attestation protocol, the trust model and the method's limits.

## 1. Background: fees become prices
On an ETH-gas chain, the cost of a call is `gasUsed × gasPrice × ETH/USD`, and two of those three factors move independently. Any "cost per call" figure is stale within hours and meaningless across weeks.

On Arc the third factor disappears. The native balance is USDC with 18 decimals, so

```
cost (USD) = gasUsed × effectiveGasPrice ÷ 10^18
```

and the base fee sits at a protocol floor of 20 gwei. On 13 October 2026 we measured a base fee of exactly 20 gwei at blocks 25,731,344 and 25,732,344. A plain 21,000-gas transfer therefore costs 0.042¢. That figure can be quoted next week and still mean the same thing.

Stable fees make three things possible for the first time:
1. **Unit economics.** A product team can state "each payout costs 0.09¢" and budget on it.
2. **Comparison.** Two contracts doing the same job can be ranked by cost in a unit everyone understands.
3. **Regression detection.** A function that becomes 30% more expensive after an upgrade is a measurable, reportable change.

## 2. What Centscan measures
For a target contract `T` and a block window `W = [a, b]`:

- **Source status:** Sourcify's verification result for `(5042, T)`: exact match, partial match, or none.
- **Direct calls:** `C = { tx : a ≤ block(tx) ≤ b, tx.to = T }`.
- **Indirect activity:** transactions in `W` where `T` emitted a log but `tx.to ≠ T` (calls routed through another contract). These are counted but not priced, because the fee pays for the whole transaction, not for `T`'s share of it.
- **Per-function cost distribution:** `C` partitioned by 4-byte selector; for each part, the median, 90th percentile, minimum and maximum of `gasUsed × effectiveGasPrice` taken from the receipt.
- **Reverted calls:** priced separately, because failed calls still cost the sender.

## 3. Method

### 3.1 Finding calls without a trace API
Arc's public RPC returns `method not supported` for `trace_*` and `debug_*`, and the explorer API is not reachable by servers. Centscan therefore uses two standard methods:

- **Log path:** `eth_getLogs` filtered by `address = T`, paged in 10,000-block ranges (halved when the node rejects a range as too large), yields candidate transaction hashes. Transactions and receipts are then fetched in JSON-RPC batches of 25 under a client-side budget of 10 calls per second, the rate the public RPC sustained without errors on 14 Oct 2026.
- **Block-scan path:** for contracts that emit no events, Centscan reads full blocks for a bounded recent window (default 10,000 blocks, about 85 minutes at the measured 0.51 s block time) and filters by `to`.

The report always states which path produced it. A block-scan report is labelled as covering only its window, never as complete.

### 3.2 Pricing
All arithmetic is in arbitrary-precision integers until display. Percentiles use the nearest-rank method on the sorted per-call costs. The **effective** gas price is used rather than the base fee, so priority tips the sender actually paid are included. That is the real cost to the user. The p90 column makes tip-driven outliers visible instead of hiding them in an average.

### 3.3 Naming functions
Selectors are named from the contract's verified ABI when available. Otherwise they come from the public openchain signature database (its filtered results avoid known collisions; for `0xa9059cbb` it returns only `transfer(address,uint256)`, while 4byte returns 6 candidates). Otherwise the raw selector is shown. The name source is shown on every row.

### 3.4 Bounds
At most 150 transactions are analysed per report by default (configurable), newest first, and the report records `analysed` against `found`. The window is capped at 7 days. These bounds keep a report near 30 s on the public RPC (measured: 33 s for the Arc USDC contract, 1 h window) and make cost and load predictable.

## 4. Attestation protocol

### 4.1 Report hash
The report is serialised as canonical JSON (keys sorted recursively, no whitespace, arrays in order, big integers as decimal strings) and hashed with keccak256. The serialiser is a shared module that runs on both server and browser, so a reader can recompute the hash locally.

### 4.2 On-chain record
`CentscanRegistry.attest(target, reportHash, medianCostMicroUsd, windowEndBlock, flags)` stores the latest attestation per `(target, attester)` and emits `Attested`. The contract has no owner, no upgrade path and holds no funds. It rejects attestations whose `windowEndBlock` is not newer than the attester's previous one, which stops older reports being replayed over newer ones.

### 4.3 Verifying a claim
To check a badge or report that someone shares:
1. Read `latest(target, centscanAttester)` from the registry on Arc.
2. Fetch the report JSON and recompute its canonical keccak256.
3. If the hashes match, the published numbers are exactly those attested at `windowEndBlock`. Every row's sample transaction can then be opened on the explorer and its cost recomputed from the receipt.

Steps 1 to 3 need no trust in Centscan's server. Only the measurement itself (which calls were found) relies on Centscan's collector, and step 3 lets anyone spot-check it.

## 5. Trust and threat model
| Threat | Effect | Mitigation |
|---|---|---|
| Wash calls to look "live" | Inflated activity | Report unique senders and success rate next to the call count; the verdict needs successful calls; reviewers see the numbers, not just a tick |
| Third-party fake attestations | Misleading badges | Attestations are keyed by attester; the UI and badge only trust the configured Centscan attester; others are shown as third-party |
| Replaying an old, flattering report | Stale cost shown | `StaleWindow` check on-chain; the badge shows the window end block |
| Tip spikes skew cost | Misleading median | Median plus p90 plus min/max; outliers stay visible |
| Collector misses calls | Under-reported activity | Coverage stated on every report; sampling disclosed; recorded-fixture tests for both paths |
| Attester key compromise | Bad attestations from the official address | Separate hot wallet with about $2 of USDC; key only in server env; rotate by redeploying config to a new attester address (the old one's history stays visible on-chain) |

## 6. Limitations
- Costs of calls routed through other contracts are not attributed to `T`; doing that requires call traces, which Arc's public RPC does not expose.
- Block-scan coverage for event-less contracts is limited to a recent window.
- Verification status is only as current as Sourcify.
- If Arc changes its fee floor, historical and new reports remain correct (they are measured), but comparisons across the change must say so.
- Confidential transactions, which Arc has announced as in development, may hide calldata. Their selectors would then show as unknown.

## 7. Roadmap
1. **Now:** on-demand reports, badge, attestation registry on Arc mainnet.
2. **Next:** cost-regression alerts and a CI action that comments "this PR makes `deposit()` 0.03¢ more expensive"; multi-contract "app" views for cost per user action.
3. **Later:** a public Arc cost index; a typed attestation schema other programs (grants, wallets, auditors) can write to; pricing views for Gateway and Nanopayments flows once they settle on mainnet.

## References
- Arc docs: connecting to Arc mainnet, deploying, Arc Foundry: https://docs.arc.io
- Sourcify supported chains (Arc Mainnet 5042: supported): https://sourcify.dev/server/chains
- Open issue on testnet explorer verification API: https://github.com/circlefin/arc-node/issues/210
- Circle, "Circle Launches Arc Mainnet": https://www.circle.com/pressroom/circle-launches-arc-mainnet-an-economic-operating-system-for-the-internet
- openchain signature database: https://api.openchain.xyz/signature-database/v1/lookup
