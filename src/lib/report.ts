import { z } from "zod";

/** Report schema v1. Shared by server (builder, store, API) and browser (rendering, hash recompute). */

export const WINDOW_HOURS = [1, 24, 168] as const;
export type WindowHours = (typeof WINDOW_HOURS)[number];
export const DEFAULT_WINDOW_HOURS: WindowHours = 24;

const hex = z.string().regex(/^0x[0-9a-f]*$/);
const address = z.string().regex(/^0x[0-9a-f]{40}$/);
const txHash = z.string().regex(/^0x[0-9a-f]{64}$/);
const uintString = z.string().regex(/^\d+$/);
const verdict = z.enum(["pass", "warn", "fail", "unknown"]);

export const reportSchema = z.object({
  schemaVersion: z.literal(1),
  chainId: z.literal(5042),
  target: address,
  window: z.object({
    fromBlock: uintString,
    toBlock: uintString,
    hours: z.union([z.literal(1), z.literal(24), z.literal(168)]),
    blockTimeMs: z.number().int().positive(),
  }),
  generatedAt: z.iso.datetime(),
  source: z.object({
    verdict,
    match: z.enum(["exact_match", "match"]).nullable(),
    sourcifyUrl: z.url(),
  }),
  activity: z.object({
    verdict,
    directCalls: z.number().int().nonnegative(),
    successfulCalls: z.number().int().nonnegative(),
    indirectTxs: z.number().int().nonnegative(),
    uniqueSenders: z.number().int().nonnegative(),
    firstSeenBlock: uintString.nullable(),
    lastSeenBlock: uintString.nullable(),
    coverage: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("logs") }),
      z.object({ kind: z.literal("block-scan"), blocks: z.number().int().positive() }),
    ]),
    /** Set when not every call in the window was analysed: newest-first sampling stopped at scannedFromBlock. */
    sampled: z
      .object({
        analysed: z.number().int().nonnegative(),
        found: z.number().int().nonnegative(),
        scannedFromBlock: uintString,
      })
      .nullable(),
  }),
  functions: z.array(
    z.object({
      selector: z.union([hex.length(10), z.literal("receive()"), z.literal("deploy")]),
      name: z.string().nullable(),
      nameSource: z.enum(["abi", "signature-db"]).nullable(),
      calls: z.number().int().positive(),
      medianGas: uintString,
      costMicroUsd: z.object({ median: uintString, p90: uintString, min: uintString, max: uintString }),
      sampleTx: txHash,
    }),
  ),
  reverted: z.object({ calls: z.number().int().nonnegative(), totalMicroUsd: uintString }),
  headline: z.object({ medianMicroUsd: uintString.nullable(), per1000Usd: z.string().nullable() }),
});

export type Report = z.infer<typeof reportSchema>;
export type Verdict = z.infer<typeof verdict>;
export type FunctionCost = Report["functions"][number];

export interface AttestationRecord {
  reportHash: `0x${string}`;
  txHash: `0x${string}`;
  attester: `0x${string}`;
  blockNumber: number;
  createdAt: string;
}

/** Progress events streamed while a report is being built. */
export type ProgressStep = "code" | "source" | "logs" | "transactions" | "blocks" | "names";
export interface ProgressEvent {
  step: ProgressStep;
  done: number;
  total: number;
}

export function parseWindowHours(value: string | null | undefined): WindowHours | null {
  if (value === null || value === undefined || value === "") return DEFAULT_WINDOW_HOURS;
  if (!/^\d+$/.test(value)) return null;
  const n = Number(value);
  return (WINDOW_HOURS as readonly number[]).includes(n) ? (n as WindowHours) : null;
}
