import type { ApiResponse, ReportPayload } from "@/lib/api";
import { parseWindowHours } from "@/lib/report";
import { errorFields, requestLogger } from "@/server/log";
import { errorResponse, getCachedReport, parseAddressParam } from "@/server/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Latest cached report for a contract and window; building a fresh one goes through /stream. */
export async function GET(request: Request, { params }: { params: Promise<{ address: string }> }): Promise<Response> {
  const address = parseAddressParam((await params).address);
  if (!address) return errorResponse({ code: "INVALID_ADDRESS", message: "Enter a 0x address with 40 hex characters." });
  const hours = parseWindowHours(new URL(request.url).searchParams.get("hours"));
  if (hours === null) return errorResponse({ code: "INVALID_WINDOW", message: "hours must be 1, 24 or 168." });

  try {
    const payload = getCachedReport(address, hours);
    if (!payload) return errorResponse({ code: "NOT_FOUND", message: "No report yet for this contract and window." });
    const body: ApiResponse<ReportPayload> = { ok: true, data: payload };
    return Response.json(body, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    requestLogger("api/report").error({ address, ...errorFields(error) }, "report lookup failed");
    return errorResponse({ code: "INTERNAL", message: "Could not read the report cache." });
  }
}
