import { toHex, type Hex } from "viem";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { reportSchema, type ProgressEvent } from "@/lib/report";
import type { FetchLike } from "@/server/http";
import { buildReport, NotAContractError, type BuildDeps } from "@/server/report/build";
import {
  loadFixture,
  replayClient,
  resultsOf,
  scenarioNumber,
  scenarioString,
  type RpcBlock,
  type RpcLog,
  type RpcReceipt,
  type RpcTx,
} from "./helpers/rpc-fixture";

const fx = loadFixture("build.json");
const TARGET = scenarioString(fx, "target") as Hex;
const EOA = scenarioString(fx, "eoa") as Hex;
const MAX_TXS = scenarioNumber(fx, "maxTxs");
const TO_BLOCK = BigInt(scenarioString(fx, "toBlock"));
const SOURCIFY = "https://sourcify.test/server";
const SIGNATURE_DB = "https://openchain.test/signature-database/v1";
const NOW = new Date("2026-10-14T12:00:00.000Z");
const ERC20_ABI = [
  { type: "function", name: "transfer", inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }] },
];

// ---- Expectations derived from the recorded node responses, independently of the builder. ----

const blocks = new Map(resultsOf<RpcBlock>(fx, "eth_getBlockByNumber").map((b) => [BigInt(b.result.number), b.result]));
const earlier = [...blocks.keys()].find((n) => n !== TO_BLOCK) ?? -1n;
const BLOCK_TIME_MS = Math.round(
  (Number(BigInt(blocks.get(TO_BLOCK)?.timestamp ?? "0") - BigInt(blocks.get(earlier)?.timestamp ?? "0")) * 1_000) / Number(TO_BLOCK - earlier),
);
const FROM_BLOCK = TO_BLOCK - BigInt(Math.ceil(3_600_000 / BLOCK_TIME_MS)) + 1n;

const logs = resultsOf<RpcLog[]>(fx, "eth_getLogs").find((e) => (e.params[0] as { fromBlock: string }).fromBlock === toHex(FROM_BLOCK));
const allHashes = [...new Set((logs?.result ?? []).map((l) => l.transactionHash))];
const txs = new Map(resultsOf<RpcTx>(fx, "eth_getTransactionByHash").map((r) => [r.result.hash, r.result]));
const receipts = new Map(resultsOf<RpcReceipt>(fx, "eth_getTransactionReceipt").map((r) => [r.result.transactionHash, r.result]));
const analysed = [...txs.keys()];
const direct = analysed.filter((h) => txs.get(h)?.to?.toLowerCase() === TARGET);
const succeeded = direct.filter((h) => receipts.get(h)?.status === "0x1");
const SELECTOR = txs.get(direct[0] as Hex)?.input.slice(0, 10) ?? "";
const microUsd = (h: Hex): bigint => {
  const r = receipts.get(h);
  return (BigInt(r?.gasUsed ?? 0) * BigInt(r?.effectiveGasPrice ?? 0) + 500_000_000_000n) / 1_000_000_000_000n;
};
const sortedCosts = succeeded.map(microUsd).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
const MEDIAN = sortedCosts[Math.ceil(sortedCosts.length / 2) - 1];

function fetchDouble(sourcify: () => Promise<Response>, signatureDb: (url: string) => Promise<Response>): ReturnType<typeof vi.fn<FetchLike>> {
  return vi.fn<FetchLike>(async (url) => (url.startsWith(SOURCIFY) ? sourcify() : signatureDb(url)));
}

const namesFor = async (url: string): Promise<Response> => {
  const requested = new URL(url).searchParams.get("function")?.split(",") ?? [];
  const fn = Object.fromEntries(requested.map((s) => [s, s === SELECTOR ? [{ name: "settle(bytes32)" }] : null]));
  return Response.json({ ok: true, result: { event: {}, function: fn } });
};

function deps(overrides: Partial<BuildDeps> = {}): BuildDeps {
  return {
    client: replayClient(fx).client,
    chainId: 5042,
    sourcifyUrl: SOURCIFY,
    signatureDbUrl: SIGNATURE_DB,
    maxTxs: MAX_TXS,
    fallbackBlocks: scenarioNumber(fx, "fallbackBlocks"),
    fetchImpl: fetchDouble(async () => Response.json({ match: "exact_match", abi: ERC20_ABI }), namesFor),
    now: () => NOW,
    ...overrides,
  };
}

describe("buildReport on recorded Arc mainnet traffic", () => {
  beforeEach(() => {
    vi.spyOn(Math, "random").mockReturnValue(0);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sanity-checks the recording", () => {
    expect(BLOCK_TIME_MS).toBeGreaterThan(0);
    expect(logs).toBeDefined();
    expect(allHashes.length).toBeGreaterThan(MAX_TXS);
    expect(analysed).toHaveLength(MAX_TXS);
    expect(succeeded.length).toBeGreaterThan(0);
  });

  it("builds a schema-valid, sampled report priced from the receipts", async () => {
    // Act
    const report = await buildReport(deps(), TARGET, 1);

    // Assert
    expect(reportSchema.parse(report)).toEqual(report);
    expect(report).toMatchObject({
      schemaVersion: 1,
      chainId: 5042,
      target: TARGET,
      window: { fromBlock: FROM_BLOCK.toString(), toBlock: TO_BLOCK.toString(), hours: 1, blockTimeMs: BLOCK_TIME_MS },
      generatedAt: NOW.toISOString(),
      source: { verdict: "pass", match: "exact_match", sourcifyUrl: `https://sourcify.dev/#/lookup/${TARGET}` },
      activity: {
        verdict: "pass",
        directCalls: direct.length,
        successfulCalls: succeeded.length,
        indirectTxs: analysed.length - direct.length,
        coverage: { kind: "logs" },
        sampled: { analysed: MAX_TXS, found: allHashes.length, scannedFromBlock: FROM_BLOCK.toString() },
      },
      headline: { medianMicroUsd: MEDIAN?.toString() },
    });
    expect(report.functions[0]).toMatchObject({ selector: SELECTOR, name: "settle(bytes32)", nameSource: "signature-db" });
    expect(report.functions.reduce((n, f) => n + f.calls, 0)).toBe(succeeded.length);
    expect(report.activity.uniqueSenders).toBe(new Set(direct.map((h) => txs.get(h)?.from.toLowerCase())).size);
  });

  it("normalises the target address and asks Sourcify about it on Arc", async () => {
    // Arrange
    const fetchImpl = fetchDouble(async () => Response.json({ match: null }), namesFor);

    // Act
    const report = await buildReport(deps({ fetchImpl }), TARGET.toUpperCase().replace("0X", "0x") as Hex, 1);

    // Assert
    expect(report.target).toBe(TARGET);
    expect(report.source.verdict).toBe("fail");
    expect(fetchImpl.mock.calls.map(([url]) => url)).toContain(`${SOURCIFY}/v2/contract/5042/${TARGET}?fields=abi`);
  });

  it("reports progress from code check to naming", async () => {
    // Arrange
    const events: ProgressEvent[] = [];

    // Act
    await buildReport(deps(), TARGET, 1, { onProgress: (e) => events.push(e) });

    // Assert
    const steps = events.map((e) => e.step);
    expect(steps[0]).toBe("code");
    expect(steps.at(-1)).toBe("names");
    expect(new Set(steps)).toEqual(new Set(["code", "source", "logs", "transactions", "names"]));
    expect(events.find((e) => e.step === "transactions" && e.done === e.total)?.total).toBe(MAX_TXS);
  });

  it("still builds when Sourcify and the signature DB are down", async () => {
    // Arrange
    const down = (): Promise<Response> => Promise.reject(new TypeError("fetch failed"));
    const fetchImpl = fetchDouble(down, down);

    // Act
    const report = await buildReport(deps({ fetchImpl }), TARGET, 1);

    // Assert
    expect(report.source).toEqual({ verdict: "unknown", match: null, sourcifyUrl: `https://sourcify.dev/#/lookup/${TARGET}` });
    expect(report.functions.every((f) => f.name === null && f.nameSource === null)).toBe(true);
    expect(report.headline.medianMicroUsd).toBe(MEDIAN?.toString());
  });

  it("stamps the real time when no clock is injected", async () => {
    const before = Date.now();
    const report = await buildReport(deps({ now: undefined }), TARGET, 1);
    expect(Date.parse(report.generatedAt)).toBeGreaterThanOrEqual(before);
  });

  it("rejects an address without code", async () => {
    // Act
    const error = await buildReport(deps(), EOA, 1).catch((e: unknown) => e);

    // Assert
    expect(error).toBeInstanceOf(NotAContractError);
    expect(error).toMatchObject({ name: "NotAContractError", address: EOA, message: `No contract code at ${EOA} on Arc mainnet` });
  });

  it("propagates cancellation from the caller", async () => {
    const signal = AbortSignal.abort();
    await expect(buildReport(deps(), TARGET, 1, { signal })).rejects.toMatchObject({ name: "AbortError" });
  });
});
