"use client";

import { useEffect, useRef, useState } from "react";
import { scrambleDigits } from "./chainStatus";

const DECODE_MS = 650;

/**
 * A live readout. The first real value decodes into place once; later values replace it directly.
 * Under reduced motion it never scrambles. The decoded value is the true one: the scramble only runs toward it.
 */
export function Decode({ value, placeholder = "—" }: { value: string | null; placeholder?: string }) {
  const [scrambled, setScrambled] = useState<string | null>(null);
  const hasDecoded = useRef(false);

  useEffect(() => {
    if (value === null || hasDecoded.current) return;
    hasDecoded.current = true;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const started = performance.now();
    let frame = requestAnimationFrame(function step(now) {
      const progress = (now - started) / DECODE_MS;
      if (progress >= 1) {
        setScrambled(null);
        return;
      }
      setScrambled(scrambleDigits(value, progress));
      frame = requestAnimationFrame(step);
    });
    return () => {
      cancelAnimationFrame(frame);
      setScrambled(null);
    };
  }, [value]);

  return <>{scrambled ?? value ?? placeholder}</>;
}
