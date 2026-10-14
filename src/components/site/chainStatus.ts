import { z } from "zod";
import { formatInt, formatMicroUsd } from "@/lib/format";

/** Browser-side reading of GET /api/chain. The response crosses a trust boundary, so it is parsed, not cast. */

/** The server caches the chain read for 2 s; polling faster only returns the same block. */
export const CHAIN_POLL_MS = 2_000;
/** A read that takes longer than this is abandoned and counts as a failure. */
export const CHAIN_TIMEOUT_MS = 5_000;
export const TRANSFER_GAS = 21_000;

const chainStatusSchema = z.object({
  blockNumber: z.string().regex(/^\d+$/),
  baseFeeGwei: z.string().regex(/^\d+(\.\d+)?$/),
  timestamp: z.number().int().nonnegative(),
  transferMicroUsd: z.string().regex(/^\d+$/),
});

export type ChainReading = z.infer<typeof chainStatusSchema>;

const responseSchema = z.union([
  z.object({ ok: z.literal(true), data: chainStatusSchema }),
  z.object({ ok: z.literal(false), error: z.object({ message: z.string() }) }),
]);

export type ChainParse = { ok: true; reading: ChainReading } | { ok: false; reason: string };

export function parseChainResponse(body: unknown): ChainParse {
  const parsed = responseSchema.safeParse(body);
  if (!parsed.success) return { ok: false, reason: "Unexpected response from /api/chain" };
  return parsed.data.ok ? { ok: true, reading: parsed.data.data } : { ok: false, reason: parsed.data.error.message };
}

/** Whole seconds since the block, never negative when the visitor's clock runs behind the chain's. */
export function blockAgeSeconds(timestamp: number, nowMs: number): number {
  return Math.max(0, Math.floor(nowMs / 1000 - timestamp));
}

/** "20" → "20", "24.000001249" → "24.000001249": the base fee exactly as the chain reported it. */
export function gweiLabel(baseFeeGwei: string): string {
  return `${baseFeeGwei} gwei`;
}

export interface ChainLabels {
  block: string;
  baseFee: string;
  transfer: string;
}

export function chainLabels(reading: ChainReading): ChainLabels {
  return {
    block: formatInt(reading.blockNumber),
    baseFee: gweiLabel(reading.baseFeeGwei),
    transfer: formatMicroUsd(reading.transferMicroUsd),
  };
}

/** Scrambles the digits of `text` and locks them left to right as `progress` goes 0 → 1. Non-digits never change. */
export function scrambleDigits(text: string, progress: number, random: () => number = Math.random): string {
  const locked = Math.floor(Math.min(Math.max(progress, 0), 1) * text.length);
  return [...text].map((ch, i) => (i < locked || !/\d/.test(ch) ? ch : String(Math.floor(random() * 10)))).join("");
}

const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;

/** Validates a pasted contract address and lowercases it for the /c/<address> route. */
export function normaliseAddress(raw: string): { ok: true; address: string } | { ok: false; reason: string } {
  const value = raw.trim();
  if (value === "") return { ok: false, reason: "Paste a contract address first." };
  if (!value.startsWith("0x")) return { ok: false, reason: "An Arc address starts with 0x." };
  if (value.length !== 42) return { ok: false, reason: `An address is 42 characters; this one is ${value.length}.` };
  if (!ADDRESS_PATTERN.test(value)) return { ok: false, reason: "Only 0-9 and a-f may follow 0x." };
  return { ok: true, address: value.toLowerCase() };
}
