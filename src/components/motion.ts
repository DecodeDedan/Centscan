import type { Transition } from "framer-motion";

/** Framer Motion values mirroring the --duration-* and --ease-* tokens in src/styles/tokens.css (seconds). */
export const duration = { instant: 0.12, fast: 0.2, base: 0.32 } as const;
export const easeOut = [0.22, 1, 0.36, 1] as const;

/** One printed line every 40 ms: the till rhythm from DESIGN.md. */
export const PRINT_STAGGER_S = 0.04;

/** Short spring for presses: settles inside the 200 ms feedback budget. */
export const pressSpring: Transition = { type: "spring", stiffness: 600, damping: 35, mass: 0.6 };
/** The rubber stamp: overshoots a little, like a hand pressing down. */
export const stampSpring: Transition = { type: "spring", stiffness: 500, damping: 30, mass: 0.8 };
/** Digits rolling into a till display. */
export const revealSpring: Transition = { type: "spring", stiffness: 420, damping: 32 };
/** Primary buttons lean toward the pointer, then settle back. */
export const magnetSpring = { stiffness: 350, damping: 22, mass: 0.5 } as const;
/** How far, in px, a magnetic button travels at the edge of its own box. */
export const MAGNET_PX = 6;

/** Layout indicators (tabs, segmented control). */
export const indicatorSpring: Transition = { type: "spring", stiffness: 500, damping: 40 };

export const printLine = (index: number): Transition => ({ duration: duration.fast, ease: easeOut, delay: index * PRINT_STAGGER_S });
