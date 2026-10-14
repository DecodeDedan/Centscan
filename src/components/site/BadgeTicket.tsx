"use client";

import { motion, useMotionValue, useReducedMotion, useSpring } from "framer-motion";
import type { PointerEvent } from "react";
import { shortHex } from "@/lib/format";
import s from "./Sections.module.css";

/** Maximum lean of the ticket towards a fine pointer, in degrees. */
const MAX_TILT_DEG = 7;
const TILT_SPRING = { stiffness: 260, damping: 26 } as const;

type Props = { target: string; imageUrl: string; windowLabel: string; median: string | null };

/** The live badge printed on a ticket stub that leans towards a fine pointer; still on touch and under reduced motion. */
export function BadgeTicket({ target, imageUrl, windowLabel, median }: Props) {
  const isReduced = useReducedMotion();
  const rotateX = useSpring(useMotionValue(0), TILT_SPRING);
  const rotateY = useSpring(useMotionValue(0), TILT_SPRING);

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    if (isReduced || event.pointerType !== "mouse") return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - 0.5;
    const y = (event.clientY - rect.top) / rect.height - 0.5;
    rotateY.set(x * MAX_TILT_DEG * 2);
    rotateX.set(-y * MAX_TILT_DEG * 2);
  }

  function handlePointerLeave() {
    rotateX.set(0);
    rotateY.set(0);
  }

  return (
    <div className={s.ticketStage} onPointerMove={handlePointerMove} onPointerLeave={handlePointerLeave}>
      <motion.div className={s.ticket} style={isReduced ? undefined : { rotateX, rotateY }}>
        <div className={s.ticketMain}>
          <p className={s.eyebrow}>Admit one README</p>
          <div className={s.ticketBadge}>
            {/* eslint-disable-next-line @next/next/no-img-element -- the badge is a dynamic SVG route; next/image cannot optimise it */}
            <img src={imageUrl} alt={`Centscan badge for ${target}`} height={20} />
          </div>
          <p className={s.ticketTarget}>
            <code>{shortHex(target)}</code>
          </p>
        </div>
        <div className={s.ticketStub} aria-hidden="true">
          <span>{windowLabel}</span>
          <span>{median ?? "—"}</span>
        </div>
      </motion.div>
    </div>
  );
}
