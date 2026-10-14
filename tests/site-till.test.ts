import { describe, expect, it } from "vitest";
import type { ReportPayload } from "@/lib/api";
import { buildTill, exampleCostLabel, MAX_FUNCTION_ROWS } from "@/components/site/tillReceipt";

const fn = (selector: string, calls: number, median: string, name: string | null = null) => ({
  selector,
  name,
  nameSource: name ? ("abi" as const) : null,
  calls,
  medianGas: "50000",
  costMicroUsd: { median, p90: median, min: median, max: median },
  sampleTx: `0x${"a".repeat(64)}`,
});

function payload(overrides: Partial<ReportPayload> = {}, functions = [fn("0xa9059cbb", 41, "1040", "transfer(address,uint256)")]): ReportPayload {
  return {
    reportHash: `0x${"b".repeat(64)}`,
    createdAt: "2026-10-14T00:00:00.000Z",
    attestation: null,
    report: {
      schemaVersion: 1,
      chainId: 5042,
      target: `0x${"1".repeat(40)}`,
      window: { fromBlock: "100", toBlock: "25732344", hours: 24, blockTimeMs: 510 },
      generatedAt: "2026-10-14T00:00:00.000Z",
      source: { verdict: "pass", match: "exact_match", sourcifyUrl: "https://sourcify.dev/" },
      activity: {
        verdict: "pass",
        directCalls: 41,
        successfulCalls: 41,
        indirectTxs: 0,
        uniqueSenders: 9,
        firstSeenBlock: "100",
        lastSeenBlock: "200",
        coverage: { kind: "logs" },
        sampled: null,
      },
      functions,
      reverted: { calls: 0, totalMicroUsd: "0" },
      headline: { medianMicroUsd: "1040", per1000Usd: "1.040000" },
    },
    ...overrides,
  };
}

describe("hero till receipt", () => {
  it("prints the whitepaper example as the method when no report is cached", () => {
    const till = buildTill(null);
    expect(till.mode).toBe("method");
    expect(exampleCostLabel()).toBe("0.440¢");
    expect(till.lines).toContainEqual(expect.objectContaining({ kind: "row", term: "cost, wei of USDC", value: "4,398,912,228,926,712" }));
    expect(till.stamp).toBeNull();
  });

  it("prints real rows and no stamp for an unattested report", () => {
    const till = buildTill(payload());
    expect(till.mode).toBe("report");
    expect(till.lines).toContainEqual(expect.objectContaining({ term: "transfer(address,uint256)", value: "41 × 0.104¢" }));
    expect(till.lines).toContainEqual(expect.objectContaining({ kind: "total", value: "0.104¢", sub: "$1.04 per 1,000 calls" }));
    expect(till.lines).toContainEqual(expect.objectContaining({ kind: "footer", linkText: "one click in the app" }));
    expect(till.stamp).toBeNull();
  });

  it("stamps only an attested report, with its tx", () => {
    const txHash = `0x${"c".repeat(64)}` as const;
    const till = buildTill(
      payload({ attestation: { reportHash: `0x${"b".repeat(64)}`, txHash, attester: `0x${"2".repeat(40)}`, blockNumber: 1, createdAt: "2026-10-14T00:00:00.000Z" } }),
    );
    expect(till.stamp).toEqual({ txHash, txShort: "0xcccc…cccc" });
  });

  it("caps function rows, busiest first, and handles a report with no priced calls", () => {
    const many = Array.from({ length: MAX_FUNCTION_ROWS + 2 }, (_, i) => fn(`0x0000000${i}`, i + 1, "100"));
    const rows = buildTill(payload({}, many)).lines.filter((l) => l.kind === "row" && l.id.startsWith("fn-") && l.id !== "fn-head");
    expect(rows.map((r) => (r.kind === "row" ? r.term : ""))).toEqual(["0x00000005", "0x00000004", "0x00000003", "0x00000002", "2 more functions"]);

    const empty = payload({}, []);
    const none = buildTill({ ...empty, report: { ...empty.report, headline: { medianMicroUsd: null, per1000Usd: null } } });
    expect(none.lines).toContainEqual(expect.objectContaining({ value: "none in this window" }));
    expect(none.lines).toContainEqual(expect.objectContaining({ kind: "total", value: "no calls", sub: null }));
  });
});
