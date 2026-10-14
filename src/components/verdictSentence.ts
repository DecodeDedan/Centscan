import { formatMicroUsd } from "@/lib/format";
import type { FunctionCost, Report } from "@/lib/report";
import { windowLabel } from "./verdicts";

/** "transfer(address,uint256)" → "transfer"; an unnamed selector stays as the selector ("0xa9059cbb", "receive()" → "receive"). */
export function shortFunctionName(fn: Pick<FunctionCost, "name" | "selector">): string {
  const full = fn.name ?? fn.selector;
  const open = full.indexOf("(");
  return open > 0 ? full.slice(0, open) : full;
}

function sourcePhrase(source: Report["source"]): string {
  switch (source.verdict) {
    case "pass":
      return source.match === "exact_match" ? "verified on Sourcify (exact match)" : "verified on Sourcify (partial match)";
    case "warn":
      return "partially verified on Sourcify";
    case "fail":
      return "not verified on Sourcify";
    case "unknown":
      return "Sourcify could not be checked";
  }
}

function activityOpening(report: Report): string {
  switch (report.activity.verdict) {
    case "pass":
      return "Live and ";
    case "warn":
      return "Quiet and ";
    case "fail":
      return `No direct calls in the last ${windowLabel(report.window.hours)}, and `;
    case "unknown":
      return "Activity unknown, and ";
  }
}

/** The function with the highest median cost; ties keep the first in report order. */
function priciest(functions: readonly FunctionCost[]): FunctionCost | null {
  let best: FunctionCost | null = null;
  for (const fn of functions) {
    if (best === null || BigInt(fn.costMicroUsd.median) > BigInt(best.costMicroUsd.median)) best = fn;
  }
  return best;
}

function costClause(report: Report): string | null {
  const median = report.headline.medianMicroUsd;
  if (median === null) {
    return report.activity.verdict === "fail" ? null : `No priced calls in the last ${windowLabel(report.window.hours)}.`;
  }
  const typical = `A typical call costs ${formatMicroUsd(median)}`;
  const top = priciest(report.functions);
  if (top === null) return `${typical}.`;
  if (report.functions.length === 1) return `${typical}; the only function called is ${shortFunctionName(top)}.`;
  return `${typical}; the most expensive function is ${shortFunctionName(top)} at ${formatMicroUsd(top.costMicroUsd.median)}.`;
}

/**
 * The report's verdict in one or two plain sentences, built only from report fields, so the same report always reads the same.
 * e.g. "Live and not verified on Sourcify. A typical call costs 0.138¢; the most expensive function is aggregate3 at 3.61¢."
 */
export function verdictSentence(report: Report): string {
  const first = `${activityOpening(report)}${sourcePhrase(report.source)}.`;
  const second = costClause(report);
  return second ? `${first} ${second}` : first;
}
