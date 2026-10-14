"use client";

import { motion, useMotionValue, useReducedMotion, useSpring } from "framer-motion";
import Link from "next/link";
import type { PointerEvent, ReactNode } from "react";
import s from "./PressLink.module.css";

const MotionLink = motion.create(Link);
/** Short, stiff springs: hover and press feedback settle inside about 200 ms. */
const PRESS_SPRING = { type: "spring", stiffness: 600, damping: 34 } as const;
const MAGNET_SPRING = { stiffness: 620, damping: 36 } as const;
/** How far the button leans towards the pointer, as a share of the pointer's offset from its centre. */
const MAGNET_PULL = 0.22;

type Props = {
  href: string;
  variant: "primary" | "quiet";
  /** Primary calls to action lean towards a fine pointer. Never on touch or under reduced motion. */
  isMagnetic?: boolean;
  children: ReactNode;
};

/** A link styled as a button, with springs on hover and press; still under reduced motion. */
export function PressLink({ href, variant, isMagnetic = false, children }: Props) {
  const isReduced = useReducedMotion();
  const x = useSpring(useMotionValue(0), MAGNET_SPRING);
  const y = useSpring(useMotionValue(0), MAGNET_SPRING);
  const isActive = isMagnetic && !isReduced;

  function handlePointerMove(event: PointerEvent<HTMLAnchorElement>) {
    if (!isActive || event.pointerType !== "mouse") return;
    const rect = event.currentTarget.getBoundingClientRect();
    x.set((event.clientX - rect.left - rect.width / 2) * MAGNET_PULL);
    y.set((event.clientY - rect.top - rect.height / 2) * MAGNET_PULL);
  }

  function handlePointerLeave() {
    x.set(0);
    y.set(0);
  }

  return (
    <MotionLink
      href={href}
      className={variant === "primary" ? s.primary : s.quiet}
      style={isActive ? { x, y } : undefined}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      whileHover={isReduced ? undefined : { scale: 1.03 }}
      whileTap={isReduced ? undefined : { scale: 0.96 }}
      transition={PRESS_SPRING}
    >
      {children}
    </MotionLink>
  );
}
