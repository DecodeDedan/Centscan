"use client";

import { useSyncExternalStore } from "react";
import { CopyButton } from "./CopyButton";
import p from "./panels.module.css";
import ui from "./ui.module.css";

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

export function BadgePanel({ address }: { address: string }) {
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
        {/* eslint-disable-next-line @next/next/no-img-element -- the badge is a dynamic SVG route; next/image cannot optimise it */}
        <img src={badge} alt="Centscan badge for this contract" height={20} />
        <span className={ui.caption}>Live preview</span>
      </div>
      <Snippet label="Markdown" value={`[![Centscan](${badge})](${report})`} />
      <Snippet label="HTML" value={`<a href="${report}"><img src="${badge}" alt="Centscan"></a>`} />
    </div>
  );
}
