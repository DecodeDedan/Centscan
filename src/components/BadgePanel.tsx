"use client";

import { useSyncExternalStore } from "react";
import { CopyButton } from "./CopyButton";
import p from "./panels.module.css";
import ui from "./ui.module.css";
import { windowLabel } from "./verdicts";

const noopSubscribe = () => () => {};

function Snippet({ label, value }: { label: string; value: string }) {
  return (
    <div className={p.snippetBlock}>
      <div className={p.snippetHead}>
        <span>{label}</span>
        <CopyButton value={value} label={`Copy ${label}`} />
      </div>
      <code className={p.snippet}>{value}</code>
    </div>
  );
}

export function BadgePanel({ address, hours }: { address: string; hours: number }) {
  // The snippets need this deployment's origin, which only the browser knows.
  const origin = useSyncExternalStore(
    noopSubscribe,
    () => window.location.origin,
    () => null,
  );

  if (origin === null) {
    return <p className={ui.caption}>Preparing badge snippets…</p>;
  }

  const badge = `${origin}/badge/${address}.svg`;
  const report = `${origin}/c/${address}`;
  return (
    <div className={p.panel}>
      <p className={p.lead}>Put the live verdict in your README. The badge updates whenever the report is refreshed.</p>
      <div className={p.preview}>
        {/* The preview asks for this report's window, so it matches the receipt beside it; the README snippet shows the newest of any window. */}
        {/* eslint-disable-next-line @next/next/no-img-element -- the badge is a dynamic SVG route; next/image cannot optimise it */}
        <img src={`${badge}?hours=${hours}`} alt={`Centscan badge for this contract, last ${windowLabel(hours)}`} height={20} />
        <span className={ui.caption}>Live preview · last {windowLabel(hours)}</span>
      </div>
      <Snippet label="Markdown" value={`[![Centscan](${badge})](${report})`} />
      <Snippet label="HTML" value={`<a href="${report}"><img src="${badge}" alt="Centscan"></a>`} />
    </div>
  );
}
