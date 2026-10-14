import { describe, expect, it } from "vitest";
import { attestationArgs, FLAG_LIVE, FLAG_SOURCE_VERIFIED } from "@/lib/registry";
import type { Report } from "@/lib/report";
import { makeReport, TARGET } from "./helpers/report";

const withVerdicts = (source: Report["source"]["verdict"], activity: Report["activity"]["verdict"]): Report => {
  const base = makeReport();
  return makeReport({ source: { ...base.source, verdict: source }, activity: { ...base.activity, verdict: activity } });
};

describe("attestationArgs", () => {
  it("maps target, median and window end onto the on-chain fields", () => {
    // Arrange
    const report = makeReport();

    // Act
    const args = attestationArgs(report);

    // Assert
    expect(args).toEqual({
      target: TARGET,
      medianCostMicroUsd: 4399n,
      windowEndBlock: 25920512n,
      flags: FLAG_SOURCE_VERIFIED | FLAG_LIVE,
    });
  });

  it.each([
    ["pass", "pass", 3],
    ["pass", "fail", 1],
    ["fail", "pass", 2],
    ["unknown", "warn", 0],
    ["warn", "unknown", 0],
  ] as const)("source %s + activity %s gives flags %i", (source, activity, flags) => {
    expect(attestationArgs(withVerdicts(source, activity)).flags).toBe(flags);
  });

  it("attests a zero median when no call succeeded", () => {
    const report = makeReport({ headline: { medianMicroUsd: null, per1000Usd: null } });
    expect(attestationArgs(report).medianCostMicroUsd).toBe(0n);
  });

  it("clamps a median beyond uint64 to the uint64 maximum", () => {
    const report = makeReport({ headline: { medianMicroUsd: (2n ** 70n).toString(), per1000Usd: null } });
    expect(attestationArgs(report).medianCostMicroUsd).toBe(2n ** 64n - 1n);
  });

  it("keeps a median of exactly uint64 max", () => {
    const max = 2n ** 64n - 1n;
    const report = makeReport({ headline: { medianMicroUsd: max.toString(), per1000Usd: null } });
    expect(attestationArgs(report).medianCostMicroUsd).toBe(max);
  });
});
