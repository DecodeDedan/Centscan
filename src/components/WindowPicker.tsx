"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { useId } from "react";
import { WINDOW_HOURS, type WindowHours } from "@/lib/report";
import { indicatorSpring } from "./motion";
import ui from "./ui.module.css";
import { windowLabel } from "./verdicts";

function Chip({ group }: { group: string }) {
  return <motion.span layoutId={`chip-${group}`} className={ui.segmentChip} transition={indicatorSpring} aria-hidden="true" />;
}

/** Window choice inside a form: a native radio group, so arrow keys and focus behave as the platform expects. */
export function WindowRadios({ name, value, onChange }: { name: string; value: WindowHours; onChange: (hours: WindowHours) => void }) {
  const group = useId();
  return (
    <div className={ui.segmented}>
      {WINDOW_HOURS.map((h) => {
        const selected = h === value;
        return (
          <label key={h} className={selected ? `${ui.segment} ${ui.segmentSelected}` : ui.segment}>
            <input className={ui.segmentInput} type="radio" name={name} value={h} checked={selected} onChange={() => onChange(h)} />
            {selected && <Chip group={group} />}
            <span className={ui.segmentLabel}>{windowLabel(h)}</span>
          </label>
        );
      })}
    </div>
  );
}

/** Window choice on a report: each window is its own URL, so these are links with aria-current. */
export function WindowLinks({ address, value }: { address: string; value: WindowHours }) {
  const group = useId();
  return (
    <nav aria-label="Report window">
      <div className={ui.segmented}>
        {WINDOW_HOURS.map((h) => {
          const selected = h === value;
          return (
            <Link
              key={h}
              href={`/c/${address}?hours=${h}`}
              className={selected ? `${ui.segment} ${ui.segmentSelected}` : ui.segment}
              aria-current={selected ? "page" : undefined}
              aria-label={`Last ${windowLabel(h)}`}
            >
              {selected && <Chip group={group} />}
              <span className={ui.segmentLabel}>{windowLabel(h)}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
