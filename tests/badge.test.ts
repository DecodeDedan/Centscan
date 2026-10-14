import { describe, expect, test } from "vitest";
import type { Report } from "@/lib/report";
import { badgeContent, renderBadge } from "@/server/badge";

function report(overrides: { source?: Report["source"]["verdict"]; activity?: Report["activity"]["verdict"]; median?: string | null }): Report {
  return {
    schemaVersion: 1,
    chainId: 5042,
    target: "0x3600000000000000000000000000000000000000",
    window: { fromBlock: "100", toBlock: "200", hours: 24, blockTimeMs: 510 },
    generatedAt: "2026-10-14T12:00:00.000Z",
    source: { verdict: overrides.source ?? "pass", match: "exact_match", sourcifyUrl: "https://sourcify.dev/#/lookup/0x36" },
    activity: {
      verdict: overrides.activity ?? "pass",
      directCalls: 3,
      successfulCalls: 3,
      indirectTxs: 0,
      uniqueSenders: 2,
      firstSeenBlock: "120",
      lastSeenBlock: "190",
      coverage: { kind: "logs" },
      sampled: null,
    },
    functions: [],
    reverted: { calls: 0, totalMicroUsd: "0" },
    headline: { medianMicroUsd: overrides.median === undefined ? "1109" : overrides.median, per1000Usd: "1.109000" },
  };
}

describe("badgeContent", () => {
  test("verified, live contract shows the median cost and a pass tone", () => {
    expect(badgeContent(report({}))).toEqual({ value: "verified · live · 0.111¢/call", tone: "pass" });
  });

  test("unknown contract reads 'not scanned' in the neutral tone", () => {
    expect(badgeContent(null)).toEqual({ value: "not scanned", tone: "none" });
  });

  test("any failing verdict makes the badge red", () => {
    expect(badgeContent(report({ source: "fail" })).tone).toBe("fail");
    expect(badgeContent(report({ source: "fail" })).value).toBe("unverified · live · 0.111¢/call");
  });

  test("unknown source with quiet activity is a warning and omits a missing median", () => {
    expect(badgeContent(report({ source: "unknown", activity: "warn", median: null }))).toEqual({
      value: "source unknown · quiet",
      tone: "warn",
    });
  });
});

describe("renderBadge", () => {
  test("produces an accessible SVG whose width grows with the text", () => {
    const short = renderBadge({ value: "live", tone: "pass" });
    const long = renderBadge({ value: "verified · live · 0.111¢/call", tone: "pass" });
    const width = (svg: string): number => Number(/width="(\d+)"/.exec(svg)?.[1]);

    expect(short.startsWith("<svg")).toBe(true);
    expect(short).toContain('role="img"');
    expect(short).toContain("<title>centscan: live</title>");
    expect(short).toContain('fill="#0B6E4F"');
    expect(width(long)).toBeGreaterThan(width(short));
  });

  test("escapes XML special characters in the value", () => {
    const svg = renderBadge({ value: `<script>"&'`, tone: "none" });

    expect(svg).not.toContain("<script>");
    expect(svg).toContain("&lt;script&gt;&quot;&amp;&apos;");
  });
});
