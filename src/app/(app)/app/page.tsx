import type { Metadata } from "next";
import Link from "next/link";
import { AddressForm } from "@/components/AddressForm";
import { Verdict } from "@/components/Verdict";
import ui from "@/components/ui.module.css";
import { activityLabel, sourceLabel, windowLabel } from "@/components/verdicts";
import type { ReportPayload } from "@/lib/api";
import { formatMicroUsd, shortHex } from "@/lib/format";
import { getRecentReports } from "@/server/service";
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

function Ledger({ recent, now }: { recent: ReportPayload[]; now: number }) {
  return (
    <div className={styles.scroll} tabIndex={0} role="region" aria-label="Recent scans, scrollable">
      <table className={styles.ledger}>
        <thead>
          <tr>
            <th scope="col">Contract</th>
            <th scope="col" className={styles.num}>
              Median call
            </th>
            <th scope="col">Source</th>
            <th scope="col">Activity</th>
            <th scope="col" className={styles.num}>
              Window
            </th>
            <th scope="col" className={styles.num}>
              Scanned
            </th>
          </tr>
        </thead>
        <tbody>
          {recent.map(({ report, reportHash, createdAt }) => (
            <tr key={reportHash}>
              <th scope="row">
                <Link className={styles.contract} href={`/c/${report.target}?hours=${report.window.hours}`} title={report.target}>
                  {shortHex(report.target, 10, 6)}
                </Link>
              </th>
              <td className={`${styles.num} ${styles.cost}`}>{report.headline.medianMicroUsd !== null ? formatMicroUsd(report.headline.medianMicroUsd) : <span className={styles.none}>—</span>}</td>
              <td>
                <Verdict label={sourceLabel(report.source)} />
              </td>
              <td>
                <Verdict label={activityLabel(report.activity)} />
              </td>
              <td className={styles.num}>{windowLabel(report.window.hours)}</td>
              <td className={styles.num}>
                <time dateTime={createdAt} title={createdAt}>
                  {timeAgo(createdAt, now)}
                </time>
              </td>
            </tr>
          ))}
          {/* Unfilled ledger lines: the book has room for RECENT_LIMIT entries. Decorative, so hidden from assistive tech. */}
          {Array.from({ length: RECENT_LIMIT - recent.length }, (_, i) => (
            <tr key={`blank-${i}`} aria-hidden="true" className={styles.blank}>
              <td colSpan={6} />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ScannerPage() {
  const recent = getRecentReports(RECENT_LIMIT);
  // Server component rendered per request: one clock reading for every row.
  // eslint-disable-next-line react-hooks/purity -- force-dynamic server render, never re-rendered on the client
  const now = Date.now();

  return (
    <div className={styles.page}>
      <section className={styles.scan} aria-labelledby="scan-title">
        <div className={styles.titleBlock}>
          <h1 id="scan-title" className={styles.title}>
            What does this contract cost to call?
          </h1>
          <p className={styles.lead}>
            Paste an Arc contract address. Centscan reads its real transaction receipts and tells you whether the source is verified, whether anyone uses
            it, and what each function costs, in cents.
          </p>
        </div>
        <div className={styles.panel}>
          <AddressForm />
        </div>
      </section>

      <div className={styles.side}>
        <section className={styles.recent} aria-labelledby="recent-title">
          <div className={styles.recentHead}>
            <h2 id="recent-title" className={ui.figHeading}>
              <span className={ui.figNo}>Fig. 1</span> Recent scans
            </h2>
            {recent.length > 0 && (
              <p className={ui.caption}>
                The last {recent.length === 1 ? "report" : `${recent.length} reports`} built on this server, newest first.
              </p>
            )}
          </div>
          {recent.length === 0 ? (
            <p className={styles.empty}>No contracts scanned yet. Paste an address to print the first receipt.</p>
          ) : (
            <Ledger recent={recent} now={now} />
          )}
        </section>

        <figure className={styles.formula}>
          <div className={styles.terms} aria-hidden="true">
            <span className={styles.term}>
              <span className={styles.symbol}>gasUsed</span>
              <span className={styles.gloss}>gas the call burned</span>
            </span>
            <span className={styles.op}>×</span>
            <span className={styles.term}>
              <span className={styles.symbol}>effectiveGasPrice</span>
              <span className={styles.gloss}>price paid, tip included</span>
            </span>
            <span className={styles.op}>=</span>
            <span className={styles.term}>
              <span className={`${styles.symbol} ${styles.result}`}>¢</span>
              <span className={styles.gloss}>Arc gas is USDC</span>
            </span>
          </div>
          <figcaption className={styles.figcaption}>
            <span className={ui.figNo}>Fig. 2</span> The cost of one call is gasUsed × effectiveGasPrice. Arc pays gas in USDC, so that product is already a
            dollar amount.
          </figcaption>
        </figure>
      </div>
    </div>
  );
}
