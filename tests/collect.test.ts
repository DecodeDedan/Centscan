import { BaseError, toHex, type Hex } from "viem";
import { describe, expect, it } from "vitest";
import type { ProgressEvent } from "@/lib/report";
import { collectCalls, isRangeTooLarge, pagesNewestFirst } from "@/server/report/collect";
import {
  loadFixture,
  replayClient,
  resultsOf,
  scenarioNumber,
  scenarioString,
  UnrecordedRequestError,
  type RpcBlock,
  type RpcFixture,
  type RpcLog,
  type RpcReceipt,
  type RpcTx,
} from "./helpers/rpc-fixture";

const usdc = loadFixture("collect-usdc.json");
const blockScan = loadFixture("collect-block-scan.json");
const deploy = loadFixture("collect-deploy.json");

interface Window {
  target: Hex;
  fromBlock: bigint;
  toBlock: bigint;
}

const windowOf = (fx: RpcFixture): Window => ({
  target: scenarioString(fx, "target") as Hex,
  fromBlock: BigInt(scenarioString(fx, "fromBlock")),
  toBlock: BigInt(scenarioString(fx, "toBlock")),
});

// Expectations are derived from the recorded node responses, independently of the collector.

const receipts = (fx: RpcFixture): Map<string, RpcReceipt> =>
  new Map(resultsOf<RpcReceipt>(fx, "eth_getTransactionReceipt").map((r) => [r.result.transactionHash, r.result]));
const transactions = (fx: RpcFixture): Map<string, RpcTx> =>
  new Map(resultsOf<RpcTx>(fx, "eth_getTransactionByHash").map((r) => [r.result.hash, r.result]));

function logsFor(fx: RpcFixture, from: bigint, to: bigint): RpcLog[] {
  const entry = resultsOf<RpcLog[]>(fx, "eth_getLogs").find((e) => {
    const p = e.params[0] as { fromBlock: string; toBlock: string };
    return p.fromBlock === toHex(from) && p.toBlock === toHex(to);
  });
  if (!entry) throw new Error(`fixture has no getLogs for ${from}-${to}`);
  return entry.result;
}

/** Unique transaction hashes, newest log first. */
function hashesNewestFirst(logs: readonly RpcLog[]): Hex[] {
  const sorted = [...logs].sort((a, b) => {
    const blocks = BigInt(b.blockNumber) - BigInt(a.blockNumber);
    return blocks !== 0n ? (blocks > 0n ? 1 : -1) : Number(BigInt(b.logIndex) - BigInt(a.logIndex));
  });
  return [...new Set(sorted.map((l) => l.transactionHash))];
}

/** Direct calls and deployments of `target` in recorded blocks, newest block first, in block order. */
function blockScanCalls(fx: RpcFixture, target: string, toBlock: bigint, blocks: number): { hash: Hex; kind: "call" | "deploy" }[] {
  const byNumber = new Map(resultsOf<RpcBlock>(fx, "eth_getBlockByNumber").map((b) => [BigInt(b.result.number), b.result]));
  const rcpts = receipts(fx);
  const out: { hash: Hex; kind: "call" | "deploy" }[] = [];
  for (let n = toBlock; n > toBlock - BigInt(blocks); n--) {
    const block = byNumber.get(n);
    if (!block) throw new Error(`fixture has no block ${n}`);
    for (const tx of block.transactions) {
      if (tx.to?.toLowerCase() === target) out.push({ hash: tx.hash, kind: "call" });
      else if (tx.to === null && rcpts.get(tx.hash)?.contractAddress?.toLowerCase() === target) out.push({ hash: tx.hash, kind: "deploy" });
    }
  }
  return out;
}

const methods = (requests: readonly { method: string }[]): string[] => [...new Set(requests.map((r) => r.method))];

describe("pagesNewestFirst", () => {
  it("splits a range into newest-first pages with a short oldest page", () => {
    expect(pagesNewestFirst(1n, 25n, 10n)).toEqual([
      { from: 16n, to: 25n },
      { from: 6n, to: 15n },
      { from: 1n, to: 5n },
    ]);
  });

  it("returns one page when the range fits and none when it is empty", () => {
    expect(pagesNewestFirst(5n, 5n, 10n)).toEqual([{ from: 5n, to: 5n }]);
    expect(pagesNewestFirst(6n, 5n, 10n)).toEqual([]);
  });
});

describe("isRangeTooLarge", () => {
  it("recognises the node's -32012 code anywhere in a viem error chain", () => {
    const nested = new BaseError("outer", { cause: Object.assign(new Error("inner"), { code: -32012 }) });
    expect(isRangeTooLarge(nested)).toBe(true);
  });

  it("recognises the message from providers that use another code", () => {
    expect(isRangeTooLarge(new Error("query returned more than 10000 results: range too large"))).toBe(true);
  });

  it("recognises the public Arc RPC's 2,000-result cap as a range to split", () => {
    const capped = new BaseError("RPC Request failed.", {
      cause: new Error("query exceeds max results 2000, retry with the range 25913335-25915456"),
    });
    expect(isRangeTooLarge(capped)).toBe(true);
  });

  it("rejects other errors and non-errors", () => {
    expect(isRangeTooLarge(new BaseError("rate limited", { cause: Object.assign(new Error("x"), { code: -32005 }) }))).toBe(false);
    expect(isRangeTooLarge(new Error("header not found"))).toBe(false);
    expect(isRangeTooLarge("range too large")).toBe(false);
  });
});

describe("collectCalls on recorded Arc mainnet traffic", () => {
  it("returns nothing and makes no request for an empty window", async () => {
    // Arrange
    const { client, replay } = replayClient(usdc);

    // Act
    const result = await collectCalls(client, { target: windowOf(usdc).target, fromBlock: 10n, toBlock: 9n, maxTxs: 10, fallbackBlocks: 100 });

    // Assert
    expect(result).toEqual({ calls: [], indirectTxs: 0, coverage: { kind: "logs" }, sampled: null });
    expect(replay.requests).toEqual([]);
  });

  describe("Path A: USDC event logs", () => {
    const w = windowOf(usdc);

    it("prices every direct call and counts routed transactions as indirect", async () => {
      // Arrange
      const { client, replay } = replayClient(usdc);
      const progress: ProgressEvent[] = [];
      const hashes = hashesNewestFirst(logsFor(usdc, w.fromBlock, w.toBlock));
      const txs = transactions(usdc);
      const direct = hashes.filter((h) => txs.get(h)?.to?.toLowerCase() === w.target);

      // Act
      const result = await collectCalls(client, { ...w, maxTxs: 2_000, fallbackBlocks: 100, onProgress: (e) => progress.push(e) });

      // Assert
      expect(direct.length).toBeGreaterThan(0);
      expect(result.coverage).toEqual({ kind: "logs" });
      expect(result.sampled).toBeNull();
      expect(result.calls.map((c) => c.hash)).toEqual(direct);
      expect(result.indirectTxs).toBe(hashes.length - direct.length);
      expect(methods(replay.requests).sort()).toEqual(["eth_getLogs", "eth_getTransactionByHash", "eth_getTransactionReceipt"]);
      expect(progress[0]).toEqual({ step: "logs", done: 1, total: 1 });
      expect(progress.at(-1)).toEqual({ step: "transactions", done: hashes.length, total: hashes.length });
    });

    it("copies gas, price, status, sender and calldata from the receipts", async () => {
      // Arrange
      const { client } = replayClient(usdc);
      const rcpts = receipts(usdc);
      const txs = transactions(usdc);

      // Act
      const { calls } = await collectCalls(client, { ...w, maxTxs: 2_000, fallbackBlocks: 100 });

      // Assert
      for (const call of calls) {
        const receipt = rcpts.get(call.hash);
        const tx = txs.get(call.hash);
        expect(call).toEqual({
          hash: call.hash,
          from: tx?.from,
          blockNumber: BigInt(receipt?.blockNumber ?? -1),
          input: tx?.input,
          gasUsed: BigInt(receipt?.gasUsed ?? -1),
          effectiveGasPrice: BigInt(receipt?.effectiveGasPrice ?? -1),
          success: receipt?.status === "0x1",
          kind: "call",
        });
      }
      const blocks = calls.map((c) => c.blockNumber);
      expect(blocks).toEqual([...blocks].sort((a, b) => (a > b ? -1 : a < b ? 1 : 0)));
    });

    it("samples the newest transactions when the cap is reached, and says how far it scanned", async () => {
      // Arrange
      const maxTxs = scenarioNumber(usdc, "sampleMaxTxs");
      const pageBlocks = BigInt(scenarioNumber(usdc, "samplePageBlocks"));
      const { client, replay } = replayClient(usdc);
      const newestPageFrom = w.toBlock - pageBlocks + 1n;
      const pageHashes = hashesNewestFirst(logsFor(usdc, newestPageFrom, w.toBlock));

      // Act
      const result = await collectCalls(client, { ...w, maxTxs, fallbackBlocks: 100, logPageBlocks: pageBlocks, logConcurrency: 1 });

      // Assert
      expect(pageHashes.length).toBeGreaterThanOrEqual(maxTxs);
      expect(result.sampled).toEqual({ analysed: maxTxs, found: pageHashes.length, scannedFromBlock: newestPageFrom.toString() });
      expect(result.calls.length + result.indirectTxs).toBe(maxTxs);
      expect(replay.requests.filter((r) => r.method === "eth_getLogs")).toHaveLength(1);
      const fetched = replay.requests.filter((r) => r.method === "eth_getTransactionByHash").map((r) => r.params[0]);
      expect(fetched).toEqual(pageHashes.slice(0, maxTxs));
    });

    it("stops before fetching transactions when the caller aborts", async () => {
      // Arrange
      const { client, replay } = replayClient(usdc);
      const controller = new AbortController();

      // Act
      const pending = collectCalls(client, {
        ...w,
        maxTxs: 2_000,
        fallbackBlocks: 100,
        signal: controller.signal,
        onProgress: (e) => {
          if (e.step === "logs") controller.abort();
        },
      });

      // Assert
      await expect(pending).rejects.toMatchObject({ name: "AbortError" });
      expect(methods(replay.requests)).toEqual(["eth_getLogs"]);
    });

    it("aborts between log waves", async () => {
      // Arrange
      const { client, replay } = replayClient(usdc);
      const controller = new AbortController();
      controller.abort();

      // Act / Assert
      await expect(collectCalls(client, { ...w, maxTxs: 10, fallbackBlocks: 100, signal: controller.signal })).rejects.toMatchObject({
        name: "AbortError",
      });
      expect(replay.requests).toEqual([]);
    });

    it("fails loudly when the node errors on something other than range size", async () => {
      // Arrange: hand-made error for a range the recording never asked for.
      const from = w.toBlock - 9n;
      const { client, replay } = replayClient(usdc, [
        {
          method: "eth_getLogs",
          params: [{ address: w.target, topics: [], fromBlock: toHex(from), toBlock: toHex(w.toBlock) }],
          error: { code: -32000, message: "header not found" },
        },
      ]);

      // Act / Assert
      await expect(collectCalls(client, { ...w, fromBlock: from, maxTxs: 10, fallbackBlocks: 100 })).rejects.toThrow(/header not found/);
      expect(replay.requests).toHaveLength(1);
    });
  });

  describe("range too large", () => {
    const w = windowOf(blockScan);
    const pageBlocks = BigInt(scenarioNumber(blockScan, "logPageBlocks"));

    it("halves a page the node rejects, newer half first", async () => {
      // Arrange
      const { client, replay } = replayClient(blockScan);
      const span = w.toBlock - w.fromBlock + 1n;
      const mid = w.fromBlock + span / 2n;

      // Act
      await collectCalls(client, { ...w, maxTxs: 150, fallbackBlocks: scenarioNumber(blockScan, "fallbackBlocks"), logPageBlocks: pageBlocks });

      // Assert
      const ranges = replay.requests
        .filter((r) => r.method === "eth_getLogs")
        .map((r) => r.params[0] as { fromBlock: string; toBlock: string })
        .map((p) => [BigInt(p.fromBlock), BigInt(p.toBlock)]);
      expect(ranges).toEqual([
        [w.fromBlock, w.toBlock],
        [mid, w.toBlock],
        [w.fromBlock, mid - 1n],
      ]);
      expect(blockScan.entries.some((e) => "error" in e && e.error.code === -32012)).toBe(true);
    });

    it("gives up at the 100-block floor instead of splitting forever", async () => {
      // Arrange: a hand-made -32012 for a 100-block page (the real node accepts these; this models a busier provider).
      const from = w.toBlock - 99n;
      const { client, replay } = replayClient(blockScan, [
        {
          method: "eth_getLogs",
          params: [{ address: w.target, topics: [], fromBlock: toHex(from), toBlock: toHex(w.toBlock) }],
          error: { code: -32012, message: "requested range too large" },
        },
      ]);

      // Act
      const error = await collectCalls(client, { ...w, fromBlock: from, maxTxs: 10, fallbackBlocks: 100, logPageBlocks: 100n }).catch(
        (e: unknown) => e,
      );

      // Assert
      expect(isRangeTooLarge(error)).toBe(true);
      expect(replay.requests).toHaveLength(1);
    });
  });

  describe("Path B: block scan for a contract without events", () => {
    const w = windowOf(blockScan);
    const fallbackBlocks = scenarioNumber(blockScan, "fallbackBlocks");
    const pageBlocks = BigInt(scenarioNumber(blockScan, "logPageBlocks"));
    const scanned = resultsOf<RpcBlock>(blockScan, "eth_getBlockByNumber").length;

    it("finds direct calls by scanning recent blocks newest first, capped at maxTxs", async () => {
      // Arrange
      const { client } = replayClient(blockScan);
      const progress: ProgressEvent[] = [];
      const expected = blockScanCalls(blockScan, w.target, w.toBlock, scanned);

      // Act
      const result = await collectCalls(client, { ...w, maxTxs: 150, fallbackBlocks, logPageBlocks: pageBlocks, onProgress: (e) => progress.push(e) });

      // Assert
      expect(expected.length).toBeGreaterThanOrEqual(150);
      expect(result.coverage).toEqual({ kind: "block-scan", blocks: scanned });
      expect(result.calls.map((c) => c.hash)).toEqual(expected.slice(0, 150).map((c) => c.hash));
      expect(result.calls.every((c) => c.kind === "call")).toBe(true);
      expect(result.indirectTxs).toBe(0);
      expect(result.sampled).toEqual({ analysed: 150, found: expected.length, scannedFromBlock: (w.toBlock - BigInt(scanned) + 1n).toString() });
      expect(progress.filter((e) => e.step === "blocks").at(-1)).toEqual({ step: "blocks", done: scanned, total: fallbackBlocks });
    });

    it("stops scanning after the first wave once maxTxs direct calls are seen", async () => {
      // Arrange
      const { client, replay } = replayClient(blockScan);

      // Act
      const result = await collectCalls(client, { ...w, maxTxs: 1, fallbackBlocks, logPageBlocks: pageBlocks });

      // Assert
      // One wave is BLOCK_CHUNK (50) blocks at BLOCK_CONCURRENCY 1.
      const waveBlocks = 50;
      const firstWave = blockScanCalls(blockScan, w.target, w.toBlock, waveBlocks);
      expect(result.calls).toHaveLength(1);
      expect(result.calls[0]?.hash).toBe(firstWave[0]?.hash);
      expect(result.sampled).toMatchObject({ analysed: 1, found: firstWave.length });
      expect(replay.requests.filter((r) => r.method === "eth_getBlockByNumber")).toHaveLength(waveBlocks);
    });

    it("cancels the block scan when the caller aborts", async () => {
      // Arrange
      const { client, replay } = replayClient(blockScan);
      const controller = new AbortController();

      // Act
      const pending = collectCalls(client, {
        ...w,
        maxTxs: 150,
        fallbackBlocks,
        logPageBlocks: pageBlocks,
        signal: controller.signal,
        onProgress: (e) => {
          if (e.step === "blocks") controller.abort();
        },
      });

      // Assert
      await expect(pending).rejects.toMatchObject({ name: "AbortError" });
      expect(replay.requests.some((r) => r.method === "eth_getTransactionReceipt")).toBe(false);
    });
  });

  describe("Path B: a deployment inside the window", () => {
    const w = windowOf(deploy);
    const fallbackBlocks = scenarioNumber(deploy, "fallbackBlocks");

    it("finds the creation transaction and labels it deploy", async () => {
      // Arrange
      const { client } = replayClient(deploy);
      const expected = blockScanCalls(deploy, w.target, w.toBlock, fallbackBlocks);
      const creation = expected.find((c) => c.kind === "deploy");

      // Act
      const result = await collectCalls(client, { ...w, maxTxs: 150, fallbackBlocks });

      // Assert
      expect(creation).toBeDefined();
      expect(result.coverage).toEqual({ kind: "block-scan", blocks: fallbackBlocks });
      expect(result.sampled).toBeNull();
      expect(result.calls.map((c) => [c.hash, c.kind])).toEqual(expected.map((c) => [c.hash, c.kind]));
      const deployed = result.calls.find((c) => c.kind === "deploy");
      expect(deployed?.input.length).toBeGreaterThan(10);
    });

    it("scans no further back than the window start", async () => {
      // Arrange
      const { client, replay } = replayClient(deploy);

      // Act
      const result = await collectCalls(client, { ...w, maxTxs: 150, fallbackBlocks: fallbackBlocks + 5_000 });

      // Assert
      expect(result.coverage).toEqual({ kind: "block-scan", blocks: fallbackBlocks });
      const lowest = replay.requests
        .filter((r) => r.method === "eth_getBlockByNumber")
        .map((r) => BigInt(r.params[0] as string))
        .reduce((a, b) => (a < b ? a : b));
      expect(lowest).toBe(w.fromBlock);
    });

    it("refuses requests that were never recorded", async () => {
      const { client } = replayClient(deploy);
      const error = await collectCalls(client, { ...w, toBlock: w.toBlock + 1n, maxTxs: 1, fallbackBlocks: 1 }).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(BaseError);
      expect((error as BaseError).walk((e) => e instanceof UnrecordedRequestError)).toBeInstanceOf(UnrecordedRequestError);
    });
  });
});
