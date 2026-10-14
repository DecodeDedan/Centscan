import { errorFields, requestLogger } from "@/server/log";
import { badgeContent, renderBadge } from "@/server/badge";
import { parseWindowHours } from "@/lib/report";
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

/**
 * GET /badge/<address>.svg[?hours=1|24|168] — the newest cached report for that window, or for any window when
 * `hours` is absent. A report page passes its own window so the badge preview matches the receipt beside it.
 */
export async function GET(request: Request, { params }: { params: Promise<{ file: string }> }): Promise<Response> {
  const { file } = await params;
  const address = file.endsWith(".svg") ? parseAddressParam(file.slice(0, -".svg".length)) : null;
  if (!address) return svgResponse(renderBadge({ value: "invalid address", tone: "none" }), 404);
  try {
    const hoursParam = new URL(request.url).searchParams.get("hours");
    const hours = hoursParam === null ? null : parseWindowHours(hoursParam);
    if (hoursParam !== null && hours === null) return svgResponse(renderBadge({ value: "invalid window", tone: "none" }), 400);
    const store = getStore();
    const stored = hours === null ? store.latestReportAnyWindow(address) : store.latestReport(address, hours);
    return svgResponse(renderBadge(badgeContent(stored?.report ?? null)));
  } catch (error) {
    requestLogger("badge").error({ address, ...errorFields(error) }, "badge lookup failed");
    return new Response(renderBadge({ value: "unavailable", tone: "none" }), {
      status: 503,
      headers: { "content-type": "image/svg+xml; charset=utf-8", "cache-control": "no-store" },
    });
  }
}
