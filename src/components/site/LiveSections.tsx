"use client";

import Link from "next/link";
import { formatInt } from "@/lib/format";
import { blockAgeSeconds, chainLabels, TRANSFER_GAS } from "./chainStatus";
import { Decode } from "./Decode";
import { useChain, useClock } from "./LiveChain";
import { DOCUMENTED_RECEIPT, documentedReceiptCost } from "./observatoryData";
import s from "./Sections.module.css";

const DOCUMENTED_COST = documentedReceiptCost();

function statusWord(status: "loading" | "live" | "paused"): string {
  if (status === "live") return "● live";
  if (status === "loading") return "○ connecting";
  return "Ⅱ Live readout paused";
}

type StripProps = { verdict: string | null; reportHref: string | null };

/** Full-width telemetry strip: the chain as it is right now, beside the newest report's verdict. */
export function LiveStrip({ verdict, reportHref }: StripProps) {
  const chain = useChain();
  const now = useClock();
  const labels = chain.reading ? chainLabels(chain.reading) : null;
  const age = chain.reading && now !== null ? `${blockAgeSeconds(chain.reading.timestamp, now)} s ago` : null;

  return (
    <section className={s.strip} aria-labelledby="live-title">
      <div className={s.stripInner}>
        <div className={s.stripHead}>
          <h2 id="live-title" className={s.eyebrow}>
            Live from Arc
          </h2>
          <p className={s.stripStatus} data-status={chain.status}>
            {statusWord(chain.status)}
          </p>
        </div>
        <dl className={s.stripCells}>
          <div className={s.cell} data-reveal>
            <dt>Latest block</dt>
            <dd>
              <Decode value={labels?.block ?? null} />
            </dd>
          </div>
          <div className={s.cell} data-reveal>
            <dt>Base fee</dt>
            <dd>
              <Decode value={labels?.baseFee ?? null} />
            </dd>
          </div>
          <div className={s.cell} data-reveal>
            <dt>A plain transfer costs</dt>
            <dd className={s.cellSignal}>
              <Decode value={labels?.transfer ?? null} />
            </dd>
          </div>
          <div className={s.cell} data-reveal>
            <dt>Block produced</dt>
            <dd>{age ?? "—"}</dd>
          </div>
        </dl>
        <div className={s.verdict} data-reveal>
          <p className={s.eyebrow}>Newest report</p>
          {verdict && reportHref ? (
            <p className={s.verdictText}>
              {verdict} <Link href={reportHref}>Open the receipt</Link>
            </p>
          ) : (
            <p className={s.verdictText}>
              No report is cached on this server yet. <Link href="/app">Scan a contract</Link> and its verdict appears here.
            </p>
          )}
        </div>
        {chain.status === "paused" && (
          <p className={s.stripNote} role="status">
            {chain.reason}. The figures above are the last reading; Centscan retries every 2 s.
          </p>
        )}
      </div>
    </section>
  );
}

/** The formula, live: today's base fee priced through the same arithmetic as the documented receipt. */
export function LiveFormula() {
  const chain = useChain();
  const labels = chain.reading ? chainLabels(chain.reading) : null;

  return (
    <section id="formula" className={s.section} aria-labelledby="formula-title">
      <div className={`${s.wrap} ${s.formulaGrid}`}>
        <div className={s.formulaHead} data-reveal>
          <p className={s.eyebrow}>The formula</p>
          <h2 id="formula-title" className={s.heading}>
            gasUsed × price. That is the whole bill.
          </h2>
          <p className={s.lede}>
            Arc charges fees in USDC with 18 decimals, so wei of gas are already fractions of a dollar. Divide by 10<sup>16</sup> and you have
            cents. No token price, no conversion, nothing that drifts by next week.
          </p>
        </div>

        <figure className={s.equation} data-reveal aria-labelledby="eq-live-caption">
          <figcaption id="eq-live-caption" className={s.eqCaption}>
            <span className={s.liveDot} aria-hidden="true" /> A plain transfer, at this block&rsquo;s base fee
            {chain.status === "paused" && " (last reading; live readout paused)"}
          </figcaption>
          <p className={s.eqLine}>
            <span className={s.eqTerm}>{formatInt(TRANSFER_GAS)}</span>
            <span className={s.eqOp} aria-label="times">
              ×
            </span>
            <span className={s.eqTerm}>
              <Decode value={labels?.baseFee ?? null} />
            </span>
          </p>
          <p className={s.eqTotal}>
            <span className={s.eqOp} aria-label="equals">
              =
            </span>
            <span className={s.eqResult}>
              <Decode value={labels?.transfer ?? null} />
            </span>
          </p>
          <p className={s.eqNote}>{labels ? `Block ${labels.block}.` : "Waiting for the first reading from Arc."}</p>
        </figure>

        <figure className={`${s.equation} ${s.equationQuiet}`} data-reveal aria-labelledby="eq-doc-caption">
          <figcaption id="eq-doc-caption" className={s.eqCaption}>
            One documented receipt, measured 13 October 2026
          </figcaption>
          <p className={s.eqLine}>
            <span className={s.eqTerm}>{formatInt(DOCUMENTED_RECEIPT.gasUsed.toString())}</span>
            <span className={s.eqOp} aria-label="times">
              ×
            </span>
            <span className={s.eqTerm}>{DOCUMENTED_RECEIPT.gasPriceLabel}</span>
          </p>
          <p className={s.eqTotal}>
            <span className={s.eqOp} aria-label="equals">
              =
            </span>
            <span className={s.eqResult}>{DOCUMENTED_COST}</span>
          </p>
          <p className={s.eqNote}>
            On a chain with a volatile gas token the same call is gasUsed × gasPrice × ETH/USD, and two of those three move on their own.
          </p>
        </figure>
      </div>
    </section>
  );
}
