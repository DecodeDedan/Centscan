import { formatInt } from "@/lib/format";
import type { Report } from "@/lib/report";

/** Collects the amber partial-coverage notes PRD §6 requires. */
export function partialNotes(report: Report): string[] {
  const notes: string[] = [];
  const { activity, source } = report;
  if (source.verdict === "unknown") notes.push("Sourcify unavailable: source verification could not be checked.");
  if (activity.sampled) {
    notes.push(
      `Sampled ${formatInt(activity.sampled.analysed)} of ${formatInt(activity.sampled.found)} transactions, newest first, back to block ${formatInt(activity.sampled.scannedFromBlock)}.`,
    );
  }
  if (activity.coverage.kind === "block-scan") {
    notes.push(`Event-less contract: scanned the last ${formatInt(activity.coverage.blocks)} blocks only.`);
  }
  if (activity.indirectTxs > 0) {
    notes.push(
      `${formatInt(activity.indirectTxs)} transaction${activity.indirectTxs === 1 ? "" : "s"} touched this contract through other contracts; they are counted, not priced.`,
    );
  }
  return notes;
}

/** "2026-10-14 09:41:07 UTC": receipts print absolute times. */
export function utcStamp(iso: string, length: 16 | 19 = 19): string {
  return `${new Date(iso).toISOString().replace("T", " ").slice(0, length)} UTC`;
}
