# Deploying Centscan

Centscan ships as one container (see `Dockerfile`). It runs the Next.js standalone server as the
non-root `node` user on port 3000 and keeps its SQLite database at `/data/centscan.db`. These steps
cover Railway. Any host that builds a Dockerfile and gives you a persistent volume at `/data` works
the same way.

## 1. Before the first deploy

1. Deploy `CentscanRegistry` and verify it on Sourcify, following `contracts/README.md`. Note the
   address. You can skip this step: the app serves reports and badges without a registry and
   disables attestation with an explanation.
2. Create a separate **attester** hot wallet (not the deployer). Fund it with about $2 of USDC for
   gas. Keep its private key for step 3 only.
3. Choose an RPC endpoint (see section 5). For production, use a provider endpoint.

## 2. Railway setup

1. **New Project → Deploy from GitHub repo** and pick this repository. Railway finds the root
   `Dockerfile` and builds with it.
2. **Volume:** in the service, go to *Settings → Volumes → Add Volume* and set the mount path to
   **`/data`**.
3. **Non-root image:** the image runs as `node` (uid 1000). Railway's volume docs say images that run
   as non-root "will have permissions issues" on volumes, and the fix is to set
   **`RAILWAY_RUN_UID=0`** in the service variables. Set it, or SQLite cannot create
   `/data/centscan.db`.
4. **Variables:** set everything in section 3. Enter secrets in the Railway dashboard only. Never
   commit them.
5. **Networking:** *Settings → Networking → Generate Domain*. Set `PORT=3000` so Railway routes to
   the port the image exposes.
6. **Healthcheck:** *Settings → Deploy → Healthcheck Path* = `/`. The image also has a Docker
   `HEALTHCHECK` that hits `http://127.0.0.1:3000/`.
7. **Replicas:** keep exactly 1. Railway does not allow replicas on a service with a volume, and
   SQLite is single-writer anyway. Expect a few seconds of downtime on each redeploy, because Railway
   cannot mount one volume on two deployments at the same time.

## 3. Environment variables

The app validates these at boot in `src/server/config.ts` and stops with a list of every problem it
finds.

| Variable | Required | Secret | Value / default | Notes |
|---|---|---|---|---|
| `ARC_RPC_URL` | yes | treat as secret if it embeds a provider key | `https://rpc.mainnet.arc.io` (public) | Use a provider URL in production (section 5) |
| `ARC_CHAIN_ID` | yes | no | `5042` | Validation rejects anything else |
| `DATABASE_PATH` | yes | no | `/data/centscan.db` | Set in the image already. Must be on the volume |
| `SOURCIFY_URL` | yes | no | `https://sourcify.dev/server` | |
| `SIGNATURE_DB_URL` | yes | no | `https://api.openchain.xyz/signature-database/v1` | |
| `REGISTRY_ADDRESS` | no | no | deployed `CentscanRegistry` address | Empty disables attestation |
| `ATTESTER_ADDRESS` | no | no | public address of the attester wallet | Needed together with `REGISTRY_ADDRESS` |
| `ATTESTER_PRIVATE_KEY` | no (needed for the attest route) | **yes** | 0x-prefixed 32-byte hex | Dashboard only. Without it the attest button explains why it is disabled |
| `RPC_MAX_CALLS_PER_SECOND` | no | no | `10` (1–10000) | Raise to around 200 with a provider RPC |
| `RPC_BURST` | no | no | `25` (1–10000) | Raise to around 400 with a provider RPC |
| `SCAN_FALLBACK_BLOCKS` | no | no | `300` (100–50000) | Blocks read for event-less contracts, 1 call each; raise to around 10000 with a provider RPC |
| `MAX_TXS_PER_REPORT` | no | no | `150` (10–10000) | Raise to around 2000 with a provider RPC |
| `LOG_LEVEL` | no | no | `info` | One of `fatal`, `error`, `warn`, `info`, `debug` or `trace` |
| `PORT` | no | no | `3000` | Read by the Next.js standalone server |
| `RAILWAY_RUN_UID` | Railway only | no | `0` | Lets the volume be written (see 2.3) |

`HOSTNAME=0.0.0.0`, `NODE_ENV=production` and `NEXT_TELEMETRY_DISABLED=1` are set in the image.

## 4. Post-deploy smoke checks

```shell
export CENTSCAN_URL="https://<your Railway domain>"   # the domain generated in step 2.5
export TARGET_ADDRESS="0x..."                          # any Arc mainnet contract with recent traffic

check() { curl -s -o /dev/null -w "%{http_code} %{time_total}s  $1\n" "$CENTSCAN_URL$1"; }
check /
check "/c/$TARGET_ADDRESS"
check "/badge/$TARGET_ADDRESS.svg"
check "/api/report/$TARGET_ADDRESS?hours=24"
```

| Request | Expected | Meaning of other codes |
|---|---|---|
| `GET /` | `200` | `5xx`: boot failed. Check the logs for `Invalid configuration: ...` |
| `GET /c/<addr>` | `200` (the page streams a fresh report if none is cached) | |
| `GET /badge/<addr>.svg` | `200`, `content-type: image/svg+xml`, `cache-control: public, max-age=3600` | `404` for a malformed address. `503` if the database can't be read (check the volume and `RAILWAY_RUN_UID`) |
| `GET /api/report/<addr>?hours=24` | `404 NOT_FOUND` before the first report, `200` after opening `/c/<addr>` once and letting it finish | `400` for a bad address or `hours` value. `500 INTERNAL` if the SQLite cache can't be read |

Order matters: open `/c/$TARGET_ADDRESS` in a browser and wait for the report to finish (30–60 s on
the public RPC). Then re-run the `/api/report` check and expect `200`. After that, restart the
service and check that `/api/report` still returns `200`. This proves the volume persists.

If attestation is configured, press **Attest** on the report page. The result is either a
transaction hash or a `503 ATTESTER_UNFUNDED` (fund the wallet). Then confirm on-chain with the
`arc-cast call ... latest(...)` command in `contracts/README.md`.

## 5. RPC budget

We measured the public endpoint `https://rpc.mainnet.arc.io` on 14 Oct 2026. It meters every call
inside a JSON-RPC batch:

- **10 calls/s sustained:** no errors.
- **12–30 calls/s:** returned `-32005 "rate limit exceeded"`.

A report needs about 2 calls per transaction, so the defaults (`RPC_MAX_CALLS_PER_SECOND=10`,
`MAX_TXS_PER_REPORT=150`) take about 30 s per report. The public RPC is also shared across every
visitor of the instance. For production, use a provider endpoint (Alchemy, QuickNode, dRPC or
Blockdaemon) in `ARC_RPC_URL` and raise the three tuning variables in section 3.
