import Link from "next/link";
import type { ReportPayload } from "@/lib/api";
import { explorerAddress, shortHex } from "@/lib/format";
import { BadgeTicket } from "./BadgeTicket";
import { CopySnippet } from "./CopySnippet";
import { ProofDemo } from "./ProofDemo";
import s from "./Sections.module.css";

const PROOF_STEPS = [
  {
    title: "Read the registry",
    body: "Call latest(target, attester) on CentscanRegistry. Attestations are keyed by target and attester, so a third party can attest too without overwriting the official record.",
  },
  {
    title: "Recompute the hash",
    body: "Fetch the report JSON, sort its keys, drop the whitespace and take keccak256. The button beside this runs that exact function in your browser.",
  },
  {
    title: "Compare, then spot-check",
    body: "If the hashes match, the numbers are exactly those attested at the window's end block. Every row links a sample transaction, so any cost can be recomputed from its receipt.",
  },
] as const;

type ProofProps = { registry: string | null; newest: ReportPayload | null };

export function Proof({ registry, newest }: ProofProps) {
  return (
    <section id="proof" className={s.section} aria-labelledby="proof-title">
      <div className={`${s.wrap} ${s.proofGrid}`}>
        <div className={s.proofHead} data-reveal>
          <p className={s.eyebrow}>Proof</p>
          <h2 id="proof-title" className={s.heading}>
            Check a number without trusting us
          </h2>
          <p className={s.lede}>Three steps, none of which go through Centscan&rsquo;s server.</p>
        </div>
        <ol className={s.steps}>
          {PROOF_STEPS.map((step, i) => (
            <li key={step.title} data-reveal>
              <span className={s.stepIndex} aria-hidden="true">
                {String(i + 1).padStart(2, "0")}
              </span>
              <h3 className={s.stepTitle}>{step.title}</h3>
              <p>{step.body}</p>
            </li>
          ))}
        </ol>
        <aside className={s.contract} aria-labelledby="contract-title" data-reveal>
          <h3 id="contract-title" className={s.contractTitle}>
            CentscanRegistry
          </h3>
          <pre className={s.signature}>
            <code>{"attest(target, reportHash,\n  medianCostMicroUsd,\n  windowEndBlock, flags)"}</code>
          </pre>
          <ul className={s.contractFacts}>
            <li>Append-only: no owner, no upgrade path, holds no funds.</li>
            <li>
              <code>StaleWindow</code> rejects a report whose window is not newer than the attester&rsquo;s last one, so an old, flattering report
              cannot be replayed.
            </li>
          </ul>
          <p className={s.contractAddress}>
            {registry ? (
              <>
                Deployed on Arc at{" "}
                <a href={explorerAddress(registry)} target="_blank" rel="noopener noreferrer">
                  {shortHex(registry)}
                  <span className="visually-hidden"> on the Arc explorer (opens in a new tab)</span>
                </a>
              </>
            ) : (
              "Registry address not configured on this server, so attestation is off here; recomputing a hash still works."
            )}
          </p>
          {newest ? (
            <ProofDemo report={newest.report} reportHash={newest.reportHash} />
          ) : (
            <p className={s.contractAddress}>
              No report is cached yet. <Link href="/app">Scan a contract</Link> to get one you can recompute here.
            </p>
          )}
        </aside>
      </div>
    </section>
  );
}

type BadgeProps = {
  badge: { target: string; imageUrl: string; markdown: string; windowLabel: string; median: string | null } | null;
};

export function Badge({ badge }: BadgeProps) {
  return (
    <section id="badge" className={s.section} aria-labelledby="badge-title">
      <div className={`${s.wrap} ${s.badgeGrid}`}>
        <div className={s.badgeHead} data-reveal>
          <p className={s.eyebrow}>Badge</p>
          <h2 id="badge-title" className={s.heading}>
            Put the price in your README
          </h2>
          <p className={s.lede}>
            An SVG drawn from the newest cached report for a contract: its source and activity verdicts and the median cost per call. It links to
            the full receipt, so a reviewer can check the number behind it.
          </p>
        </div>
        {badge ? (
          <div className={s.badgeLive} data-reveal>
            <BadgeTicket target={badge.target} imageUrl={badge.imageUrl} windowLabel={badge.windowLabel} median={badge.median} />
            <CopySnippet value={badge.markdown} />
          </div>
        ) : (
          <div className={s.badgeLive} data-reveal>
            <p>
              No contract has been scanned on this server yet, so there is no badge to show. <Link href="/app">Scan a contract</Link> and its
              badge appears here.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
