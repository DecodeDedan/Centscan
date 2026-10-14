<p><img src="brand/centscan-logo-tagline.svg" alt="Centscan — Every Arc contract, priced to the cent." width="420"></p>

Paste any Arc mainnet contract address and see whether its source is verified, whether anyone is using it, and what each function actually costs to call, in cents, measured from real receipts. Every report is hashed and can be attested on Arc.

**Why only Arc:** gas on Arc is paid in USDC, so a transaction fee is already a dollar price. Centscan is the first tool that publishes those prices per function.

## Documents
| Doc | What it covers |
|---|---|
| [Vision](docs/VISION.md) | The insight, users, principles, roadmap |
| [PRD](docs/PRD.md) | Requirements, UX states, acceptance criteria, risks |
| [Whitepaper](docs/WHITEPAPER.md) | Measurement method, attestation protocol, threat model, limits |
| [Architecture](docs/ARCHITECTURE.md) | Measured network facts, components, data model, contract, API, deployment |
| [Deploy](docs/DEPLOY.md) | Railway deploy, every env var, smoke checks |
| [Design direction](DESIGN.md) | Art direction for the site and the app |
| [Build prompts](docs/PROMPTS.md) | Step-by-step build plan |
| [Brand](brand/BRAND.md) | Logo, colour, type, motion, voice ([visual sheet](brand/brand-sheet.html)) |
| [Contracts](contracts/README.md) | `CentscanRegistry`: build, test, deploy, verify |

## Run locally
Requires Node 24 and pnpm 9.
```bash
pnpm install
cp .env.example .env.local   # public RPC defaults work; attestation stays off until REGISTRY_ADDRESS is set
pnpm dev                     # site on http://localhost:3000, scanner at /app
pnpm report 0x3600000000000000000000000000000000000000 1   # one report from the CLI
```

## Checks
```bash
pnpm lint && pnpm typecheck && pnpm test:coverage && pnpm build
pnpm test:e2e                     # Playwright, desktop and 360 px, against the live Arc RPC
cd contracts && arc-forge test    # registry contract
```

## Layout
| Path | What |
|---|---|
| `src/app/(site)` | Marketing site at `/` |
| `src/app/(app)` | Scanner at `/app` and reports at `/c/<address>` |
| `src/app/api`, `src/app/badge` | JSON, SSE and attestation routes; README badge |
| `src/server` | Arc client and throttle, collector, pricer, store, attestation |
| `src/lib` | Report schema, canonical hash, API contract, shared with the browser |
| `contracts` | `CentscanRegistry` (Arc Foundry) |
