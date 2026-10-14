"use client";

import { motion, useReducedMotion } from "framer-motion";
import { PRINT_STAGGER_S, revealSpring } from "./motion";
import styles from "./NumberReveal.module.css";

type Props = {
  value: string;
  /** True only for a report that just finished in this browser; server-rendered numbers never animate. */
  animate: boolean;
  /** Seconds before the first character rolls in. */
  delay?: number;
};

/** Rolls each character up into place like a till display. Transform only: every character is clipped, never transparent. */
export function NumberReveal({ value, animate, delay = 0 }: Props) {
  const reduceMotion = useReducedMotion();
  if (!animate || reduceMotion) return <>{value}</>;
  return (
    <span className={styles.reveal}>
      <span className="visually-hidden">{value}</span>
      <span aria-hidden="true">
        {Array.from(value).map((char, i) => (
          <span key={i} className={styles.cell}>
            <motion.span className={styles.char} initial={{ y: "110%" }} animate={{ y: "0%" }} transition={{ ...revealSpring, delay: delay + i * PRINT_STAGGER_S }}>
              {char}
            </motion.span>
          </span>
        ))}
      </span>
    </span>
  );
}
