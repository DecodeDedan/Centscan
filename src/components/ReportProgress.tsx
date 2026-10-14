"use client";

import { AnimatePresence, motion } from "framer-motion";
import { formatInt } from "@/lib/format";
import { STAGE_LABELS, queuedSteps, stageSeconds, type StageState } from "./pipelineStages";
import styles from "./ReportProgress.module.css";
import ui from "./ui.module.css";
import { useNow } from "./useNow";
import { windowLabel } from "./verdicts";

const STEP_UNITS: Partial<Record<StageState["step"], string>> = { logs: "pages", transactions: "receipts", blocks: "blocks" };

function countText(stage: StageState): string | null {
  if (stage.total <= 1) return null;
  const unit = STEP_UNITS[stage.step];
  return `${formatInt(stage.done)}/${formatInt(stage.total)}${unit ? ` ${unit}` : ""}`;
}

function StageRow({ stage, index, now }: { stage: StageState; index: number; now: number }) {
  const running = stage.finishedAt === null;
  const count = countText(stage);
  const share = stage.total > 0 ? Math.min(1, stage.done / stage.total) : running ? 0 : 1;
  return (
    // Stages exist only after SSE events reach the browser, so this transform start never ships in server HTML.
    <motion.li layout="position" className={styles.stage} data-state={running ? "running" : "done"} initial={{ x: -12 }} animate={{ x: 0 }}>
      <span className={styles.index} aria-hidden="true">
        {String(index + 1).padStart(2, "0")}
      </span>
      <span className={styles.name}>{STAGE_LABELS[stage.step]}</span>
      {/* Counts and timers tick many times a second; they are visible but not announced. */}
      <span className={styles.count} aria-hidden="true">
        {count ?? ""}
      </span>
      <span className={styles.time} aria-hidden="true">
        {now > 0 ? `${stageSeconds(stage, now)} s` : ""}
      </span>
      <span className={running ? styles.statusRunning : `${styles.status} ${ui.pass}`}>{running ? "running" : <>✓ done</>}</span>
      <span className={styles.meter} aria-hidden="true">
        <span className={styles.meterFill} style={{ transform: `scaleX(${share})` }} />
      </span>
    </motion.li>
  );
}

/** The build pipeline while a report streams: named stages, real counts, client-measured seconds per stage, the running stage pulsing. */
export function ReportProgress({ stages, hours, startedAt }: { stages: readonly StageState[]; hours: number; startedAt: number | null }) {
  const now = useNow(200);
  const queued = queuedSteps(stages);
  const total = startedAt !== null && now > 0 ? ((now - startedAt) / 1000).toFixed(1) : null;
  const running = stages.filter((s) => s.finishedAt === null).map((s) => STAGE_LABELS[s.step]);

  return (
    <section className={`${ui.panel} ${styles.panel}`} aria-labelledby="progress-title" aria-busy="true">
      <div className={ui.panelHead}>
        <h2 id="progress-title" className={ui.figHeading}>
          <span className={ui.figNo}>01</span> Building report
        </h2>
        <p className={styles.total}>
          <span className={ui.live} aria-hidden="true" />
          <span>last {windowLabel(hours)}</span>
          {total && <span aria-hidden="true">{total} s</span>}
        </p>
      </div>
      <p className={ui.caption}>Reading real receipts from Arc mainnet. The public RPC can take around 30 seconds.</p>
      <p className="visually-hidden" aria-live="polite">
        {stages.length === 0 ? "Connecting to Arc." : running.length > 0 ? `Running: ${running.join(", ")}.` : "Finishing the report."}
      </p>
      <ol className={styles.stages} role="list">
        {stages.length === 0 && (
          <li className={styles.stage} data-state="running">
            <span className={styles.index} aria-hidden="true">
              00
            </span>
            <span className={styles.name}>Connect</span>
            <span className={styles.count} />
            <span className={styles.time} />
            <span className={styles.statusRunning}>running</span>
          </li>
        )}
        <AnimatePresence initial={false}>
          {stages.map((stage, i) => (
            <StageRow key={stage.step} stage={stage} index={i} now={now} />
          ))}
        </AnimatePresence>
        {queued.map((step, i) => {
          // With nothing reporting, the next stage in the route is the one the server is working towards.
          const next = i === 0 && stages.length > 0 && running.length === 0;
          return (
            <li key={step} className={styles.stage} data-state={next ? "running" : "queued"}>
              <span className={styles.index} aria-hidden="true">
                {String(stages.length + i + 1).padStart(2, "0")}
              </span>
              <span className={styles.name}>{STAGE_LABELS[step]}</span>
              <span className={styles.count} />
              <span className={styles.time} />
              <span className={next ? styles.statusRunning : styles.status}>{next ? "next" : "queued"}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
