"use client";

import { useState } from "react";
import type { ApiError, ApiResponse, AttestationInfo } from "@/lib/api";
import { explorerTx, formatInt, shortHex } from "@/lib/format";
import type { AttestationRecord, WindowHours } from "@/lib/report";
import { Button } from "./Button";
import p from "./panels.module.css";
import ui from "./ui.module.css";

type Props = {
  address: string;
  hours: WindowHours;
  info: AttestationInfo | null;
  existing: AttestationRecord | null;
  /** Called once Arc confirms the attestation, so the receipt can take its stamp. */
  onAttested: (record: AttestationRecord) => void;
};

type State = { kind: "idle" } | { kind: "pending" } | { kind: "error"; error: ApiError };

const ATTEST_MESSAGES: Partial<Record<ApiError["code"], string>> = {
  ATTEST_DISABLED: "Attesting is turned off on this server.",
  REPORT_TOO_OLD: "This report is more than an hour old. Refresh it, then attest the new one.",
  STALE_WINDOW: "Arc already holds an attestation for a newer window of this contract.",
  ATTESTER_UNFUNDED: "The Centscan attester wallet is out of USDC for gas. Try again later.",
  NOT_FOUND: "No stored report for this contract and window. Run a scan first.",
  RPC_UNAVAILABLE: "Arc RPC did not answer in time. Try again in a minute.",
};

function errorMessage(error: ApiError): string {
  if (error.code === "RATE_LIMITED") {
    const wait = error.retryAfterSeconds ? ` Try again in ${error.retryAfterSeconds} s.` : "";
    return `This contract was attested recently.${wait}`;
  }
  return ATTEST_MESSAGES[error.code] ?? error.message;
}

function isAttestationResponse(value: unknown): value is ApiResponse<AttestationRecord> {
  return typeof value === "object" && value !== null && "ok" in value && typeof (value as { ok: unknown }).ok === "boolean";
}

function Attested({ record }: { record: AttestationRecord }) {
  return (
    <div className={p.panel}>
      <p className={p.result}>
        <span className={ui.pass}>
          <span aria-hidden="true">✓</span> Attested on Arc
        </span>
        <span>in block {formatInt(record.blockNumber)}</span>
      </p>
      <dl className={p.facts}>
        <div>
          <dt>Transaction</dt>
          <dd>
            <a href={explorerTx(record.txHash)} target="_blank" rel="noopener noreferrer">
              {shortHex(record.txHash, 10, 8)}
              <span className="visually-hidden"> (opens in a new tab)</span>
            </a>
          </dd>
        </div>
        <div>
          <dt>Report hash</dt>
          <dd title={record.reportHash}>{shortHex(record.reportHash, 10, 8)}</dd>
        </div>
        <div>
          <dt>Attester</dt>
          <dd title={record.attester}>{shortHex(record.attester)}</dd>
        </div>
      </dl>
    </div>
  );
}

export function AttestPanel({ address, hours, info, existing, onAttested }: Props) {
  const [state, setState] = useState<State>({ kind: "idle" });

  async function attest() {
    setState({ kind: "pending" });
    try {
      const response = await fetch(`/api/attest/${address}?hours=${hours}`, { method: "POST" });
      const body: unknown = await response.json();
      if (!isAttestationResponse(body)) throw new Error("Unexpected response");
      if (body.ok) {
        setState({ kind: "idle" });
        onAttested(body.data);
      } else {
        setState({ kind: "error", error: body.error });
      }
    } catch {
      setState({ kind: "error", error: { code: "INTERNAL", message: "Could not reach the server. Check your connection and try again." } });
    }
  }

  if (info === null) {
    return <p className={p.lead}>Attestation is not configured on this server. The report and its hash are still shown above.</p>;
  }
  if (existing) return <Attested record={existing} />;

  const pending = state.kind === "pending";
  return (
    <div className={p.panel} aria-busy={pending}>
      <p className={p.lead}>
        Record this report&apos;s hash, verdicts and median cost on the Centscan registry on Arc mainnet, signed by the Centscan attester. The receipt
        takes a stamp when Arc confirms it.
      </p>
      <Button onClick={attest} disabled={!info.canAttest || pending} aria-describedby={!info.canAttest ? "attest-off" : undefined}>
        {pending ? "Attesting… waiting for Arc" : "Attest on Arc"}
      </Button>
      {!info.canAttest && (
        <p id="attest-off" className={ui.caption}>
          This server has no signing key, so it cannot attest. Anyone can still verify existing attestations in the Verify tab.
        </p>
      )}
      <div aria-live="polite">
        {state.kind === "error" && (
          <p className={`${p.result} ${ui.fail}`}>
            <span aria-hidden="true">✕</span> {errorMessage(state.error)}
          </p>
        )}
      </div>
    </div>
  );
}
