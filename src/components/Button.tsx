"use client";

import { motion, useMotionValue, useReducedMotion, useSpring, type HTMLMotionProps } from "framer-motion";
import type { PointerEvent } from "react";
import { MAGNET_PX, magnetSpring, pressSpring } from "./motion";
import ui from "./ui.module.css";

type Variant = "primary" | "secondary" | "ghost";

type Props = Omit<HTMLMotionProps<"button">, "className" | "style"> & {
  variant?: Variant;
  className?: string;
  /** Lean toward a mouse pointer. Reserved for the one primary action on a view. */
  magnetic?: boolean;
};

/** Native button with a short spring press. Disabled buttons do not press or lean. */
export function Button({ variant = "primary", className, type = "button", disabled, magnetic = false, onPointerMove, onPointerLeave, ...rest }: Props) {
  const reduceMotion = useReducedMotion();
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const springX = useSpring(x, magnetSpring);
  const springY = useSpring(y, magnetSpring);
  const leans = magnetic && !disabled && !reduceMotion;

  function lean(event: PointerEvent<HTMLButtonElement>) {
    onPointerMove?.(event);
    // Touch and pen have no hover, so only a mouse pulls the button.
    if (!leans || event.pointerType !== "mouse") return;
    const box = event.currentTarget.getBoundingClientRect();
    x.set(((event.clientX - box.left) / box.width - 0.5) * 2 * MAGNET_PX);
    y.set(((event.clientY - box.top) / box.height - 0.5) * 2 * MAGNET_PX);
  }

  function settle(event: PointerEvent<HTMLButtonElement>) {
    onPointerLeave?.(event);
    x.set(0);
    y.set(0);
  }

  return (
    <motion.button
      type={type}
      disabled={disabled}
      className={[ui.button, ui[variant], className].filter(Boolean).join(" ")}
      whileTap={disabled || reduceMotion ? undefined : { scale: 0.96 }}
      transition={pressSpring}
      style={magnetic ? { x: springX, y: springY } : undefined}
      onPointerMove={lean}
      onPointerLeave={settle}
      {...rest}
    />
  );
}
