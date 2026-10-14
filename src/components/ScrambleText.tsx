"use client";

import { useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";
import { scrambleFrame } from "./scramble";

const FRAME_MS = 40;
const DURATION_MS = 800;

/** Resolves an address from scrambled hex once (0.8 s, 40 ms frames) when `active`; readers always get the real value. */
export function ScrambleText({ value, active }: { value: string; active: boolean }) {
  const reduceMotion = useReducedMotion();
  const [shown, setShown] = useState(value);

  useEffect(() => {
    if (!active || reduceMotion) return;
    const digits = value.startsWith("0x") ? value.length - 2 : value.length;
    const frames = DURATION_MS / FRAME_MS;
    let frame = 0;
    const id = window.setInterval(() => {
      frame += 1;
      setShown(frame >= frames ? value : scrambleFrame(value, (frame / frames) * digits, Math.random));
      if (frame >= frames) window.clearInterval(id);
    }, FRAME_MS);
    return () => {
      window.clearInterval(id);
      setShown(value);
    };
  }, [active, reduceMotion, value]);

  return (
    <>
      <span className="visually-hidden">{value}</span>
      <span aria-hidden="true">{shown}</span>
    </>
  );
}
