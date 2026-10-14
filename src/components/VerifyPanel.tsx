"use client";

import { useState } from "react";
import { createPublicClient, http, type Hex } from "viem";
import { arc } from "viem/chains";
import type { AttestationInfo } from "@/lib/api";
import { canonicalHash } from "@/lib/canonical";
import { formatInt, formatMicroUsd, shortHex } from "@/lib/format";
import type { Report } from "@/lib/report";
import { FLAG_LIVE, FLAG_SOURCE_VERIFIED, registryAbi } from "@/lib/registry";
import { Button } from "./Button";
import p from "./panels.module.css";
import { utcStamp } from "./receiptNotes";
import ui from "./ui.module.css";

const ZERO_HASH = `0x${"0".repeat(64)}`;
const RPC_TIMEOUT_MS = 15_000;

type Props = {
  report: Report;
  reportHash: Hex;
  info: AttestationInfo | null;
};

type Recompute = { kind: "idle" } | { kind: "done"; hash: Hex } | { kind: "error" };

interface OnChain {
  reportHash: Hex;
  medianCostMicroUsd: bigint;
  windowEndBlock: bigint;
  timestamp: number;
  flags: number;
}

type ChainState = { kind: "idle" } | { kind: "loading" } | { kind: "error"; message: string } | { kind: "none" } | { kind: "done"; record: OnChain };

function decodeFlags(flags: number): string {
  const verified = (flags & FLAG_SOURCE_VERIFIED) !== 0 ? "✓ source verified" : "✕ source not verified";
  const live = (flags & FLAG_LIVE) !== 0 ? "✓ live" : "✕ not live";
  return `${verified} · ${live}`;
}

function Match({ ok, yes, no }: { ok: boolean; yes: string; no: string }) {
  return (
    <p className={`${p.result} ${ok ? ui.pass : ui.fail}`}>
      <span aria-hidden="true">{ok ? "✓" : "✕"}</span> {ok ? yes : no}
    </p>
  );
}

export function VerifyPanel({ report, reportHash, info }: Props) {
  const [recompute, setRecompute] = useState<Recompute>({ kind: "idle" });
  const [chain, setChain] = useState<ChainState>({ kind: "idle" });

  function recomputeHash(): Hex | null {
    try {
      const hash = canonicalHash(report);
      setRecompute({ kind: "done", hash });
      return hash;
    } catch {
      setRecompute({ kind: "error" });
      return null;
    }
  }

  async function verifyOnArc() {
    if (!info) return;
    recomputeHash();
    setChain({ kind: "loading" });
    try {
      const client = createPublicClient({ chain: arc, transport: http(undefined, { timeout: RPC_TIMEOUT_MS }) });
      const [onChainHash, medianCostMicroUsd, windowEndBlock, timestamp, flags] = await client.readContract({
        address: info.registry,
        abi: registryAbi,
        functionName: "latest",
        args: [report.target as Hex, info.attester],
      });
      if (onChainHash === ZERO_HASH) {
        setChain({ kind: "none" });
        return;
      }
      setChain({ kind: "done", record: { reportHash: onChainHash, medianCostMicroUsd, windowEndBlock, timestamp, flags } });
    } catch {
      setChain({ kind: "error", message: "Could not read the registry from Arc. The public RPC may be busy; try again." });
    }
  }

  const recomputed = recompute.kind === "done" ? recompute.hash : null;

  return (
    <div className={p.panel}>
      <p className={p.lead}>
        The report hash is keccak256 of the canonical report JSON. Recompute it here, in your browser, and compare it with the hash recorded on Arc.
      </p>
      <dl className={p.facts}>
        <div>
          <dt>Stored hash</dt>
          <dd className={p.hash}>{reportHash}</dd>
        </div>
      </dl>
      <div className={p.row}>
        <Button variant="secondary" onClick={recomputeHash}>
          Recompute hash
        </Button>
        {info && (
          <Button variant="secondary" onClick={verifyOnArc} disabled={chain.kind === "loading"}>
            {chain.kind === "loading" ? "Reading Arc…" : "Verify on Arc"}
          </Button>
        )}
      </div>
      {!info && <p className={ui.caption}>On-chain verification is unavailable: no registry is configured on this server.</p>}

      <div aria-live="polite" className={p.panel}>
        {recompute.kind === "error" && <Match ok={false} yes="" no="The report JSON could not be hashed." />}
        {recomputed && (
          <>
            <p className={p.hash}>Recomputed {recomputed}</p>
            <Match ok={recomputed === reportHash} yes="Matches the stored report hash" no={`Does not match the stored hash ${shortHex(reportHash, 10, 8)}`} />
          </>
        )}
        {chain.kind === "error" && (
          <p className={`${p.result} ${ui.fail}`}>
            <span aria-hidden="true">✕</span> {chain.message}
          </p>
        )}
        {chain.kind === "none" && (
          <p className={`${p.result} ${ui.unknown}`}>
            <span aria-hidden="true">?</span> Not attested: the registry holds no attestation for this contract from the Centscan attester.
          </p>
        )}
        {chain.kind === "done" && (
          <>
            <p className={p.hash}>On Arc {chain.record.reportHash}</p>
            <Match
              ok={recomputed !== null && chain.record.reportHash === recomputed}
              yes="On-chain hash matches this report"
              no="On-chain hash differs: the latest attestation covers a different report or window"
            />
            <dl className={p.facts}>
              <div>
                <dt>Window end block</dt>
                <dd>{formatInt(chain.record.windowEndBlock.toString())}</dd>
              </div>
              <div>
                <dt>Median cost</dt>
                <dd>{formatMicroUsd(chain.record.medianCostMicroUsd)}</dd>
              </div>
              <div>
                <dt>Flags</dt>
                <dd>{decodeFlags(chain.record.flags)}</dd>
              </div>
              <div>
                <dt>Attested</dt>
                <dd>{utcStamp(new Date(chain.record.timestamp * 1000).toISOString())}</dd>
              </div>
            </dl>
          </>
        )}
      </div>

      <details className={p.details}>
        <summary>Report JSON</summary>
        <pre>{JSON.stringify(report, null, 2)}</pre>
      </details>
    </div>
  );
}
