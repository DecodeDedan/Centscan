# Centscan PRD

| | |
|---|---|
| Status | In build (server, contract and report pipeline done; see README) |
| Target | Arc Microgrants submission, closes 14 Oct 2026 23:59 ET |
| Network | Arc mainnet, chain ID 5042 |

## 1. Problem
On Arc, every transaction fee is paid in USDC, so each contract function has a real dollar price. Builders, reviewers and finance teams cannot see that price:
- Explorers show gas units and single transactions, not cost per function.
- Nothing combines "source verified?", "actually used?" and "what does it cost?" in one answer.
- Reviewers checking "deployed and working on Arc mainnet" do it by hand, one explorer tab at a time.

## 2. Goals
| # | Goal | Measure |
|---|---|---|
| G1 | Any Arc mainnet contract gets a report in under 30 s | p95 report time with default window ≤ 30 s |
| G2 | Every cost figure is traceable | 100% of per-function rows link to a sample transaction |
| G3 | Reports can be proven on-chain | Attestation written to Arc mainnet and readable by anyone |
| G4 | Builders can show it | Embeddable SVG badge per contract |

**Non-goals for this release:** continuous indexing of the whole chain, alerts, accounts and logins, paid plans, other chains, and source verification itself (Sourcify does that).

## 3. Users and core stories
1. **Builder:** "I paste my contract address and see what each function costs my users, so I can fix the expensive one."
2. **Builder:** "I copy a badge into my README that proves my contract is verified and live."
3. **Reviewer:** "I paste an address from a submission and know within 30 seconds whether it is real, verified and used."
4. **Anyone:** "I open a report link someone shared and check its attestation on Arc myself."

## 4. Functional requirements

### FR1 Report request
- Input: one Arc address (`0x` + 40 hex characters, checksummed or not). Reject anything else with an inline error.
- Optional window: last 1 h, 24 h (default) or 7 d, converted to blocks at the measured ~0.5 s block time (24 h ≈ 172,800 blocks).
- If the address has no code (`eth_getCode` returns `0x`), return "Not a contract on Arc mainnet" and stop.

### FR2 Source check
- Query Sourcify v2 `GET /server/v2/contract/5042/{address}?fields=abi`.
- `match` = `exact_match` gives **✓ Verified (exact)**; `match` = `match` gives **✓ Verified (partial)**; `null` gives **✕ Not verified on Sourcify**, with a link to the Sourcify verifier.
- If Sourcify is unreachable, show **? Unknown (Sourcify unavailable)**. Never treat that as a fail.

### FR3 Activity check
- Collect transactions **sent directly to** the contract inside the window (see Architecture §4 for how).
- Show count, first and last seen, unique senders, and success rate.
- Verdict: **✓ Live** if there is at least 1 successful call in the window, **! Quiet** if there are none in the window but some in the 7-day backstop, **✕ No calls found** otherwise.
- Coverage must be stated: "Found via event logs" or "Event-less contract: scanned the last N blocks only."

### FR4 Cost table (the core)
- For each function selector called: name, calls, median cost, p90 cost, min and max, all in cents with 3 significant decimals, plus median gas, and a link to a sample transaction.
- Cost per transaction = `gasUsed × effectiveGasPrice` in wei of native USDC (18 decimals). Cents = wei ÷ 10^16.
- Function name source, in order: (1) the verified ABI from Sourcify, (2) the openchain signature database, labelled "name from public signature DB", (3) the raw selector.
- Calls with empty calldata show as `receive()`. Contract creation shows as `deploy`, using the creation transaction if it is in the window.
- Failed calls are counted separately: "3 reverted calls cost 0.12¢ total."
- Headline: "Median call costs **X¢**. 1,000 calls ≈ **$Y**."

### FR5 Attestation
- Any report can be attested to the `CentscanRegistry` contract on Arc mainnet.
- The attestation stores the target, the keccak256 of the canonical report JSON, the verdict bits (verified, live), the median cost in micro-USD, the window end block, and the attester.
- Reports are attested by the Centscan service wallet ("official"). The contract also accepts attestations from any address, and the UI labels those as third-party.
- The report page shows the attestation transaction and lets anyone recompute the hash from the JSON.

### FR6 Badge
- `GET /badge/{address}.svg` returns a shields-style SVG: `centscan | verified · live · 0.04¢/call`, built from the latest cached report.
- Cache it for 1 h (`Cache-Control: public, max-age=3600`). Unknown contracts get a neutral `centscan | not scanned` badge.
- The report page shows copy-ready Markdown and HTML snippets.

### FR7 Report page and JSON
- `/c/{address}` renders the receipt. `/api/report/{address}` returns the JSON. Both serve the cached report and offer "Refresh" (rate-limited).
- The landing page has a single input, three example contracts with live reports, and the "how costs are measured" note.

## 5. Non-functional requirements
| Area | Requirement |
|---|---|
| Accuracy | Costs come from receipts only. No estimates. Each row has a sample tx link. |
| Performance | Default 24 h report ≤ 30 s p95; cached report < 300 ms |
| RPC limits | `eth_getLogs` pages of 10,000 blocks, halved on a range error; client-side budget of 10 JSON-RPC calls/s on the public RPC (measured limit), configurable for provider endpoints; 5 retries with doubling backoff; 10 s timeout per call |
| Bounds | Max 150 transactions analysed per report by default (sampled newest-first, and the report says so), raised by config on a provider RPC; max 7-day window |
| Abuse | Refresh limited to 1 per address per 5 min and 20 per IP per hour |
| Accessibility | WCAG 2.2 AA; status never shown by colour alone; keyboard operable; works from 360 px |
| Security | Service key only in env; attest endpoint server-side with its own rate limit; all external data validated with zod |
| Observability | Structured JSON logs (pino) at each boundary: RPC, Sourcify, openchain, attestation tx |

## 6. UX states (all required)
| State | What the user sees |
|---|---|
| Empty | Landing input with example contracts |
| Invalid input | Inline error under the field |
| Loading | Receipt skeleton plus a live step list: "Reading code → Checking Sourcify → Collecting calls (page 12/173) → Pricing" |
| Success | Receipt with verdicts, cost table, badge snippet, attest button |
| Partial | Amber notes: "Sourcify unavailable", "Sampled 150 of 3,994 transactions", "Event-less contract: last 20,000 blocks only" |
| No activity | Verdicts render; cost table is replaced by "No calls in this window" and a wider-window button |
| Error | Plain message plus retry; RPC errors are logged with request id |

## 7. Acceptance criteria
- [ ] A report for a real, active, verified Arc mainnet contract shows ✓ Verified, ✓ Live and a cost table whose sample tx links open on explorer.arc.io.
- [ ] An EOA address returns "Not a contract on Arc mainnet".
- [ ] An unverified contract shows ✕ Not verified and still prices its functions, with names from openchain or raw selectors.
- [ ] Per-call cost equals `gasUsed × effectiveGasPrice ÷ 10^16` cents for a hand-checked transaction.
- [ ] `CentscanRegistry` is deployed on Arc mainnet, and at least 3 real attestations are visible on explorer.arc.io.
- [ ] `/badge/{address}.svg` renders in a GitHub README.
- [ ] Lint, typecheck, unit tests, one Playwright test of the full flow, and the build all pass in CI.

## 8. Risks
| Risk | Mitigation |
|---|---|
| Event-less contracts cannot be found via `eth_getLogs` | Bounded recent-block scan with `eth_getBlockByNumber(full)` plus a coverage note; pasting tx hashes is a later feature |
| Public RPC throttling | Configurable RPC URL (QuickNode, dRPC, Alchemy and Blockdaemon all serve Arc); backoff; cache |
| Sourcify outage | Report "Unknown", never "fail" |
| Tips make prices vary | Use the receipt's `effectiveGasPrice` (base fee plus tip actually paid) and show p90 next to the median |
| Deadline (~30 h) | Build order in `PROMPTS.md`; the registry contract ships first so the submission is valid early |
