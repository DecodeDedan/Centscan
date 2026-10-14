import type { Hex } from "viem";
import { reportSchema, type ProgressEvent, type Report, type Verdict, type WindowHours } from "@/lib/report";
import type { ArcClient } from "../arc/client";
import type { FetchLike } from "../http";
import { getSourceStatus } from "../sourcify";
import { collectCalls } from "./collect";
import { resolveNames } from "./names";
import { summarizeCalls } from "./price";

export class NotAContractError extends Error {
  constructor(readonly address: string) {
    super(`No contract code at ${address} on Arc mainnet`);
    this.name = "NotAContractError";
  }
}

export interface BuildDeps {
  client: ArcClient;
  chainId: number;
  sourcifyUrl: string;
  signatureDbUrl: string;
  maxTxs: number;
  fallbackBlocks: number;
  fetchImpl?: FetchLike;
  now?: () => Date;
}

export interface BuildOptions {
  onProgress?: (event: ProgressEvent) => void;
  signal?: AbortSignal;
}

/** Blocks sampled to estimate block time, so the window in hours maps onto the chain's real pace. */
const BLOCK_TIME_SAMPLE = 10_000n;
const MS_PER_HOUR = 3_600_000;

async function estimateBlockTimeMs(client: ArcClient, tip: bigint): Promise<number> {
  const earlier = tip > BLOCK_TIME_SAMPLE ? tip - BLOCK_TIME_SAMPLE : 0n;
  const [latest, past] = await Promise.all([client.getBlock({ blockNumber: tip }), client.getBlock({ blockNumber: earlier })]);
  const blocks = Number(tip - earlier);
  if (blocks === 0) return 1_000;
  return Math.max(1, Math.round((Number(latest.timestamp - past.timestamp) * 1_000) / blocks));
}

function activityVerdict(successfulCalls: number, indirectTxs: number): Verdict {
  if (successfulCalls > 0) return "pass";
  return indirectTxs > 0 ? "warn" : "fail";
}

export async function buildReport(deps: BuildDeps, target: Hex, hours: WindowHours, opts: BuildOptions = {}): Promise<Report> {
  const { client } = deps;
  const { signal } = opts;
  const address = target.toLowerCase() as Hex;

  const code = await client.getCode({ address });
  if (!code || code === "0x") throw new NotAContractError(address);
  opts.onProgress?.({ step: "code", done: 1, total: 1 });

  const toBlock = await client.getBlockNumber({ cacheTime: 0 });
  const blockTimeMs = await estimateBlockTimeMs(client, toBlock);
  const windowBlocks = BigInt(Math.ceil((hours * MS_PER_HOUR) / blockTimeMs));
  const fromBlock = toBlock - windowBlocks + 1n > 0n ? toBlock - windowBlocks + 1n : 0n;

  const sourcePromise = getSourceStatus(address, {
    baseUrl: deps.sourcifyUrl,
    chainId: deps.chainId,
    fetchImpl: deps.fetchImpl,
    signal,
  }).then((status) => {
    opts.onProgress?.({ step: "source", done: 1, total: 1 });
    return status;
  });
  const [source, collected] = await Promise.all([
    sourcePromise,
    collectCalls(client, {
      target: address,
      fromBlock,
      toBlock,
      maxTxs: deps.maxTxs,
      fallbackBlocks: deps.fallbackBlocks,
      onProgress: opts.onProgress,
      signal,
    }),
  ]);

  const summary = summarizeCalls(collected.calls);
  const names = await resolveNames(
    summary.functions.map((f) => f.selector),
    source.abiNames,
    { signatureDbUrl: deps.signatureDbUrl, fetchImpl: deps.fetchImpl, signal },
  );
  opts.onProgress?.({ step: "names", done: 1, total: 1 });

  const report: Report = {
    schemaVersion: 1,
    chainId: 5042,
    target: address,
    window: { fromBlock: fromBlock.toString(), toBlock: toBlock.toString(), hours, blockTimeMs },
    generatedAt: (deps.now?.() ?? new Date()).toISOString(),
    source: { verdict: source.verdict, match: source.match, sourcifyUrl: source.sourcifyUrl },
    activity: {
      verdict: activityVerdict(summary.successfulCalls, collected.indirectTxs),
      directCalls: collected.calls.length,
      successfulCalls: summary.successfulCalls,
      indirectTxs: collected.indirectTxs,
      uniqueSenders: summary.uniqueSenders,
      firstSeenBlock: summary.firstSeenBlock,
      lastSeenBlock: summary.lastSeenBlock,
      coverage: collected.coverage,
      sampled: collected.sampled,
    },
    functions: summary.functions.map((f) => {
      const name = names.get(f.selector);
      return { ...f, name: name?.name ?? null, nameSource: name?.source ?? null };
    }) as Report["functions"],
    reverted: summary.reverted,
    headline: summary.headline,
  };
  // Defensive: a report that does not match the published schema must never be stored or attested.
  return reportSchema.parse(report);
}
