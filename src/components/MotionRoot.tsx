"use client";

import { MotionConfig } from "framer-motion";
import type { ReactNode } from "react";
import { houseSpring } from "./motion";

/** Every Framer animation in the app honours prefers-reduced-motion and inherits the house spring. */
export function MotionRoot({ children }: { children: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user" transition={houseSpring}>
      {children}
    </MotionConfig>
  );
}
