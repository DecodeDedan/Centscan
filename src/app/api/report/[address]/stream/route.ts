import type { ApiError, StreamEvent } from "@/lib/api";
import { parseWindowHours } from "@/lib/report";
import { errorFields, requestLogger } from "@/server/log";
import {
  buildErrorToApi,
  clientIp,
  consumeRefreshLimit,
  errorResponse,
  parseAddressParam,
  refreshReport,
  releaseRefreshLimit,
  tryStartBuild,
} from "@/server/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// A 7-day report on the public RPC can take minutes; the stream keeps the connection busy with progress events.
export const maxDuration = 300;

const encoder = new TextEncoder();
const sse = ({ event, data }: StreamEvent): Uint8Array => encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

/** Builds a fresh report and streams progress over Server-Sent Events. Rate limits apply before any RPC work. */
export async function GET(request: Request, { params }: { params: Promise<{ address: string }> }): Promise<Response> {
  const address = parseAddressParam((await params).address);
  if (!address) return errorResponse({ code: "INVALID_ADDRESS", message: "Enter a 0x address with 40 hex characters." });
  const hours = parseWindowHours(new URL(request.url).searchParams.get("hours"));
  if (hours === null) return errorResponse({ code: "INVALID_WINDOW", message: "hours must be 1, 24 or 168." });

  const log = requestLogger("api/report/stream");
  // EventSource cannot read an HTTP error body, so a refusal is sent as an "error" event on a 200 stream.
  let refusal: ApiError | null;
  const releaseBuild = tryStartBuild();
  try {
    refusal = releaseBuild
      ? consumeRefreshLimit(address, clientIp(request.headers))
      : { code: "RATE_LIMITED", message: "Centscan is building other reports right now. Try again in a minute.", retryAfterSeconds: 60 };
  } catch (error) {
    log.error({ address, ...errorFields(error) }, "rate limit check failed");
    refusal = { code: "INTERNAL", message: "Could not start the report." };
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: StreamEvent): void => {
        if (!request.signal.aborted) controller.enqueue(sse(event));
      };
      if (refusal) {
        releaseBuild?.();
        send({ event: "error", data: refusal });
        controller.close();
        return;
      }
      const started = Date.now();
      log.info({ address, hours }, "report build started");
      try {
        const payload = await refreshReport(address, hours, {
          signal: request.signal,
          onProgress: (data) => send({ event: "progress", data }),
        });
        log.info({ address, hours, ms: Date.now() - started, calls: payload.report.activity.directCalls }, "report built");
        send({ event: "done", data: payload });
      } catch (error) {
        releaseRefreshLimit(address);
        if (request.signal.aborted) {
          log.info({ address, hours }, "client disconnected; report build cancelled");
        } else {
          log.error({ address, hours, ...errorFields(error) }, "report build failed");
          send({ event: "error", data: buildErrorToApi(error) });
        }
      } finally {
        releaseBuild?.();
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-store, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}
