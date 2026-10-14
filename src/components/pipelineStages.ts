import type { ProgressEvent, ProgressStep } from "@/lib/report";

/** A build stage as the browser saw it: the latest server counts plus client-measured start and finish times (ms epoch). */
export interface StageState extends ProgressEvent {
  startedAt: number;
  finishedAt: number | null;
}

export const STAGE_LABELS: Record<ProgressStep, string> = {
  code: "Read code",
  source: "Check Sourcify",
  logs: "Collect logs",
  transactions: "Fetch receipts",
  blocks: "Scan blocks",
  names: "Name functions",
};

/** The order a build normally runs in. "logs" and "blocks" are alternatives: an event-less contract is block-scanned instead. */
const PIPELINE: readonly ProgressStep[] = ["code", "source", "logs", "transactions", "names"];

export function isProgressStep(value: unknown): value is ProgressStep {
  return typeof value === "string" && Object.hasOwn(STAGE_LABELS, value);
}

/** A counted stage has finished when its count is complete. */
const counted = (s: ProgressEvent): boolean => s.total > 0 && s.done >= s.total;

/**
 * Folds one progress event into the stage list, keeping first-seen order.
 * The server reports a stage when it has done some work, so a new stage is timed from `since`: the previous event, or the
 * moment the stream opened. Uncounted stages (total 0) report no completion of their own, so they finish when a later stage starts.
 */
export function advanceStages(stages: readonly StageState[], event: ProgressEvent, now: number, since: number = now): StageState[] {
  const existing = stages.find((s) => s.step === event.step);
  if (existing) {
    return stages.map((s) =>
      s.step === event.step ? { ...s, done: event.done, total: event.total, finishedAt: s.finishedAt ?? (counted(event) ? now : null) } : s,
    );
  }
  const closed = stages.map((s) => (s.finishedAt === null && s.total === 0 ? { ...s, finishedAt: now } : s));
  return [...closed, { ...event, startedAt: Math.min(since, now), finishedAt: counted(event) ? now : null }];
}

/** Stages not seen yet, in pipeline order, so the reader sees the whole route before it runs. */
export function queuedSteps(stages: readonly StageState[]): ProgressStep[] {
  const seen = new Set(stages.map((s) => s.step));
  const scanned = seen.has("blocks");
  return PIPELINE.filter((step) => !seen.has(step) && !(scanned && step === "logs"));
}

/** Elapsed seconds for a stage, one decimal; a running stage reads against `now`. */
export function stageSeconds(stage: StageState, now: number): string {
  const end = stage.finishedAt ?? now;
  return (Math.max(0, end - stage.startedAt) / 1000).toFixed(1);
}
