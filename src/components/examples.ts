import type { ReportPayload } from "@/lib/api";
import { formatMicroUsd, shortHex } from "@/lib/format";

/** Arc's native USDC: always busy, so any window has calls to price. */
export const ARC_USDC = "0x3600000000000000000000000000000000000000";

export interface ScanExample {
  address: string;
  label: string;
  /** The newest cached median for this contract, when there is one. */
  note: string | null;
}

/** Real addresses to try: Arc USDC first, then distinct contracts with cached reports, newest first. */
export function scanExamples(recent: readonly ReportPayload[], limit = 4): ScanExample[] {
  const out: ScanExample[] = [];
  const usdc = recent.find((r) => r.report.target.toLowerCase() === ARC_USDC);
  out.push({ address: ARC_USDC, label: "Arc USDC", note: usdc?.report.headline.medianMicroUsd ? formatMicroUsd(usdc.report.headline.medianMicroUsd) : null });
  const seen = new Set([ARC_USDC]);
  for (const { report } of recent) {
    const address = report.target.toLowerCase();
    if (out.length >= limit) break;
    if (seen.has(address)) continue;
    seen.add(address);
    out.push({ address, label: shortHex(address, 6, 4), note: report.headline.medianMicroUsd ? formatMicroUsd(report.headline.medianMicroUsd) : null });
  }
  return out;
}
