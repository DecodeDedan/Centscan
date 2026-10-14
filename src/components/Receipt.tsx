"use client";

import { motion, useReducedMotion, type MotionProps } from "framer-motion";
import type { ReactNode } from "react";
import type { ReportPayload } from "@/lib/api";
import { explorerTx, formatInt, formatUsd, shortHex } from "@/lib/format";
import type { AttestationRecord } from "@/lib/report";
import { duration, easeOut, PRINT_STAGGER_S, printLine, stampSpring } from "./motion";
import styles from "./Receipt.module.css";
import { partialNotes, utcStamp } from "./receiptNotes";
import { CountUp } from "./CountUp";
import { microUsdText } from "./formatters";
import { Verdict } from "./Verdict";
import { activityLabel, sourceLabel, windowLabel } from "./verdicts";

type Props = {
  payload: ReportPayload;
  /** True only when the report just finished building in this browser: the paper feeds out and lines print. */
  shouldPrint: boolean;
  /** True when the attestation landed in this browser session: the stamp presses down. */
  stampFresh: boolean;
};

/** Hands out the next print slot, so lines land top to bottom. Fresh reports exist only client-side, so no SSR hidden state. */
function printer(animate: boolean): () => MotionProps {
  let index = 0;
  return () => (animate ? { initial: { x: -8 }, animate: { x: 0 }, transition: printLine(index++) } : { initial: false });
}

function Line({ term, children, m }: { term: string; children: ReactNode; m: MotionProps }) {
  return (
    <motion.div className={styles.line} {...m}>
      <dt>{term}</dt>
      <dd>{children}</dd>
    </motion.div>
  );
}

function Stamp({ record, fresh }: { record: AttestationRecord; fresh: boolean }) {
  const reduceMotion = useReducedMotion();
  const press = fresh && !reduceMotion;
  return (
    <motion.a
      className={styles.stamp}
      href={explorerTx(record.txHash)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Attested on Arc in block ${formatInt(record.blockNumber)}. Open the attestation transaction (opens in a new tab)`}
      initial={press ? { scale: 1.8, rotate: 4 } : false}
      animate={{ scale: 1, rotate: -7 }}
      transition={press ? stampSpring : undefined}
    >
      <span className={styles.stampWord}>Attested on Arc</span>
      <span className={styles.stampMeta}>block {formatInt(record.blockNumber)}</span>
    </motion.a>
  );
}

export function Receipt({ payload, shouldPrint, stampFresh }: Props) {
  const reduceMotion = useReducedMotion();
  const animate = shouldPrint && !reduceMotion;
  const { report, reportHash, attestation } = payload;
  const { activity, headline } = report;
  const next = printer(animate);
  // The total rolls in after the verdict lines have printed.
  const totalDelay = 7 * PRINT_STAGGER_S;
  const notes = partialNotes(report);

  return (
    <div className={styles.unit}>
      <motion.article
        className={styles.paper}
        data-stamped={attestation ? "true" : undefined}
        aria-labelledby="receipt-title"
        initial={animate ? { scaleY: 0.9, y: -8 } : false}
        animate={{ scaleY: 1, y: 0 }}
        transition={{ duration: duration.base, ease: easeOut }}
        style={{ originY: 0 }}
      >
        <header className={styles.head}>
          <h2 id="receipt-title" className={styles.title}>
            Receipt
          </h2>
          <span className={styles.figNo} aria-hidden="true">
            04
          </span>
          <p className={styles.store}>Centscan · Arc mainnet · chain {report.chainId}</p>
          <p className={styles.store}>
            {shortHex(report.target, 10, 8)} · last {windowLabel(report.window.hours)}
          </p>
        </header>

        <dl className={styles.lines}>
          <Line term="Source" m={next()}>
            <Verdict label={sourceLabel(report.source)} />
            {report.source.verdict === "fail" && (
              <a className={styles.fix} href={report.source.sourcifyUrl} target="_blank" rel="noopener noreferrer">
                Publish on Sourcify<span className="visually-hidden"> (opens in a new tab)</span>
              </a>
            )}
          </Line>
          <Line term="Activity" m={next()}>
            <Verdict label={activityLabel(activity)} />
          </Line>
          <Line term="Direct calls" m={next()}>
            {formatInt(activity.directCalls)} <span className={styles.dim}>({formatInt(activity.successfulCalls)} ok)</span>
          </Line>
          <Line term="Unique senders" m={next()}>
            {formatInt(activity.uniqueSenders)}
          </Line>
          <Line term="First seen" m={next()}>
            {activity.firstSeenBlock ? `block ${formatInt(activity.firstSeenBlock)}` : "—"}
          </Line>
          <Line term="Last seen" m={next()}>
            {activity.lastSeenBlock ? `block ${formatInt(activity.lastSeenBlock)}` : "—"}
          </Line>
          <Line term="Coverage" m={next()}>
            {activity.coverage.kind === "logs" ? "event logs" : `last ${formatInt(activity.coverage.blocks)} blocks`}
          </Line>
        </dl>

        {/* The total is the hero: on a fresh report its digits roll in once, transform only; a stored report shows it at rest. */}
        <div className={styles.total}>
          {headline.medianMicroUsd !== null && headline.per1000Usd !== null ? (
            <>
              <p className={styles.totalRow}>
                <span className={styles.totalTerm}>Median call</span>
                <span className={styles.totalValue}>
                  <CountUp value={Number(headline.medianMicroUsd)} format={microUsdText} animate={animate} delay={totalDelay} />
                </span>
              </p>
              <p className={styles.totalSub}>
                <span>1,000 calls ≈</span> <span>{formatUsd(headline.per1000Usd)}</span>
              </p>
            </>
          ) : (
            <p className={styles.totalRow}>
              <span className={styles.totalTerm}>No priced calls in this window</span>
            </p>
          )}
          {attestation && <Stamp record={attestation} fresh={stampFresh} />}
        </div>

        {notes.length > 0 && (
          <ul className={styles.notes} aria-label="Coverage notes" role="list">
            {notes.map((note) => (
              <motion.li key={note} className={styles.note} {...next()}>
                <span aria-hidden="true" className={styles.noteIcon}>
                  !
                </span>
                <span>{note}</span>
              </motion.li>
            ))}
          </ul>
        )}

        <dl className={`${styles.lines} ${styles.foot}`}>
          <Line term="Blocks" m={next()}>
            {formatInt(report.window.fromBlock)}–{formatInt(report.window.toBlock)}
          </Line>
          <Line term="Generated" m={next()}>
            <time dateTime={report.generatedAt}>{utcStamp(report.generatedAt)}</time>
          </Line>
          <Line term="Report hash" m={next()}>
            <span title={reportHash}>{shortHex(reportHash, 10, 8)}</span>
          </Line>
        </dl>
        <motion.p className={styles.signoff} {...next()}>
          Priced from real receipts, never estimates.
        </motion.p>
      </motion.article>
    </div>
  );
}
