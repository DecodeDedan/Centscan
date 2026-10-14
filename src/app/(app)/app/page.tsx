import type { Metadata } from "next";
import { AddressForm } from "@/components/AddressForm";
import { costRamp } from "@/components/costScale";
import { scanExamples } from "@/components/examples";
import { RecentLedger, type LedgerRow } from "@/components/RecentLedger";
import { TelemetryPanel } from "@/components/TelemetryPanel";
import ui from "@/components/ui.module.css";
import { activityLabel, sourceLabel, windowLabel } from "@/components/verdicts";
import type { ReportPayload } from "@/lib/api";
import { formatMicroUsd } from "@/lib/format";
import { getRecentReports, readOrFallback } from "@/server/service";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Scanner · Centscan" };

const RECENT_LIMIT = 8;

const UNITS: readonly [Intl.RelativeTimeFormatUnit, number][] = [
  ["day", 86_400],
  ["hour", 3_600],
  ["minute", 60],
];
const relative = new Intl.RelativeTimeFormat("en", { numeric: "auto", style: "short" });

/** "3 min. ago": scans are read at request time, so the server clock is the reader's clock to the minute. */
function timeAgo(iso: string, now: number): string {
  const seconds = Math.round((new Date(iso).getTime() - now) / 1000);
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) return relative.format(Math.round(seconds / size), unit);
  }
  return "just now";
}

function ledgerRows(recent: readonly ReportPayload[], now: number): LedgerRow[] {
  const medians = recent.flatMap(({ report }) => (report.headline.medianMicroUsd === null ? [] : [report.headline.medianMicroUsd]));
  const ramp = costRamp(medians);
  return recent.map(({ report, reportHash, createdAt }) => {
    const median = report.headline.medianMicroUsd;
    const stop = median === null ? null : ramp(median);
    return {
      reportHash,
      address: report.target,
      hours: report.window.hours,
      windowLabel: windowLabel(report.window.hours),
      median: median === null ? null : formatMicroUsd(median),
      ramp: stop ? { label: stop.label, color: stop.color } : null,
      source: sourceLabel(report.source),
      activity: activityLabel(report.activity),
      createdAt,
      ago: timeAgo(createdAt, now),
    };
  });
}

export default function ScannerPage() {
  const recent = readOrFallback("/app", [], () => getRecentReports(RECENT_LIMIT));
  // Server component rendered per request: one clock reading for every row.
  // eslint-disable-next-line react-hooks/purity -- force-dynamic server render, never re-rendered on the client
  const now = Date.now();

  return (
    <div className={styles.page}>
      <section className={`${ui.panel} ${styles.scan}`} aria-labelledby="scan-title">
        <div className={ui.panelHead}>
          <p className={ui.figHeading}>
            <span className={ui.figNo}>01</span> Scanner
          </p>
          <p className={ui.label}>Arc mainnet · chain 5042</p>
        </div>
        <div className={styles.titleBlock}>
          <h1 id="scan-title" className={styles.title}>
            What does this contract cost to call?
          </h1>
          <p className={styles.lead}>
            Paste an Arc contract address. Centscan reads its real transaction receipts and tells you whether the source is verified, whether anyone uses it,
            and what each function costs, in cents.
          </p>
        </div>
        <AddressForm examples={scanExamples(recent)} />
      </section>

      <section className={`${ui.panel} ${styles.recent}`} aria-labelledby="recent-title">
        <div className={ui.panelHead}>
          <h2 id="recent-title" className={ui.figHeading}>
            <span className={ui.figNo}>02</span> Recent scans
          </h2>
          <p className={ui.label}>{recent.length > 0 ? `${recent.length} newest · ramp across these medians` : "none yet"}</p>
        </div>
        <RecentLedger rows={ledgerRows(recent, now)} />
      </section>

      <div className={styles.telemetry}>
        <TelemetryPanel />
      </div>
    </div>
  );
}
