"use client";

import Link from "next/link";
import type { ApiError } from "@/lib/api";
import { Button } from "./Button";
import { ExampleChips } from "./ExampleChips";
import type { ScanExample } from "./examples";
import styles from "./ReportClient.module.css";
import ui from "./ui.module.css";
import { useNow } from "./useNow";

const ERROR_MESSAGES: Partial<Record<ApiError["code"], string>> = {
  NOT_A_CONTRACT: "No contract code at this address on Arc mainnet. Check the address or try an example.",
  INVALID_ADDRESS: "That is not a valid Arc address.",
  INVALID_WINDOW: "That window is not supported. Choose 1 h, 24 h or 7 d.",
  RPC_UNAVAILABLE: "Arc RPC did not answer in time. Try again in a minute.",
};

const TITLES: Partial<Record<ApiError["code"], string>> = {
  NOT_A_CONTRACT: "Not a contract on Arc mainnet",
  RATE_LIMITED: "Rate limited",
  RPC_UNAVAILABLE: "Arc RPC unavailable",
};

type Props = {
  error: ApiError;
  /** Client time the error arrived, for the retry countdown. */
  at: number;
  hours: number;
  examples: readonly ScanExample[];
  onRetry: () => void;
  onBack: (() => void) | null;
};

/** Seconds left before a rate-limited retry can succeed; 0 when there is no limit or it has passed. */
function secondsLeft(error: ApiError, at: number, now: number): number {
  if (error.code !== "RATE_LIMITED" || !error.retryAfterSeconds || now === 0) return 0;
  return Math.max(0, Math.ceil(error.retryAfterSeconds - (now - at) / 1000));
}

export function ReportError({ error, at, hours, examples, onRetry, onBack }: Props) {
  const limited = error.code === "RATE_LIMITED" && Boolean(error.retryAfterSeconds);
  const now = useNow(1_000, limited);
  const wait = secondsLeft(error, at, now);
  const notContract = error.code === "NOT_A_CONTRACT";
  const message = ERROR_MESSAGES[error.code] ?? error.message;

  return (
    <section className={`${ui.panel} ${styles.error}`} role="alert" aria-labelledby="report-error-title">
      <div className={ui.panelHead}>
        <h2 id="report-error-title" className={styles.errorTitle}>
          <span className={ui.fail} aria-hidden="true">
            ✕
          </span>{" "}
          {TITLES[error.code] ?? "Report failed"}
        </h2>
        <p className={ui.label}>{error.code.toLowerCase().replace(/_/g, " ")}</p>
      </div>
      <p className={styles.errorText}>{message}</p>
      {limited && (
        <p className={`${ui.mono} ${styles.countdown}`}>
          {wait > 0 ? (
            <>
              Retry opens in <strong>{wait} s</strong>
              <span className="visually-hidden"> (the Retry button is disabled until then)</span>
            </>
          ) : (
            "You can retry now."
          )}
        </p>
      )}
      <div className={styles.actions}>
        <Button variant={notContract ? "secondary" : "primary"} onClick={onRetry} disabled={wait > 0}>
          Retry
        </Button>
        {onBack && (
          <Button variant="secondary" onClick={onBack}>
            Back to the saved report
          </Button>
        )}
        <Link className={`${ui.button} ${ui.ghost}`} href="/app">
          Scan another address
        </Link>
      </div>
      {notContract && examples.length > 0 && (
        <div className={styles.examples}>
          <p className={ui.label} id="error-examples">
            Try an example
          </p>
          <ExampleChips examples={examples} hours={hours} labelledBy="error-examples" />
        </div>
      )}
    </section>
  );
}
