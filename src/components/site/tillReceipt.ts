import type { ReportPayload } from "@/lib/api";
import { formatInt, formatMicroUsd, formatUsd, shortHex } from "@/lib/format";
import type { FunctionCost, Verdict } from "@/lib/report";
import { activityLabel, sourceLabel, windowLabel } from "@/components/verdicts";

/** The hero receipt as plain, serialisable lines, so the server decides the content and the client only animates it. */

export type TillTone = Verdict | "plain";

export type TillLine =
  | { kind: "row"; id: string; term: string; value: string; tone: TillTone; mark?: string }
  | { kind: "rule"; id: string }
  | { kind: "total"; id: string; term: string; value: string; sub: string | null }
  | { kind: "footer"; id: string; text: string; href: string; linkText: string };

export interface TillReceipt {
  mode: "report" | "method";
  title: string;
  caption: string;
  lines: TillLine[];
  /** Present only when the report hash is recorded on Arc by the official attester. */
  stamp: { txHash: string; txShort: string } | null;
}

/** Rows that fit the hero paper without turning it into the full report table. */
export const MAX_FUNCTION_ROWS = 4;

/** Documented example receipt (ARCHITECTURE.md §1, WHITEPAPER.md §1). */
export const EXAMPLE = {
  gasUsed: 183_288n,
  /** 24.000001249 gwei, in wei. */
  effectiveGasPriceWei: 24_000_001_249n,
  gasPriceLabel: "24.000001249 gwei",
} as const;

const WEI_PER_CENT = 10n ** 16n;
const WEI_PER_MICRO_USD = 10n ** 12n;

export function exampleCostWei(): bigint {
  return EXAMPLE.gasUsed * EXAMPLE.effectiveGasPriceWei;
}

/** 0.440¢ for the example: wei ÷ 10^12 gives micro-USD, which the shared formatter prints as cents. */
export function exampleCostLabel(): string {
  return formatMicroUsd(exampleCostWei() / WEI_PER_MICRO_USD);
}

function functionTerm(fn: FunctionCost): string {
  return fn.name ?? fn.selector;
}

function topFunctions(functions: readonly FunctionCost[]): FunctionCost[] {
  return [...functions].sort((a, b) => b.calls - a.calls).slice(0, MAX_FUNCTION_ROWS);
}

export function methodReceipt(): TillReceipt {
  const wei = exampleCostWei();
  return {
    mode: "method",
    title: "The method",
    caption: "Example from the whitepaper: one live Arc mainnet receipt",
    lines: [
      { kind: "row", id: "gas", term: "gasUsed", value: formatInt(EXAMPLE.gasUsed.toString()), tone: "plain" },
      { kind: "row", id: "price", term: "effectiveGasPrice", value: EXAMPLE.gasPriceLabel, tone: "plain" },
      { kind: "rule", id: "r1" },
      { kind: "row", id: "wei", term: "cost, wei of USDC", value: formatInt(wei.toString()), tone: "plain" },
      { kind: "row", id: "div", term: "÷ 10^16", value: `${(Number(wei) / Number(WEI_PER_CENT)).toFixed(4)}¢`, tone: "plain" },
      { kind: "rule", id: "r2" },
      { kind: "total", id: "total", term: "Cost of the call", value: exampleCostLabel(), sub: null },
      { kind: "footer", id: "next", text: "Print one for any contract:", href: "/app", linkText: "open the scanner" },
    ],
    stamp: null,
  };
}

export function reportReceipt(payload: ReportPayload): TillReceipt {
  const { report, attestation } = payload;
  const source = sourceLabel(report.source);
  const activity = activityLabel(report.activity);
  const fns = topFunctions(report.functions);
  const hidden = report.functions.length - fns.length;

  const fnLines: TillLine[] = fns.map((fn) => ({
    kind: "row",
    id: `fn-${fn.selector}`,
    term: functionTerm(fn),
    value: `${formatInt(fn.calls)} × ${formatMicroUsd(fn.costMicroUsd.median)}`,
    tone: "plain",
  }));
  if (hidden > 0) {
    fnLines.push({ kind: "row", id: "fn-more", term: `${formatInt(hidden)} more function${hidden === 1 ? "" : "s"}`, value: "in the app", tone: "plain" });
  }
  if (fns.length === 0) {
    fnLines.push({ kind: "row", id: "fn-none", term: "Priced functions", value: "none in this window", tone: "plain" });
  }

  const { medianMicroUsd, per1000Usd } = report.headline;
  const footer: TillLine = attestation
    ? { kind: "footer", id: "att", text: "Recorded on Arc in", href: `/c/${report.target}`, linkText: `tx ${shortHex(attestation.txHash)}` }
    : { kind: "footer", id: "att", text: "Attest on Arc:", href: `/c/${report.target}`, linkText: "one click in the app" };

  return {
    mode: "report",
    title: "Receipt",
    caption: `${shortHex(report.target)} · last ${windowLabel(report.window.hours)} · block ${formatInt(report.window.toBlock)}`,
    lines: [
      { kind: "row", id: "source", term: "Source", value: source.word, tone: source.tone, mark: source.icon },
      { kind: "row", id: "activity", term: "Activity", value: activity.word, tone: activity.tone, mark: activity.icon },
      { kind: "row", id: "calls", term: "Direct calls", value: formatInt(report.activity.directCalls), tone: "plain" },
      { kind: "rule", id: "r1" },
      { kind: "row", id: "fn-head", term: "Function", value: "calls × median", tone: "unknown" },
      ...fnLines,
      { kind: "rule", id: "r2" },
      {
        kind: "total",
        id: "total",
        term: "Median per call",
        value: medianMicroUsd ? formatMicroUsd(medianMicroUsd) : "no calls",
        sub: per1000Usd ? `${formatUsd(per1000Usd)} per 1,000 calls` : null,
      },
      footer,
    ],
    stamp: attestation ? { txHash: attestation.txHash, txShort: shortHex(attestation.txHash) } : null,
  };
}

export function buildTill(payload: ReportPayload | null): TillReceipt {
  return payload ? reportReceipt(payload) : methodReceipt();
}
