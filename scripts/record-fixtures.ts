/**
 * Records real Arc mainnet JSON-RPC exchanges into tests/fixtures/*.json for the collector and builder tests.
 *   pnpm record-fixtures
 * Each fixture holds the scenario parameters and every request→response pair the code made while running that
 * scenario, so tests replay the exact traffic offline. Discovery picks live contracts that fit each path (one with
 * direct calls but no events, one with a few events, a recent deployment), so re-recording follows the chain.
 * The public RPC meters every call in a batch and answers -32005 above ~10 calls/s, so this stays at 6 calls/s.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  BaseError,
  createPublicClient,
  custom,
  http,
  RpcRequestError,
  type EIP1193RequestFn,
  type Hex,
  type Transaction,
} from "viem";
import { arc } from "viem/chains";
import type { ArcClient } from "../src/server/arc/client";
import { createThrottledFetch } from "../src/server/arc/throttle";
import { log } from "../src/server/log";
import { buildReport, NotAContractError } from "../src/server/report/build";
import { collectCalls } from "../src/server/report/collect";
import { fixtureKey, type RpcEntry, type RpcFixture } from "../tests/helpers/rpc-fixture";

const RPC_URL = process.env.ARC_RPC_URL ?? "https://rpc.mainnet.arc.io";
const CALLS_PER_SECOND = 6;
const BATCH_SIZE = 6;
/** Throttle waits count toward viem's per-request timeout, so it must cover a full queue of concurrent calls. */
const REQUEST_TIMEOUT_MS = 300_000;
const FIXTURE_DIR = join(__dirname, "..", "tests", "fixtures");

const USDC: Hex = "0x3600000000000000000000000000000000000000";
const USDC_WINDOW_BLOCKS = 200n;
const SAMPLE_MAX_TXS = 10;
const SAMPLE_PAGE_BLOCKS = 50;
const DISCOVERY_BLOCKS = 300n;
const DISCOVERY_CANDIDATES = 25;
const DISCOVERY_CHUNK = 30;
/** Wider than the RPC's ~10,000-block getLogs limit, so the collector must halve it. */
const RANGE_ERROR_BLOCKS = 15_000n;
const BUILD_MAX_TXS = 20;
const BUILD_FALLBACK_BLOCKS = 200;
const ACTIVE_MAX_LOGS = 40;
const FIXED_NOW = new Date("2026-10-14T12:00:00.000Z");

class Recorder {
  private readonly cache = new Map<string, Promise<RpcEntry>>();
  private touched = new Set<string>();
  readonly client: ArcClient;

  constructor(private readonly inner: EIP1193RequestFn) {
    const transport = custom(
      { request: async ({ method, params }: { method: string; params?: unknown }) => this.request(method, (params ?? []) as unknown[]) },
      { retryCount: 0 },
    );
    this.client = createPublicClient({ chain: arc, transport });
  }

  /** Starts a scenario: only requests made from now on are written to its fixture. */
  begin(): void {
    this.touched = new Set();
  }

  async entries(): Promise<RpcEntry[]> {
    return Promise.all([...this.touched].map((key) => this.cache.get(key) as Promise<RpcEntry>));
  }

  private async request(method: string, params: unknown[]): Promise<unknown> {
    const key = fixtureKey(method, params);
    this.touched.add(key);
    let pending = this.cache.get(key);
    if (!pending) {
      pending = this.fetchEntry(method, params);
      this.cache.set(key, pending);
      pending.catch(() => this.cache.delete(key));
    }
    const entry = await pending;
    if ("error" in entry) throw new RpcRequestError({ body: { method, params }, error: entry.error, url: RPC_URL });
    return entry.result;
  }

  private async fetchEntry(method: string, params: unknown[]): Promise<RpcEntry> {
    try {
      const result = await this.inner({ method, params } as Parameters<EIP1193RequestFn>[0]);
      return { method, params, result };
    } catch (error) {
      const rpcError = error instanceof BaseError ? error.walk((e) => e instanceof RpcRequestError) : null;
      if (rpcError instanceof RpcRequestError) return { method, params, error: { code: rpcError.code, message: rpcError.details } };
      throw error;
    }
  }
}

async function writeFixture(
  rec: Recorder,
  name: string,
  description: string,
  scenario: RpcFixture["scenario"],
): Promise<void> {
  const fixture: RpcFixture = { description, rpcUrl: RPC_URL, recordedAt: new Date().toISOString(), scenario, entries: await rec.entries() };
  mkdirSync(FIXTURE_DIR, { recursive: true });
  writeFileSync(join(FIXTURE_DIR, name), `${JSON.stringify(fixture)}\n`);
  log.info({ name, entries: fixture.entries.length }, "fixture written");
}

async function recordUsdc(rec: Recorder, tip: bigint): Promise<void> {
  rec.begin();
  const fromBlock = tip - USDC_WINDOW_BLOCKS + 1n;
  const full = await collectCalls(rec.client, { target: USDC, fromBlock, toBlock: tip, maxTxs: 2_000, fallbackBlocks: 100 });
  await collectCalls(rec.client, {
    target: USDC,
    fromBlock,
    toBlock: tip,
    maxTxs: SAMPLE_MAX_TXS,
    fallbackBlocks: 100,
    logPageBlocks: BigInt(SAMPLE_PAGE_BLOCKS),
    logConcurrency: 1,
  });
  await writeFixture(rec, "collect-usdc.json", "Arc USDC (0x3600…0000) over 200 blocks: Path A via logs, plus a 10-transaction sample", {
    target: USDC,
    fromBlock: fromBlock.toString(),
    toBlock: tip.toString(),
    sampleMaxTxs: SAMPLE_MAX_TXS,
    samplePageBlocks: SAMPLE_PAGE_BLOCKS,
  });
  log.info({ direct: full.calls.length, indirect: full.indirectTxs }, "usdc scenario recorded");
}

interface Candidate {
  address: Hex;
  direct: number;
  logs: number;
}

interface Discovery {
  quiet: Candidate | null;
  active: Candidate | null;
  deploy: { address: Hex; block: bigint } | null;
  senders: Hex[];
}

async function inChunks<T, R>(items: readonly T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size) out.push(...(await Promise.all(items.slice(i, i + size).map(fn))));
  return out;
}

async function discover(rec: Recorder, tip: bigint): Promise<Discovery> {
  const from = tip - DISCOVERY_BLOCKS + 1n;
  const numbers = Array.from({ length: Number(DISCOVERY_BLOCKS) }, (_, i) => tip - BigInt(i));
  const blocks = await inChunks(numbers, DISCOVERY_CHUNK, (n) => rec.client.getBlock({ blockNumber: n, includeTransactions: true }));
  const counts = new Map<Hex, number>();
  const creations: Transaction[] = [];
  const senders: Hex[] = [];
  for (const block of blocks) {
    for (const tx of block.transactions) {
      senders.push(tx.from);
      if (tx.to === null) creations.push(tx);
      else if (tx.to.toLowerCase() !== USDC) counts.set(tx.to.toLowerCase() as Hex, (counts.get(tx.to.toLowerCase() as Hex) ?? 0) + 1);
    }
  }
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, DISCOVERY_CANDIDATES);
  const candidates: Candidate[] = [];
  for (const [address, direct] of top) {
    const code = await rec.client.getCode({ address });
    if (!code || code === "0x") continue;
    const logs = await rec.client.getLogs({ address, fromBlock: from, toBlock: tip });
    candidates.push({ address, direct, logs: logs.length });
  }
  const byDirect = (a: Candidate, b: Candidate): number => b.direct - a.direct;
  const quiet = candidates.filter((c) => c.logs === 0).sort(byDirect)[0] ?? null;
  const active = candidates.filter((c) => c.logs > 0 && c.logs <= ACTIVE_MAX_LOGS && c.direct >= 2).sort(byDirect)[0] ?? null;

  let deploy: Discovery["deploy"] = null;
  for (const tx of creations) {
    const receipt = await rec.client.getTransactionReceipt({ hash: tx.hash });
    if (!receipt.contractAddress) continue;
    const logs = await rec.client.getLogs({ address: receipt.contractAddress, fromBlock: receipt.blockNumber, toBlock: tip });
    if (logs.length === 0) {
      deploy = { address: receipt.contractAddress.toLowerCase() as Hex, block: receipt.blockNumber };
      break;
    }
  }
  log.info({ candidates, quiet, active, deploy: deploy && { ...deploy, block: deploy.block.toString() } }, "discovery done");
  return { quiet, active, deploy, senders };
}

async function recordQuiet(rec: Recorder, tip: bigint, quiet: Candidate): Promise<void> {
  rec.begin();
  const fromBlock = tip - RANGE_ERROR_BLOCKS + 1n;
  const base = { target: quiet.address, fromBlock, toBlock: tip, maxTxs: 150, fallbackBlocks: Number(DISCOVERY_BLOCKS) };
  const full = await collectCalls(rec.client, { ...base, logPageBlocks: RANGE_ERROR_BLOCKS });
  await collectCalls(rec.client, { ...base, maxTxs: 1, logPageBlocks: RANGE_ERROR_BLOCKS });
  await writeFixture(
    rec,
    "collect-block-scan.json",
    "A contract with direct calls and no events: a 15,000-block getLogs page (range too large, halved), then Path B over 300 blocks",
    {
      target: quiet.address,
      fromBlock: fromBlock.toString(),
      toBlock: tip.toString(),
      logPageBlocks: Number(RANGE_ERROR_BLOCKS),
      fallbackBlocks: Number(DISCOVERY_BLOCKS),
      directCallsSeen: full.calls.length,
    },
  );
}

async function recordDeploy(rec: Recorder, tip: bigint, deploy: { address: Hex; block: bigint }): Promise<void> {
  rec.begin();
  const fallbackBlocks = Number(tip - deploy.block + 1n);
  await collectCalls(rec.client, { target: deploy.address, fromBlock: deploy.block, toBlock: tip, maxTxs: 150, fallbackBlocks });
  await writeFixture(rec, "collect-deploy.json", "A contract deployed inside the window that emits no events: Path B finds its creation", {
    target: deploy.address,
    fromBlock: deploy.block.toString(),
    toBlock: tip.toString(),
    fallbackBlocks,
  });
}

async function findEoa(rec: Recorder, senders: readonly Hex[]): Promise<Hex> {
  for (const sender of new Set(senders.map((s) => s.toLowerCase() as Hex))) {
    const code = await rec.client.getCode({ address: sender });
    if (!code || code === "0x") return sender;
  }
  throw new Error("no externally owned sender found in the discovery window");
}

async function recordBuild(rec: Recorder, active: Candidate, eoa: Hex): Promise<void> {
  rec.begin();
  const notFound = async (): Promise<Response> => new Response(null, { status: 404 });
  const deps = {
    client: rec.client,
    chainId: arc.id,
    sourcifyUrl: "https://sourcify.dev/server",
    signatureDbUrl: "https://api.openchain.xyz/signature-database/v1",
    maxTxs: BUILD_MAX_TXS,
    fallbackBlocks: BUILD_FALLBACK_BLOCKS,
    fetchImpl: notFound,
    now: () => FIXED_NOW,
  };
  await rec.client.getChainId();
  const report = await buildReport(deps, active.address, 1);
  try {
    await buildReport(deps, eoa, 1);
    throw new Error(`expected ${eoa} to have no code`);
  } catch (error) {
    if (!(error instanceof NotAContractError)) throw error;
  }
  await writeFixture(rec, "build.json", "buildReport over a 1-hour window for a contract with a few events, plus an EOA", {
    target: active.address,
    eoa,
    hours: 1,
    maxTxs: BUILD_MAX_TXS,
    fallbackBlocks: BUILD_FALLBACK_BLOCKS,
    toBlock: report.window.toBlock,
  });
}

async function main(): Promise<void> {
  const inner = http(RPC_URL, {
    batch: { batchSize: BATCH_SIZE },
    timeout: REQUEST_TIMEOUT_MS,
    retryCount: 6,
    retryDelay: 1_000,
    fetchFn: createThrottledFetch(CALLS_PER_SECOND, BATCH_SIZE),
  })({ chain: arc }).request;
  const rec = new Recorder(inner);

  const chainId = await rec.client.getChainId();
  if (chainId !== arc.id) throw new Error(`${RPC_URL} serves chain ${chainId}, expected ${arc.id}`);
  const tip = await rec.client.getBlockNumber({ cacheTime: 0 });
  log.info({ tip: tip.toString() }, "recording at tip");

  await recordUsdc(rec, tip);
  const found = await discover(rec, tip);
  if (!found.quiet) throw new Error("discovery found no event-less contract with direct calls; re-run later");
  if (!found.active) throw new Error("discovery found no contract with a few events and direct calls; re-run later");
  await recordQuiet(rec, tip, found.quiet);
  if (found.deploy) await recordDeploy(rec, tip, found.deploy);
  else log.warn("no event-less deployment in the discovery window; collect-deploy.json not re-recorded");
  await recordBuild(rec, found.active, await findEoa(rec, found.senders));
}

main().catch((error: unknown) => {
  log.error({ err: error instanceof Error ? error.message : String(error) }, "recording failed");
  process.exitCode = 1;
});
