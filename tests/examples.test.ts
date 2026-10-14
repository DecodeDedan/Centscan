import { describe, expect, it } from "vitest";
import type { ReportPayload } from "@/lib/api";
import { ARC_USDC, scanExamples } from "@/components/examples";
import { makeReport } from "./helpers/report";

function payload(target: string, median: string | null): ReportPayload {
  const report = makeReport({ target: target as `0x${string}`, headline: { medianMicroUsd: median, per1000Usd: median ? "1" : null } });
  return { report, reportHash: `0x${"00".repeat(32)}`, createdAt: "2026-10-14T12:00:00.000Z", attestation: null };
}

describe("scanExamples", () => {
  it("always offers Arc USDC first, with no note before it has been scanned", () => {
    expect(scanExamples([])).toEqual([{ address: ARC_USDC, label: "Arc USDC", note: null }]);
  });

  it("adds distinct cached contracts newest first, up to the limit", () => {
    const a = `0x${"aa".repeat(20)}`;
    const b = `0x${"bb".repeat(20)}`;
    const c = `0x${"cc".repeat(20)}`;
    const out = scanExamples([payload(ARC_USDC, "4399"), payload(a, "1380"), payload(a, "9"), payload(b, null), payload(c, "1")], 3);
    expect(out.map((e) => e.address)).toEqual([ARC_USDC, a, b]);
    expect(out[0]?.note).toBe("0.440¢");
    expect(out[1]).toEqual({ address: a, label: "0xaaaa…aaaa", note: "0.138¢" });
    expect(out[2]?.note).toBeNull();
  });
});
