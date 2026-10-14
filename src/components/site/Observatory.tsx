"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { blockAgeSeconds, chainLabels } from "./chainStatus";
import { Decode } from "./Decode";
import { useChain, useClock } from "./LiveChain";
import type { ObservatoryData } from "./observatoryData";
import type { SceneHandle } from "./observatoryScene";
import { ScanForm, type ScanExample } from "./ScanForm";
import s from "./Observatory.module.css";

/** Which view the stage shows: the CSS stand-in while three.js loads, the live scene, or the stand-in for good. */
type StageMode = "loading" | "3d" | "fallback";
type SceneModule = typeof import("./observatoryScene");

const IDLE_TIMEOUT_MS = 1_500;

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

/** Resolves once the browser is idle after first paint, so three.js never competes with the LCP. */
function afterFirstPaint(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window.requestIdleCallback === "function") window.requestIdleCallback(() => resolve(), { timeout: IDLE_TIMEOUT_MS });
    else window.setTimeout(resolve, 300);
  });
}

function reportHref(data: ObservatoryData, selector?: string): string {
  const base = `/c/${data.target}?hours=${data.windowHours}`;
  return selector ? `${base}#fn-${encodeURIComponent(selector)}` : base;
}

type Props = { data: ObservatoryData | null; examples: readonly ScanExample[] };

export function Observatory({ data, examples }: Props) {
  const router = useRouter();
  const chain = useChain();
  const now = useClock();
  const rootRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const labelRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const ringLabelRef = useRef<HTMLSpanElement>(null);
  const reticleRef = useRef<HTMLDivElement>(null);
  const rulerXRef = useRef<HTMLElement>(null);
  const rulerYRef = useRef<HTMLElement>(null);
  const fpsRef = useRef<HTMLElement>(null);
  const dprRef = useRef<HTMLElement>(null);
  const particlesRef = useRef<HTMLElement>(null);
  const pointerRef = useRef<HTMLElement>(null);
  const sceneRef = useRef<SceneHandle | null>(null);
  const [mode, setMode] = useState<StageMode>("loading");
  const [sceneModule, setSceneModule] = useState<SceneModule | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [hover, setHover] = useState<number | null>(null);
  const nodes = data?.nodes ?? [];

  // Phase 1: after first paint, check for WebGL2 and fetch the scene chunk (three.js + GSAP).
  useEffect(() => {
    let isCancelled = false;
    void afterFirstPaint().then(async () => {
      if (isCancelled) return;
      if (!hasWebGL2()) {
        setMode("fallback");
        return;
      }
      try {
        const loaded = await import("./observatoryScene");
        if (!isCancelled) setSceneModule(loaded);
      } catch {
        // The chunk failed to load (offline, blocked); the stand-in and the HTML node list carry the page.
        if (!isCancelled) setMode("fallback");
      }
    });
    return () => {
      isCancelled = true;
    };
  }, []);

  // Phase 2: build the scene once its module is here. Refs are stable, so it is built exactly once.
  useEffect(() => {
    const host = stageRef.current;
    const root = rootRef.current;
    if (!sceneModule || !host || !root) return;
    const isReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let handle: SceneHandle;
    try {
      handle = sceneModule.createObservatoryScene({
        host,
        root,
        nodes,
        windowHours: data?.windowHours ?? null,
        labels: labelRefs.current,
        ringLabel: ringLabelRef.current,
        reticle: reticleRef.current,
        rulerX: rulerXRef.current,
        rulerY: rulerYRef.current,
        readouts: { fps: fpsRef.current, dpr: dprRef.current, particles: particlesRef.current, pointer: pointerRef.current },
        reducedMotion: isReduced,
        paused: isReduced,
        onHover: setHover,
        onActivate: (index) => {
          const node = nodes[index];
          if (data && node) router.push(reportHref(data, node.selector));
        },
        onContextLost: () => setMode("fallback"),
      });
    } catch {
      // WebGL context creation can still fail after the capability probe (GPU blocklist, too many contexts).
      queueMicrotask(() => setMode("fallback"));
      return;
    }
    sceneRef.current = handle;
    queueMicrotask(() => {
      setMode("3d");
      setIsPaused(isReduced);
    });
    const handlePageHide = () => handle.dispose();
    window.addEventListener("pagehide", handlePageHide);
    return () => {
      window.removeEventListener("pagehide", handlePageHide);
      handle.dispose();
      sceneRef.current = null;
    };
    // The scene is built once per module load; data and nodes come from the server render and do not change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sceneModule]);

  useEffect(() => {
    sceneRef.current?.setHighlight(hover);
  }, [hover]);

  function togglePause() {
    const next = !isPaused;
    setIsPaused(next);
    sceneRef.current?.setPaused(next);
  }

  const labels = chain.reading ? chainLabels(chain.reading) : null;
  const age = chain.reading && now !== null ? `${blockAgeSeconds(chain.reading.timestamp, now)} s` : null;
  const isLive = mode === "3d";

  return (
    <section ref={rootRef} className={s.hero} aria-labelledby="hero-title" data-stage={mode}>
      <div ref={stageRef} className={s.stage} aria-hidden="true" />
      <div className={s.field} aria-hidden="true" />
      <div className={s.rulerX} aria-hidden="true">
        <i ref={rulerXRef} />
      </div>
      <div className={s.rulerY} aria-hidden="true">
        <i ref={rulerYRef} />
      </div>
      <div ref={reticleRef} className={s.reticle} data-on={isLive && !isPaused ? "" : undefined} aria-hidden="true" />

      <div className={s.markers} aria-hidden="true">
        {nodes.map((node, i) => (
          <span
            key={node.selector}
            ref={(el) => {
              labelRefs.current[i] = el;
            }}
            className={s.marker}
            data-active={hover === i ? "" : undefined}
            style={{ "--swatch": node.swatch } as CSSProperties}
          >
            <span className={s.markerText}>
              <b>{node.name}</b>
              <span className={s.markerCalls}>
                {" "}
                · {node.calls.toLocaleString("en-US")} {node.calls === 1 ? "call" : "calls"}
              </span>{" "}
              · {node.medianLabel}
            </span>
          </span>
        ))}
        {data && (
          <span ref={ringLabelRef} className={s.ringMarker}>
            {data.windowLabel} window
          </span>
        )}
      </div>

      <div className={s.hud}>
        <div className={s.copy}>
          <p className={s.kicker} data-boot>
            <span className={s.dot} aria-hidden="true" /> Cost observatory · Arc mainnet
          </p>
          <h1 id="hero-title" className={s.title}>
            On Arc, gas is a price.
          </h1>
          <p className={s.lede}>
            Paste a contract address. Centscan reads its recent calls from Arc, prices every function in cents of USDC, and hashes the result
            so anyone can check it.
          </p>
          <ScanForm examples={examples} />
          {!data && (
            <p className={s.empty} data-boot>
              No contract has been scanned on this server yet. Scan a contract to light this up: its functions appear here as nodes, priced
              and placed by cost.
            </p>
          )}
        </div>

        <aside className={s.rail} aria-label="Live readouts">
          <div className={s.railHead} data-boot>
            <h2 className={s.railTitle}>Arc, live</h2>
            <p className={s.railStatus} data-status={chain.status} role="status">
              {chain.status === "live" && "● live"}
              {chain.status === "loading" && "○ connecting"}
              {chain.status === "paused" && "Ⅱ Live readout paused"}
            </p>
          </div>
          <dl className={s.readouts}>
            <div className={s.row} data-boot>
              <dt>block</dt>
              <dd>
                <Decode value={labels?.block ?? null} />
              </dd>
            </div>
            <div className={s.row} data-boot>
              <dt>base fee</dt>
              <dd>
                <Decode value={labels?.baseFee ?? null} />
              </dd>
            </div>
            <div className={s.row} data-boot>
              <dt>plain transfer</dt>
              <dd className={s.signal}>
                <Decode value={labels?.transfer ?? null} />
              </dd>
            </div>
            <div className={s.row} data-boot>
              <dt>since block</dt>
              <dd>{age ?? "—"}</dd>
            </div>
            <div className={s.row} data-boot>
              <dt>frame rate</dt>
              <dd ref={fpsRef}>{mode === "fallback" ? "no WebGL" : "—"}</dd>
            </div>
            <div className={s.row} data-boot>
              <dt>particles</dt>
              <dd ref={particlesRef}>—</dd>
            </div>
            <div className={s.row} data-boot>
              <dt>pixel ratio</dt>
              <dd ref={dprRef}>—</dd>
            </div>
            <div className={`${s.row} ${s.fineOnly}`} data-boot>
              <dt>pointer</dt>
              <dd ref={pointerRef}>—</dd>
            </div>
          </dl>
          {chain.status === "paused" && <p className={s.railNote}>{chain.reason}. Showing the last reading; retrying every 2 s.</p>}

          {data ? (
            <div className={s.scope} data-boot>
              <h2 className={s.scopeTitle}>
                On the scope: <Link href={reportHref(data)}>{data.targetShort}</Link>
              </h2>
              <p className={s.scopeMeta}>
                {data.windowLabel} window · {data.directCalls.toLocaleString("en-US")} calls · median {data.medianLabel ?? "—"}
              </p>
              {nodes.length > 0 ? (
                <ol className={s.nodeList}>
                  {nodes.map((node, i) => (
                    <li key={node.selector}>
                      <Link
                        href={reportHref(data, node.selector)}
                        className={s.nodeRow}
                        data-active={hover === i ? "" : undefined}
                        style={{ "--swatch": node.swatch } as CSSProperties}
                        onPointerEnter={() => setHover(i)}
                        onPointerLeave={() => setHover(null)}
                        onFocus={() => setHover(i)}
                        onBlur={() => setHover(null)}
                        title={node.fullName}
                      >
                        <span className={s.swatch} aria-hidden="true" />
                        <span className={s.nodeName}>{node.name}</span>
                        <span className={s.nodeRank}>{node.rankWord}</span>
                        <span className={s.nodeCalls}>{node.calls.toLocaleString("en-US")}×</span>
                        <span className={s.nodeCost}>{node.medianLabel}</span>
                      </Link>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className={s.scopeMeta}>No functions were called in this window, so there is nothing to place on the orbit.</p>
              )}
              {data.functionCount > nodes.length && (
                <p className={s.scopeMeta}>
                  Showing the {nodes.length} busiest of {data.functionCount} functions.
                </p>
              )}
            </div>
          ) : null}

          <div className={s.controls} data-boot>
            <button type="button" className={s.pause} aria-pressed={isPaused} onClick={togglePause} disabled={!isLive}>
              {isPaused ? "▶ Resume motion" : "Ⅱ Pause motion"}
            </button>
            <p className={s.stageNote}>
              {mode === "loading" && "Loading the 3D view…"}
              {mode === "3d" && (isPaused ? "Still frame." : "Nodes are the newest report's functions; hover one.")}
              {mode === "fallback" && "3D view unavailable on this device. The functions are listed above."}
            </p>
          </div>
        </aside>
      </div>
    </section>
  );
}
