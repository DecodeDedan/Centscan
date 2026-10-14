"use client";

import { useState } from "react";
import { shortHex } from "@/lib/format";
import type { Report } from "@/lib/report";
import s from "./Sections.module.css";

type Result =
  | { kind: "idle" }
  | { kind: "running" }
  | { kind: "done"; hash: string; isMatch: boolean; bytes: number; ms: number }
  | { kind: "error"; message: string };

/** Recomputes the newest report's hash in this browser with the same canonicalHash the server used. */
export function ProofDemo({ report, reportHash }: { report: Report; reportHash: string }) {
  const [result, setResult] = useState<Result>({ kind: "idle" });

  async function handleRecompute() {
    setResult({ kind: "running" });
    try {
      // Loaded on demand: keccak only ships to visitors who press the button.
      const { canonicalHash, canonicalJson } = await import("@/lib/canonical");
      const started = performance.now();
      const hash = canonicalHash(report);
      const ms = performance.now() - started;
      setResult({ kind: "done", hash, isMatch: hash === reportHash, bytes: new TextEncoder().encode(canonicalJson(report)).length, ms });
    } catch (error) {
      setResult({ kind: "error", message: error instanceof Error ? error.message : "The hash could not be computed in this browser." });
    }
  }

  return (
    <div className={s.proofDemo}>
      <p className={s.eyebrow}>Try it on the newest report</p>
      <dl className={s.hashes}>
        <div>
          <dt>Stored hash</dt>
          <dd>
            <code>{shortHex(reportHash, 14, 10)}</code>
          </dd>
        </div>
        <div>
          <dt>Recomputed here</dt>
          <dd>
            <code>
              {result.kind === "done" ? shortHex(result.hash, 14, 10) : result.kind === "running" ? "hashing…" : "not run yet"}
            </code>
          </dd>
        </div>
      </dl>
      <button type="button" className={s.action} onClick={handleRecompute} disabled={result.kind === "running"}>
        {result.kind === "running" ? "Hashing…" : "Recompute the hash"}
      </button>
      <p className={s.proofStatus} role="status" data-tone={result.kind === "done" ? (result.isMatch ? "pass" : "fail") : result.kind === "error" ? "fail" : undefined}>
        {result.kind === "done" &&
          (result.isMatch
            ? `✓ Match. keccak256 of ${result.bytes.toLocaleString("en-US")} bytes of canonical JSON, computed in ${result.ms.toFixed(1)} ms in your browser.`
            : "✕ Mismatch. The report shown here does not hash to the stored value; do not trust its numbers.")}
        {result.kind === "error" && `✕ ${result.message}`}
      </p>
    </div>
  );
}
