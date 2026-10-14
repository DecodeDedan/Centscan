import type { ReportPayload } from "@/lib/api";
import { formatInt, formatMicroUsd, shortHex } from "@/lib/format";
import type { FunctionCost, Report } from "@/lib/report";
import { rampCss, rampPositions, rampRank, RANK_WORD, type RampRank } from "./costRamp";

/**
 * Everything the observatory shows about the newest report, shaped on the server into plain serialisable values.
 * Every figure comes from the stored report; nothing here is invented or sampled for effect.
 */

/** More nodes than this crowd the orbit and their labels collide; the rest are counted, not drawn. */
export const MAX_NODES = 12;

/** Orbit radii in scene units: the cheapest function rides closest to the mark, the dearest furthest out. */
export const NODE_RADIUS = { min: 2.05, max: 3.25 } as const;
/** Node sphere radius in scene units, by share of the busiest function's calls (square root, so area tracks calls). */
export const NODE_SIZE = { min: 0.04, max: 0.1 } as const;
/** Golden angle: consecutive nodes never share an orbit position, whatever the count. */
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

export interface ObservatoryNode {
  selector: string;
  /** Short name for the label: the function name without its parameter list, or the selector. */
  name: string;
  fullName: string;
  calls: number;
  medianLabel: string;
  /** Position on the cost ramp, 0 = this report's cheapest function, 1 = its dearest. */
  ramp: number;
  rank: RampRank;
  rankWord: string;
  swatch: string;
  radius: number;
  size: number;
  phase: number;
  /** Diegetic label text, e.g. "aggregate3 · 19 calls · 1.08¢". */
  label: string;
}

export interface PipelineStage {
  id: "logs" | "receipts" | "selectors" | "cents" | "hash" | "arc";
  title: string;
  method: string;
  /** The newest report's figure for this stage, or null when no report exists. */
  figure: string | null;
  detail: string | null;
}

export interface ObservatoryData {
  target: string;
  targetShort: string;
  windowHours: number;
  windowLabel: string;
  verdict: string;
  medianLabel: string | null;
  directCalls: number;
  uniqueSenders: number;
  functionCount: number;
  nodes: ObservatoryNode[];
  reportHash: string;
  generatedAt: string;
  attestationTx: string | null;
}

export function windowLabel(hours: number): string {
  if (hours === 168) return "7 d";
  return `${hours} h`;
}

/** "aggregate3((address,bool,bytes)[])" → "aggregate3"; unnamed selectors stay as the selector. */
export function shortFunctionName(fn: Pick<FunctionCost, "name" | "selector">): string {
  if (!fn.name) return fn.selector;
  const paren = fn.name.indexOf("(");
  return paren > 0 ? fn.name.slice(0, paren) : fn.name;
}

function plural(count: number, one: string, many: string): string {
  return `${formatInt(count)} ${count === 1 ? one : many}`;
}

function sourcePhrase(source: Report["source"]): string {
  switch (source.verdict) {
    case "pass":
      return source.match === "exact_match" ? "its source is verified on Sourcify (exact match)" : "its source is verified on Sourcify (partial match)";
    case "warn":
      return "its source is partially verified on Sourcify";
    case "fail":
      return "its source is not verified on Sourcify";
    case "unknown":
      return "Sourcify did not answer, so its source is unchecked";
  }
}

/** One deterministic sentence built only from report fields. */
export function verdictSentence(report: Report): string {
  const who = shortHex(report.target);
  const window = windowLabel(report.window.hours);
  const source = sourcePhrase(report.source);
  if (report.activity.directCalls === 0) {
    return `In the last ${window}, ${who} received no direct calls; ${source}.`;
  }
  const calls = plural(report.activity.directCalls, "direct call", "direct calls");
  const senders = plural(report.activity.uniqueSenders, "sender", "senders");
  const median = report.headline.medianMicroUsd ? ` at a median ${formatMicroUsd(report.headline.medianMicroUsd)} per call` : "";
  return `In the last ${window}, ${who} took ${calls} from ${senders}${median}; ${source}.`;
}

/** Busiest functions first, capped at MAX_NODES, laid out on the orbit by cost and sized by calls. */
export function layoutNodes(functions: readonly FunctionCost[]): ObservatoryNode[] {
  const shown = [...functions].sort((a, b) => b.calls - a.calls || a.selector.localeCompare(b.selector)).slice(0, MAX_NODES);
  if (shown.length === 0) return [];
  const ramps = rampPositions(shown.map((fn) => BigInt(fn.costMicroUsd.median)));
  const maxCalls = Math.max(...shown.map((fn) => fn.calls));
  return shown.map((fn, i) => {
    const ramp = ramps[i] ?? 0;
    const rank = rampRank(ramp, shown.length);
    const name = shortFunctionName(fn);
    const medianLabel = formatMicroUsd(fn.costMicroUsd.median);
    return {
      selector: fn.selector,
      name,
      fullName: fn.name ?? fn.selector,
      calls: fn.calls,
      medianLabel,
      ramp,
      rank,
      rankWord: RANK_WORD[rank],
      swatch: rampCss(ramp),
      radius: NODE_RADIUS.min + ramp * (NODE_RADIUS.max - NODE_RADIUS.min),
      size: NODE_SIZE.min + Math.sqrt(fn.calls / maxCalls) * (NODE_SIZE.max - NODE_SIZE.min),
      phase: (i * GOLDEN_ANGLE) % (Math.PI * 2),
      label: `${name} · ${plural(fn.calls, "call", "calls")} · ${medianLabel}`,
    };
  });
}

export function buildObservatory(payload: ReportPayload | null): ObservatoryData | null {
  if (!payload) return null;
  const { report } = payload;
  return {
    target: report.target,
    targetShort: shortHex(report.target),
    windowHours: report.window.hours,
    windowLabel: windowLabel(report.window.hours),
    verdict: verdictSentence(report),
    medianLabel: report.headline.medianMicroUsd ? formatMicroUsd(report.headline.medianMicroUsd) : null,
    directCalls: report.activity.directCalls,
    uniqueSenders: report.activity.uniqueSenders,
    functionCount: report.functions.length,
    nodes: layoutNodes(report.functions),
    reportHash: payload.reportHash,
    generatedAt: report.generatedAt,
    attestationTx: payload.attestation?.txHash ?? null,
  };
}

function windowBlocks(report: Report): number {
  return Number(BigInt(report.window.toBlock) - BigInt(report.window.fromBlock)) + 1;
}

/** The six measuring stages, each with the newest report's own figure when there is one. */
export function pipelineStages(payload: ReportPayload | null): PipelineStage[] {
  const report = payload?.report ?? null;
  const coverage = report?.activity.coverage;
  const logsFigure = !report
    ? null
    : coverage?.kind === "block-scan"
      ? `${formatInt(coverage.blocks)} blocks read`
      : `${formatInt(windowBlocks(report))} blocks of logs`;
  const txs = report ? report.activity.directCalls + report.activity.indirectTxs : 0;
  const sampled = report?.activity.sampled;
  return [
    {
      id: "logs",
      title: "Logs",
      method: "Find every transaction that touched the contract in the window, from event logs, or by reading whole blocks when it emits none.",
      figure: logsFigure,
      detail: report ? `Blocks ${formatInt(report.window.fromBlock)} to ${formatInt(report.window.toBlock)}, ${windowLabel(report.window.hours)} window.` : null,
    },
    {
      id: "receipts",
      title: "Receipts",
      method: "Fetch each receipt for gasUsed and effectiveGasPrice. Both are final once the block is.",
      figure: report ? plural(txs, "transaction", "transactions") : null,
      detail: report
        ? sampled
          ? `Newest ${formatInt(sampled.analysed)} of ${formatInt(sampled.found)} analysed.`
          : `${plural(report.activity.directCalls, "direct call", "direct calls")}, ${plural(report.activity.indirectTxs, "indirect", "indirect")}.`
        : null,
    },
    {
      id: "selectors",
      title: "Selectors",
      method: "Group calls by their 4-byte selector and name them from the verified ABI or a signature database.",
      figure: report ? plural(report.functions.length, "function", "functions") : null,
      detail: report ? `${plural(report.reverted.calls, "reverted call", "reverted calls")} counted apart.` : null,
    },
    {
      id: "cents",
      title: "Cents",
      method: "gasUsed × effectiveGasPrice is already USDC on Arc. Divide wei by 10^16 for cents.",
      figure: report?.headline.medianMicroUsd ? `${formatMicroUsd(report.headline.medianMicroUsd)} median` : report ? "no calls priced" : null,
      detail: report?.headline.per1000Usd ? `$${Number(report.headline.per1000Usd).toFixed(2)} per 1,000 calls.` : null,
    },
    {
      id: "hash",
      title: "Hash",
      method: "Sort the report's keys, drop whitespace, take keccak256. Anyone can recompute it.",
      figure: payload ? shortHex(payload.reportHash, 10, 6) : null,
      detail: payload ? `Generated ${payload.report.generatedAt.replace("T", " ").slice(0, 19)} UTC.` : null,
    },
    {
      id: "arc",
      title: "Arc",
      method: "The official attester writes the hash and median to CentscanRegistry on Arc mainnet.",
      figure: payload ? (payload.attestation ? `block ${formatInt(payload.attestation.blockNumber)}` : "not attested yet") : null,
      detail: payload?.attestation ? `Transaction ${shortHex(payload.attestation.txHash, 10, 6)}.` : payload ? "Attest it from the report page." : null,
    },
  ];
}

/** The documented example receipt (docs/WHITEPAPER.md §1, ARCHITECTURE.md §1): one live Arc mainnet call. */
export const DOCUMENTED_RECEIPT = {
  gasUsed: 183_288n,
  /** 24.000001249 gwei, in wei. */
  effectiveGasPriceWei: 24_000_001_249n,
  gasPriceLabel: "24.000001249 gwei",
} as const;

const WEI_PER_MICRO_USD = 10n ** 12n;

/** "0.440¢": wei ÷ 10^12 is micro-USD, which the shared formatter prints as cents. */
export function documentedReceiptCost(): string {
  return formatMicroUsd((DOCUMENTED_RECEIPT.gasUsed * DOCUMENTED_RECEIPT.effectiveGasPriceWei) / WEI_PER_MICRO_USD);
}
