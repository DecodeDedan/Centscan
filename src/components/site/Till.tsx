import Link from "next/link";
import { TillStage } from "./TillStage";
import type { TillLine, TillReceipt } from "./tillReceipt";
import s from "./Till.module.css";

function LineItem({ line }: { line: TillLine }) {
  switch (line.kind) {
    case "rule":
      return <li className={s.rule} aria-hidden="true" />;
    case "row":
      return (
        <li className={s.row}>
          <span className={s.term}>{line.term}</span>
          <span className={s[`tone-${line.tone}`]}>
            {line.mark && <span aria-hidden="true">{line.mark} </span>}
            {line.value}
          </span>
        </li>
      );
    case "total":
      return (
        <li className={s.total}>
          <span>{line.term}</span>
          <span className={s.totalValue}>
            <strong>{line.value}</strong>
            {line.sub && <span className={s.totalSub}>{line.sub}</span>}
          </span>
        </li>
      );
    case "footer":
      return (
        <li className={s.footer}>
          {line.text} <Link href={line.href}>{line.linkText}</Link>
        </li>
      );
  }
}

/**
 * The hero till. The server renders the finished receipt as HTML: it is the whole till for no-JS, reduced-motion,
 * no-WebGL and weak phones, and the accessible text of the 3D till everywhere else.
 */
export function Till({ receipt }: { receipt: TillReceipt }) {
  return (
    <figure className={s.till} aria-labelledby="till-title">
      <TillStage receipt={receipt}>
        <div className={s.printer} aria-hidden="true">
          <span className={s.slit} />
        </div>
        <article className={s.paper} aria-labelledby="till-title">
          <header className={s.head}>
            {/* eslint-disable-next-line @next/next/no-img-element -- static brand SVG; next/image adds nothing for a vector mark */}
            <img src="/brand/centscan-mark.svg" alt="" width={28} height={28} />
            <div>
              <h2 id="till-title" className={s.title}>
                {receipt.title}
              </h2>
              <p className={s.caption}>{receipt.caption}</p>
            </div>
          </header>
          <ul className={s.lines}>
            {receipt.lines.map((line) => (
              <LineItem key={line.id} line={line} />
            ))}
          </ul>
          {receipt.stamp && (
            <p className={s.stamp}>
              <span className={s.stampWord}>Attested on Arc</span>
              <span className={s.stampTx}>{receipt.stamp.txShort}</span>
            </p>
          )}
        </article>
      </TillStage>
      <figcaption className={s.figcaption}>
        <span className={s.figNo}>Fig. 0</span>{" "}
        {receipt.mode === "report"
          ? "The newest receipt in Centscan’s cache, printed from real mainnet transactions."
          : "No contract has been scanned on this server yet, so the till prints the method: the worked example from the whitepaper."}
      </figcaption>
    </figure>
  );
}
