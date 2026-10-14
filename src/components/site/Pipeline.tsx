"use client";

import { useState, type CSSProperties } from "react";
import type { PipelineStage } from "./observatoryData";
import s from "./Sections.module.css";

/**
 * How it measures: six stages on one rail. Hovering or focusing a stage lights the path up to it
 * and shows that stage's figure from the newest report.
 */
export function Pipeline({ stages, target }: { stages: readonly PipelineStage[]; target: string | null }) {
  const [active, setActive] = useState(0);
  const stage = stages[active] ?? stages[0];
  const lit = stages.length > 1 ? active / (stages.length - 1) : 1;

  return (
    <section id="method" className={s.section} aria-labelledby="method-title">
      <div className={s.wrap}>
        <div className={s.methodHead} data-reveal>
          <p className={s.eyebrow}>How it measures</p>
          <h2 id="method-title" className={s.heading}>
            From raw logs to a hash on Arc, in six steps
          </h2>
          <p className={s.lede}>
            {target
              ? `Each step shows what it found for the newest report, ${target}.`
              : "No report is cached yet, so each step shows the method only. Scan a contract and its figures fill in."}
          </p>
        </div>

        <div className={s.pipeline} style={{ "--lit": lit } as CSSProperties}>
          <div className={s.pipeRail} aria-hidden="true">
            <span className={s.pipeLit} />
          </div>
          <ol className={s.pipeStages}>
            {stages.map((item, i) => (
              <li key={item.id}>
                <button
                  type="button"
                  className={s.pipeStage}
                  aria-pressed={i === active}
                  aria-controls="pipeline-detail"
                  data-lit={i <= active ? "" : undefined}
                  onPointerEnter={() => setActive(i)}
                  onFocus={() => setActive(i)}
                  onClick={() => setActive(i)}
                >
                  <span className={s.pipeIndex}>{String(i + 1).padStart(2, "0")}</span>
                  <span className={s.pipeTitle}>{item.title}</span>
                  <span className={s.pipeFigure}>{item.figure ?? "—"}</span>
                </button>
              </li>
            ))}
          </ol>
          {stage && (
            <div id="pipeline-detail" className={s.pipeDetail} aria-live="polite">
              <p className={s.pipeDetailTitle}>
                {String(active + 1).padStart(2, "0")} · {stage.title}
              </p>
              <p>{stage.method}</p>
              <p className={s.pipeDetailFigure}>{stage.figure ? `${stage.figure}. ${stage.detail ?? ""}` : "Waiting for a first report."}</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
