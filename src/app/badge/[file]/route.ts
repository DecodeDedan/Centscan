import { errorFields, requestLogger } from "@/server/log";
import { badgeContent, renderBadge } from "@/server/badge";
import { parseAddressParam } from "@/server/service";
import { getStore } from "@/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const svgResponse = (svg: string, status = 200): Response =>
  new Response(svg, {
    status,
    headers: {
      "content-type": "image/svg+xml; charset=utf-8",
      "cache-control": "public, max-age=3600",
      // Opened directly, the SVG is a document: forbid scripts and remote loads as defence in depth.
      "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'",
    },
  });

/** GET /badge/<address>.svg — built from the newest cached report in any window. */
export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }): Promise<Response> {
  const { file } = await params;
  const address = file.endsWith(".svg") ? parseAddressParam(file.slice(0, -".svg".length)) : null;
  if (!address) return svgResponse(renderBadge({ value: "invalid address", tone: "none" }), 404);
  try {
    const stored = getStore().latestReportAnyWindow(address);
    return svgResponse(renderBadge(badgeContent(stored?.report ?? null)));
  } catch (error) {
    requestLogger("badge").error({ address, ...errorFields(error) }, "badge lookup failed");
    return new Response(renderBadge({ value: "unavailable", tone: "none" }), {
      status: 503,
      headers: { "content-type": "image/svg+xml; charset=utf-8", "cache-control": "no-store" },
    });
  }
}
