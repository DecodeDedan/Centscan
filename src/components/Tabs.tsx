"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { duration, easeOut, indicatorSpring } from "./motion";
import styles from "./Tabs.module.css";

export type TabItem = { key: string; label: string; content: ReactNode };

type Props = { label: string; items: readonly TabItem[] };

/** WAI-ARIA tabs with automatic activation. Inactive panels stay mounted (hidden) so in-flight work keeps its state. */
export function Tabs({ label, items }: Props) {
  const base = useId();
  const [active, setActive] = useState(0);
  const reduceMotion = useReducedMotion();
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  function select(index: number) {
    const count = items.length;
    const next = ((index % count) + count) % count;
    setActive(next);
    tabRefs.current[next]?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const moves: Record<string, number> = { ArrowRight: active + 1, ArrowLeft: active - 1, Home: 0, End: items.length - 1 };
    const target = moves[event.key];
    if (target === undefined) return;
    event.preventDefault();
    select(target);
  }

  return (
    <div className={styles.tabs}>
      <div role="tablist" aria-label={label} className={styles.list} onKeyDown={onKeyDown}>
        {items.map((item, i) => {
          const selected = i === active;
          return (
            <button
              key={item.key}
              ref={(el) => {
                tabRefs.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`${base}-tab-${item.key}`}
              aria-selected={selected}
              aria-controls={`${base}-panel-${item.key}`}
              tabIndex={selected ? 0 : -1}
              className={selected ? `${styles.tab} ${styles.selected}` : styles.tab}
              onClick={() => setActive(i)}
            >
              {item.label}
              {selected && <motion.span layoutId={`${base}-indicator`} className={styles.indicator} transition={indicatorSpring} aria-hidden="true" />}
            </button>
          );
        })}
      </div>
      {items.map((item, i) => {
        const shown = i === active;
        return (
          // The first panel renders at rest (no server-side hidden state); later switches slide the panel in, transform only.
          <motion.div
            key={item.key}
            role="tabpanel"
            id={`${base}-panel-${item.key}`}
            aria-labelledby={`${base}-tab-${item.key}`}
            hidden={!shown}
            tabIndex={0}
            className={styles.panel}
            initial={false}
            animate={{ x: shown || reduceMotion ? 0 : 12 }}
            transition={{ duration: duration.base, ease: easeOut }}
          >
            {item.content}
          </motion.div>
        );
      })}
    </div>
  );
}
