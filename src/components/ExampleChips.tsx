import Link from "next/link";
import type { ScanExample } from "./examples";
import ui from "./ui.module.css";

type Props = { examples: readonly ScanExample[]; hours: number; labelledBy: string };

/** Real example contracts as chips; each one opens a scan of that address in one click. */
export function ExampleChips({ examples, hours, labelledBy }: Props) {
  return (
    <ul className={ui.chips} role="list" aria-labelledby={labelledBy}>
      {examples.map((example) => (
        <li key={example.address}>
          <Link className={ui.chip} href={`/c/${example.address}?hours=${hours}`} prefetch={false} aria-label={`Scan ${example.label} (${example.address})`}>
            <span>{example.label}</span>
            {example.note && <span className={ui.chipNote}>{example.note}</span>}
          </Link>
        </li>
      ))}
    </ul>
  );
}
