import type { Report } from "@/lib/report";

export const TARGET = `0x${"ab".repeat(20)}` as const;
export const SAMPLE_TX = `0x${"11".repeat(32)}` as const;

/** A schema-valid v1 report for a contract with one priced function; override any top-level field. */
export function makeReport(overrides: Partial<Report> = {}): Report {
  return {
    schemaVersion: 1,
    chainId: 5042,
    target: TARGET,
    window: { fromBlock: "25913412", toBlock: "25920512", hours: 1, blockTimeMs: 507 },
    generatedAt: "2026-10-14T12:00:00.000Z",
    source: { verdict: "pass", match: "exact_match", sourcifyUrl: `https://sourcify.dev/#/lookup/${TARGET}` },
    activity: {
      verdict: "pass",
      directCalls: 3,
      successfulCalls: 3,
      indirectTxs: 1,
      uniqueSenders: 2,
      firstSeenBlock: "25913500",
      lastSeenBlock: "25920500",
      coverage: { kind: "logs" },
      sampled: null,
    },
    functions: [
      {
        selector: "0xa9059cbb",
        name: "transfer(address,uint256)",
        nameSource: "abi",
        calls: 3,
        medianGas: "183288",
        costMicroUsd: { median: "4399", p90: "4500", min: "4300", max: "4500" },
        sampleTx: SAMPLE_TX,
      },
    ],
    reverted: { calls: 0, totalMicroUsd: "0" },
    headline: { medianMicroUsd: "4399", per1000Usd: "4.399000" },
    ...overrides,
  };
}
