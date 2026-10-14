import { describe, expect, it } from "vitest";
import { advanceStages, isProgressStep, queuedSteps, stageSeconds, type StageState } from "@/components/pipelineStages";

describe("advanceStages", () => {
  it("adds stages in first-seen order with client start times", () => {
    const a = advanceStages([], { step: "code", done: 0, total: 0 }, 1000);
    const b = advanceStages(a, { step: "logs", done: 1, total: 4 }, 1500);
    expect(b.map((s) => s.step)).toEqual(["code", "logs"]);
    expect(b[1]).toMatchObject({ startedAt: 1500, finishedAt: null });
  });

  it("finishes an uncounted stage when the next one starts", () => {
    const a = advanceStages([], { step: "code", done: 0, total: 0 }, 1000);
    const b = advanceStages(a, { step: "source", done: 0, total: 0 }, 1800);
    expect(b[0]?.finishedAt).toBe(1800);
    expect(b[1]?.finishedAt).toBeNull();
  });

  it("finishes a counted stage when its count completes, and keeps the first finish time", () => {
    let s = advanceStages([], { step: "logs", done: 1, total: 3 }, 0);
    s = advanceStages(s, { step: "logs", done: 3, total: 3 }, 2400);
    expect(s[0]).toMatchObject({ done: 3, finishedAt: 2400 });
    s = advanceStages(s, { step: "logs", done: 3, total: 3 }, 9000);
    expect(s[0]?.finishedAt).toBe(2400);
  });

  it("leaves a running counted stage open when another starts beside it", () => {
    let s = advanceStages([], { step: "logs", done: 1, total: 3 }, 0);
    s = advanceStages(s, { step: "source", done: 0, total: 0 }, 500);
    expect(s[0]?.finishedAt).toBeNull();
  });

  it("times a new stage from the previous event, since the server reports work after doing it", () => {
    const [code] = advanceStages([], { step: "code", done: 1, total: 1 }, 1300, 1000);
    expect(code).toMatchObject({ startedAt: 1000, finishedAt: 1300 });
    expect(stageSeconds(code as StageState, 5000)).toBe("0.3");
  });

  it("does not mutate its input", () => {
    const a = advanceStages([], { step: "code", done: 0, total: 0 }, 1);
    const copy = structuredClone(a);
    advanceStages(a, { step: "source", done: 0, total: 0 }, 2);
    expect(a).toEqual(copy);
  });
});

describe("queuedSteps", () => {
  it("lists the unseen pipeline, swapping logs for blocks on a block scan", () => {
    expect(queuedSteps([])).toEqual(["code", "source", "logs", "transactions", "names"]);
    const scanned = advanceStages([], { step: "blocks", done: 0, total: 300 }, 0);
    expect(queuedSteps(scanned)).toEqual(["code", "source", "transactions", "names"]);
  });
});

describe("stageSeconds", () => {
  it("measures running and finished stages", () => {
    const running: StageState = { step: "logs", done: 0, total: 2, startedAt: 1000, finishedAt: null };
    expect(stageSeconds(running, 3450)).toBe("2.5");
    expect(stageSeconds({ ...running, finishedAt: 1500 }, 99999)).toBe("0.5");
    expect(stageSeconds(running, 0)).toBe("0.0");
  });

  it("recognises step names", () => {
    expect(isProgressStep("names")).toBe(true);
    expect(isProgressStep("toString")).toBe(false);
    expect(isProgressStep(3)).toBe(false);
  });
});
