"use client";

import { useEffect } from "react";

/**
 * Scroll reveals for `[data-reveal]` blocks below the hero. GSAP loads on demand (it shares the scene's chunk),
 * and the from-state is written at runtime, so without JavaScript every block is already in place.
 */
export function SiteMotion() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let revert: (() => void) | null = null;
    let isCancelled = false;
    void Promise.all([import("gsap"), import("gsap/ScrollTrigger")])
      .then(([{ gsap }, { ScrollTrigger }]) => {
        if (isCancelled) return;
        gsap.registerPlugin(ScrollTrigger);
        const ctx = gsap.context(() => {
          const blocks = gsap.utils.toArray<HTMLElement>("main [data-reveal]").filter((el) => el.getBoundingClientRect().top > window.innerHeight);
          ScrollTrigger.batch(blocks, {
            start: "top 95%",
            once: true,
            onEnter: (batch) => gsap.from(batch, { y: 24, opacity: 0, duration: 0.5, ease: "power3.out", stagger: 0.06, overwrite: true }),
          });
        });
        revert = () => ctx.revert();
      })
      .catch(() => {
        // GSAP failed to load: nothing was hidden, so the page simply stays still.
      });
    return () => {
      isCancelled = true;
      revert?.();
    };
  }, []);

  return null;
}
