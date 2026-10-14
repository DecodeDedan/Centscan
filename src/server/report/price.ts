import type { Hex } from "viem";

/** One direct call to the target, as read from its transaction and receipt. */
export interface ObservedCall {
  hash: Hex;
  from: Hex;
  blockNumber: bigint;
  input: Hex;
  gasUsed: bigint;
  effectiveGasPrice: bigint;
  success: boolean;
  /** "deploy" for the transaction that created the target; its input is init code, not calldata. */
  kind: "call" | "deploy";
}

export interface PricedFunction {
  selector: string;
  calls: number;
  medianGas: string;
  costMicroUsd: { median: string; p90: string; min: string; max: string };
  sampleTx: Hex;
}

export interface CallSummary {
  functions: PricedFunction[];
  reverted: { calls: number; totalMicroUsd: string };
  headline: { medianMicroUsd: string | null; per1000Usd: string | null };
  successfulCalls: number;
  uniqueSenders: number;
  firstSeenBlock: string | null;
  lastSeenBlock: string | null;
}

// Native USDC on Arc has 18 decimals: 1 USD = 10^18 wei, so 1 micro-USD = 10^12 wei.
const WEI_PER_MICRO_USD = 10n ** 12n;
const MICRO_USD_PER_USD = 1_000_000n;
const SELECTOR_HEX_LENGTH = 10;

export const costWei = (gasUsed: bigint, effectiveGasPrice: bigint): bigint => gasUsed * effectiveGasPrice;

/** Rounds half up so that a 0.44¢ call is 4,400 µ$ rather than 4,399. */
export const weiToMicroUsd = (wei: bigint): bigint => (wei + WEI_PER_MICRO_USD / 2n) / WEI_PER_MICRO_USD;

export function selectorOf(call: Pick<ObservedCall, "input" | "kind">): string {
  if (call.kind === "deploy") return "deploy";
  return call.input.length < SELECTOR_HEX_LENGTH ? "receive()" : call.input.slice(0, SELECTOR_HEX_LENGTH).toLowerCase();
}

/** Nearest-rank percentile over an ascending-sorted, non-empty array. */
export function nearestRank(sorted: readonly bigint[], percentile: number): bigint {
  if (sorted.length === 0) throw new RangeError("nearestRank: empty input");
  if (percentile <= 0 || percentile > 100) throw new RangeError("nearestRank: percentile must be in (0, 100]");
  const rank = Math.ceil((percentile / 100) * sorted.length);
  return sorted[rank - 1] as bigint;
}

const ascending = (a: bigint, b: bigint): number => (a < b ? -1 : a > b ? 1 : 0);

/** USD with 6 decimals as a string, from integer micro-USD (exact, no floating point). */
export function microUsdToUsdString(micro: bigint): string {
  const whole = micro / MICRO_USD_PER_USD;
  const frac = (micro % MICRO_USD_PER_USD).toString().padStart(6, "0");
  return `${whole}.${frac}`;
}

function priceGroup(selector: string, calls: readonly ObservedCall[]): PricedFunction {
  const costs = calls.map((c) => weiToMicroUsd(costWei(c.gasUsed, c.effectiveGasPrice))).sort(ascending);
  const gas = calls.map((c) => c.gasUsed).sort(ascending);
  const latest = calls.reduce((a, b) => (b.blockNumber > a.blockNumber ? b : a));
  return {
    selector,
    calls: calls.length,
    medianGas: nearestRank(gas, 50).toString(),
    costMicroUsd: {
      median: nearestRank(costs, 50).toString(),
      p90: nearestRank(costs, 90).toString(),
      min: (costs[0] as bigint).toString(),
      max: (costs[costs.length - 1] as bigint).toString(),
    },
    sampleTx: latest.hash,
  };
}

/** Groups successful calls by selector and prices them; reverted calls are totalled separately. */
export function summarizeCalls(calls: readonly ObservedCall[]): CallSummary {
  const successful = calls.filter((c) => c.success);
  const reverted = calls.filter((c) => !c.success);

  const groups = new Map<string, ObservedCall[]>();
  for (const call of successful) {
    const selector = selectorOf(call);
    const group = groups.get(selector);
    if (group) group.push(call);
    else groups.set(selector, [call]);
  }
  const functions = [...groups.entries()]
    .map(([selector, group]) => priceGroup(selector, group))
    .sort((a, b) => b.calls - a.calls || a.selector.localeCompare(b.selector));

  const successCosts = successful.map((c) => weiToMicroUsd(costWei(c.gasUsed, c.effectiveGasPrice))).sort(ascending);
  const median = successCosts.length > 0 ? nearestRank(successCosts, 50) : null;
  const blocks = calls.map((c) => c.blockNumber).sort(ascending);

  return {
    functions,
    reverted: {
      calls: reverted.length,
      totalMicroUsd: reverted.reduce((sum, c) => sum + weiToMicroUsd(costWei(c.gasUsed, c.effectiveGasPrice)), 0n).toString(),
    },
    headline: {
      medianMicroUsd: median === null ? null : median.toString(),
      per1000Usd: median === null ? null : microUsdToUsdString(median * 1000n),
    },
    successfulCalls: successful.length,
    uniqueSenders: new Set(calls.map((c) => c.from.toLowerCase())).size,
    firstSeenBlock: blocks.length > 0 ? (blocks[0] as bigint).toString() : null,
    lastSeenBlock: blocks.length > 0 ? (blocks[blocks.length - 1] as bigint).toString() : null,
  };
}
