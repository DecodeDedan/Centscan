"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { ProgressEvent, ProgressStep } from "@/lib/report";
import { duration, easeOut } from "./motion";
import r from "./Receipt.module.css";
import styles from "./ReportProgress.module.css";
import ui from "./ui.module.css";
import { windowLabel } from "./verdicts";

const STEP_LABELS: Record<ProgressStep, string> = {
  code: "Reading code",
  source: "Checking Sourcify",
  logs: "Collecting logs",
  transactions: "Fetching transactions",
  blocks: "Scanning blocks",
  names: "Naming functions",
};

const STEP_UNITS: Partial<Record<ProgressStep, string>> = { logs: "page " };

export function isProgressStep(value: unknown): value is ProgressStep {
  return typeof value === "string" && value in STEP_LABELS;
}

/** Widths of the unprinted lines, so the skeleton has the receipt's ragged shape. */
const FEED_WIDTHS = ["92%", "70%", "84%", "60%", "88%", "76%"] as const;

function StepLine({ step, isLast }: { step: ProgressEvent; isLast: boolean }) {
  const reduceMotion = useReducedMotion();
  // Steps can overlap (Sourcify runs beside log collection), so a step is finished only when it says so.
  const active = step.done < step.total || (step.total === 0 && isLast);
  const count = step.total > 1 ? `${STEP_UNITS[step.step] ?? ""}${step.done.toLocaleString("en-US")}/${step.total.toLocaleString("en-US")}` : null;
  // Step lines only exist after SSE events arrive in the browser, so the opacity-0 start never reaches server HTML.
  return (
    <motion.div
      className={r.line}
      initial={reduceMotion ? false : { opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: duration.fast, ease: easeOut }}
    >
      <dt>{STEP_LABELS[step.step]}</dt>
      <dd>
        {/* Counts tick many times a second; they are visible but not announced. */}
        {count && <span aria-hidden="true">{count} </span>}
        {active ? (
          <span className={styles.working}>
            <span className="visually-hidden">in progress</span>
            <span aria-hidden="true" className={styles.caret} />
          </span>
        ) : (
          <span className={ui.pass}>
            <span aria-hidden="true">✓</span>
            <span className="visually-hidden">done</span>
          </span>
        )}
      </dd>
    </motion.div>
  );
}

/** The receipt while it prints: each build step lands as a printed line, then blank paper feeds below it. */
export function ReportProgress({ steps, hours }: { steps: ProgressEvent[]; hours: number }) {
  return (
    <div className={r.unit} aria-busy="true">
      <div className={r.slot} aria-hidden="true" />
      <article className={r.paper} aria-labelledby="progress-title">
        <header className={r.head}>
          <h2 id="progress-title" className={r.title}>
            Printing receipt
          </h2>
          <p className={r.store}>Reading real receipts from Arc mainnet · last {windowLabel(hours)}</p>
          <p className={r.store}>The public RPC can take around 30 seconds.</p>
        </header>
        <dl className={r.lines} aria-live="polite" aria-label="Report progress">
          {steps.length === 0 && (
            <div className={r.line}>
              <dt>Connecting</dt>
              <dd>
                <span className="visually-hidden">in progress</span>
                <span aria-hidden="true" className={styles.caret} />
              </dd>
            </div>
          )}
          {steps.map((s, i) => (
            <StepLine key={s.step} step={s} isLast={i === steps.length - 1} />
          ))}
        </dl>
        <div className={styles.feed} aria-hidden="true">
          {FEED_WIDTHS.map((w, i) => (
            <span key={i} className={styles.bar} style={{ inlineSize: w }} />
          ))}
        </div>
      </article>
    </div>
  );
}

/** Placeholder for the cost table in its final position, so nothing jumps when the report lands. */
export function CostTableSkeleton() {
  return (
    <section className={styles.tableSkeleton} aria-labelledby="cost-pending-title">
      <h2 id="cost-pending-title" className={ui.figHeading}>
        <span className={ui.figNo}>Fig. 2</span> Cost per function
      </h2>
      <p className={ui.caption}>Prices appear when the receipt finishes printing.</p>
      <div className={styles.rows} aria-hidden="true">
        {FEED_WIDTHS.slice(0, 5).map((w, i) => (
          <span key={i} className={styles.row}>
            <span className={styles.bar} style={{ inlineSize: w }} />
          </span>
        ))}
      </div>
    </section>
  );
}
