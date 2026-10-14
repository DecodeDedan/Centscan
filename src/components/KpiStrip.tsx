"use client";

import { formatInt, formatUsd } from "@/lib/format";
import type { Report } from "@/lib/report";
import { CountUp } from "./CountUp";
import { intText, microUsdText } from "./formatters";
import styles from "./KpiStrip.module.css";
import ui from "./ui.module.css";

/** Success rate to one decimal, or null when there were no direct calls to rate. */
function successRate(activity: Report["activity"]): string | null {
  if (activity.directCalls === 0) return null;
  return `${((activity.successfulCalls / activity.directCalls) * 100).toFixed(1)}%`;
}

function coverageText(activity: Report["activity"]): { value: string; note: string } {
  const base = activity.coverage.kind === "logs" ? "event logs" : `last ${formatInt(activity.coverage.blocks)} blocks`;
  if (activity.sampled) return { value: `${formatInt(activity.sampled.analysed)}/${formatInt(activity.sampled.found)}`, note: `sampled, from ${base}` };
  return { value: "full", note: `every call, from ${base}` };
}

/** The report's headline readouts: a huge median, then calls, senders, success rate and coverage. Counts up on fresh reports only. */
export function KpiStrip({ report, fresh }: { report: Report; fresh: boolean }) {
  const { activity, headline } = report;
  const rate = successRate(activity);
  const coverage = coverageText(activity);
  return (
    <section className={styles.strip} aria-label="Headline readouts">
      <div className={`${styles.kpi} ${styles.hero}`}>
        <p className={ui.label}>Median call</p>
        <p className={styles.heroValue}>
          {headline.medianMicroUsd === null ? "—" : <CountUp value={Number(headline.medianMicroUsd)} format={microUsdText} animate={fresh} />}
        </p>
        <p className={styles.note}>{headline.per1000Usd === null ? "no priced calls in this window" : `1,000 calls ≈ ${formatUsd(headline.per1000Usd)}`}</p>
      </div>
      <div className={styles.kpi}>
        <p className={ui.label}>Direct calls</p>
        <p className={styles.value}>
          <CountUp value={activity.directCalls} format={intText} animate={fresh} />
        </p>
        <p className={styles.note}>{formatInt(activity.indirectTxs)} via other contracts</p>
      </div>
      <div className={styles.kpi}>
        <p className={ui.label}>Unique senders</p>
        <p className={styles.value}>
          <CountUp value={activity.uniqueSenders} format={intText} animate={fresh} />
        </p>
        <p className={styles.note}>distinct from addresses</p>
      </div>
      <div className={styles.kpi}>
        <p className={ui.label}>Success rate</p>
        <p className={styles.value}>{rate ?? "—"}</p>
        <p className={styles.note}>{rate === null ? "no direct calls" : `${formatInt(activity.successfulCalls)} succeeded`}</p>
      </div>
      <div className={styles.kpi}>
        <p className={ui.label}>Coverage</p>
        <p className={styles.value}>{coverage.value}</p>
        <p className={styles.note}>{coverage.note}</p>
      </div>
    </section>
  );
}
