"use client";

import { animate, motion, useMotionValue, useReducedMotion, useTransform } from "framer-motion";
import { useEffect } from "react";
import { countSpring } from "./motion";

type Props = {
  value: number;
  format: (value: number) => string;
  /** True only for a report that just finished in this browser; stored reports render their final value at rest. */
  animate: boolean;
  /** Seconds before the count starts. */
  delay?: number;
};

/** Counts from zero to the real value on an overdamped spring, written straight to the DOM; readers hear only the final value. */
export function CountUp({ value, format, animate: shouldAnimate, delay = 0 }: Props) {
  const reduceMotion = useReducedMotion();
  const counting = shouldAnimate && !reduceMotion;
  const shown = useMotionValue(counting ? 0 : value);
  const text = useTransform(shown, (v) => format(v));

  useEffect(() => {
    if (!counting) {
      shown.set(value);
      return;
    }
    const controls = animate(shown, value, { ...countSpring, delay });
    return () => controls.stop();
  }, [counting, value, delay, shown]);

  if (!counting) return <>{format(value)}</>;
  return (
    <span>
      <span className="visually-hidden">{format(value)}</span>
      <motion.span aria-hidden="true">{text}</motion.span>
    </span>
  );
}
