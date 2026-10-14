"use client";

import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useLayoutEffect, useRef, type ReactNode } from "react";

/** Captions trail their rule by 40 ms, like a plate number set after the drawing. */
const CAPTION_LAG_S = 0.04;

/**
 * Draws hairlines (`data-draw`) with scaleX as their figure scrolls in, captions (`data-caption`) following.
 * Nothing else moves. The from-state is written here, so without JavaScript every rule is already drawn.
 */
export function DrawOnScroll({ children, className }: { children: ReactNode; className?: string }) {
  const rootRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    gsap.registerPlugin(ScrollTrigger);

    const ctx = gsap.context(() => {
      for (const group of gsap.utils.toArray<HTMLElement>("[data-draw-group]", root)) {
        const tl = gsap.timeline({ scrollTrigger: { trigger: group, start: "top 80%", once: true } });
        tl.from(group.querySelectorAll("[data-draw]"), {
          scaleX: 0,
          transformOrigin: "0% 50%",
          duration: 0.6,
          ease: "power3.out",
          stagger: 0.06,
        });
        tl.from(group.querySelectorAll("[data-caption]"), { opacity: 0, x: -8, duration: 0.32, ease: "power3.out" }, CAPTION_LAG_S);
      }
    }, root);
    return () => ctx.revert();
  }, []);

  return (
    <div ref={rootRef} className={className}>
      {children}
    </div>
  );
}
