import { BaseError, type Hex, type Transaction, type TransactionReceipt } from "viem";
import type { ProgressEvent } from "@/lib/report";
import type { ArcClient } from "../arc/client";
import type { ObservedCall } from "./price";

export interface CollectOptions {
  target: Hex;
  fromBlock: bigint;
  toBlock: bigint;
  maxTxs: number;
  fallbackBlocks: number;
  logPageBlocks?: bigint;
  logConcurrency?: number;
  onProgress?: (event: ProgressEvent) => void;
  signal?: AbortSignal;
}

export type Coverage = { kind: "logs" } | { kind: "block-scan"; blocks: number };

export interface CollectResult {
  calls: ObservedCall[];
  indirectTxs: number;
  coverage: Coverage;
  sampled: { analysed: number; found: number; scannedFromBlock: string } | null;
}

interface BlockRange {
  from: bigint;
  to: bigint;
}

/** The public Arc RPC accepts ~10,000-block getLogs ranges for one address; busier ranges are split on demand. */
const DEFAULT_LOG_PAGE_BLOCKS = 10_000n;
const MIN_LOG_PAGE_BLOCKS = 100n;
const DEFAULT_LOG_CONCURRENCY = 2;
/** Transaction + receipt per hash, so 50 hashes fill one 100-request JSON-RPC batch. */
const TX_CHUNK = 50;
const BLOCK_CHUNK = 50;
/** Block batches in flight at once; higher values trip the public RPC's rate limit. */
const BLOCK_CONCURRENCY = 1;
const RANGE_TOO_LARGE_CODE = -32012;

export function isRangeTooLarge(error: unknown): boolean {
  if (error instanceof BaseError) {
    const match = error.walk((e) => typeof e === "object" && e !== null && "code" in e && e.code === RANGE_TOO_LARGE_CODE);
    if (match) return true;
  }
  // The public Arc RPC also caps one getLogs answer at 2,000 logs ("query exceeds max results 2000, retry with
  // the range a-b"); splitting the page resolves it the same way.
  return error instanceof Error && /range too large|exceeds max results/.test(error.message);
}

/** Splits [from, to] into pages, newest first, so sampling keeps the most recent activity. */
export function pagesNewestFirst(from: bigint, to: bigint, size: bigint): BlockRange[] {
  const pages: BlockRange[] = [];
  for (let end = to; end >= from; end -= size) {
    const start = end - size + 1n > from ? end - size + 1n : from;
    pages.push({ from: start, to: end });
  }
  return pages;
}

const chunk = <T>(items: readonly T[], size: number): T[][] =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, i * size + size));

const sameAddress = (a: string | null | undefined, b: string): boolean => a?.toLowerCase() === b;

interface LogRef {
  hash: Hex;
  blockNumber: bigint;
  logIndex: number;
}

async function getLogsAdaptive(client: ArcClient, target: Hex, range: BlockRange): Promise<LogRef[]> {
  try {
    const logs = await client.getLogs({ address: target, fromBlock: range.from, toBlock: range.to });
    return logs.flatMap((l) =>
      l.transactionHash && l.blockNumber !== null ? [{ hash: l.transactionHash, blockNumber: l.blockNumber, logIndex: l.logIndex ?? 0 }] : [],
    );
  } catch (error) {
    const span = range.to - range.from + 1n;
    if (!isRangeTooLarge(error) || span <= MIN_LOG_PAGE_BLOCKS) throw error;
    const mid = range.from + span / 2n;
    const newer = await getLogsAdaptive(client, target, { from: mid, to: range.to });
    const older = await getLogsAdaptive(client, target, { from: range.from, to: mid - 1n });
    return [...newer, ...older];
  }
}

interface LogScan {
  hashes: Hex[];
  scannedFromBlock: bigint;
  complete: boolean;
}

async function scanLogs(client: ArcClient, opts: CollectOptions): Promise<LogScan> {
  const pages = pagesNewestFirst(opts.fromBlock, opts.toBlock, opts.logPageBlocks ?? DEFAULT_LOG_PAGE_BLOCKS);
  const concurrency = opts.logConcurrency ?? DEFAULT_LOG_CONCURRENCY;
  const seen = new Set<Hex>();
  const hashes: Hex[] = [];
  let scannedFromBlock = opts.toBlock + 1n;

  for (let i = 0; i < pages.length; i += concurrency) {
    opts.signal?.throwIfAborted();
    const wave = pages.slice(i, i + concurrency);
    const results = await Promise.all(wave.map((page) => getLogsAdaptive(client, opts.target, page)));
    for (const logs of results) {
      const newestFirst = [...logs].sort((a, b) =>
        a.blockNumber === b.blockNumber ? b.logIndex - a.logIndex : a.blockNumber > b.blockNumber ? -1 : 1,
      );
      for (const log of newestFirst) {
        if (seen.has(log.hash)) continue;
        seen.add(log.hash);
        hashes.push(log.hash);
      }
    }
    scannedFromBlock = (wave[wave.length - 1] as BlockRange).from;
    const done = Math.min(i + concurrency, pages.length);
    opts.onProgress?.({ step: "logs", done, total: pages.length });
    if (hashes.length >= opts.maxTxs) return { hashes, scannedFromBlock, complete: done === pages.length };
  }
  return { hashes, scannedFromBlock, complete: true };
}

function toObservedCall(tx: Transaction, receipt: TransactionReceipt, kind: ObservedCall["kind"]): ObservedCall {
  return {
    hash: tx.hash,
    from: tx.from,
    blockNumber: receipt.blockNumber,
    input: tx.input,
    gasUsed: receipt.gasUsed,
    effectiveGasPrice: receipt.effectiveGasPrice,
    success: receipt.status === "success",
    kind,
  };
}

/** Direct call, the deployment of the target, or neither (activity routed through another contract). */
function classify(tx: Transaction, receipt: TransactionReceipt, target: Hex): ObservedCall["kind"] | null {
  if (sameAddress(tx.to, target)) return "call";
  if (tx.to === null && sameAddress(receipt.contractAddress, target)) return "deploy";
  return null;
}

async function fetchCalls(
  client: ArcClient,
  hashes: readonly Hex[],
  opts: CollectOptions,
): Promise<{ calls: ObservedCall[]; indirect: number }> {
  const calls: ObservedCall[] = [];
  let indirect = 0;
  let done = 0;
  for (const group of chunk(hashes, TX_CHUNK)) {
    opts.signal?.throwIfAborted();
    const pairs = await Promise.all(
      group.map((hash) => Promise.all([client.getTransaction({ hash }), client.getTransactionReceipt({ hash })])),
    );
    for (const [tx, receipt] of pairs) {
      const kind = classify(tx, receipt, opts.target);
      if (kind) calls.push(toObservedCall(tx, receipt, kind));
      else indirect++;
    }
    done += group.length;
    opts.onProgress?.({ step: "transactions", done, total: hashes.length });
  }
  return { calls, indirect };
}

interface BlockScan {
  calls: ObservedCall[];
  blocks: number;
  found: number;
  scannedFromBlock: bigint;
  complete: boolean;
}

async function scanBlocks(client: ArcClient, opts: CollectOptions): Promise<BlockScan> {
  const lowest = opts.toBlock - BigInt(opts.fallbackBlocks) + 1n;
  const start = lowest > opts.fromBlock ? lowest : opts.fromBlock;
  const numbers: bigint[] = [];
  for (let n = opts.toBlock; n >= start; n--) numbers.push(n);

  const candidates: Transaction[] = [];
  let directCandidates = 0;
  let scannedFromBlock = opts.toBlock + 1n;
  let done = 0;
  const groups = chunk(numbers, BLOCK_CHUNK);
  for (let i = 0; i < groups.length; i += BLOCK_CONCURRENCY) {
    opts.signal?.throwIfAborted();
    const wave = groups.slice(i, i + BLOCK_CONCURRENCY);
    const blocks = await Promise.all(
      wave.flat().map((blockNumber) => client.getBlock({ blockNumber, includeTransactions: true })),
    );
    for (const block of blocks) {
      for (const tx of block.transactions) {
        if (sameAddress(tx.to, opts.target)) {
          candidates.push(tx);
          directCandidates++;
        } else if (tx.to === null) {
          candidates.push(tx);
        }
      }
    }
    done += wave.reduce((n, g) => n + g.length, 0);
    const lastGroup = wave[wave.length - 1] as bigint[];
    scannedFromBlock = lastGroup[lastGroup.length - 1] as bigint;
    opts.onProgress?.({ step: "blocks", done, total: numbers.length });
    if (directCandidates >= opts.maxTxs) break;
  }

  const calls: ObservedCall[] = [];
  for (const group of chunk(candidates, TX_CHUNK * 2)) {
    opts.signal?.throwIfAborted();
    const receipts = await Promise.all(group.map((tx) => client.getTransactionReceipt({ hash: tx.hash })));
    group.forEach((tx, i) => {
      const receipt = receipts[i] as TransactionReceipt;
      const kind = classify(tx, receipt, opts.target);
      if (kind) calls.push(toObservedCall(tx, receipt, kind));
    });
  }
  const capped = calls.slice(0, opts.maxTxs);
  return { calls: capped, blocks: done, found: calls.length, scannedFromBlock, complete: done === numbers.length };
}

/**
 * Finds transactions sent directly to the target in [fromBlock, toBlock].
 * Event logs locate candidates cheaply; contracts with no direct calls found that way fall back to a bounded
 * scan of recent blocks. Arc's public RPC exposes no trace API, so calls routed through other contracts can
 * be counted (via the target's logs) but not priced.
 */
export async function collectCalls(client: ArcClient, opts: CollectOptions): Promise<CollectResult> {
  if (opts.fromBlock > opts.toBlock) return { calls: [], indirectTxs: 0, coverage: { kind: "logs" }, sampled: null };

  const logScan = await scanLogs(client, opts);
  const analysed = logScan.hashes.slice(0, opts.maxTxs);
  const { calls, indirect } = await fetchCalls(client, analysed, opts);

  // Any log at all means the target emits events, so a block scan would not find calls the logs missed.
  if (logScan.hashes.length > 0) {
    const isSampled = analysed.length < logScan.hashes.length || !logScan.complete;
    return {
      calls,
      indirectTxs: indirect,
      coverage: { kind: "logs" },
      sampled: isSampled
        ? { analysed: analysed.length, found: logScan.hashes.length, scannedFromBlock: logScan.scannedFromBlock.toString() }
        : null,
    };
  }

  const scan = await scanBlocks(client, opts);
  return {
    calls: scan.calls,
    indirectTxs: indirect,
    coverage: { kind: "block-scan", blocks: scan.blocks },
    sampled:
      scan.complete && scan.found === scan.calls.length
        ? null
        : { analysed: scan.calls.length, found: scan.found, scannedFromBlock: scan.scannedFromBlock.toString() },
  };
}
