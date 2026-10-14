# Centscan vision

## The insight
On every other EVM chain, gas is a volatile token, so "what does this contract cost to use?" has no stable answer.
On Arc, gas is paid in USDC. A transaction fee is already a dollar amount. For the first time, the cost of calling a smart contract function is a **price**: something you can quote, compare, budget and put on a receipt.

Nobody shows that price. Explorers show gas units. Wallets show one fee at a time. Builders guess.

## The product, in one sentence
Paste any Arc contract address and Centscan shows whether its source is verified, whether it is actually being used, and what each of its functions costs to call, in cents, measured from real mainnet transactions. The verdict is recorded on Arc as an attestation anyone can check.

## Who it is for
1. **Builders** shipping on Arc, who want to know which function is expensive before their users find out, and want a badge that proves "deployed, verified, live" in their README.
2. **Reviewers and grant programs** (Arc Microgrants, Circle Grant Program, hackathon judges), who need to check "deployed and working on Arc mainnet" for hundreds of submissions quickly.
3. **Product and finance people** building on Arc, who need unit economics: "a payout costs us 0.09¢, so 1M payouts cost $900."

## Why now
- Arc mainnet went public on 16 September 2026, and more than 100 apps launched on day one. The ecosystem is new enough that shared tooling is still missing.
- The base fee sits at a 20 gwei floor (measured on mainnet on 13 October 2026), so a plain 21,000-gas transfer costs about 0.042¢. Prices are stable enough to publish and compare.
- Source verification already exists through Sourcify (Arc mainnet, chain ID 5042, is supported). Centscan builds on it instead of competing with it.

## Principles
1. **Measured, never estimated.** Every number comes from a real mainnet receipt and links to that receipt.
2. **Say what was not checked.** Partial coverage is reported as partial, never rounded up to a pass.
3. **Composable.** Reports are JSON, badges are SVG, and attestations are on-chain events. Other tools can build on all three.
4. **Free to read.** Anyone can view any report. The only cost is the Arc gas for writing an attestation.

## Where it goes after the microgrant
| Stage | What ships |
|---|---|
| Microgrant (now) | On-demand reports, cents-per-function table, README badge, on-chain attestation registry |
| Next 3 months | Watch lists and alerts when a function's cost moves; a CI action that fails a PR if a function gets more expensive; per-app unit-economics view (cost per user action across several contracts) |
| Circle Grant Program | A public "cost index" for the Arc ecosystem; machine-readable attestations that grant programs and wallets can query; a Gateway/Nanopayments cost view once those settle on mainnet |

## What success looks like
- At least 20 Arc projects show a Centscan badge in their README.
- Judges use it to screen Microgrants submissions.
- A builder cuts a function's cost after seeing it on Centscan, and the before/after receipt proves it.
