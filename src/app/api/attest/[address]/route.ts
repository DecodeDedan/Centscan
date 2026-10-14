import { ATTEST_COOLDOWN_MS, type ApiResponse } from "@/lib/api";
import type { AttestationRecord } from "@/lib/report";
import { parseWindowHours } from "@/lib/report";
import { AttestError, attestReport } from "@/server/attest";
import { errorFields, requestLogger } from "@/server/log";
import { clientIp, errorResponse, parseAddressParam, rateLimited } from "@/server/service";
import { getStore } from "@/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 90;

/** Wallet spend ceilings across all contracts (an attestation costs well under 1¢, but the wallet is a hot key). */
const ATTEST_GLOBAL_WINDOW_MS = 60 * 60_000;
const ATTEST_GLOBAL_MAX = 30;
const ATTEST_PER_IP_MAX = 6;

/** Attests the latest cached report for a contract and window from the official attester wallet. */
export async function POST(request: Request, { params }: { params: Promise<{ address: string }> }): Promise<Response> {
  const address = parseAddressParam((await params).address);
  if (!address) return errorResponse({ code: "INVALID_ADDRESS", message: "Enter a 0x address with 40 hex characters." });
  const hours = parseWindowHours(new URL(request.url).searchParams.get("hours"));
  if (hours === null) return errorResponse({ code: "INVALID_WINDOW", message: "hours must be 1, 24 or 168." });

  const log = requestLogger("api/attest");
  const store = getStore();
  const stored = store.latestReport(address, hours);
  if (!stored) return errorResponse({ code: "NOT_FOUND", message: "Build a report for this contract before attesting it." });
  const existing = store.attestationForHash(stored.reportHash);
  if (existing) return Response.json({ ok: true, data: existing } satisfies ApiResponse<AttestationRecord>);

  const global = store.consumeRateLimit("attest:global", ATTEST_GLOBAL_WINDOW_MS, ATTEST_GLOBAL_MAX);
  if (!global.allowed) return errorResponse(rateLimited(global.retryAfterMs, "Centscan is at its hourly attestation limit."));
  const byIp = store.consumeRateLimit(`attest-ip:${clientIp(request.headers)}`, ATTEST_GLOBAL_WINDOW_MS, ATTEST_PER_IP_MAX);
  if (!byIp.allowed) return errorResponse(rateLimited(byIp.retryAfterMs, "Too many attestations from your network. Try again later."));
  const limit = store.consumeRateLimit(`attest:${address}`, ATTEST_COOLDOWN_MS, 1);
  if (!limit.allowed) return errorResponse(rateLimited(limit.retryAfterMs, "This contract was attested in the last 10 minutes."));

  try {
    const record = await attestReport(stored);
    store.saveAttestation(address, record);
    log.info({ address, txHash: record.txHash, block: record.blockNumber }, "attestation confirmed");
    return Response.json({ ok: true, data: record } satisfies ApiResponse<AttestationRecord>);
  } catch (error) {
    // Only a failure before sending frees the contract's cooldown; once a transaction may be on-chain, it holds.
    if (error instanceof AttestError) {
      if (!error.sent) store.clearRateLimit(`attest:${address}`);
      return errorResponse(error.apiError);
    }
    log.error({ address, ...errorFields(error) }, "attestation failed unexpectedly");
    return errorResponse({ code: "INTERNAL", message: "Attestation failed." });
  }
}
