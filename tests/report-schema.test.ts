import { describe, expect, it } from "vitest";
import { DEFAULT_WINDOW_HOURS, parseWindowHours, reportSchema } from "@/lib/report";
import { makeReport } from "./helpers/report";

describe("parseWindowHours", () => {
  it.each([null, undefined, ""])("defaults %s to 24 hours", (value) => {
    expect(parseWindowHours(value)).toBe(DEFAULT_WINDOW_HOURS);
    expect(DEFAULT_WINDOW_HOURS).toBe(24);
  });

  it.each([
    ["1", 1],
    ["24", 24],
    ["168", 168],
  ])("accepts %s", (value, expected) => {
    expect(parseWindowHours(value)).toBe(expected);
  });

  it.each(["0", "2", "48", "-1", "abc", "1.5", "Infinity", "0x18", " 24", "24.0"])("rejects %s", (value) => {
    expect(parseWindowHours(value)).toBeNull();
  });
});

describe("reportSchema", () => {
  it("accepts a well-formed v1 report", () => {
    expect(reportSchema.safeParse(makeReport()).success).toBe(true);
  });

  it("accepts receive(), deploy and block-scan coverage with sampling", () => {
    // Arrange
    const base = makeReport();
    const fn = base.functions[0];
    if (!fn) throw new Error("fixture report has no function");
    const report = makeReport({
      functions: [
        { ...fn, selector: "receive()", name: "receive()", nameSource: null },
        { ...fn, selector: "deploy", name: "deploy (contract creation)", nameSource: null },
      ],
      activity: { ...base.activity, coverage: { kind: "block-scan", blocks: 10_000 }, sampled: { analysed: 150, found: 900, scannedFromBlock: "1" } },
    });

    // Act / Assert
    expect(reportSchema.safeParse(report).success).toBe(true);
  });

  it.each([
    ["an upper-case target", { target: `0x${"AB".repeat(20)}` }],
    ["another chain", { chainId: 1 }],
    ["schema version 2", { schemaVersion: 2 }],
    ["a non-decimal block", { window: { fromBlock: "0x10", toBlock: "20", hours: 24, blockTimeMs: 500 } }],
    ["an unsupported window", { window: { fromBlock: "1", toBlock: "2", hours: 12, blockTimeMs: 500 } }],
    ["a non-ISO timestamp", { generatedAt: "14 Oct 2026" }],
    ["a negative revert count", { reverted: { calls: -1, totalMicroUsd: "0" } }],
  ])("rejects %s", (_label, override) => {
    expect(reportSchema.safeParse({ ...makeReport(), ...override }).success).toBe(false);
  });

  it("rejects a function with a malformed selector or zero calls", () => {
    const fn = makeReport().functions[0];
    if (!fn) throw new Error("fixture report has no function");
    expect(reportSchema.safeParse(makeReport({ functions: [{ ...fn, selector: "0xa9059c" as `0x${string}` }] })).success).toBe(false);
    expect(reportSchema.safeParse(makeReport({ functions: [{ ...fn, calls: 0 }] })).success).toBe(false);
  });
});
