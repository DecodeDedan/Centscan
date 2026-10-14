"use client";

import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useEffect, useRef } from "react";

const COUNT_S = 1.4;

type Props = {
  /** Final value; the server HTML prints `children`, which must be this number formatted. */
  to: number;
  decimals: number;
  suffix?: string;
  children: string;
};

/**
 * A number that counts up once when it scrolls into view. Server HTML and reduced motion show the final figure;
 * screen readers always get the final figure, never the ticking one.
 */
export function CountUp({ to, decimals, suffix = "", children }: Props) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    gsap.registerPlugin(ScrollTrigger);
    const format = new Intl.NumberFormat("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    const mm = gsap.matchMedia();
    mm.add("(prefers-reduced-motion: no-preference)", () => {
      const counter = { value: 0 };
      const render = () => {
        el.textContent = `${format.format(counter.value)}${suffix}`;
      };
      const tween = gsap.to(counter, {
        value: to,
        duration: COUNT_S,
        ease: "power3.out",
        paused: true,
        onUpdate: render,
        onComplete: () => {
          el.textContent = children;
        },
      });
      render();
      ScrollTrigger.create({ trigger: el, start: "top 85%", once: true, onEnter: () => tween.play() });
      return () => {
        el.textContent = children;
      };
    });
    return () => mm.revert();
  }, [to, decimals, suffix, children]);

  return (
    <>
      {/* Reserving the final width (mono digits are 1ch) keeps the ticking number from shifting its line. */}
      <span ref={ref} aria-hidden="true" style={{ display: "inline-block", minWidth: `${children.length}ch` }}>
        {children}
      </span>
      <span className="visually-hidden">{children}</span>
    </>
  );
}
