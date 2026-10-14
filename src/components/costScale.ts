/**
 * Scale and colour maths for the cost-range chart and every cost-ramp swatch. Pure, so the same report always draws the same.
 * All amounts are micro-USD (1¢ = 10,000 micro-USD). Costs span orders of magnitude, so positions are logarithmic.
 */

export type RampBand = "low" | "mid" | "high" | "flat";

/** Text that rides beside every ramp colour, so colour is never the only signal. */
export const BAND_LABEL: Record<RampBand, string> = { low: "cheap", mid: "mid", high: "pricey", flat: "one level" };

/** A zero-cost call has no logarithm; it sits at the floor of one micro-USD. */
const FLOOR_MICRO = 1;
/** Breathing room beside the cheapest and dearest values, in decades. */
const DOMAIN_PAD_DECADES = 0.12;
/** A chart narrower than one decade turns rounding noise into visible differences. */
const MIN_DOMAIN_DECADES = 1;

export interface LogDomain {
  /** log10 of the lowest drawable micro-USD value. */
  lo: number;
  /** log10 of the highest drawable micro-USD value. */
  hi: number;
}

export interface RampStop {
  /** Position on the ramp, 0 (cheapest in this report) to 1 (dearest). */
  t: number;
  band: RampBand;
  label: string;
  /** A CSS colour built from the status tokens: green → amber → red. */
  color: string;
}

export function toMicro(value: string | number | bigint): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n > FLOOR_MICRO ? n : FLOOR_MICRO;
}

const log = (value: string | number | bigint): number => Math.log10(toMicro(value));

/** The ramp colour at t, mixed in OKLCH from the --success, --warning and --danger tokens. */
export function rampColor(t: number): string {
  const c = Math.min(1, Math.max(0, t));
  if (c <= 0.5) return `color-mix(in oklch, var(--warning) ${Math.round(c * 200)}%, var(--success))`;
  return `color-mix(in oklch, var(--danger) ${Math.round((c - 0.5) * 200)}%, var(--warning))`;
}

export function rampBand(t: number): Exclude<RampBand, "flat"> {
  if (t < 1 / 3) return "low";
  if (t < 2 / 3) return "mid";
  return "high";
}

/**
 * Builds the ramp for one set of medians: log10(median) mapped across the set's own min to max.
 * When every value is equal there is no cheap or dear; each value sits mid-ramp and reads "one level".
 */
export function costRamp(medians: readonly (string | number | bigint)[]): (median: string | number | bigint) => RampStop {
  const logs = medians.map(log);
  const lo = Math.min(...logs);
  const hi = Math.max(...logs);
  const flat = logs.length === 0 || hi - lo < 1e-9;
  return (median) => {
    if (flat) return { t: 0.5, band: "flat", label: BAND_LABEL.flat, color: rampColor(0.5) };
    const t = Math.min(1, Math.max(0, (log(median) - lo) / (hi - lo)));
    const band = rampBand(t);
    return { t, band, label: BAND_LABEL[band], color: rampColor(t) };
  };
}

/** The chart's x domain: every value from the cheapest min to the dearest p90, padded, at least one decade wide. */
export function chartDomain(ranges: readonly { min: string; p90: string }[]): LogDomain {
  if (ranges.length === 0) return { lo: 0, hi: MIN_DOMAIN_DECADES };
  let lo = Math.min(...ranges.map((r) => log(r.min))) - DOMAIN_PAD_DECADES;
  let hi = Math.max(...ranges.map((r) => log(r.p90))) + DOMAIN_PAD_DECADES;
  if (hi - lo < MIN_DOMAIN_DECADES) {
    const mid = (lo + hi) / 2;
    lo = mid - MIN_DOMAIN_DECADES / 2;
    hi = mid + MIN_DOMAIN_DECADES / 2;
  }
  return { lo: Math.max(0, lo), hi: Math.max(hi, Math.max(0, lo) + MIN_DOMAIN_DECADES) };
}

/** Fraction across the chart (0..1, clamped) for a micro-USD value. */
export function position(domain: LogDomain, value: string | number | bigint): number {
  const p = (log(value) - domain.lo) / (domain.hi - domain.lo);
  return Math.min(1, Math.max(0, p));
}

/** The micro-USD value under a fraction of the chart: what the crosshair reads. */
export function valueAt(domain: LogDomain, fraction: number): number {
  const p = Math.min(1, Math.max(0, fraction));
  return 10 ** (domain.lo + p * (domain.hi - domain.lo));
}

/** Gridline values in micro-USD: each power of ten inside the domain, plus 2× and 5× when fewer than three decades fit. */
export function ticks(domain: LogDomain): number[] {
  const out: number[] = [];
  const multipliers = domain.hi - domain.lo < 3 ? [1, 2, 5] : [1];
  for (let k = Math.floor(domain.lo); k <= Math.ceil(domain.hi); k++) {
    for (const m of multipliers) {
      const v = m * 10 ** k;
      const l = Math.log10(v);
      if (l >= domain.lo && l <= domain.hi) out.push(v);
    }
  }
  return out;
}

/** Row anchor for the cost table: "#fn-0xa9059cbb", "#fn-receive", "#fn-deploy". Only [A-Za-z0-9-], so it is URL- and CSS-safe. */
export function rowAnchor(selector: string): string {
  return `fn-${selector.replace(/[^A-Za-z0-9]/g, "")}`;
}
