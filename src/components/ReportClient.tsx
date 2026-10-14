"use client";

import { useEffect, useState } from "react";
import type { ApiError, AttestationInfo, ReportPayload } from "@/lib/api";
import { explorerAddress } from "@/lib/format";
import { reportSchema, type AttestationRecord, type ProgressEvent, type WindowHours } from "@/lib/report";
import { AttestPanel } from "./AttestPanel";
import { BadgePanel } from "./BadgePanel";
import { Button } from "./Button";
import { CopyButton } from "./CopyButton";
import { CostChart, CostChartSkeleton } from "./CostChart";
import { CostTable } from "./CostTable";
import type { ScanExample } from "./examples";
import { KpiStrip } from "./KpiStrip";
import { advanceStages, isProgressStep, type StageState } from "./pipelineStages";
import { Receipt } from "./Receipt";
import styles from "./ReportClient.module.css";
import { ReportError } from "./ReportError";
import { ReportProgress } from "./ReportProgress";
import { utcStamp } from "./receiptNotes";
import { ScrambleText } from "./ScrambleText";
import { Tabs } from "./Tabs";
import ui from "./ui.module.css";
import { verdictSentence } from "./verdictSentence";
import { VerifyPanel } from "./VerifyPanel";
import { WindowLinks } from "./WindowPicker";

type Props = {
  address: string;
  hours: WindowHours;
  initial: ReportPayload | null;
  attestationInfo: AttestationInfo | null;
  examples: readonly ScanExample[];
};

type View =
  | { kind: "report"; payload: ReportPayload; fresh: boolean; stampFresh: boolean }
  | { kind: "streaming"; stages: StageState[]; startedAt: number | null }
  | { kind: "error"; error: ApiError; at: number };

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

/** Reads "#fn-…" from the URL so a shared row link lands on its row. */
function hashAnchor(): string | null {
  const hash = window.location.hash.slice(1);
  return /^fn-[A-Za-z0-9]+$/.test(hash) ? hash : null;
}

/** Scrolls a cost-table row into view and moves focus to it, so keyboard readers land where the chart sent them. */
function revealRow(anchor: string, smooth: boolean): void {
  const row = document.getElementById(anchor);
  if (!row) return;
  row.scrollIntoView({ block: "center", behavior: smooth ? "smooth" : "auto" });
  row.focus({ preventScroll: true });
}

type HeaderProps = {
  address: string;
  hours: WindowHours;
  busy: boolean;
  onRefresh: () => void;
  payload: ReportPayload | null;
  fresh: boolean;
  errorCode: ApiError["code"] | null;
};

function ReportHeader({ address, hours, busy, onRefresh, payload, fresh, errorCode }: HeaderProps) {
  const sentence = payload
    ? verdictSentence(payload.report)
    : busy
      ? "Building a fresh report from real Arc receipts."
      : errorCode === "NOT_A_CONTRACT"
        ? "This address holds no contract code on Arc mainnet."
        : "No report to show for this window.";
  return (
    <header className={styles.header}>
      <p className={styles.verdict}>{sentence}</p>
      <div className={styles.ident}>
        <h1 className={styles.address}>
          <span className="visually-hidden">Report for </span>
          <ScrambleText value={address} active={fresh} />
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
        <Button variant="secondary" onClick={onRefresh} disabled={busy}>
          {busy ? "Scanning…" : "Refresh"}
        </Button>
        {payload && (
          <p className={ui.label}>
            Saved <time dateTime={payload.createdAt}>{utcStamp(payload.createdAt, 16)}</time>
          </p>
        )}
      </div>
    </header>
  );
}

export function ReportClient({ address, hours, initial, attestationInfo, examples }: Props) {
  const [view, setView] = useState<View>(
    initial ? { kind: "report", payload: initial, fresh: false, stampFresh: false } : { kind: "streaming", stages: [], startedAt: null },
  );
  // Bumped by Refresh and Retry to open a new stream.
  const [attempt, setAttempt] = useState(0);
  const [highlight, setHighlight] = useState<string | null>(null);
  const isStreaming = view.kind === "streaming";
  const hasReport = view.kind === "report";

  useEffect(() => {
    if (!isStreaming) return;
    const source = new EventSource(`/api/report/${address}/stream?hours=${hours}`);
    const openedAt = Date.now();
    // Each stage is timed from the event before it: the server reports a stage after working on it.
    let lastEventAt = openedAt;
    // EventSource reconnects on its own after an error; every terminal state closes it explicitly.
    const finish = (next: View) => {
      source.close();
      setView(next);
    };
    source.addEventListener("progress", (event) => {
      const data = parseData(event as MessageEvent<string>);
      if (!isProgress(data)) return;
      const now = Date.now();
      const since = lastEventAt;
      lastEventAt = now;
      setView((v) =>
        v.kind === "streaming" ? { kind: "streaming", stages: advanceStages(v.stages, data, now, since), startedAt: v.startedAt ?? openedAt } : v,
      );
    });
    source.addEventListener("done", (event) => {
      const payload = parsePayload(parseData(event as MessageEvent<string>));
      finish(payload ? { kind: "report", payload, fresh: true, stampFresh: false } : { kind: "error", error: BAD_DATA, at: Date.now() });
    });
    source.addEventListener("error", (event) => {
      // A server "error" event carries data; a bare Event means the connection itself failed.
      const data = event instanceof MessageEvent ? parseData(event as MessageEvent<string>) : null;
      finish({ kind: "error", error: isApiError(data) ? data : CONNECTION_LOST, at: Date.now() });
    });
    return () => source.close();
  }, [address, hours, attempt, isStreaming]);

  // Deep links: "#fn-…" on load or a later hash change scrolls to and marks that row once the table exists.
  useEffect(() => {
    if (!hasReport) return;
    function follow() {
      const anchor = hashAnchor();
      if (!anchor) return;
      // Wait a frame so the table row is in the DOM after the report view renders.
      requestAnimationFrame(() => {
        setHighlight(anchor);
        revealRow(anchor, false);
      });
    }
    follow();
    window.addEventListener("hashchange", follow);
    return () => window.removeEventListener("hashchange", follow);
  }, [hasReport]);

  function restart() {
    setView({ kind: "streaming", stages: [], startedAt: null });
    setAttempt((n) => n + 1);
  }

  function onAttested(record: AttestationRecord) {
    setView((v) => (v.kind === "report" ? { ...v, fresh: false, stampFresh: true, payload: { ...v.payload, attestation: record } } : v));
  }

  function activateRow(anchor: string) {
    setHighlight(anchor);
    // replaceState keeps Back meaningful and makes the address bar a shareable link to this row.
    window.history.replaceState(null, "", `#${anchor}`);
    revealRow(anchor, !window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }

  const payload = view.kind === "report" ? view.payload : null;
  const header = (
    <ReportHeader
      address={address}
      hours={hours}
      busy={isStreaming}
      onRefresh={restart}
      payload={payload}
      fresh={view.kind === "report" && view.fresh}
      errorCode={view.kind === "error" ? view.error.code : null}
    />
  );

  if (view.kind === "streaming") {
    return (
      <div className={styles.page}>
        {header}
        <div className={styles.body}>
          <div className={styles.main}>
            <CostChartSkeleton />
          </div>
          <div className={styles.side}>
            <ReportProgress stages={view.stages} hours={hours} startedAt={view.startedAt} />
          </div>
        </div>
      </div>
    );
  }

  if (view.kind === "error") {
    return (
      <div className={styles.page}>
        {header}
        <ReportError
          error={view.error}
          at={view.at}
          hours={hours}
          examples={examples}
          onRetry={restart}
          onBack={initial ? () => setView({ kind: "report", payload: initial, fresh: false, stampFresh: false }) : null}
        />
      </div>
    );
  }

  const { fresh, stampFresh } = view;
  const report = view.payload.report;
  return (
    <div className={styles.page}>
      {header}
      <KpiStrip report={report} fresh={fresh} />
      <div className={styles.body}>
        <div className={styles.main}>
          <CostChart report={report} animate={fresh} activeAnchor={highlight} onActivate={activateRow} />
          <CostTable report={report} shouldPrint={fresh} highlight={highlight} />
          <section className={ui.panel} aria-labelledby="proof-title">
            <div className={ui.panelHead}>
              <h2 id="proof-title" className={ui.figHeading}>
                <span className={ui.figNo}>05</span> Share and prove
              </h2>
            </div>
            <Tabs
              label="Share and prove"
              items={[
                { key: "badge", label: "Badge", content: <BadgePanel address={address} hours={hours} /> },
                {
                  key: "attest",
                  label: "Attest",
                  content: (
                    <AttestPanel
                      key={view.payload.reportHash}
                      address={address}
                      hours={hours}
                      info={attestationInfo}
                      existing={view.payload.attestation}
                      onAttested={onAttested}
                    />
                  ),
                },
                {
                  key: "verify",
                  label: "Verify",
                  content: <VerifyPanel key={`v-${view.payload.reportHash}`} report={report} reportHash={view.payload.reportHash} info={attestationInfo} />,
                },
              ]}
            />
          </section>
        </div>
        <div className={styles.side}>
          <Receipt payload={view.payload} shouldPrint={fresh} stampFresh={stampFresh} />
        </div>
      </div>
      <p className="visually-hidden" role="status">
        {stampFresh && view.payload.attestation ? `Attested on Arc in block ${view.payload.attestation.blockNumber}. The receipt is stamped.` : ""}
      </p>
    </div>
  );
}
