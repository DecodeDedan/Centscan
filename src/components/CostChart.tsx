"use client";

import { motion, stagger, useReducedMotion, type Variants } from "framer-motion";
import { useId, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { formatInt, formatMicroUsd } from "@/lib/format";
import type { FunctionCost, Report } from "@/lib/report";
import { chartDomain, costRamp, position, rampColor, rowAnchor, ticks, valueAt, type RampStop } from "./costScale";
import styles from "./CostChart.module.css";
import { ROW_STAGGER_S, duration, easeOut, indicatorSpring } from "./motion";
import ui from "./ui.module.css";
import { shortFunctionName } from "./verdictSentence";

/** SVG user units across one track; tracks stretch to their column, strokes stay crisp with non-scaling-stroke. */
const TRACK_W = 1000;
const TRACK_H = 12;
/** A min-to-p90 range narrower than this still shows as a visible bar. */
const MIN_BAR_W = 6;

type Props = {
  report: Report;
  /** True only for a report that just finished in this browser: bars grow in once, row after row. */
  animate: boolean;
  /** The table row currently highlighted, so the chart marks the same function. */
  activeAnchor: string | null;
  /** Called with a row anchor when a row is chosen by click, Enter or Space. */
  onActivate: (anchor: string) => void;
};

type Cursor = { index: number; fraction: number; fromPointer: boolean; left: number; top: number };

const plotVariants: Variants = { hidden: {}, show: { transition: { delayChildren: stagger(ROW_STAGGER_S) } } };
const trackVariants: Variants = { hidden: { scaleX: 0 }, show: { scaleX: 1, transition: { duration: duration.base * 2, ease: easeOut } } };

function rowLabel(fn: FunctionCost, stop: RampStop): string {
  const c = fn.costMicroUsd;
  return `${shortFunctionName(fn)}: median ${formatMicroUsd(c.median)}, ${stop.label} for this contract; min ${formatMicroUsd(c.min)}, p90 ${formatMicroUsd(c.p90)}, max ${formatMicroUsd(c.max)}; ${formatInt(fn.calls)} calls. Press Enter to open its table row.`;
}

function Track({ fn, frac, color }: { fn: FunctionCost; frac: (v: string) => number; color: string }) {
  const c = fn.costMicroUsd;
  const x0 = frac(c.min) * TRACK_W;
  const x1 = Math.max(frac(c.p90) * TRACK_W, x0 + MIN_BAR_W);
  const xm = frac(c.median) * TRACK_W;
  const xMax = frac(c.max) * TRACK_W;
  return (
    <motion.svg className={styles.track} viewBox={`0 0 ${TRACK_W} ${TRACK_H}`} preserveAspectRatio="none" aria-hidden="true" variants={trackVariants} style={{ originX: 0 }}>
      {xMax > x1 && <line x1={x1} x2={xMax} y1={TRACK_H / 2} y2={TRACK_H / 2} className={styles.whisker} style={{ stroke: color }} vectorEffect="non-scaling-stroke" />}
      <rect x={x0} y={1} width={x1 - x0} height={TRACK_H - 2} style={{ fill: color }} className={styles.bar} />
      <line x1={xm} x2={xm} y1={0} y2={TRACK_H} className={styles.median} vectorEffect="non-scaling-stroke" />
    </motion.svg>
  );
}

/**
 * The signature of the app: one row per function, a bar from min to p90 with a median tick on a log scale, coloured by the cost ramp.
 * Hover or focus draws a crosshair with a tooltip; arrow keys move between rows; Enter or click opens the table row.
 */
export function CostChart({ report, animate, activeAnchor, onActivate }: Props) {
  const reduceMotion = useReducedMotion();
  const grow = animate && !reduceMotion;
  const id = useId();
  const overlayRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [focusIndex, setFocusIndex] = useState(0);
  const [cursor, setCursor] = useState<Cursor | null>(null);

  const fns = report.functions;
  const domain = chartDomain(fns.map((fn) => fn.costMicroUsd));
  const ramp = costRamp(fns.map((fn) => fn.costMicroUsd.median));
  const frac = (v: string | number) => position(domain, v);
  const gridlines = ticks(domain);

  /** Pixel position of a chart fraction on a row, relative to the plot, for the tooltip. */
  function place(index: number, fraction: number): { left: number; top: number } {
    const overlay = overlayRef.current;
    const row = rowRefs.current[index];
    if (!overlay || !row) return { left: 0, top: 0 };
    return { left: overlay.offsetLeft + fraction * overlay.offsetWidth, top: row.offsetTop + row.offsetHeight };
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const target = (event.target as Element).closest<HTMLElement>("[data-row]");
    const overlay = overlayRef.current;
    if (!target || !overlay) {
      setCursor(null);
      return;
    }
    const index = Number(target.dataset.row);
    const box = overlay.getBoundingClientRect();
    const raw = (event.clientX - box.left) / box.width;
    const fraction = Math.min(1, Math.max(0, raw));
    setCursor({ index, fraction, fromPointer: true, ...place(index, fraction) });
  }

  function focusRow(index: number) {
    const next = Math.min(fns.length - 1, Math.max(0, index));
    setFocusIndex(next);
    rowRefs.current[next]?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const moves: Record<string, number> = { ArrowDown: focusIndex + 1, ArrowUp: focusIndex - 1, Home: 0, End: fns.length - 1 };
    const target = moves[event.key];
    if (target === undefined) return;
    event.preventDefault();
    focusRow(target);
  }

  function onRowFocus(index: number) {
    setFocusIndex(index);
    const fn = fns[index];
    if (!fn) return;
    const fraction = frac(fn.costMicroUsd.median);
    setCursor({ index, fraction, fromPointer: false, ...place(index, fraction) });
  }

  const activeIndex = fns.findIndex((fn) => rowAnchor(fn.selector) === activeAnchor);
  // One moving mark: it follows the pointer or focus, and rests on the highlighted table row otherwise.
  const markIndex = cursor?.index ?? (activeIndex >= 0 ? activeIndex : null);
  const tipFn = cursor ? fns[cursor.index] : undefined;
  const tipStop = tipFn ? ramp(tipFn.costMicroUsd.median) : null;

  return (
    <section className={`${ui.panel} ${styles.section}`} aria-labelledby={`${id}-title`}>
      <div className={ui.panelHead}>
        <h2 id={`${id}-title`} className={ui.figHeading}>
          <span className={ui.figNo}>02</span> Cost range per function
        </h2>
        <ul className={styles.legend} role="list" aria-label="Legend">
          <li>
            <span className={styles.keyBar} aria-hidden="true" /> min → p90
          </li>
          <li>
            <span className={styles.keyTick} aria-hidden="true" /> median
          </li>
          {(["cheap", "mid", "pricey"] as const).map((word, i) => (
            <li key={word}>
              <span className={styles.keySwatch} style={{ background: rampColor(i / 2) }} aria-hidden="true" /> {word}
            </li>
          ))}
          <li className={styles.legendNote}>log scale</li>
        </ul>
      </div>

      {fns.length === 0 ? (
        <p className={ui.caption}>No priced calls in this window, so there is no range to draw.</p>
      ) : (
        <>
          <p id={`${id}-help`} className={ui.caption}>
            {fns.length} function{fns.length === 1 ? "" : "s"}, ramp from this contract&apos;s cheapest to dearest median. Hover to read any cost; arrow keys move
            between rows, Enter opens the table row.
          </p>
          <motion.div
            className={styles.plot}
            role="group"
            aria-label="Cost range per function"
            aria-describedby={`${id}-help`}
            onKeyDown={onKeyDown}
            onPointerMove={onPointerMove}
            onPointerLeave={() => setCursor(null)}
            variants={plotVariants}
            initial={grow ? "hidden" : false}
            animate="show"
          >
            <div className={styles.axis} aria-hidden="true">
              {gridlines.map((v) => (
                <span key={v} className={styles.tick} style={{ left: `${frac(v) * 100}%` }}>
                  {formatMicroUsd(BigInt(Math.round(v)))}
                </span>
              ))}
            </div>

            {fns.map((fn, i) => {
              const stop = ramp(fn.costMicroUsd.median);
              const anchor = rowAnchor(fn.selector);
              const active = activeAnchor === anchor;
              return (
                <button
                  key={fn.selector}
                  ref={(el) => {
                    rowRefs.current[i] = el;
                  }}
                  type="button"
                  data-row={i}
                  className={styles.row}
                  // Explicit rows: the overlay spans these same rows, so auto-placement must not push rows below it.
                  style={{ gridRow: i + 2 }}
                  data-active={active ? "true" : undefined}
                  tabIndex={i === focusIndex ? 0 : -1}
                  aria-label={rowLabel(fn, stop)}
                  aria-current={active ? "true" : undefined}
                  onFocus={() => onRowFocus(i)}
                  onClick={() => onActivate(anchor)}
                >
                  {markIndex === i && <motion.span layoutId={`${id}-cursor`} className={styles.rowMark} transition={indicatorSpring} aria-hidden="true" />}
                  <span className={styles.name} title={fn.name ?? fn.selector}>
                    {shortFunctionName(fn)}
                  </span>
                  <Track fn={fn} frac={frac} color={stop.color} />
                  <span className={styles.value}>
                    <span className={styles.valueNum}>{formatMicroUsd(fn.costMicroUsd.median)}</span>
                    <span className={styles.band}>{stop.label}</span>
                  </span>
                </button>
              );
            })}

            <div ref={overlayRef} className={styles.overlay} style={{ gridRow: `2 / span ${fns.length}` }} aria-hidden="true">
              <svg className={styles.grid} viewBox="0 0 1000 100" preserveAspectRatio="none">
                {gridlines.map((v) => (
                  <line key={v} x1={frac(v) * 1000} x2={frac(v) * 1000} y1={0} y2={100} className={styles.gridline} vectorEffect="non-scaling-stroke" />
                ))}
                {cursor && <line x1={cursor.fraction * 1000} x2={cursor.fraction * 1000} y1={0} y2={100} className={styles.crosshair} vectorEffect="non-scaling-stroke" />}
              </svg>
            </div>

            {cursor && tipFn && tipStop && (
              <div
                className={styles.tooltip}
                data-flip={cursor.fraction > 0.55 ? "true" : undefined}
                style={{ left: cursor.left, top: cursor.top }}
                aria-hidden="true"
              >
                <p className={styles.tipName}>{tipFn.name ?? tipFn.selector}</p>
                {cursor.fromPointer && (
                  <p className={styles.tipCursor}>
                    crosshair <strong>{formatMicroUsd(BigInt(Math.round(valueAt(domain, cursor.fraction))))}</strong>
                  </p>
                )}
                <dl className={styles.tipStats}>
                  <div>
                    <dt>min</dt>
                    <dd>{formatMicroUsd(tipFn.costMicroUsd.min)}</dd>
                  </div>
                  <div>
                    <dt>median</dt>
                    <dd>{formatMicroUsd(tipFn.costMicroUsd.median)}</dd>
                  </div>
                  <div>
                    <dt>p90</dt>
                    <dd>{formatMicroUsd(tipFn.costMicroUsd.p90)}</dd>
                  </div>
                  <div>
                    <dt>max</dt>
                    <dd>{formatMicroUsd(tipFn.costMicroUsd.max)}</dd>
                  </div>
                  <div>
                    <dt>calls</dt>
                    <dd>{formatInt(tipFn.calls)}</dd>
                  </div>
                  <div>
                    <dt>ramp</dt>
                    <dd>{tipStop.label}</dd>
                  </div>
                </dl>
              </div>
            )}
          </motion.div>
        </>
      )}
    </section>
  );
}

/** The chart's frame while a report builds: rows in their final place, nothing moving, so the landing report does not shift. */
export function CostChartSkeleton() {
  return (
    <section className={`${ui.panel} ${styles.section}`} aria-labelledby="chart-pending-title">
      <div className={ui.panelHead}>
        <h2 id="chart-pending-title" className={ui.figHeading}>
          <span className={ui.figNo}>02</span> Cost range per function
        </h2>
        <p className={ui.label}>waiting for receipts</p>
      </div>
      <p className={ui.caption}>Ranges appear when the pipeline finishes pricing receipts.</p>
      <div className={styles.skeleton} aria-hidden="true">
        {[62, 38, 74, 45, 56].map((w, i) => (
          <span key={i} className={styles.skeletonRow}>
            <span className={styles.skeletonName} />
            <span className={styles.skeletonBar} style={{ inlineSize: `${w}%` }} />
          </span>
        ))}
      </div>
    </section>
  );
}
