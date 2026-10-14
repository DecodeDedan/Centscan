/**
 * The cost ramp: cheap is green (--accent), middle is amber (--warning), expensive is red (--danger).
 * Position is log10(median micro-USD) mapped across the report's own cheapest to dearest function.
 * Data only, never decoration, and always paired with a text rank so colour is never the only signal.
 */

export type RampRank = "only" | "lowest" | "highest" | "between";
export type RampRole = "--accent" | "--warning" | "--danger";

/** A median of 0 micro-USD (a free call) still needs a finite logarithm. */
const MIN_MICRO_USD = 1;

function log10Micro(microUsd: bigint): number {
  return Math.log10(Math.max(Number(microUsd), MIN_MICRO_USD));
}

/** Ramp position in [0, 1] for each median, in input order. A report with one price everywhere sits at 0 (green). */
export function rampPositions(mediansMicroUsd: readonly bigint[]): number[] {
  if (mediansMicroUsd.length === 0) return [];
  const logs = mediansMicroUsd.map(log10Micro);
  const lo = Math.min(...logs);
  const hi = Math.max(...logs);
  const span = hi - lo;
  if (span === 0) return logs.map(() => 0);
  return logs.map((value) => (value - lo) / span);
}

export function rampRank(position: number, count: number): RampRank {
  if (count <= 1) return "only";
  if (position <= 0) return "lowest";
  if (position >= 1) return "highest";
  return "between";
}

export const RANK_WORD: Record<RampRank, string> = {
  only: "only function",
  lowest: "cheapest",
  highest: "dearest",
  between: "mid-range",
};

/** Which two ramp roles a position falls between, and how far towards the second (0..1). */
export function rampSegment(position: number): { from: RampRole; to: RampRole; amount: number } {
  const t = Math.min(Math.max(position, 0), 1);
  return t <= 0.5 ? { from: "--accent", to: "--warning", amount: t * 2 } : { from: "--warning", to: "--danger", amount: t * 2 - 1 };
}

/** CSS colour for a ramp position, resolved by the browser from the theme's own role tokens. */
export function rampCss(position: number): string {
  const { from, to, amount } = rampSegment(position);
  return `color-mix(in oklab, var(${from}), var(${to}) ${(amount * 100).toFixed(1)}%)`;
}
