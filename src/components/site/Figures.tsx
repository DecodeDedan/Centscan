import type { ReactNode } from "react";
import { MethodStage } from "./MethodStage";
import s from "./Figures.module.css";

/* Diagrams are schematic plates, not data: positions show the shape of the method, the captions carry the facts. */

const BLOCK_COUNT = 16;
const BLOCK_STEP = 30;
const MATCHED_BLOCKS = new Set([2, 5, 6, 10, 13]);
const FIRST_MATCHED = 2;
const LAST_MATCHED = 13;
const blockX = (i: number) => 4 + i * BLOCK_STEP;
const blockMid = (i: number) => blockX(i) + 11;

function ReadDiagram() {
  const matched = [...MATCHED_BLOCKS].map(blockMid);
  const left = blockMid(FIRST_MATCHED);
  const right = blockMid(LAST_MATCHED);
  return (
    <svg viewBox="0 0 480 170" className={s.svg} aria-hidden="true">
      {Array.from({ length: BLOCK_COUNT }, (_, i) => (
        <g key={i}>
          <rect x={blockX(i)} y={96} width={22} height={22} className={s.ink} />
          {MATCHED_BLOCKS.has(i) && <rect x={blockX(i) + 7} y={103} width={8} height={8} className={s.accentFill} />}
        </g>
      ))}
      {matched.map((x) => (
        <line key={x} x1={x} y1={96} x2={x} y2={44} className={s.accent} />
      ))}
      <line x1={left} y1={44} x2={right} y2={44} className={s.accentBold} data-draw />
      <rect x={left - 6} y={14} width={right - left + 12} height={22} className={s.accent} />
      <line x1={0} y1={124} x2={480} y2={124} className={s.ink} data-draw />
      <line x1={4} y1={150} x2={476} y2={150} className={s.ink} data-draw />
      <line x1={4} y1={142} x2={4} y2={158} className={s.ink} />
      <line x1={476} y1={142} x2={476} y2={158} className={s.ink} />
    </svg>
  );
}

const CALL_COSTS_X = [40, 62, 75, 88, 96, 104, 110, 118, 126, 140, 158, 190, 240, 330, 420] as const;
// Nearest-rank on 15 sorted calls: the median is the 8th, p90 the 14th (ceil(0.9 × 15)).
const MEDIAN_X = CALL_COSTS_X[7];
const P90_X = CALL_COSTS_X[13];
const MIN_X = CALL_COSTS_X[0];
const MAX_X = CALL_COSTS_X[14];

function PriceDiagram() {
  return (
    <svg viewBox="0 0 480 170" className={s.svg} aria-hidden="true">
      <line x1={0} y1={110} x2={480} y2={110} className={s.ink} data-draw />
      {CALL_COSTS_X.map((x) => (
        <circle key={x} cx={x} cy={96} r={5} className={s.ink} />
      ))}
      <line x1={MEDIAN_X} y1={28} x2={MEDIAN_X} y2={122} className={s.accentBold} />
      <line x1={P90_X} y1={48} x2={P90_X} y2={122} className={s.dashed} />
      <line x1={MIN_X} y1={140} x2={MAX_X} y2={140} className={s.ink} data-draw />
      <line x1={MIN_X} y1={132} x2={MIN_X} y2={148} className={s.ink} />
      <line x1={MAX_X} y1={132} x2={MAX_X} y2={148} className={s.ink} />
    </svg>
  );
}

const CHAIN_X = [520, 572, 624, 676];
const ATTESTED_BLOCK = 2;

function AttestDiagram() {
  return (
    <svg viewBox="0 0 720 140" className={s.svg} aria-hidden="true">
      <rect x={8} y={18} width={112} height={104} className={s.ink} />
      {[38, 54, 70, 86, 102].map((y, i) => (
        <line key={y} x1={22} y1={y} x2={i % 2 ? 86 : 106} y2={y} className={s.ink} data-draw />
      ))}
      <line x1={132} y1={70} x2={262} y2={70} className={s.ink} data-draw />
      <rect x={272} y={50} width={128} height={40} className={s.accent} />
      {[288, 304, 320, 336, 352, 368].map((x) => (
        <line key={x} x1={x} y1={64} x2={x + 8} y2={64} className={s.accent} />
      ))}
      <line x1={288} y1={76} x2={384} y2={76} className={s.accent} data-draw />
      <line x1={412} y1={70} x2={508} y2={70} className={s.accentBold} data-draw />
      {CHAIN_X.map((x, i) => (
        <g key={x}>
          <rect x={x} y={52} width={36} height={36} className={i === ATTESTED_BLOCK ? s.accentBlock : s.ink} />
          {i < CHAIN_X.length - 1 && <line x1={x + 36} y1={70} x2={x + 52} y2={70} className={s.ink} />}
        </g>
      ))}
    </svg>
  );
}

function Legend({ items }: { items: ReadonlyArray<{ key: "ink" | "accent" | "dashed"; text: string }> }) {
  return (
    <ul className={s.legend}>
      {items.map((item) => (
        <li key={item.text}>
          <span className={s[`swatch-${item.key}`]} aria-hidden="true" />
          {item.text}
        </li>
      ))}
    </ul>
  );
}

type Step = {
  id: string;
  title: string;
  diagram: ReactNode;
  body: ReactNode;
  legend: ReadonlyArray<{ key: "ink" | "accent" | "dashed"; text: string }>;
};

const STEPS: readonly Step[] = [
  {
    id: "read",
    title: "Read",
    diagram: <ReadDiagram />,
    body: (
      <>
        Arc&rsquo;s public RPC has no trace API, so Centscan pages <code>eth_getLogs</code> by the contract&rsquo;s address, 10,000 blocks at a
        time. Contracts that emit no events get a scan of recent blocks instead, and the report says which path it took. Transactions and
        receipts arrive in batches of 25, at most 10 calls a second.
      </>
    ),
    legend: [
      { key: "accent", text: "Block with a log from the target, fetched in one batch" },
      { key: "ink", text: "One eth_getLogs page: up to 10,000 blocks" },
    ],
  },
  {
    id: "price",
    title: "Price",
    diagram: <PriceDiagram />,
    body: (
      <>
        Each call is priced from its own receipt, <code>gasUsed × effectiveGasPrice</code>, so tips the sender paid are included. Calls are
        grouped by 4-byte selector; each function gets its median, p90, minimum and maximum, in integer maths until display.
      </>
    ),
    legend: [
      { key: "accent", text: "Median cost per call" },
      { key: "dashed", text: "p90, nearest rank: tip spikes stay visible" },
    ],
  },
  {
    id: "attest",
    title: "Attest",
    diagram: <AttestDiagram />,
    body: (
      <>
        The report is serialised as canonical JSON and hashed with keccak256. One click writes that hash, the median cost and the
        window&rsquo;s end block to <code>CentscanRegistry</code> on Arc, where anyone can read it back.
      </>
    ),
    legend: [
      { key: "ink", text: "Report JSON, keys sorted, no whitespace" },
      { key: "accent", text: "keccak256 hash, recorded in an Arc block" },
    ],
  },
];

const stepNumber = (i: number) => String(i + 1).padStart(2, "0");

/** Method: one stage that steps Read, Price, Attest as the reader scrolls. Without JS it is three figures in a column. */
export function Figures() {
  return (
    <MethodStage id="method" className={s.section} aria-labelledby="method-title">
      <div className={s.wrap}>
        <header className={s.intro}>
          <h2 id="method-title" className={s.heading}>
            Method
          </h2>
          <p className={s.introText}>
            Three steps turn a contract address into a receipt. Each one is a standard JSON-RPC call or a public record, so you can repeat it
            without Centscan.
          </p>
          <ol className={s.index}>
            {STEPS.map((step, i) => (
              <li key={step.id} data-step-index>
                <a href={`#fig-${step.id}`}>
                  <span className={s.indexNo}>{stepNumber(i)}</span>
                  <span className={s.indexTitle}>{step.title}</span>
                </a>
              </li>
            ))}
          </ol>
        </header>

        <div className={s.plates} data-plates>
          {STEPS.map((step, i) => (
            <figure key={step.id} id={`fig-${step.id}`} className={s.figure} data-step aria-labelledby={`fig-${step.id}-title`}>
              <div className={s.plate}>
                <span className={s.plateNo} aria-hidden="true">
                  {stepNumber(i)}
                </span>
                {step.diagram}
              </div>
              <figcaption className={s.caption}>
                <div className={s.captionHead}>
                  <span className={s.figNo}>Fig. {i + 1}</span>
                  <h3 id={`fig-${step.id}-title`} className={s.figTitle}>
                    {step.title}
                  </h3>
                </div>
                <div className={s.captionBody}>
                  <p>{step.body}</p>
                  <Legend items={step.legend} />
                </div>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </MethodStage>
  );
}
