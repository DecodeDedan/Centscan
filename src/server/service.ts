import { isIP } from "node:net";
import { isAddress, type Hex } from "viem";
import type { ApiError, AttestationInfo, ReportPayload } from "@/lib/api";
import { canonicalHash } from "@/lib/canonical";
import type { ProgressEvent, WindowHours } from "@/lib/report";
import { getArcClient } from "./arc/client";
import { getAttestationConfig, getConfig } from "./config";
import { errorFields, log } from "./log";
import { buildReport, NotAContractError } from "./report/build";
import { getStore, type Store, type StoredReport } from "./store";

/**
 * Runs a page's server-side read and falls back instead of failing the whole page: the cache is an
 * optimisation, so an unreadable database or missing optional config degrades to "no cached data".
 */
export function readOrFallback<T>(route: string, fallback: T, read: () => T): T {
  try {
    return read();
  } catch (error) {
    log.error({ route, ...errorFields(error) }, "server read failed; rendering without cached data");
    return fallback;
  }
}

/** Refresh limits from PRD §5: one fresh build per contract per 5 min, 20 per client IP per hour. */
const REFRESH_PER_ADDRESS_MS = 5 * 60_000;
const REFRESH_PER_IP_WINDOW_MS = 60 * 60_000;
const REFRESH_PER_IP_MAX = 20;
/** Service-wide ceilings, so many addresses or IPs together cannot exhaust the RPC budget. */
const REFRESH_GLOBAL_WINDOW_MS = 60 * 60_000;
const REFRESH_GLOBAL_MAX = 240;
const MAX_CONCURRENT_BUILDS = 3;

let buildsInFlight = 0;

/** Reserves a build slot; returns its release function, or null when the service is at capacity. */
export function tryStartBuild(): (() => void) | null {
  if (buildsInFlight >= MAX_CONCURRENT_BUILDS) return null;
  buildsInFlight++;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    buildsInFlight--;
  };
}

/** Lowercased address, or null when the input is not a 20-byte hex address. */
export function parseAddressParam(raw: string): Hex | null {
  let value: string;
  try {
    value = decodeURIComponent(raw).trim();
  } catch {
    // Malformed percent-encoding is just an invalid address.
    return null;
  }
  return isAddress(value, { strict: false }) ? (value.toLowerCase() as Hex) : null;
}

/** Longest X-Forwarded-For we parse; a real chain through one or two proxies is far shorter. */
const MAX_FORWARDED_LENGTH = 512;

/**
 * Client IP for rate limiting. The hosting proxy appends the address it saw to X-Forwarded-For, so the
 * LAST hop is the one a client cannot forge (the first hop is whatever the client sent). Falls back to
 * X-Real-IP; anything that is not a valid IP is ignored so spoofed junk cannot mint new rate-limit keys.
 */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for")?.slice(0, MAX_FORWARDED_LENGTH).split(",") ?? [];
  const lastHop = forwarded[forwarded.length - 1]?.trim();
  if (lastHop && isIP(lastHop)) return lastHop;
  const realIp = headers.get("x-real-ip")?.trim();
  return realIp && isIP(realIp) ? realIp : "unknown";
}

export function toPayload(stored: StoredReport, store: Store = getStore()): ReportPayload {
  const attestation = store.attestationForHash(stored.reportHash);
  return { report: stored.report, reportHash: stored.reportHash, createdAt: stored.createdAt, attestation };
}

export function getCachedReport(address: Hex, hours: WindowHours): ReportPayload | null {
  const stored = getStore().latestReport(address, hours);
  return stored ? toPayload(stored) : null;
}

export function getRecentReports(limit: number): ReportPayload[] {
  const store = getStore();
  return store.recentReports(limit).map((stored) => toPayload(stored, store));
}

export function getAttestationInfo(): AttestationInfo | null {
  const config = getAttestationConfig();
  if (!config) return null;
  return { registry: config.registry, attester: config.attester, canAttest: config.privateKey !== undefined };
}

export function rateLimited(retryAfterMs: number, message: string): ApiError {
  return { code: "RATE_LIMITED", message, retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1_000)) };
}

/** Checks both refresh limits; the address limit is consumed only when the IP limit allows the request. */
export function consumeRefreshLimit(address: Hex, ip: string, store: Store = getStore()): ApiError | null {
  const global = store.consumeRateLimit("refresh-global", REFRESH_GLOBAL_WINDOW_MS, REFRESH_GLOBAL_MAX);
  if (!global.allowed) return rateLimited(global.retryAfterMs, "Centscan is at its hourly report limit. Try again later.");
  const byIp = store.consumeRateLimit(`refresh-ip:${ip}`, REFRESH_PER_IP_WINDOW_MS, REFRESH_PER_IP_MAX);
  if (!byIp.allowed) return rateLimited(byIp.retryAfterMs, "Too many refreshes from your network. Try again later.");
  const byAddress = store.consumeRateLimit(`refresh:${address}`, REFRESH_PER_ADDRESS_MS, 1);
  if (!byAddress.allowed) return rateLimited(byAddress.retryAfterMs, "This contract was refreshed in the last 5 minutes.");
  return null;
}

/** A failed build should not lock the contract out for 5 minutes; the per-IP budget still applies. */
export function releaseRefreshLimit(address: Hex, store: Store = getStore()): void {
  store.clearRateLimit(`refresh:${address}`);
}

/** Builds a fresh report, hashes it canonically and stores it. */
export async function refreshReport(
  address: Hex,
  hours: WindowHours,
  opts: { onProgress?: (event: ProgressEvent) => void; signal?: AbortSignal } = {},
): Promise<ReportPayload> {
  const config = getConfig();
  const report = await buildReport(
    {
      client: await getArcClient(),
      chainId: config.ARC_CHAIN_ID,
      sourcifyUrl: config.SOURCIFY_URL,
      signatureDbUrl: config.SIGNATURE_DB_URL,
      maxTxs: config.MAX_TXS_PER_REPORT,
      fallbackBlocks: config.SCAN_FALLBACK_BLOCKS,
    },
    address,
    hours,
    opts,
  );
  const reportHash = canonicalHash(report);
  const store = getStore();
  const createdAt = new Date().toISOString();
  store.saveReport(report, reportHash, createdAt);
  return toPayload({ report, reportHash, createdAt }, store);
}

/** Maps a report-build failure onto the public error contract without leaking internals. */
export function buildErrorToApi(error: unknown): ApiError {
  if (error instanceof NotAContractError) return { code: "NOT_A_CONTRACT", message: "Not a contract on Arc mainnet." };
  return { code: "RPC_UNAVAILABLE", message: "Arc RPC did not answer in time. Try again in a minute." };
}

export const API_STATUS: Record<ApiError["code"], number> = {
  INVALID_ADDRESS: 400,
  INVALID_WINDOW: 400,
  NOT_A_CONTRACT: 404,
  NOT_FOUND: 404,
  RATE_LIMITED: 429,
  RPC_UNAVAILABLE: 503,
  ATTEST_DISABLED: 503,
  REPORT_TOO_OLD: 409,
  STALE_WINDOW: 409,
  ATTESTER_UNFUNDED: 503,
  INTERNAL: 500,
};

export function errorResponse(error: ApiError): Response {
  const headers: Record<string, string> = { "cache-control": "no-store" };
  if (error.retryAfterSeconds !== undefined) headers["retry-after"] = String(error.retryAfterSeconds);
  return Response.json({ ok: false, error }, { status: API_STATUS[error.code], headers });
}
