import type { Report, Verdict } from "@/lib/report";

export interface VerdictLabel {
  icon: string;
  word: string;
  /** CSS class carrying the status colour; the icon and word carry the meaning on their own. */
  tone: Verdict;
}

export function sourceLabel(source: Report["source"]): VerdictLabel {
  switch (source.verdict) {
    case "pass":
      return { icon: "✓", word: source.match === "exact_match" ? "Verified (exact)" : "Verified (partial)", tone: "pass" };
    case "fail":
      return { icon: "✕", word: "Not verified on Sourcify", tone: "fail" };
    case "warn":
      return { icon: "!", word: "Partially verified", tone: "warn" };
    case "unknown":
      return { icon: "?", word: "Unknown (Sourcify unavailable)", tone: "unknown" };
  }
}

export function activityLabel(activity: Report["activity"]): VerdictLabel {
  switch (activity.verdict) {
    case "pass":
      return { icon: "✓", word: "Live", tone: "pass" };
    case "warn":
      return { icon: "!", word: "Quiet", tone: "warn" };
    case "fail":
      return { icon: "✕", word: "No calls found", tone: "fail" };
    case "unknown":
      return { icon: "?", word: "Unknown", tone: "unknown" };
  }
}

export function windowLabel(hours: number): string {
  return hours === 168 ? "7 d" : `${hours} h`;
}
