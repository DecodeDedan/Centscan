![Centscan](https://raw.githubusercontent.com/okwareddevnest/Centscan/main/brand/centscan-logo-480.png)

# Centscan: every Arc contract, priced to the cent

**Live site:** https://centscan.vercel.app
**Scanner:** https://centscan.vercel.app/app
**Code:** https://github.com/okwareddevnest/Centscan
**Registry contract (Arc mainnet, Sourcify exact match):** `0x4b0376Ec9712A7341F5903aeCC725B2a94f30F50`

> On Arc, gas is a price. Centscan reads real transaction receipts and tells you what every function of an Arc contract costs to call, in cents. You also see whether its source is verified and whether anyone actually uses it. Every report is hashed so anyone can check it, and can be attested on Arc mainnet.

---

## The problem

Arc pays gas in **USDC**, so every transaction fee is already a dollar amount. On other chains a fee drifts with a volatile gas token. On Arc a price list stays true. Yet nobody shows that price.

- **Builders** can't see what each function of their contract costs their users.
- **Reviewers and grant committees** check "is this real and live on Arc mainnet?" by hand, one explorer tab at a time.
- **Finance and payments teams** need budgets ("1,000 calls ≈ $1.11"), not gas units.

## Why it's hard on Arc today

We measured each of these on Arc mainnet:

- `trace_*` and `debug_*` are **not supported** (`-32601`), so nobody can simply ask for "all calls to contract X".
- The **explorer API sits behind a Cloudflare challenge**, so it can't be used from a server.
- The **public RPC allows about 10 calls per second**, and returns `-32005` at 12–30 calls/s.

## What Centscan does

Paste any Arc contract. In about 30 seconds you get:

1. **Is the source verified?** Checked against Sourcify (exact or partial match). If Sourcify is unreachable the result is "unknown", never "fail".
2. **Is it live?** Direct calls, unique senders, success rate, and first and last seen block, with honest coverage notes.
3. **What does each function cost?** Median, p90, min and max **in cents**, with a sample transaction for every row.
4. **Can I trust it?** The report is hashed as canonical JSON with keccak256. Anyone can recompute that hash in their browser and compare it with the attestation stored in the `CentscanRegistry` contract on Arc.
5. **Can I show it?** An embeddable README badge, for example `centscan | verified · live · 0.111¢/call`.

## What it uses Arc for

- **USDC-denominated gas is the product.** `gasUsed × effectiveGasPrice` from a real Arc receipt is already a dollar amount.
- **Arc mainnet data:** event logs and batched block reads, kept within the public RPC's limits.
- **On-chain attestations:** reports are attested to `CentscanRegistry` on Arc mainnet, so verdicts and costs can be checked by anyone.
- **Live chain telemetry:** the newest block, the base fee and the live price of a plain transfer power the app's readouts.

## Deployed on Arc mainnet

- **Contract:** `CentscanRegistry` at `0x4b0376Ec9712A7341F5903aeCC725B2a94f30F50`, on [Explorer](https://explorer.arc.io/address/0x4b0376Ec9712A7341F5903aeCC725B2a94f30F50) and [Sourcify](https://sourcify.dev/#/lookup/0x4b0376Ec9712A7341F5903aeCC725B2a94f30F50).
- **Deploy transaction:** [`0x3615f792ef020f450c2e482f428b7b55d9380cf9e8d25de26f21cfe5f4a68387`](https://explorer.arc.io/tx/0x3615f792ef020f450c2e482f428b7b55d9380cf9e8d25de26f21cfe5f4a68387), block 26,004,839.
- **Source:** verified on Sourcify, **exact match**.
- **Design:**
  - Append-only, keyed by (target, attester).
  - No owner, no upgrade path, holds no funds.
  - A newer report can't be overwritten by an older one.

## Architecture

![Architecture](https://raw.githubusercontent.com/okwareddevnest/Centscan/main/docs/diagrams/architecture.png)

## How a report is built

![Report pipeline](https://raw.githubusercontent.com/okwareddevnest/Centscan/main/docs/diagrams/report-pipeline.png)

## How a report is attested and verified

![Attestation](https://raw.githubusercontent.com/okwareddevnest/Centscan/main/docs/diagrams/attestation.png)

## How cost is measured

![Cost formula](https://raw.githubusercontent.com/okwareddevnest/Centscan/main/docs/diagrams/cost-formula.png)

A real Arc receipt: 183,288 gas × 24.000001249 gwei = **0.440¢**. A plain 21,000-gas transfer at the 20 gwei base fee = **0.042¢**.

## Honest limits

- Calls routed through other contracts (routers, multicall) are **counted, not priced**. Arc has no trace API, so pricing them would charge the router's whole transaction to this contract.
- On the public RPC, reports **sample the newest 150 transactions**, and the report says so.
- Contracts that emit no events are found by a bounded scan of recent blocks, and the coverage note says how many.

## Tech

- **App:** Next.js 16, React 19, TypeScript, viem, zod, SQLite.
- **UI:** a three.js "cost observatory", GSAP and Framer Motion.
- **Contract:** Solidity 0.8.30, built and tested with Arc Foundry (`arc-forge`).
- **Quality:**
  - 321 unit and integration tests, including replays of recorded Arc mainnet RPC responses;
  - Playwright end-to-end tests at desktop and 360 px;
  - contract tests, including a fuzz test.

## Vision

Centscan makes Arc's dollar-priced gas visible: paste any contract and see, in cents and verified on-chain, what every function really costs to use.

*Built on Arc for the Arc Microgrants program. Centscan is an independent tool, not an Arc or Circle product.*
