/** Pure maths the observatory scene shares with its tests: orbit positions, label projection, hit testing, quality steps. */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface ScreenPoint {
  x: number;
  y: number;
}

/** The three report windows as tilted orbit rings; the newest report's window is drawn as the live one. */
export const WINDOW_RINGS = [
  { hours: 1, radius: 1.8, tilt: [1.2, 0, 0.3], speed: 0.21 },
  { hours: 24, radius: 2.7, tilt: [1.38, 0, -0.42], speed: -0.13 },
  { hours: 168, radius: 3.7, tilt: [1.56, 0.5, 0.12], speed: 0.07 },
] as const;

/** A node's position on a flat orbit before the ring's tilt: angle grows with time, slower further out (Kepler-ish). */
export function orbitPoint(radius: number, phase: number, time: number, speed: number): Vec3 {
  const angle = phase + time * speed * (2 / radius);
  return { x: Math.cos(angle) * radius, y: 0, z: Math.sin(angle) * radius };
}

/** Normalised device coordinates (-1..1, y up) to CSS pixels (y down). */
export function ndcToScreen(ndcX: number, ndcY: number, width: number, height: number): ScreenPoint {
  return { x: (ndcX * 0.5 + 0.5) * width, y: (-ndcY * 0.5 + 0.5) * height };
}

export function isOnScreen(point: ScreenPoint, width: number, height: number, margin = 0): boolean {
  return point.x >= -margin && point.x <= width + margin && point.y >= -margin && point.y <= height + margin;
}

/** Index of the projected node nearest the pointer within `reachPx`, or null. Off-screen nodes are passed as null. */
export function nearestNode(pointer: ScreenPoint, nodes: ReadonlyArray<ScreenPoint | null>, reachPx: number): number | null {
  let best: number | null = null;
  let bestDistance = reachPx;
  nodes.forEach((node, index) => {
    if (!node) return;
    const distance = Math.hypot(node.x - pointer.x, node.y - pointer.y);
    if (distance <= bestDistance) {
      best = index;
      bestDistance = distance;
    }
  });
  return best;
}

/** Frame-time budget above which quality steps down: first pixel ratio to 1, then half the particles. */
export const SLOW_FRAME_MS = 24;
export const QUALITY_SAMPLE_FRAMES = 90;
export type QualityStep = "none" | "drop-dpr" | "halve-particles";

export function nextQualityStep(averageFrameMs: number, dpr: number, particlesHalved: boolean): QualityStep {
  if (averageFrameMs <= SLOW_FRAME_MS) return "none";
  if (dpr > 1) return "drop-dpr";
  if (!particlesHalved) return "halve-particles";
  return "none";
}

/** Cap the pixel ratio so a 3x phone renders at most 1.75x. */
export const MAX_DPR = 1.75;
export function cappedDpr(devicePixelRatio: number): number {
  return Math.min(Math.max(devicePixelRatio, 1), MAX_DPR);
}
