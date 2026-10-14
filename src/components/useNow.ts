"use client";

import { useEffect, useState } from "react";

/** A client clock that ticks every `intervalMs` while `active`; 0 until mounted, so server HTML never carries a time. */
export function useNow(intervalMs: number, active = true): number {
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (!active) return;
    const tick = () => setNow(Date.now());
    tick();
    const id = window.setInterval(tick, intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs, active]);
  return now;
}
