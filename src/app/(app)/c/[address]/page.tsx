import type { Metadata } from "next";
import { scanExamples } from "@/components/examples";
import { ReportClient } from "@/components/ReportClient";
import { parseWindowHours } from "@/lib/report";
import { getAttestationInfo, getCachedReport, getRecentReports, parseAddressParam, readOrFallback } from "@/server/service";
import { InvalidState } from "./InvalidState";

export const dynamic = "force-dynamic";

const EXAMPLE_SOURCE_LIMIT = 8;

type Props = {
  params: Promise<{ address: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Echoes the raw segment back; a malformed %-escape is shown as typed rather than crashing the page. */
function echo(raw: string): string {
  let text = raw;
  try {
    text = decodeURIComponent(raw);
  } catch {
    // Not valid percent-encoding: the raw segment is what the reader typed.
  }
  return text.slice(0, 80);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { address: raw } = await params;
  const address = parseAddressParam(raw);
  return { title: address ? `${address} · Centscan` : "Invalid address · Centscan" };
}

export default async function ReportPage({ params, searchParams }: Props) {
  const [{ address: raw }, query] = await Promise.all([params, searchParams]);
  const address = parseAddressParam(raw);
  if (!address) {
    return (
      <InvalidState
        title="Not a valid Arc address"
        message="An Arc address is 0x followed by 40 hex characters (0-9, a-f)."
        detail={echo(raw)}
      />
    );
  }
  const hours = parseWindowHours(firstParam(query.hours));
  if (hours === null) {
    return <InvalidState title="Unsupported window" message="Choose a window of 1 h, 24 h or 7 d." detail={null} />;
  }

  const initial = readOrFallback("/c", null, () => getCachedReport(address, hours));
  const attestationInfo = readOrFallback("/c", null, () => getAttestationInfo());
  // Offered when the address turns out not to be a contract; never includes the address that just failed.
  const examples = scanExamples(readOrFallback("/c", [], () => getRecentReports(EXAMPLE_SOURCE_LIMIT))).filter((e) => e.address !== address);

  return (
    <ReportClient key={`${address}-${hours}`} address={address} hours={hours} initial={initial} attestationInfo={attestationInfo} examples={examples} />
  );
}
