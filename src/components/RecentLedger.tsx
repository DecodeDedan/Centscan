"use client";

import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Verdict } from "./Verdict";
import ui from "./ui.module.css";
import type { VerdictLabel } from "./verdicts";
import styles from "./RecentLedger.module.css";

export interface LedgerRow {
  reportHash: string;
  address: string;
  hours: number;
  windowLabel: string;
  median: string | null;
  ramp: { label: string; color: string } | null;
  source: VerdictLabel;
  activity: VerdictLabel;
  createdAt: string;
  ago: string;
}

/** New scans by anyone appear without a reload: the server list is re-read on this cadence while the tab is visible. */
const REFRESH_MS = 20_000;

function useVisibleRefresh(intervalMs: number): void {
  const router = useRouter();
  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [router, intervalMs]);
}

/** The recent-scans ledger: a cost-ramp swatch with its word, the contract, its median and verdicts. New rows push in from the top. */
export function RecentLedger({ rows }: { rows: readonly LedgerRow[] }) {
  useVisibleRefresh(REFRESH_MS);

  if (rows.length === 0) {
    return (
      <div className={styles.empty}>
        <p className={styles.emptyTitle}>No contracts scanned yet.</p>
        <p className={ui.caption}>Paste an address or pick an example to print the first report. It will appear here for everyone.</p>
      </div>
    );
  }

  return (
    <ol className={styles.list} role="list">
      <AnimatePresence initial={false} mode="popLayout">
        {rows.map((row) => (
          // New rows only arrive after hydration (router.refresh), and AnimatePresence initial={false} renders the first rows at rest.
          <motion.li key={row.reportHash} layout="position" className={styles.row} initial={{ y: -16, scale: 0.98 }} animate={{ y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.98 }}>
            <span className={styles.swatch} aria-hidden="true" style={row.ramp ? { background: row.ramp.color } : undefined} />
            <div className={styles.main}>
              <Link className={styles.contract} href={`/c/${row.address}?hours=${row.hours}`} title={row.address}>
                {row.address.slice(0, 10)}…{row.address.slice(-6)}
              </Link>
              <span className={styles.meta}>
                <Verdict label={row.source} /> <span aria-hidden="true">·</span> <Verdict label={row.activity} />
              </span>
            </div>
            <div className={styles.cost}>
              <span className={styles.median}>{row.median ?? "—"}</span>
              <span className={styles.band}>{row.ramp ? `${row.ramp.label} · median` : "no priced calls"}</span>
            </div>
            <span className={styles.when}>
              {row.windowLabel} ·{" "}
              <time dateTime={row.createdAt} title={row.createdAt}>
                {row.ago}
              </time>
            </span>
          </motion.li>
        ))}
      </AnimatePresence>
    </ol>
  );
}
