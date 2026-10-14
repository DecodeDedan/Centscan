"use client";

import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useEffect, useRef, type ComponentPropsWithoutRef } from "react";

/** Scroll distance of the pinned stage, as a share of the viewport height: about one screen per step. */
const PIN_DISTANCE = "+=220%";
/** Where inside a step's scroll span an index link lands, so the step is fully in and its rules drawn. */
const STEP_LANDING = 0.55;

/**
 * Pins the Method section on wide screens and steps its three figures (Read, Price, Attest) through one stage as the
 * reader scrolls. Every from-state is written here: without JS, under reduced motion and on phones the figures are a
 * plain column, all visible.
 */
export function MethodStage(props: ComponentPropsWithoutRef<"section">) {
  const rootRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    gsap.registerPlugin(ScrollTrigger);
    const mm = gsap.matchMedia();

    mm.add("(min-width: 768px) and (prefers-reduced-motion: no-preference)", () => {
      const figures = gsap.utils.toArray<HTMLElement>("[data-step]", root);
      const indexItems = gsap.utils.toArray<HTMLElement>("[data-step-index]", root);
      if (figures.length === 0) return;
      root.dataset.staged = "true";

      const tl = gsap.timeline({ defaults: { ease: "power2.inOut" } });
      figures.forEach((figure, i) => {
        const draws = figure.querySelectorAll("[data-draw]");
        const previous = figures[i - 1];
        if (previous) {
          tl.to(previous, { opacity: 0, y: -40, duration: 0.3 }, i);
          tl.fromTo(figure, { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.3 }, i + 0.1);
        }
        tl.fromTo(draws, { scaleX: 0, transformOrigin: "0% 50%" }, { scaleX: 1, duration: 0.4, stagger: 0.05, ease: "power3.out" }, i + 0.15);
      });
      tl.to({}, { duration: 0.35 });

      let active = -1;
      const setActive = (step: number) => {
        if (step === active) return;
        active = step;
        indexItems.forEach((item, i) => {
          item.toggleAttribute("data-active", i === step);
          const link = item.querySelector("a");
          if (i === step) link?.setAttribute("aria-current", "step");
          else link?.removeAttribute("aria-current");
        });
      };

      const trigger = ScrollTrigger.create({
        animation: tl,
        trigger: root,
        start: "top top",
        end: PIN_DISTANCE,
        pin: true,
        scrub: 0.6,
        onUpdate: (self) => setActive(Math.min(figures.length - 1, Math.floor(self.progress * tl.duration()))),
      });
      setActive(0);

      // An index link would jump to the pinned section's top (always step 1); scroll to its step instead.
      const handleClick = (event: MouseEvent) => {
        const link = (event.target as Element | null)?.closest<HTMLAnchorElement>("[data-step-index] a");
        if (!link) return;
        const step = indexItems.findIndex((item) => item.contains(link));
        if (step < 0) return;
        event.preventDefault();
        const at = trigger.start + ((step + STEP_LANDING) / tl.duration()) * (trigger.end - trigger.start);
        window.scrollTo({ top: at, behavior: "smooth" });
      };
      root.addEventListener("click", handleClick);

      return () => {
        root.removeEventListener("click", handleClick);
        indexItems.forEach((item) => {
          item.removeAttribute("data-active");
          item.querySelector("a")?.removeAttribute("aria-current");
        });
        delete root.dataset.staged;
      };
    });
    return () => mm.revert();
  }, []);

  return <section ref={rootRef} {...props} />;
}
