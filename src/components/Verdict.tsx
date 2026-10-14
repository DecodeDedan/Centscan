import ui from "./ui.module.css";
import type { VerdictLabel } from "./verdicts";

/** A verdict as icon plus word; the tone colour only reinforces it. */
export function Verdict({ label }: { label: VerdictLabel }) {
  return (
    <span className={ui[label.tone]}>
      <span aria-hidden="true">{label.icon}</span> {label.word}
    </span>
  );
}
