import { PressLink } from "./PressLink";
import { Till } from "./Till";
import type { TillReceipt } from "./tillReceipt";
import s from "./Hero.module.css";

const FACTS: ReadonlyArray<{ term: string; value: string }> = [
  { term: "Chain", value: "Arc mainnet, 5042" },
  { term: "Block time", value: "~0.51 s" },
  { term: "Fee token", value: "USDC, 18 decimals" },
  { term: "Plain transfer", value: "0.042¢" },
];

/** The H1 is the LCP element: plain HTML, rendered in place and never animated. Only the till moves. */
export function Hero({ receipt }: { receipt: TillReceipt }) {
  return (
    <section className={s.hero} aria-labelledby="hero-title" data-till-pin>
      <div className={s.grid}>
        <div className={s.copy}>
          <p className={s.tagline}>Every Arc contract, priced to the cent.</p>
          <h1 id="hero-title" className={s.title}>
            On Arc, gas is a&nbsp;price.
          </h1>
          <p className={s.lede}>
            Centscan reads real transaction receipts and tells you what each function of a contract costs to call, in cents.
          </p>
          <div className={s.actions}>
            <PressLink href="/app" variant="primary" isMagnetic>
              Launch app
            </PressLink>
            <PressLink href="#method" variant="quiet">
              Read the method
            </PressLink>
          </div>
          <dl className={s.facts}>
            {FACTS.map((fact) => (
              <div key={fact.term}>
                <dt>{fact.term}</dt>
                <dd>{fact.value}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className={s.tillCol}>
          <Till receipt={receipt} />
        </div>
      </div>
    </section>
  );
}
