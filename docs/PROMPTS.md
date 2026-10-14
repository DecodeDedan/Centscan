# Centscan build prompts

Run these in order in Claude Code from the repo root. Each prompt is self-contained and points to the docs, which are the spec. The timeline assumes about 30 hours to the deadline (14 Oct 2026 23:59 ET).

| # | Prompt | Target time | Output |
|---|---|---|---|
| H0 | Human steps (no agent) | Hour 0 | Funded wallets, Arc Foundry installed |
| P1 | Registry contract | Hours 0–3 | Contract live and verified on Arc mainnet (makes the submission valid early) |
| P2 | App skeleton and server core | Hours 3–6 | Next.js app, config, logger, Arc client, store |
| P3 | Collector and pricer | Hours 6–12 | Report JSON for real contracts |
| P4 | Report UI | Hours 12–18 | Landing page and receipt page with streaming |
| P5 | Badge and attestation | Hours 18–21 | Badge route; attest route writing to mainnet |
| P6 | Tests and CI | Hours 21–24 | Green pipeline |
| P7 | Deploy | Hours 24–26 | Public URL |
| P8 | Submission copy and demo | Hours 26–28 | DoraHacks text, README, 90 s video script |
| B1 | Regenerate brand assets | Any time | SVGs in `brand/` |

---

## H0. Human steps (do these yourself first)
1. Create two wallets: **deployer** and **attester**. Keep the keys out of the repo; they go in `.env.local` (git-ignored) and in your host's secret store.
2. Put about $3 of USDC on Arc mainnet in the deployer and about $2 in the attester. Bridge or withdraw it yourself (for example with Circle's Bridge Kit/CCTP or an exchange that supports Arc). An agent must not handle funds or keys for you.
3. Install Arc Foundry from https://docs.arc.io/arc/tutorials/install-arc-foundry, so that `arc-forge --version` works.
4. Create a public GitHub repo named `centscan`.

---

## P1. Registry contract
```
Read docs/ARCHITECTURE.md §7 and docs/PRD.md FR5. Create a Foundry project in contracts/ using Arc Foundry
(binaries are arc-forge / arc-cast, not forge / cast).

1. Implement contracts/src/CentscanRegistry.sol exactly as specified in ARCHITECTURE.md §7 (Solidity 0.8.30).
2. Write contracts/test/CentscanRegistry.t.sol covering: first attestation stores all fields and emits Attested
   with correct indexed topics; ZeroTarget revert; StaleWindow revert for equal and lower windowEndBlock;
   two attesters on the same target do not overwrite each other; a newer window overwrites.
   Run `arc-forge test -vv` and show the real output.
3. Write contracts/script/Deploy.s.sol that deploys the registry using the DEPLOYER_PRIVATE_KEY env var.
4. Do not deploy yet. Print the exact commands for me to run:
   - deploy: arc-forge script script/Deploy.s.sol --rpc-url https://rpc.mainnet.arc.io --broadcast
   - verify on Sourcify: arc-forge verify-contract <address> src/CentscanRegistry.sol:CentscanRegistry
     --chain-id 5042 --verifier sourcify
   - smoke test: arc-cast send <address> "attest(address,bytes32,uint64,uint64,uint8)" ... from the attester
After I deploy, record the address and deploy tx in contracts/DEPLOYMENTS.md.
```

## P2. App skeleton and server core
```
Read docs/ARCHITECTURE.md §3, §6 (SQLite), §9, §10 and brand/BRAND.md.

Scaffold a Next.js 16 App Router app with TypeScript 5.x (not 7), pnpm, ESLint, and src/ layout.
Add: viem, zod, better-sqlite3, pino, framer-motion; dev: vitest, @playwright/test.

Implement, matching the paths in ARCHITECTURE.md §3:
- src/server/config.ts: zod schema for every env var in §9; throw at boot with a list of missing vars;
  assert ARC_CHAIN_ID equals eth_chainId on first use.
- src/server/log.ts: pino logger with a requestId child helper.
- src/server/arc/client.ts: viem public client for a custom chain (id 5042, native currency USDC with
  18 decimals, RPC from config), http transport with batch { batchSize: 25 }, timeout 10_000,
  retryCount 4 and exponential backoff with jitter; accepts an AbortSignal.
- src/server/store.ts plus migrations/0001_init.up.sql and .down.sql with exactly the tables in §6;
  apply migrations at boot in a transaction.
- .env.example listing every var with a comment (no real values).
- Design tokens from brand/BRAND.md as CSS variables in src/app/globals.css; IBM Plex Sans and Mono via next/font.
Run lint, typecheck and build, and show the output.
```

## P3. Collector and pricer
```
Read docs/ARCHITECTURE.md §4, §5, §6 and docs/WHITEPAPER.md §3. Use TDD: write each test first and watch it fail.

1. src/server/report/price.ts (pure): costWei, toMicroUsd, toCentsDisplay (3 significant decimals),
   nearest-rank median/p90, groupBySelector (empty input => "receive()"), revert grouping.
   Unit tests with hand-computed bigint values, including this real receipt:
   183288 gas * 24000001249 wei = 0.440 cents.
2. src/server/sourcify.ts: GET {SOURCIFY_URL}/v2/contract/5042/{address}?fields=abi, validated with zod;
   network errors => verdict "unknown", never "fail".
3. src/server/report/names.ts: ABI first, then openchain
   GET {SIGNATURE_DB_URL}/lookup?function=0x..,0x..&filter=true (batched), then the raw selector.
4. src/server/report/collect.ts: Path A (getLogs in 10,000-block pages, concurrency 2, halve the page on
   "requested range too large" down to 100) and Path B (block scan of SCAN_FALLBACK_BLOCKS with full txs).
   Keep only tx.to == target; count indirect txs; cap at MAX_TXS_PER_REPORT newest-first; emit progress
   events; honour AbortSignal.
   Integration tests use recorded JSON-RPC fixtures from real Arc mainnet responses (record them once with
   a script in scripts/record-fixtures.ts) behind a transport double. That is the only double allowed.
5. src/lib/canonical.ts: canonicalJson + keccak256, in a module importable by client code too.
6. src/server/report/build.ts: orchestrates eth_getCode check → Sourcify → collect → price → names →
   Report (schemaVersion 1) → store.
Then run a real report against a busy Arc mainnet contract and paste the headline and the first 3 rows.
```

## P4. Report UI
```
Read docs/PRD.md FR1, FR3, FR4, FR7 and §6 (UX states), and brand/BRAND.md. Light theme only.

Build:
- / : the logo with tagline, one address input (label, inline validation), a window select (1 h / 24 h / 7 d),
  three example contracts that have live cached reports, and a short "How costs are measured" section
  that links to WHITEPAPER.md.
- /c/[address] : server-render the cached report if one exists; otherwise open the SSE stream
  (/api/report/[address]/stream) and show the live step list. Render the RECEIPT pattern from BRAND.md:
  verdict rows (icon + word + colour), a headline "Median call costs X¢ · 1,000 calls ≈ $Y", a cost table
  (function, calls, median, p90, min–max, sample tx linking to https://explorer.arc.io/tx/<hash>),
  a reverted-calls line, coverage and sampling notes in amber, and the JSON plus a "Recompute hash" button.
- Implement every state in PRD §6: empty, invalid, loading, success, partial, no-activity, error.
- Motion: receipt rows print with a 40 ms stagger via Framer Motion initial/animate (never a CSS hidden
  start state); disable it with useReducedMotion. Don't animate the headline number in.
- Keyboard operable, visible focus rings, works at 360 px.
Verify in the browser at 1280 px and 360 px and show screenshots.
```

## P5. Badge and attestation
```
Read docs/PRD.md FR5, FR6 and docs/ARCHITECTURE.md §7, §8, §11.

1. src/server/badge.ts + route /badge/[address].svg: shields-style SVG matching brand/badge-example.svg
   (ink label with the mark, green value); value "verified · live · 0.04¢/call", built from the latest
   report; "not scanned" for unknown addresses; escape all text; Cache-Control public, max-age=3600.
   Unit test the SVG output.
2. src/server/attest.ts + POST /api/attest/[address]: requires a report less than 1 h old; computes flags
   (bit0 verified, bit1 live) and medianCostMicroUsd; sends attest() from ATTESTER_PRIVATE_KEY with viem
   walletClient; waits for the receipt; stores it in the attestations table; maps a StaleWindow revert
   to 409 and insufficient funds to 503 ATTESTER_UNFUNDED; rate limit 1 per address per 10 min.
3. On the report page: an "Attest on Arc" button with pending, success (link to the tx) and error states;
   a "Verify on Arc" panel that reads latest(target, ATTESTER_ADDRESS) from the registry and compares it
   with the recomputed hash in the browser.
4. Attest 3 real reports on mainnet and list the tx hashes.
```

## P6. Tests and CI
```
Add .github/workflows/ci.yml: pnpm install --frozen-lockfile, lint, typecheck, vitest with coverage
(fail under 80% for src/server), arc-forge test (install Arc Foundry from its release tarball as in the docs),
next build, Playwright e2e (fixtures transport, desktop + 360 px), docker build.
Add one Playwright test for the full flow: paste address → stream → receipt rows → badge snippet copy.
Run everything locally and show the real output. Fix failures in the code, not in the tests.
```

## P7. Deploy
```
Write a multi-stage Dockerfile (node:24-slim, pnpm, non-root user, DATABASE_PATH on /data) and deploy
instructions for Railway with a persistent volume at /data. List every env var to set (values from
.env.example; secrets set by me in the dashboard). After deploy, hit /, one /c/ page, one badge and
/api/report for a known contract, and report the status codes and timings.
```

## P8. Submission copy, README and demo
```
Using docs/VISION.md, docs/PRD.md and the live URLs, write:
1. README.md: logo, one-liner, a live badge of the registry contract itself, a screenshot, "What it uses
   Arc for", how costs are measured (link to WHITEPAPER.md), architecture diagram, local setup, the
   deployed registry address, and the 3 attestation txs.
2. DoraHacks submission text, under 250 words: problem, what it does, why only Arc makes it possible
   (fees are in USDC), what is live (links), what's next. Plain language, no hype words (see BRAND.md Voice).
3. A 90-second demo script: 0–10 s hook ("On Arc, gas is a price. Nobody shows it."), 10–50 s paste a real
   contract and show the receipt, 50–70 s attest on Arc and verify the hash, 70–85 s paste the badge into a
   README, 85–90 s the logo-with-tagline end card.
```

## B1. Regenerate brand assets
```
brand/tools/generate-brand.mjs builds every SVG in brand/ with the text converted to outlines.
It needs opentype.js 1.3.4 and IBM Plex Sans Regular and SemiBold TTFs (IBM/plex v6.4.0) in one folder:
  node brand/tools/generate-brand.mjs <fontDir> brand
Change colours or the tagline only through the constants at the top of the script, then update
brand/BRAND.md to match.
```
