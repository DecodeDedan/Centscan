"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { ApiError, AttestationInfo, ReportPayload } from "@/lib/api";
import { explorerAddress } from "@/lib/format";
import { reportSchema, type AttestationRecord, type ProgressEvent, type WindowHours } from "@/lib/report";
import { AttestPanel } from "./AttestPanel";
import { BadgePanel } from "./BadgePanel";
import { Button } from "./Button";
import { CopyButton } from "./CopyButton";
import { CostTable } from "./CostTable";
import { Receipt } from "./Receipt";
import styles from "./ReportClient.module.css";
import { CostTableSkeleton, isProgressStep, ReportProgress } from "./ReportProgress";
import { utcStamp } from "./receiptNotes";
import { Tabs } from "./Tabs";
import ui from "./ui.module.css";
import { VerifyPanel } from "./VerifyPanel";
import { WindowLinks } from "./WindowPicker";

type Props = {
  address: string;
  hours: WindowHours;
  initial: ReportPayload | null;
  attestationInfo: AttestationInfo | null;
};

type View =
  | { kind: "report"; payload: ReportPayload; fresh: boolean; stampFresh: boolean }
  | { kind: "streaming"; steps: ProgressEvent[] }
  | { kind: "error"; error: ApiError };

const ERROR_MESSAGES: Partial<Record<ApiError["code"], string>> = {
  NOT_A_CONTRACT: "There is no contract code at this address on Arc mainnet. Check the address, or scan another one.",
  INVALID_ADDRESS: "That is not a valid Arc address.",
  INVALID_WINDOW: "That window is not supported. Choose 1 h, 24 h or 7 d.",
  RPC_UNAVAILABLE: "Arc RPC did not answer in time. Try again in a minute.",
};

function errorText(error: ApiError): string {
  if (error.code === "RATE_LIMITED") {
    const wait = error.retryAfterSeconds ? ` Try again in ${error.retryAfterSeconds} s.` : "";
    return `${error.message}${wait}`;
  }
  return ERROR_MESSAGES[error.code] ?? error.message;
}

function isApiError(value: unknown): value is ApiError {
  return typeof value === "object" && value !== null && typeof (value as ApiError).code === "string" && typeof (value as ApiError).message === "string";
}

function isProgress(value: unknown): value is ProgressEvent {
  if (typeof value !== "object" || value === null) return false;
  const v = value as ProgressEvent;
  return isProgressStep(v.step) && typeof v.done === "number" && typeof v.total === "number";
}

function parsePayload(value: unknown): ReportPayload | null {
  if (typeof value !== "object" || value === null) return null;
  const v = value as ReportPayload;
  const report = reportSchema.safeParse(v.report);
  if (!report.success || typeof v.reportHash !== "string" || typeof v.createdAt !== "string") return null;
  return { report: report.data, reportHash: v.reportHash, createdAt: v.createdAt, attestation: v.attestation ?? null };
}

function parseData(event: MessageEvent<string>): unknown {
  try {
    return JSON.parse(event.data);
  } catch {
    return null;
  }
}

const CONNECTION_LOST: ApiError = { code: "INTERNAL", message: "The connection to the server dropped before the report finished. Retry to start again." };
const BAD_DATA: ApiError = { code: "INTERNAL", message: "The server sent a report this page could not read. Retry to build it again." };

/** Replaces the entry for a step, keeping first-seen order. */
function upsertStep(steps: ProgressEvent[], next: ProgressEvent): ProgressEvent[] {
  return steps.some((s) => s.step === next.step) ? steps.map((s) => (s.step === next.step ? next : s)) : [...steps, next];
}

function ReportHeader({ address, hours, busy, onRefresh, savedAt }: { address: string; hours: WindowHours; busy: boolean; onRefresh: () => void; savedAt: string | null }) {
  return (
    <header className={styles.header}>
      <div className={styles.ident}>
        <p className={ui.caption}>Contract on Arc mainnet</p>
        <h1 className={styles.address}>
          <span className="visually-hidden">Report for </span>
          {address}
        </h1>
        <div className={styles.identActions}>
          <a className={styles.explorer} href={explorerAddress(address)} target="_blank" rel="noopener noreferrer">
            Arc explorer<span aria-hidden="true"> ↗</span>
            <span className="visually-hidden"> (opens in a new tab)</span>
          </a>
          <CopyButton value={address} label="Copy address" />
        </div>
      </div>
      <div className={styles.tools}>
        <WindowLinks address={address} value={hours} />
        <div className={styles.refresh}>
          <Button variant="secondary" onClick={onRefresh} disabled={busy} className={styles.refreshButton}>
            {busy ? "Scanning…" : "Refresh"}
          </Button>
          {savedAt && (
            <p className={ui.caption}>
              Saved <time dateTime={savedAt}>{utcStamp(savedAt, 16)}</time>
            </p>
          )}
        </div>
      </div>
    </header>
  );
}

function ErrorState({ error, onRetry, onBack }: { error: ApiError; onRetry: () => void; onBack: (() => void) | null }) {
  const notContract = error.code === "NOT_A_CONTRACT";
  return (
    <section className={styles.error} role="alert" aria-labelledby="report-error-title">
      <h2 id="report-error-title" className={styles.errorTitle}>
        <span className={ui.fail} aria-hidden="true">
          ✕
        </span>{" "}
        {notContract ? "Not a contract on Arc mainnet" : "Report failed"}
      </h2>
      <p className={styles.errorText}>{errorText(error)}</p>
      <div className={styles.actions}>
        <Button onClick={onRetry}>Retry</Button>
        {onBack && (
          <Button variant="secondary" onClick={onBack}>
            Back to the saved report
          </Button>
        )}
        <Link className={`${ui.button} ${ui.ghost}`} href="/app">
          Scan another address
        </Link>
      </div>
    </section>
  );
}

export function ReportClient({ address, hours, initial, attestationInfo }: Props) {
  const [view, setView] = useState<View>(initial ? { kind: "report", payload: initial, fresh: false, stampFresh: false } : { kind: "streaming", steps: [] });
  // Bumped by Refresh and Retry to open a new stream.
  const [attempt, setAttempt] = useState(0);
  const isStreaming = view.kind === "streaming";

  useEffect(() => {
    if (!isStreaming) return;
    const source = new EventSource(`/api/report/${address}/stream?hours=${hours}`);
    // EventSource reconnects on its own after an error; every terminal state closes it explicitly.
    const finish = (next: View) => {
      source.close();
      setView(next);
    };
    source.addEventListener("progress", (event) => {
      const data = parseData(event as MessageEvent<string>);
      if (isProgress(data)) setView((v) => (v.kind === "streaming" ? { kind: "streaming", steps: upsertStep(v.steps, data) } : v));
    });
    source.addEventListener("done", (event) => {
      const payload = parsePayload(parseData(event as MessageEvent<string>));
      finish(payload ? { kind: "report", payload, fresh: true, stampFresh: false } : { kind: "error", error: BAD_DATA });
    });
    source.addEventListener("error", (event) => {
      // A server "error" event carries data; a bare Event means the connection itself failed.
      const data = event instanceof MessageEvent ? parseData(event as MessageEvent<string>) : null;
      finish({ kind: "error", error: isApiError(data) ? data : CONNECTION_LOST });
    });
    return () => source.close();
  }, [address, hours, attempt, isStreaming]);

  function restart() {
    setView({ kind: "streaming", steps: [] });
    setAttempt((n) => n + 1);
  }

  function onAttested(record: AttestationRecord) {
    setView((v) => (v.kind === "report" ? { ...v, fresh: false, stampFresh: true, payload: { ...v.payload, attestation: record } } : v));
  }

  const savedAt = view.kind === "report" ? view.payload.createdAt : null;
  const header = <ReportHeader address={address} hours={hours} busy={isStreaming} onRefresh={restart} savedAt={savedAt} />;

  if (view.kind === "streaming") {
    return (
      <div className={styles.page}>
        {header}
        <div className={styles.body}>
          <div className={styles.receiptCol}>
            <ReportProgress steps={view.steps} hours={hours} />
          </div>
          <div className={styles.tableCol}>
            <CostTableSkeleton />
          </div>
        </div>
      </div>
    );
  }

  if (view.kind === "error") {
    return (
      <div className={styles.page}>
        {header}
        <ErrorState error={view.error} onRetry={restart} onBack={initial ? () => setView({ kind: "report", payload: initial, fresh: false, stampFresh: false }) : null} />
      </div>
    );
  }

  const { payload, fresh, stampFresh } = view;
  return (
    <div className={styles.page}>
      {header}
      <div className={styles.body}>
        <div className={styles.receiptCol}>
          <p className={styles.fig}>
            <span className={ui.figNo}>Fig. 1</span> The receipt
          </p>
          <Receipt payload={payload} shouldPrint={fresh} stampFresh={stampFresh} />
        </div>
        <div className={styles.tableCol}>
          <CostTable report={payload.report} shouldPrint={fresh} />
        </div>
        <div className={styles.panelCol}>
          <section className={styles.proof} aria-labelledby="proof-title">
            <h2 id="proof-title" className={ui.figHeading}>
              <span className={ui.figNo}>Fig. 3</span> Share and prove
            </h2>
            <Tabs
              label="Share and prove"
              items={[
                { key: "badge", label: "Badge", content: <BadgePanel address={address} /> },
                {
                  key: "attest",
                  label: "Attest",
                  content: (
                    <AttestPanel
                      key={payload.reportHash}
                      address={address}
                      hours={hours}
                      info={attestationInfo}
                      existing={payload.attestation}
                      onAttested={onAttested}
                    />
                  ),
                },
                {
                  key: "verify",
                  label: "Verify",
                  content: <VerifyPanel key={`v-${payload.reportHash}`} report={payload.report} reportHash={payload.reportHash} info={attestationInfo} />,
                },
              ]}
            />
          </section>
        </div>
      </div>
      <p className="visually-hidden" role="status">
        {stampFresh && payload.attestation ? `Attested on Arc in block ${payload.attestation.blockNumber}. The receipt is stamped.` : ""}
      </p>
    </div>
  );
}
