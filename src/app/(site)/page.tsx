import { headers } from "next/headers";
import type { ReportPayload } from "@/lib/api";
import { Figures } from "@/components/site/Figures";
import { Hero } from "@/components/site/Hero";
import { Badge, Formula, Proof, WhyArc } from "@/components/site/Sections";
import { buildTill } from "@/components/site/tillReceipt";
import { errorFields, log } from "@/server/log";
import { getAttestationInfo, getRecentReports } from "@/server/service";

export const dynamic = "force-dynamic";

/** Newest cached report, or null. A failing store must never take the marketing page down: it falls back to the method. */
function newestReport(): ReportPayload | null {
  try {
    return getRecentReports(1)[0] ?? null;
  } catch (error) {
    log.error({ route: "/", ...errorFields(error) }, "recent report lookup failed; rendering the method receipt");
    return null;
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

export default async function HomePage() {
  const newest = newestReport();
  const origin = await siteOrigin();
  const target = newest?.report.target ?? null;

  return (
    <>
      <Hero receipt={buildTill(newest)} />
      <Figures />
      <Formula />
      <WhyArc />
      <Proof registry={registryAddress()} newest={newest && target ? { target, reportHash: newest.reportHash } : null} />
      <Badge
        badge={
          target
            ? {
                target,
                imageUrl: `/badge/${target}.svg`,
                markdown: `[![Centscan](${origin}/badge/${target}.svg)](${origin}/c/${target})`,
              }
            : null
        }
      />
    </>
  );
}
