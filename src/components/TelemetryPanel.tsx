"use client";

import { animate, motion, useMotionValue, useReducedMotion, useTransform } from "framer-motion";
import { useEffect } from "react";
import { formatInt, formatMicroUsd } from "@/lib/format";
import { CHAIN_POLL_MS, useChainFeed, type ChainFeed } from "./chainFeed";
import { countSpring } from "./motion";
import styles from "./TelemetryPanel.module.css";
import ui from "./ui.module.css";
import { useNow } from "./useNow";

const GAS_PER_TRANSFER = 21_000;
const SPARK_W = 120;
const SPARK_H = 32;

/** A readout that springs from its previous value to the next one, so a new block reads as movement, not a jump. */
function LiveInt({ value }: { value: number }) {
  const reduceMotion = useReducedMotion();
  const shown = useMotionValue(value);
  const text = useTransform(shown, (v) => formatInt(Math.round(v)));
  useEffect(() => {
    if (reduceMotion) {
      shown.set(value);
      return;
    }
    const controls = animate(shown, value, countSpring);
    return () => controls.stop();
  }, [value, reduceMotion, shown]);
  return <motion.span>{text}</motion.span>;
}

/** Blocks per second measured in this browser between the first and last reading it kept. */
function blockRate(history: ChainFeed["history"]): string | null {
  const first = history[0];
  const last = history.at(-1);
  if (!first || !last || last.at - first.at < 1_000) return null;
  return ((last.block - first.block) / ((last.at - first.at) / 1000)).toFixed(2);
}

/** Bars of blocks advanced between consecutive polls: the chain's pace as this browser saw it. */
function Sparkline({ history }: { history: ChainFeed["history"] }) {
  const deltas = history.slice(1).map((h, i) => h.block - (history[i]?.block ?? h.block));
  if (deltas.length < 2) return <p className={ui.caption}>Pace chart fills in after a few readings.</p>;
  const max = Math.max(...deltas, 1);
  const step = SPARK_W / deltas.length;
  return (
    <svg className={styles.spark} viewBox={`0 0 ${SPARK_W} ${SPARK_H}`} preserveAspectRatio="none" role="img" aria-label={`Blocks per poll, last ${deltas.length} polls: ${deltas.join(", ")}`}>
      {deltas.map((d, i) => {
        const h = Math.max(1, (d / max) * SPARK_H);
        return <rect key={i} x={i * step + 0.5} y={SPARK_H - h} width={Math.max(1, step - 1)} height={h} className={styles.sparkBar} />;
      })}
    </svg>
  );
}

/** Live Arc telemetry for /app: every figure comes from GET /api/chain or this browser's own clock. */
export function TelemetryPanel() {
  const { latest, paused, history } = useChainFeed();
  const now = useNow(1_000);
  const age = latest && now > 0 ? Math.max(0, Math.round(now / 1000 - latest.timestamp)) : null;
  const rate = blockRate(history);

  return (
    <section className={`${ui.panel} ${styles.panel}`} aria-labelledby="telemetry-title">
      <div className={ui.panelHead}>
        <h2 id="telemetry-title" className={ui.figHeading}>
          <span className={ui.figNo}>03</span> Arc mainnet, live
        </h2>
        <p className={styles.state}>
          <span className={paused ? `${ui.live} ${ui.liveOff}` : ui.live} aria-hidden="true" />
          {paused ? "Live readout paused" : `Polled every ${CHAIN_POLL_MS / 1000} s while this tab is visible`}
        </p>
      </div>

      {latest === null ? (
        <p className={ui.caption}>{paused ? "Arc RPC did not answer. Readouts resume when it does." : "Reading the newest Arc block…"}</p>
      ) : (
        <div className={styles.grid}>
          <dl className={styles.readouts}>
            <div className={styles.readout}>
              <dt className={ui.label}>Block</dt>
              <dd className={styles.big}>
                <LiveInt value={Number(latest.blockNumber)} />
              </dd>
            </div>
            <div className={styles.readout}>
              <dt className={ui.label}>Base fee</dt>
              <dd className={styles.value}>
                {latest.baseFeeGwei} <span className={styles.unit}>gwei</span>
              </dd>
            </div>
            <div className={styles.readout}>
              <dt className={ui.label}>Plain transfer</dt>
              <dd className={styles.value}>{formatMicroUsd(latest.transferMicroUsd)}</dd>
            </div>
            <div className={styles.readout}>
              <dt className={ui.label}>Block age</dt>
              <dd className={styles.value}>{age === null ? "—" : `${age} s`}</dd>
            </div>
            <div className={styles.readout}>
              <dt className={ui.label}>Pace</dt>
              <dd className={styles.value}>{rate === null ? (
                  "measuring…"
                ) : (
                  <>
                    {rate} <span className={styles.unit}>blocks/s</span>
                  </>
                )}</dd>
            </div>
          </dl>
          <div className={styles.side}>
            <Sparkline history={history} />
            <p className={styles.formula}>
              <span>{formatInt(GAS_PER_TRANSFER)} gas</span> <span aria-hidden="true">×</span>
              <span className="visually-hidden">times</span> <span>{latest.baseFeeGwei} gwei</span> <span aria-hidden="true">=</span>
              <span className="visually-hidden">equals</span> <strong className={styles.result}>{formatMicroUsd(latest.transferMicroUsd)}</strong>
            </p>
            <p className={ui.caption}>Arc pays gas in USDC, so gas × price is already money. Centscan does the same sum for every real call.</p>
          </div>
        </div>
      )}
      {paused && latest && <p className={`${ui.caption} ${ui.warn}`}>Showing the last good reading, block {formatInt(latest.blockNumber)}.</p>}
    </section>
  );
}
