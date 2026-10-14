/** Small pure helpers behind the 3D till, kept apart from three.js so they are unit-testable. */

export interface SpringState {
  readonly x: number;
  readonly v: number;
}

export interface SpringConfig {
  stiffness: number;
  damping: number;
}

/** The stamp's spring (DESIGN.md: stiffness 400–600, damping 30–40), unit mass. */
export const STAMP_SPRING: SpringConfig = { stiffness: 520, damping: 32 };
const SUBSTEP_S = 1 / 240;

/** Advances a damped spring towards `target` by `dt` seconds, in fixed substeps so a long frame cannot explode it. */
export function stepSpring(state: SpringState, target: number, dt: number, config: SpringConfig): SpringState {
  let { x, v } = state;
  let remaining = Math.max(0, dt);
  while (remaining > 0) {
    const h = Math.min(SUBSTEP_S, remaining);
    const a = -config.stiffness * (x - target) - config.damping * v;
    v += a * h;
    x += v * h;
    remaining -= h;
  }
  return { x, v };
}

export const isSpringAtRest = (state: SpringState, target: number): boolean => Math.abs(state.x - target) < 1e-3 && Math.abs(state.v) < 1e-3;

/** Frame-rate independent exponential approach: `rate` is the share of the gap closed per second, as a decay constant. */
export function approach(current: number, target: number, dt: number, rate: number): number {
  const next = current + (target - current) * (1 - Math.exp(-rate * dt));
  return Math.abs(target - next) < 1e-4 ? target : next;
}

/**
 * Paper exposed above the slot for a scroll progress p in [0, 1], as a share of the receipt.
 * At p = 0 the printed head is already out, so the first frame reads as a receipt rather than a blank lip.
 */
export function feedForProgress(progress: number, headShare: number): number {
  const p = Math.min(1, Math.max(0, progress));
  return headShare + (1 - headShare) * p;
}

/** Scroll progress at which the stamp comes down (DESIGN.md v2: 0.9). */
export const STAMP_AT = 0.9;

export interface DeviceHints {
  hardwareConcurrency?: number;
  deviceMemory?: number;
}

/**
 * A phone that is likely to drop frames on a shader-heavy canvas: few cores and little memory.
 * Both must be low; unknown values (Safari hides deviceMemory) count as capable rather than weak.
 */
export function isWeakDevice({ hardwareConcurrency, deviceMemory }: DeviceHints): boolean {
  const fewCores = hardwareConcurrency !== undefined && hardwareConcurrency <= 4;
  const littleMemory = deviceMemory !== undefined && deviceMemory <= 4;
  return fewCores && littleMemory;
}
