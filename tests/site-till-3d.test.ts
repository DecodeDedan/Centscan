import { describe, expect, it } from "vitest";
import { buildTill } from "@/components/site/tillReceipt";
import { approach, feedForProgress, isSpringAtRest, isWeakDevice, STAMP_SPRING, stepSpring } from "@/components/site/tillMath";
import { fitText, layoutReceipt, PAPER_WIDTH, wrapWords, type MeasureText } from "@/components/site/tillTexture";

/** Monospace stand-in for canvas measureText: every glyph is 0.6 em wide. */
const measure: MeasureText = (text, font) => text.length * font.size * 0.6;
const ROW = { role: "mono", weight: 400, size: 32 } as const;

describe("till texture layout", () => {
  it("fits text with an ellipsis only when it overflows", () => {
    expect(fitText("short", 1000, ROW, measure)).toBe("short");
    const fitted = fitText("transferFrom(address,address,uint256)", 300, ROW, measure);
    expect(fitted.endsWith("…")).toBe(true);
    expect(measure(fitted, ROW)).toBeLessThanOrEqual(300);
  });

  it("wraps footer words and fits a single over-long word", () => {
    expect(wrapWords(["Print", "one", "for", "any", "contract:"], 300, ROW, measure)).toEqual(["Print one for", "any contract:"]);
    expect(wrapWords(["x".repeat(40)], 300, ROW, measure)[0]?.endsWith("…")).toBe(true);
  });

  it("lays out the method receipt inside the paper, with no stamp", () => {
    const layout = layoutReceipt(buildTill(null), measure);
    expect(layout.width).toBe(PAPER_WIDTH);
    expect(layout.stampCenter).toBeNull();
    expect(layout.headBottom).toBeGreaterThan(0);
    expect(layout.headBottom).toBeLessThan(layout.height / 2);
    for (const op of layout.ops) {
      if (op.kind === "text") {
        const width = measure(op.text, op.font);
        const left = op.align === "left" ? op.x : op.x - width;
        expect(left).toBeGreaterThanOrEqual(0);
        expect(left + width).toBeLessThanOrEqual(PAPER_WIDTH);
        expect(op.y).toBeLessThan(layout.height);
      }
    }
    expect(layout.ops).toContainEqual(expect.objectContaining({ kind: "text", text: "0.440¢", ink: "accent" }));
  });

  it("places the stamp over the total only when the report is attested", () => {
    const method = buildTill(null);
    const attested = { ...method, stamp: { txHash: `0x${"c".repeat(64)}`, txShort: "0xcccc…cccc" } };
    const layout = layoutReceipt(attested, measure);
    expect(layout.stampCenter).not.toBeNull();
    expect(layout.stampCenter?.y).toBeGreaterThan(layout.headBottom);
    expect(layout.stampCenter?.y).toBeLessThan(layout.height);
  });
});

describe("till motion helpers", () => {
  it("maps scroll progress to feed, starting with the head out and clamping", () => {
    expect(feedForProgress(0, 0.2)).toBe(0.2);
    expect(feedForProgress(1, 0.2)).toBe(1);
    expect(feedForProgress(-1, 0.2)).toBe(0.2);
    expect(feedForProgress(2, 0.2)).toBe(1);
    expect(feedForProgress(0.5, 0.2)).toBeCloseTo(0.6);
  });

  it("settles the stamp spring with an overshoot, and survives a long frame", () => {
    let state = { x: 0, v: 0 };
    let peak = 0;
    for (let i = 0; i < 120; i++) {
      state = stepSpring(state, 1, 1 / 60, STAMP_SPRING);
      peak = Math.max(peak, state.x);
    }
    expect(peak).toBeGreaterThan(1);
    expect(isSpringAtRest(state, 1)).toBe(true);
    const jumped = stepSpring({ x: 0, v: 0 }, 1, 2, STAMP_SPRING);
    expect(Number.isFinite(jumped.x)).toBe(true);
    expect(isSpringAtRest(jumped, 1)).toBe(true);
  });

  it("approaches a target and snaps once close", () => {
    expect(approach(0, 1, 1 / 60, 14)).toBeGreaterThan(0);
    expect(approach(0.99995, 1, 1 / 60, 14)).toBe(1);
    expect(approach(1, 1, 0, 14)).toBe(1);
  });

  it("treats a phone as weak only when both cores and memory are low", () => {
    expect(isWeakDevice({ hardwareConcurrency: 4, deviceMemory: 4 })).toBe(true);
    expect(isWeakDevice({ hardwareConcurrency: 8, deviceMemory: 4 })).toBe(false);
    expect(isWeakDevice({ hardwareConcurrency: 4 })).toBe(false);
    expect(isWeakDevice({})).toBe(false);
  });
});
