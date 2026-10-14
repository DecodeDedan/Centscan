import { z } from "zod";

const emptyToUndefined = (v: unknown): unknown => (typeof v === "string" && v.trim() === "" ? undefined : v);
const optionalAddress = z.preprocess(
  emptyToUndefined,
  z.string().regex(/^0x[0-9a-fA-F]{40}$/, "must be a 0x-prefixed 20-byte address").transform((s) => s.toLowerCase() as `0x${string}`).optional(),
);

/** Public, non-secret endpoints, so a fresh deploy boots without any configuration. */
export const PUBLIC_DEFAULTS = {
  ARC_RPC_URL: "https://rpc.mainnet.arc.io",
  ARC_CHAIN_ID: "5042",
  SOURCIFY_URL: "https://sourcify.dev/server",
  SIGNATURE_DB_URL: "https://api.openchain.xyz/signature-database/v1",
} as const;

/** Serverless hosts (Vercel) can only write under /tmp; the SQLite cache there is per-instance and ephemeral. */
const SERVERLESS_DB_PATH = "/tmp/centscan.db";
const LOCAL_DB_PATH = "./data/centscan.db";

const envSchema = z.object({
  ARC_RPC_URL: z.url(),
  ARC_CHAIN_ID: z.coerce.number().int().refine((n) => n === 5042, "must be 5042 (Arc mainnet)"),
  DATABASE_PATH: z.string().min(1),
  SOURCIFY_URL: z.url(),
  SIGNATURE_DB_URL: z.url(),
  REGISTRY_ADDRESS: optionalAddress,
  ATTESTER_ADDRESS: optionalAddress,
  ATTESTER_PRIVATE_KEY: z.preprocess(
    emptyToUndefined,
    z.string().regex(/^0x[0-9a-fA-F]{64}$/, "must be a 0x-prefixed 32-byte hex key").transform((s) => s as `0x${string}`).optional(),
  ),
  RPC_MAX_CALLS_PER_SECOND: z.coerce.number().int().min(1).max(10_000).default(10),
  RPC_BURST: z.coerce.number().int().min(1).max(10_000).default(25),
  SCAN_FALLBACK_BLOCKS: z.coerce.number().int().min(100).max(50_000).default(300),
  MAX_TXS_PER_REPORT: z.coerce.number().int().min(10).max(10_000).default(150),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
});

export type Config = z.infer<typeof envSchema>;

let cached: Config | null = null;

const isSet = (v: string | undefined): v is string => v !== undefined && v.trim() !== "";

/** Fills unset public endpoints and picks a writable database path; explicit values always win. */
export function withDefaults(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const serverless = isSet(env.VERCEL);
  const filled: NodeJS.ProcessEnv = { ...env };
  for (const [key, value] of Object.entries(PUBLIC_DEFAULTS)) {
    if (!isSet(filled[key])) filled[key] = value;
  }
  // A relative or non-/tmp path cannot be written on a serverless host, so it is redirected rather than crashing.
  const dbPath = filled.DATABASE_PATH;
  if (!isSet(dbPath)) filled.DATABASE_PATH = serverless ? SERVERLESS_DB_PATH : LOCAL_DB_PATH;
  else if (serverless && !dbPath.startsWith("/tmp/")) filled.DATABASE_PATH = SERVERLESS_DB_PATH;
  return filled;
}

/** Parses and validates the environment once. Throws with every problem listed, so boot fails fast. */
export function getConfig(env: NodeJS.ProcessEnv = process.env): Config {
  if (cached && env === process.env) return cached;
  const parsed = envSchema.safeParse(withDefaults(env));
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid configuration: ${problems}`);
  }
  if (env === process.env) cached = parsed.data;
  return parsed.data;
}

export interface AttestationConfig {
  registry: `0x${string}`;
  attester: `0x${string}`;
  privateKey: `0x${string}` | undefined;
}

/** Attestation is optional: reports and badges work without a deployed registry. */
export function getAttestationConfig(config: Config = getConfig()): AttestationConfig | null {
  if (!config.REGISTRY_ADDRESS || !config.ATTESTER_ADDRESS) return null;
  return { registry: config.REGISTRY_ADDRESS, attester: config.ATTESTER_ADDRESS, privateKey: config.ATTESTER_PRIVATE_KEY };
}
