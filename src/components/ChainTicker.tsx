"use client";

import { formatInt, formatMicroUsd } from "@/lib/format";
import { useChainFeed } from "./chainFeed";
import styles from "./ChainTicker.module.css";
import ui from "./ui.module.css";

/** App-bar readout of the newest Arc block and base fee from GET /api/chain. Visible, not announced: it changes every few seconds. */
export function ChainTicker() {
  const { latest, paused } = useChainFeed();
  return (
    <div className={styles.ticker} aria-label="Live Arc mainnet readout" role="group">
      <span className={paused ? `${ui.live} ${ui.liveOff}` : ui.live} aria-hidden="true" />
      {latest === null ? (
        <span className={styles.wait}>{paused ? "Live readout paused" : "Reading Arc…"}</span>
      ) : (
        <>
          <span className={styles.item}>
            <span className={ui.label}>Block</span> <span className={styles.value}>{formatInt(latest.blockNumber)}</span>
          </span>
          <span className={styles.item}>
            <span className={ui.label}>Base fee</span> <span className={styles.value}>{latest.baseFeeGwei} gwei</span>
          </span>
          <span className={`${styles.item} ${styles.optional}`}>
            <span className={ui.label}>Transfer</span> <span className={styles.value}>{formatMicroUsd(latest.transferMicroUsd)}</span>
          </span>
          {paused && <span className={styles.paused}>Live readout paused</span>}
        </>
      )}
    </div>
  );
}
