import Link from "next/link";
import { explorerAddress, formatInt, shortHex } from "@/lib/format";
import { CopySnippet } from "./CopySnippet";
import { CountUp } from "./CountUp";
import { DrawOnScroll } from "./DrawOnScroll";
import { EXAMPLE, exampleCostLabel } from "./tillReceipt";
import s from "./Sections.module.css";

const EXAMPLE_GAS = Number(EXAMPLE.gasUsed);
const EXAMPLE_CENTS = exampleCostLabel();

export function Formula() {
  return (
    <section className={s.ink} aria-labelledby="formula-title">
      <DrawOnScroll className={s.wrap}>
        <div className={s.inkHead} data-draw-group>
          <p className={s.inkFig} data-caption>
            Fig. 4
          </p>
          <h2 id="formula-title" className={s.inkTitle}>
            One receipt, priced
          </h2>
          <p className={s.inkCaption}>
            A live Arc mainnet receipt, measured on 13 October 2026. <code>cost = gasUsed × effectiveGasPrice</code>, and{" "}
            <code>cents = wei ÷ 10^16</code>.
          </p>
        </div>
        <dl className={s.sum} data-draw-group>
          <div className={s.sumRow}>
            <dt>gasUsed</dt>
            <dd>
              <span className={s.op} aria-hidden="true" />
              <CountUp to={EXAMPLE_GAS} decimals={0}>
                {formatInt(EXAMPLE.gasUsed.toString())}
              </CountUp>
            </dd>
          </div>
          <div className={s.sumRow}>
            <dt>effectiveGasPrice, gwei</dt>
            <dd>
              <span className={s.op} aria-hidden="true">
                ×
              </span>
              {EXAMPLE.gasPriceLabel.replace(" gwei", "")}
            </dd>
          </div>
          <span className={s.sumRule} data-draw aria-hidden="true" />
          <div className={`${s.sumRow} ${s.sumTotal}`}>
            <dt>Cost of the call, in cents of USDC</dt>
            <dd>
              <span className={s.op} aria-hidden="true">
                =
              </span>
              <CountUp to={Number.parseFloat(EXAMPLE_CENTS)} decimals={3} suffix="¢">
                {EXAMPLE_CENTS}
              </CountUp>
            </dd>
          </div>
        </dl>
      </DrawOnScroll>
    </section>
  );
}

export function WhyArc() {
  return (
    <section className={s.section} aria-labelledby="why-title">
      <div className={`${s.wrap} ${s.whyGrid}`}>
        <h2 id="why-title" className={s.heading}>
          Why this only works on Arc
        </h2>
        <div className={s.compare}>
          <div className={s.compareOther}>
            <h3 className={s.compareTitle}>On a chain with a volatile gas token</h3>
            <p className={s.equation}>
              gasUsed × <span className={s.moving}>gasPrice</span> × <span className={s.moving}>ETH/USD</span>
            </p>
            <p>Two of the three factors move on their own, so any cost-per-call figure is stale within hours.</p>
          </div>
          <div className={s.compareArc}>
            <h3 className={s.compareTitle}>On Arc</h3>
            <p className={s.equation}>gasUsed × effectiveGasPrice ÷ 10^18</p>
            <p>
              Fees are paid in USDC with 18 decimals, so a fee is already a dollar amount. The base fee sits at its 20 gwei floor, so a plain
              21,000-gas transfer costs
            </p>
            <p className={s.bigCents}>0.042¢</p>
            <p className={s.compareNote}>and that number still means the same thing next week.</p>
          </div>
        </div>
      </div>
    </section>
  );
}

type ProofProps = {
  registry: string | null;
  newest: { target: string; reportHash: string } | null;
};

const PROOF_STEPS = [
  {
    title: "Read the registry",
    body: "Call latest(target, attester) on CentscanRegistry. Attestations are keyed by target and attester, so a third party can attest too without overwriting the official record.",
  },
  {
    title: "Recompute the hash",
    body: "Fetch the report JSON, sort its keys, drop the whitespace and take keccak256. The report page runs the same function in your browser.",
  },
  {
    title: "Compare, then spot-check",
    body: "If the hashes match, the numbers are exactly those attested at the window's end block. Every row links a sample transaction, so any cost can be recomputed from its receipt.",
  },
] as const;

export function Proof({ registry, newest }: ProofProps) {
  return (
    <section id="proof" className={s.section} aria-labelledby="proof-title">
      <div className={`${s.wrap} ${s.proofGrid}`}>
        <div className={s.sectionHead}>
          <h2 id="proof-title" className={s.heading}>
            Check a number without trusting us
          </h2>
          <p className={s.lede}>
            A shared receipt is only useful if a reader can confirm it is the one that was measured. Three steps, none of which go through
            Centscan&rsquo;s server.
          </p>
        </div>
        <ol className={s.steps}>
          {PROOF_STEPS.map((step) => (
            <li key={step.title}>
              <h3 className={s.stepTitle}>{step.title}</h3>
              <p>{step.body}</p>
            </li>
          ))}
        </ol>
        <aside className={s.contract} aria-labelledby="contract-title">
          <h3 id="contract-title" className={s.contractTitle}>
            CentscanRegistry
          </h3>
          <pre className={s.signature}>
            <code>{"attest(target, reportHash,\n  medianCostMicroUsd,\n  windowEndBlock, flags)"}</code>
          </pre>
          <ul className={s.contractFacts}>
            <li>Append-only: no owner, no upgrade path, holds no funds.</li>
            <li>
              <code>StaleWindow</code> rejects a report whose window is not newer than the attester&rsquo;s last one, so an old,
              flattering report cannot be replayed.
            </li>
          </ul>
          {registry && (
            <p className={s.contractAddress}>
              Deployed at{" "}
              <a href={explorerAddress(registry)} target="_blank" rel="noopener noreferrer">
                {shortHex(registry)}
                <span className="visually-hidden"> on the Arc explorer (opens in a new tab)</span>
              </a>
            </p>
          )}
          {newest && (
            <p className={s.contractAddress}>
              Newest report hash <code>{shortHex(newest.reportHash, 10, 6)}</code>.{" "}
              <Link href={`/c/${newest.target}`}>Recompute it on the report page</Link>
            </p>
          )}
        </aside>
      </div>
    </section>
  );
}

type BadgeProps = { badge: { target: string; imageUrl: string; markdown: string } | null };

export function Badge({ badge }: BadgeProps) {
  return (
    <section id="badge" className={s.section} aria-labelledby="badge-title">
      <div className={`${s.wrap} ${s.badgeGrid}`}>
        <div className={s.badgeHead}>
          <h2 id="badge-title" className={s.heading}>
            A badge for your README
          </h2>
          <p className={s.lede}>
            The badge is an SVG drawn from the newest cached report for a contract: its source and activity verdicts and the median cost per call. It links
            to the full receipt, so a reviewer can check the number behind it.
          </p>
        </div>
        {badge ? (
          <div className={s.badgeLive}>
            <p className={s.badgeLabel}>
              Live badge for <code>{shortHex(badge.target)}</code>
            </p>
            <div className={s.badgeImage}>
              {/* eslint-disable-next-line @next/next/no-img-element -- the badge is a dynamic SVG route; next/image cannot optimise it */}
              <img src={badge.imageUrl} alt={`Centscan badge for ${badge.target}`} height={20} />
            </div>
            <CopySnippet value={badge.markdown} />
          </div>
        ) : (
          <div className={s.badgeLive}>
            <p>
              No contract has been scanned on this server yet, so there is no badge to show. <Link href="/app">Scan a contract</Link> and
              its badge appears here.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
