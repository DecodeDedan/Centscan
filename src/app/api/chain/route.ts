import type { ApiResponse } from "@/lib/api";
import { getArcClient } from "@/server/arc/client";
import { createChainStatusReader, type ChainStatus } from "@/server/chain";
import { errorFields, requestLogger } from "@/server/log";
import { errorResponse } from "@/server/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const readChainStatus = createChainStatusReader(getArcClient);

/** GET /api/chain — newest Arc block, base fee and the price of a plain transfer, for live readouts. */
export async function GET(): Promise<Response> {
  try {
    const body: ApiResponse<ChainStatus> = { ok: true, data: await readChainStatus() };
    return Response.json(body, { headers: { "cache-control": "public, max-age=2" } });
  } catch (error) {
    requestLogger("api/chain").warn(errorFields(error), "chain status unavailable");
    return errorResponse({ code: "RPC_UNAVAILABLE", message: "Arc RPC did not answer. Live readouts are paused." });
  }
}
