const HEX = "0123456789abcdef";

/**
 * One frame of the address decode: the "0x" prefix and the first `revealed` hex digits are real,
 * the rest are drawn from the hex alphabet only. `rand` returns [0, 1) and is injected so tests are deterministic.
 */
export function scrambleFrame(target: string, revealed: number, rand: () => number): string {
  const prefix = target.startsWith("0x") ? 2 : 0;
  const keep = prefix + Math.max(0, Math.floor(revealed));
  let out = target.slice(0, Math.min(keep, target.length));
  for (let i = out.length; i < target.length; i++) out += HEX[Math.floor(rand() * HEX.length) % HEX.length];
  return out;
}
