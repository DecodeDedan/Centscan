import { describe, expect, it } from "vitest";
import { chartDomain, costRamp, position, rampBand, rampColor, rowAnchor, ticks, toMicro, valueAt } from "@/components/costScale";

describe("costRamp", () => {
  it("maps log10(median) across the set's own min to max", () => {
    const ramp = costRamp(["100", "1000", "10000"]);
    expect(ramp("100")).toMatchObject({ t: 0, band: "low", label: "cheap" });
    expect(ramp("1000")).toMatchObject({ t: 0.5, band: "mid", label: "mid" });
    expect(ramp("10000")).toMatchObject({ t: 1, band: "high", label: "pricey" });
  });

  it("clamps values outside the set", () => {
    const ramp = costRamp(["100", "1000"]);
    expect(ramp("1").t).toBe(0);
    expect(ramp("999999").t).toBe(1);
  });

  it("puts every value mid-ramp with a 'one level' label when all medians are equal or there is one", () => {
    expect(costRamp(["4399"])("4399")).toMatchObject({ t: 0.5, band: "flat", label: "one level" });
    expect(costRamp(["5", "5"])("5").band).toBe("flat");
    expect(costRamp([])("5").band).toBe("flat");
  });

  it("treats zero and junk as the one micro-USD floor", () => {
    expect(toMicro("0")).toBe(1);
    expect(toMicro("not a number")).toBe(1);
    expect(costRamp(["0", "100"])("0").t).toBe(0);
  });
});

describe("rampColor", () => {
  it("mixes green → amber → red from the status tokens", () => {
    expect(rampColor(0)).toBe("color-mix(in oklch, var(--warning) 0%, var(--success))");
    expect(rampColor(0.25)).toBe("color-mix(in oklch, var(--warning) 50%, var(--success))");
    expect(rampColor(0.5)).toBe("color-mix(in oklch, var(--warning) 100%, var(--success))");
    expect(rampColor(1)).toBe("color-mix(in oklch, var(--danger) 100%, var(--warning))");
    expect(rampColor(7)).toBe(rampColor(1));
    expect(rampColor(-1)).toBe(rampColor(0));
  });

  it("splits bands in thirds", () => {
    expect(rampBand(0.32)).toBe("low");
    expect(rampBand(0.34)).toBe("mid");
    expect(rampBand(0.67)).toBe("high");
  });
});

describe("chart scale", () => {
  it("spans the cheapest min to the dearest p90 with padding", () => {
    const d = chartDomain([
      { min: "100", p90: "1000" },
      { min: "1000", p90: "100000" },
    ]);
    expect(d.lo).toBeCloseTo(2 - 0.12);
    expect(d.hi).toBeCloseTo(5 + 0.12);
  });

  it("widens a narrow domain to one decade around its centre", () => {
    const d = chartDomain([{ min: "4300", p90: "4500" }]);
    expect(d.hi - d.lo).toBeCloseTo(1);
    expect(position(d, "4399")).toBeGreaterThan(0.4);
    expect(position(d, "4399")).toBeLessThan(0.6);
  });

  it("never starts below one micro-USD", () => {
    const d = chartDomain([{ min: "0", p90: "2" }]);
    expect(d.lo).toBe(0);
    expect(d.hi).toBeGreaterThanOrEqual(1);
  });

  it("has a sane default with no rows", () => {
    expect(chartDomain([])).toEqual({ lo: 0, hi: 1 });
  });

  it("round-trips position and valueAt, and clamps both", () => {
    const d = { lo: 2, hi: 5 };
    expect(position(d, "1000")).toBeCloseTo(1 / 3);
    expect(valueAt(d, 1 / 3)).toBeCloseTo(1000);
    expect(position(d, "1")).toBe(0);
    expect(position(d, "1e9")).toBe(1);
    expect(valueAt(d, 2)).toBeCloseTo(100000);
  });

  it("ticks every decade on wide domains and adds 2× and 5× on narrow ones", () => {
    expect(ticks({ lo: 1.9, hi: 5.1 })).toEqual([100, 1000, 10000, 100000]);
    expect(ticks({ lo: 3.1, hi: 4.2 })).toEqual([2000, 5000, 10000]);
  });
});

describe("rowAnchor", () => {
  it("keeps anchors URL- and selector-safe", () => {
    expect(rowAnchor("0xa9059cbb")).toBe("fn-0xa9059cbb");
    expect(rowAnchor("receive()")).toBe("fn-receive");
    expect(rowAnchor("deploy")).toBe("fn-deploy");
  });
});
