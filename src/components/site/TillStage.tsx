"use client";

import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { feedForProgress, isWeakDevice, STAMP_AT, type DeviceHints } from "./tillMath";
import type { TillReceipt } from "./tillReceipt";
import type { TillScene } from "./tillScene";
import { layoutReceipt, paintReceipt, paintStamp, cssFont, STAMP_SIZE, type FontFamilies, type ReceiptLayout, type ReceiptPalette } from "./tillTexture";
import s from "./Till.module.css";

/** Which till is showing, exposed as data-till: the HTML receipt, the HTML receipt while three.js loads, or the 3D till. */
type Mode = "html" | "loading" | "3d";

const WIDE = "(min-width: 768px)";
const PIN_DISTANCE = "+=140%";
const PRINT_SCALE = 1.5;
const INTRO_S = 1.1;
const MOBILE_FEED_S = 2.6;
const IDLE_TIMEOUT_MS = 1200;
const MARK_SRC = "/brand/centscan-mark.svg";

function hasWebGL2(): boolean {
  try {
    const gl = document.createElement("canvas").getContext("webgl2");
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
    return Boolean(gl);
  } catch {
    // Some privacy modes throw instead of returning null; either way there is no WebGL.
    return false;
  }
}

/** Waits for the browser to be idle after first paint, so three.js never competes with the LCP. */
function afterFirstPaint(): Promise<void> {
  return new Promise((resolve) => {
    // Safari has no requestIdleCallback; a short timeout after hydration serves the same purpose there.
    if (typeof window.requestIdleCallback === "function") window.requestIdleCallback(() => resolve(), { timeout: IDLE_TIMEOUT_MS });
    else setTimeout(resolve, 200);
  });
}

function readFamilies(): FontFamilies {
  const root = getComputedStyle(document.documentElement);
  return {
    mono: root.getPropertyValue("--font-plex-mono").trim() || "ui-monospace, monospace",
    sans: root.getPropertyValue("--font-plex-sans").trim() || "system-ui, sans-serif",
  };
}

function readPalette(el: Element): ReceiptPalette & { paper: string; page: string } {
  const css = getComputedStyle(el);
  const v = (name: string) => css.getPropertyValue(name).trim();
  return {
    text: v("--text"),
    muted: v("--text-muted"),
    accent: v("--accent"),
    accentText: v("--accent-text"),
    warning: v("--warning"),
    danger: v("--danger"),
    rule: v("--border-strong"),
    paper: v("--surface"),
    page: v("--page"),
  };
}

async function loadFonts(families: FontFamilies): Promise<void> {
  await Promise.all([
    document.fonts.load(cssFont({ role: "mono", weight: 400, size: 32 }, families)),
    document.fonts.load(cssFont({ role: "mono", weight: 600, size: 32 }, families)),
    document.fonts.load(cssFont({ role: "sans", weight: 600, size: 32 }, families)),
  ]);
  await document.fonts.ready;
}

async function loadMark(): Promise<HTMLImageElement | null> {
  const img = new Image();
  img.src = MARK_SRC;
  try {
    await img.decode();
    return img;
  } catch {
    // The mark is decoration on the printed paper; the receipt prints without it.
    return null;
  }
}

function canvas2d(width: number, height: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(width);
  canvas.height = Math.ceil(height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas unavailable");
  return [canvas, ctx];
}

interface Printed {
  layout: ReceiptLayout;
  print: HTMLCanvasElement;
  stamp: HTMLCanvasElement | null;
  label: HTMLCanvasElement;
}

function printReceipt(receipt: TillReceipt, families: FontFamilies, palette: ReceiptPalette & { page: string }, mark: HTMLImageElement | null): Printed {
  const [, measureCtx] = canvas2d(1, 1);
  const layout = layoutReceipt(receipt, (text, font) => {
    measureCtx.font = cssFont(font, families);
    return measureCtx.measureText(text).width;
  });
  const [print, ctx] = canvas2d(layout.width * PRINT_SCALE, layout.height * PRINT_SCALE);
  ctx.scale(PRINT_SCALE, PRINT_SCALE);
  paintReceipt(ctx, layout, palette, families, mark);

  let stamp: HTMLCanvasElement | null = null;
  if (receipt.stamp) {
    const [stampCanvas, stampCtx] = canvas2d(STAMP_SIZE.width, STAMP_SIZE.height);
    paintStamp(stampCtx, palette.accent, receipt.stamp.txShort, families);
    stamp = stampCanvas;
  }

  // The printer's front plate: name and chain, set in mono like the slot label on the HTML till.
  const [label, labelCtx] = canvas2d(640, 96);
  labelCtx.font = cssFont({ role: "mono", weight: 400, size: 40 }, families);
  labelCtx.fillStyle = palette.page;
  labelCtx.textBaseline = "middle";
  labelCtx.textAlign = "center";
  labelCtx.fillText("centscan · arc 5042", 320, 50);
  return { layout, print, stamp, label };
}

type Props = { receipt: TillReceipt; children: ReactNode };

/**
 * Progressive enhancement for the hero till. The server HTML (children) is the finished receipt and stays the page for
 * no-JS, reduced-motion, no-WebGL and weak phones. Otherwise three.js is imported after first paint and the receipt is
 * reprinted on 3D paper that feeds out of the printer as the pinned hero scrolls.
 */
export function TillStage({ receipt, children }: Props) {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [mode, setMode] = useState<Mode>("html");
  const [wantsCanvas, setWantsCanvas] = useState(false);

  // Phase 1: decide whether this visitor gets the 3D till.
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (!window.matchMedia(WIDE).matches && isWeakDevice(navigator as Navigator & DeviceHints)) return;
    if (!hasWebGL2()) return;
    let cancelled = false;
    afterFirstPaint().then(() => {
      if (cancelled) return;
      setWantsCanvas(true);
      setMode("loading");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Phase 2: build the scene on the canvas that phase 1 mounted, then drive it from scroll and pointer.
  useEffect(() => {
    if (!wantsCanvas) return;
    const stage = stageRef.current;
    const canvas = canvasRef.current;
    if (!stage || !canvas) return;
    let scene: TillScene | null = null;
    let teardown: (() => void) | null = null;
    let cancelled = false;

    const fallBack = () => {
      teardown?.();
      teardown = null;
      scene?.dispose();
      scene = null;
      if (cancelled) return;
      setWantsCanvas(false);
      setMode("html");
    };

    (async () => {
      const families = readFamilies();
      const palette = readPalette(stage);
      const [{ createTillScene }, mark] = await Promise.all([import("./tillScene"), loadMark(), loadFonts(families)]);
      if (cancelled) return;
      const printed = printReceipt(receipt, families, palette, mark);
      scene = createTillScene({
        canvas,
        ...printed,
        colors: { paper: palette.paper, ink: palette.text },
        onContextLost: fallBack,
      });
      teardown = drive(scene, stage, printed.layout, Boolean(receipt.stamp));
      setMode("3d");
    })().catch(() => {
      // Import, font or GPU failure: the HTML receipt is already the page, so stay on it.
      if (!cancelled) fallBack();
    });

    return () => {
      cancelled = true;
      teardown?.();
      scene?.dispose();
    };
  }, [wantsCanvas, receipt]);

  return (
    <div ref={stageRef} className={s.stage} data-till={mode}>
      <div className={s.receiptLayer}>{children}</div>
      {wantsCanvas && <canvas ref={canvasRef} className={s.canvas} aria-hidden="true" />}
    </div>
  );
}

/** Wires a ready scene to size, visibility, pointer and scroll. Returns the cleanup. */
function drive(scene: TillScene, stage: HTMLElement, layout: ReceiptLayout, isAttested: boolean): () => void {
  const hero = stage.closest<HTMLElement>("[data-till-pin]") ?? stage;
  const headShare = Math.min(0.6, (layout.headBottom + 80) / layout.height);
  let intro = 0;
  let progress = 0;
  const push = () => {
    scene.setFeed(intro * feedForProgress(progress, headShare), true);
    scene.setStamp(isAttested && intro === 1 && progress >= STAMP_AT);
  };

  const resize = new ResizeObserver(([entry]) => {
    if (entry) scene.resize(entry.contentRect.width, entry.contentRect.height);
  });
  resize.observe(stage);
  scene.resize(stage.clientWidth, stage.clientHeight);

  let onScreen = true;
  const syncActive = () => scene.setActive(onScreen && document.visibilityState === "visible");
  const visibility = new IntersectionObserver(([entry]) => {
    onScreen = Boolean(entry?.isIntersecting);
    syncActive();
  });
  visibility.observe(stage);
  document.addEventListener("visibilitychange", syncActive);

  const finePointer = window.matchMedia("(pointer: fine)").matches;
  const handleMove = (event: PointerEvent) => {
    const rect = hero.getBoundingClientRect();
    scene.setPointer(((event.clientX - rect.left) / rect.width) * 2 - 1, ((event.clientY - rect.top) / rect.height) * 2 - 1);
  };
  const handleLeave = () => scene.setPointer(0, 0);
  if (finePointer) {
    hero.addEventListener("pointermove", handleMove);
    hero.addEventListener("pointerleave", handleLeave);
  }

  gsap.registerPlugin(ScrollTrigger);
  const proxy = { intro: 0, progress: 0 };
  const mm = gsap.matchMedia();
  mm.add({ wide: WIDE, narrow: "(max-width: 767.98px)" }, (context) => {
    if (context.conditions?.wide) {
      const trigger = ScrollTrigger.create({
        trigger: hero,
        start: "top top",
        end: PIN_DISTANCE,
        pin: true,
        scrub: true,
        invalidateOnRefresh: true,
        onUpdate: (self) => {
          progress = self.progress;
          push();
        },
      });
      progress = trigger.progress;
      gsap.to(proxy, {
        intro: 1,
        duration: INTRO_S,
        ease: "power2.out",
        onUpdate: () => {
          intro = proxy.intro;
          push();
        },
      });
      return;
    }
    // Phones: no pin; the paper feeds out once, the first time the till scrolls into view.
    intro = 1;
    progress = 0;
    push();
    proxy.progress = 0;
    ScrollTrigger.create({
      trigger: stage,
      start: "top 75%",
      once: true,
      onEnter: () => {
        gsap.to(proxy, {
          progress: 1,
          duration: MOBILE_FEED_S,
          ease: "power1.inOut",
          onUpdate: () => {
            progress = proxy.progress;
            push();
          },
        });
      },
    });
  });

  // The canvas has been invisible so far; it takes over from the HTML receipt only once it can draw.
  const canvas = stage.querySelector("canvas");
  if (canvas) gsap.fromTo(canvas, { opacity: 0 }, { opacity: 1, duration: 0.4, ease: "power2.out" });

  return () => {
    mm.revert();
    resize.disconnect();
    visibility.disconnect();
    document.removeEventListener("visibilitychange", syncActive);
    hero.removeEventListener("pointermove", handleMove);
    hero.removeEventListener("pointerleave", handleLeave);
  };
}
