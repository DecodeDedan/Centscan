"use client";

import { motion, useReducedMotion } from "framer-motion";
import Link from "next/link";
import type { ReactNode } from "react";
import { explorerTx, formatInt, formatMicroUsd, shortHex } from "@/lib/format";
import type { FunctionCost, Report } from "@/lib/report";
import styles from "./CostTable.module.css";
import { PRINT_STAGGER_S, printLine } from "./motion";
import { NumberReveal } from "./NumberReveal";
import ui from "./ui.module.css";

function functionLabel(fn: FunctionCost): { primary: string; secondary: string | null } {
  if (!fn.name) return { primary: fn.selector, secondary: null };
  const parts = [fn.selector.startsWith("0x") ? fn.selector : null, fn.nameSource === "signature-db" ? "name from public signature DB" : null];
  const secondary = parts.filter((part): part is string => part !== null).join(" · ");
  return { primary: fn.name, secondary: secondary || null };
}

function windowPhrase(hours: number): string {
  if (hours === 168) return "7 days";
  return hours === 1 ? "hour" : `${hours} hours`;
}

/** Long ABI signatures break after commas and brackets, not mid-word. */
function breakable(signature: string): ReactNode[] {
  return signature.split(/(?<=[,(])/).flatMap((part, i) => (i === 0 ? [part] : [<wbr key={i} />, part]));
}

type Props = { report: Report; shouldPrint: boolean };

export function CostTable({ report, shouldPrint }: Props) {
  const reduceMotion = useReducedMotion();
  const animate = shouldPrint && !reduceMotion;
  const maxCalls = report.functions.reduce((max, fn) => Math.max(max, fn.calls), 0);

  return (
    <section className={styles.section} aria-labelledby="cost-title">
      <h2 id="cost-title" className={ui.figHeading}>
        <span className={ui.figNo}>Fig. 2</span> Cost per function
      </h2>
      <p className={ui.caption}>
        From real receipts on Arc: <code>gasUsed × effectiveGasPrice</code>, paid in USDC, so the result is already in cents.
      </p>

      {report.functions.length > 0 ? (
        <div className={styles.scroll} tabIndex={0} role="region" aria-label="Cost per function, scrollable">
          <table className={styles.table}>
            <caption className="visually-hidden">Cost per function in the last {windowPhrase(report.window.hours)}</caption>
            <thead>
              <tr>
                <th scope="col">Function</th>
                <th scope="col" className={styles.num}>
                  Median
                </th>
                <th scope="col" className={styles.num}>
                  p90
                </th>
                <th scope="col" className={styles.num}>
                  Calls
                </th>
                <th scope="col" className={styles.num}>
                  Min–max
                </th>
                <th scope="col" className={styles.num}>
                  Median gas
                </th>
                <th scope="col">Sample tx</th>
              </tr>
            </thead>
            <tbody>
              {report.functions.map((fn, i) => {
                const label = functionLabel(fn);
                const share = maxCalls > 0 ? (fn.calls / maxCalls) * 100 : 0;
                return (
                  // shouldPrint is only true after a stream finishes in the browser, so the opacity-0 start never reaches server HTML.
                  <motion.tr
                    key={fn.selector}
                    initial={animate ? { opacity: 0, y: 4 } : false}
                    animate={{ opacity: 1, y: 0 }}
                    transition={animate ? printLine(i) : undefined}
                  >
                    <th scope="row" className={styles.fn}>
                      <span className={styles.fnName}>{breakable(label.primary)}</span>
                      {label.secondary && <span className={styles.sub}>{label.secondary}</span>}
                    </th>
                    <td className={`${styles.num} ${styles.median}`}>
                      <NumberReveal value={formatMicroUsd(fn.costMicroUsd.median)} animate={animate} delay={i * PRINT_STAGGER_S} />
                    </td>
                    <td className={styles.num}>{formatMicroUsd(fn.costMicroUsd.p90)}</td>
                    <td className={styles.num}>
                      {formatInt(fn.calls)}
                      <span className={styles.meter} aria-hidden="true">
                        <span className={styles.meterFill} style={{ inlineSize: `${share}%` }} />
                      </span>
                    </td>
                    <td className={styles.num}>
                      {formatMicroUsd(fn.costMicroUsd.min)}–{formatMicroUsd(fn.costMicroUsd.max)}
                    </td>
                    <td className={styles.num}>{formatInt(fn.medianGas)}</td>
                    <td>
                      <a className={styles.tx} href={explorerTx(fn.sampleTx)} target="_blank" rel="noopener noreferrer" aria-label={`Sample transaction ${fn.sampleTx} (opens in a new tab)`}>
                        {shortHex(fn.sampleTx)}
                      </a>
                    </td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>No calls in this window.</p>
          <p className={ui.caption}>
            Nobody called this contract directly in the last {windowPhrase(report.window.hours)}, so there is nothing to price yet.
          </p>
          {report.window.hours !== 168 && (
            <Link className={`${ui.button} ${ui.secondary}`} href={`/c/${report.target}?hours=168`}>
              Try the 7 d window
            </Link>
          )}
        </div>
      )}

      {report.reverted.calls > 0 && (
        <p className={styles.reverted}>
          <span className={ui.warn} aria-hidden="true">
            !
          </span>{" "}
          {formatInt(report.reverted.calls)} reverted call{report.reverted.calls === 1 ? "" : "s"} cost <span className={ui.mono}>{formatMicroUsd(report.reverted.totalMicroUsd)}</span> in total.
        </p>
      )}
    </section>
  );
}
