import { headers } from "next/headers";
import type { ReportPayload } from "@/lib/api";
import { formatMicroUsd, shortHex } from "@/lib/format";
import { ChainProvider } from "@/components/site/LiveChain";
import { LiveFormula, LiveStrip } from "@/components/site/LiveSections";
import { Observatory } from "@/components/site/Observatory";
import { buildObservatory, pipelineStages, windowLabel } from "@/components/site/observatoryData";
import { Pipeline } from "@/components/site/Pipeline";
import type { ScanExample } from "@/components/site/ScanForm";
import { Badge, Proof } from "@/components/site/Sections";
import { SiteMotion } from "@/components/site/SiteMotion";
import { errorFields, log } from "@/server/log";
import { getAttestationInfo, getRecentReports } from "@/server/service";

export const dynamic = "force-dynamic";

/** Recent reports for the hero chips. */
const RECENT_LIMIT = 4;
/** Arc's native USDC system contract: a real, always-busy example anyone can scan. */
const ARC_USDC = "0x3600000000000000000000000000000000000000";

/** Recent cached reports, newest first. A failing store must never take the marketing page down. */
function recentReports(): ReportPayload[] {
  try {
    return getRecentReports(RECENT_LIMIT);
  } catch (error) {
    log.error({ route: "/", ...errorFields(error) }, "recent report lookup failed; rendering without report data");
    return [];
  }
}

function registryAddress(): string | null {
  try {
    return getAttestationInfo()?.registry ?? null;
  } catch (error) {
    log.error({ route: "/", ...errorFields(error) }, "attestation config unavailable; hiding the registry address");
    return null;
  }
}

/** Absolute origin for the README snippet, which is pasted outside this site. */
async function siteOrigin(): Promise<string> {
  const h = await headers();
  const first = (value: string | null) => value?.split(",")[0]?.trim() || null;
  const host = first(h.get("x-forwarded-host")) ?? first(h.get("host")) ?? "localhost";
  const proto = first(h.get("x-forwarded-proto")) ?? (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");
  return `${proto}://${host}`;
}

/** One chip per distinct contract from the recent reports, then Arc USDC when it is not already among them. */
function scanExamples(reports: readonly ReportPayload[]): ScanExample[] {
  const seen = new Set<string>();
  const examples: ScanExample[] = [];
  for (const { report } of reports) {
    if (seen.has(report.target)) continue;
    seen.add(report.target);
    const median = report.headline.medianMicroUsd ? `${formatMicroUsd(report.headline.medianMicroUsd)} median` : "no calls";
    examples.push({
      address: report.target,
      label: shortHex(report.target),
      detail: `${windowLabel(report.window.hours)} · ${median}`,
      href: `/c/${report.target}?hours=${report.window.hours}`,
    });
  }
  if (!seen.has(ARC_USDC)) {
    examples.push({ address: ARC_USDC, label: shortHex(ARC_USDC), detail: "Arc USDC", href: `/c/${ARC_USDC}` });
  }
  return examples;
}

export default async function HomePage() {
  const reports = recentReports();
  const newest = reports[0] ?? null;
  const origin = await siteOrigin();
  const observatory = buildObservatory(newest);
  const target = newest?.report.target ?? null;
  const reportHref = newest ? `/c/${newest.report.target}?hours=${newest.report.window.hours}` : null;

  return (
    <ChainProvider>
      <Observatory data={observatory} examples={scanExamples(reports)} />
      <LiveStrip verdict={observatory?.verdict ?? null} reportHref={reportHref} />
      <Pipeline stages={pipelineStages(newest)} target={observatory?.targetShort ?? null} />
      <LiveFormula />
      <Proof registry={registryAddress()} newest={newest} />
      <Badge
        badge={
          newest && target
            ? {
                target,
                imageUrl: `/badge/${target}.svg?hours=${newest.report.window.hours}`,
                markdown: `[![Centscan](${origin}/badge/${target}.svg)](${origin}/c/${target})`,
                windowLabel: windowLabel(newest.report.window.hours),
                median: observatory?.medianLabel ?? null,
              }
            : null
        }
      />
      <SiteMotion />
    </ChainProvider>
  );
}
