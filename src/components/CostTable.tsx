"use client";

import { motion, useReducedMotion } from "framer-motion";
import Link from "next/link";
import type { ReactNode } from "react";
import { explorerTx, formatInt, formatMicroUsd, shortHex } from "@/lib/format";
import type { FunctionCost, Report } from "@/lib/report";
import { CopyButton } from "./CopyButton";
import { costRamp, rowAnchor } from "./costScale";
import styles from "./CostTable.module.css";
import { CountUp } from "./CountUp";
import { microUsdText } from "./formatters";
import { PRINT_STAGGER_S, indicatorSpring, printLine } from "./motion";
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

/** The shareable URL of one row, built at click time from the page the reader is on. */
function rowUrl(hours: number, anchor: string): string {
  const { origin, pathname } = window.location;
  return `${origin}${pathname}?hours=${hours}#${anchor}`;
}

type Props = {
  report: Report;
  shouldPrint: boolean;
  /** Anchor of the row to mark, from a deep link or the chart. */
  highlight: string | null;
};

export function CostTable({ report, shouldPrint, highlight }: Props) {
  const reduceMotion = useReducedMotion();
  const animate = shouldPrint && !reduceMotion;
  const ramp = costRamp(report.functions.map((fn) => fn.costMicroUsd.median));

  return (
    <section className={`${ui.panel} ${styles.section}`} aria-labelledby="cost-title">
      <div className={ui.panelHead}>
        <h2 id="cost-title" className={ui.figHeading}>
          <span className={ui.figNo}>03</span> Cost per function
        </h2>
        <p className={ui.label}>gasUsed × effectiveGasPrice · USDC</p>
      </div>

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
                const anchor = rowAnchor(fn.selector);
                const stop = ramp(fn.costMicroUsd.median);
                const marked = highlight === anchor;
                return (
                  // shouldPrint is only true after a stream finishes in the browser, so the transformed start never reaches server HTML.
                  <motion.tr
                    key={fn.selector}
                    id={anchor}
                    tabIndex={-1}
                    className={styles.row}
                    data-highlight={marked ? "true" : undefined}
                    initial={animate ? { x: -12 } : false}
                    animate={{ x: 0 }}
                    transition={animate ? printLine(i) : undefined}
                  >
                    <th scope="row" className={styles.fn}>
                      {marked && <motion.span layoutId="cost-row-mark" className={styles.mark} transition={indicatorSpring} aria-hidden="true" />}
                      <span className={styles.fnHead}>
                        <span className={styles.swatch} style={{ background: stop.color }} aria-hidden="true" />
                        <span className={styles.fnName}>{breakable(label.primary)}</span>
                      </span>
                      <span className={styles.sub}>
                        {label.secondary && <span>{label.secondary}</span>}
                        <span>{stop.label} for this contract</span>
                      </span>
                      <span className={styles.rowCopy}>
                        <CopyButton value={() => rowUrl(report.window.hours, anchor)} label={`Copy link to the ${label.primary} row`} text="Copy link" />
                      </span>
                    </th>
                    <td className={`${styles.num} ${styles.median}`} data-label="Median">
                      <CountUp value={Number(fn.costMicroUsd.median)} format={microUsdText} animate={animate} delay={i * PRINT_STAGGER_S} />
                    </td>
                    <td className={styles.num} data-label="p90">
                      {formatMicroUsd(fn.costMicroUsd.p90)}
                    </td>
                    <td className={styles.num} data-label="Calls">
                      {formatInt(fn.calls)}
                    </td>
                    <td className={styles.num} data-label="Min–max">
                      {formatMicroUsd(fn.costMicroUsd.min)}–{formatMicroUsd(fn.costMicroUsd.max)}
                    </td>
                    <td className={styles.num} data-label="Median gas">
                      {formatInt(fn.medianGas)}
                    </td>
                    <td data-label="Sample tx">
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
