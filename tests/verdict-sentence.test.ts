import { describe, expect, it } from "vitest";
import type { FunctionCost } from "@/lib/report";
import { shortFunctionName, verdictSentence } from "@/components/verdictSentence";
import { SAMPLE_TX, makeReport } from "./helpers/report";

function fn(selector: string, name: string | null, median: string): FunctionCost {
  return {
    selector: selector as FunctionCost["selector"],
    name,
    nameSource: name ? "abi" : null,
    calls: 1,
    medianGas: "21000",
    costMicroUsd: { median, p90: median, min: median, max: median },
    sampleTx: SAMPLE_TX,
  };
}

describe("verdictSentence", () => {
  it("names the only function of a live, verified contract", () => {
    expect(verdictSentence(makeReport())).toBe("Live and verified on Sourcify (exact match). A typical call costs 0.440¢; the only function called is transfer.");
  });

  it("names the most expensive function by median when there are several", () => {
    const report = makeReport({
      source: { verdict: "fail", match: null, sourcifyUrl: "https://sourcify.dev/" },
      functions: [fn("0x82ad56cb", "aggregate3((address,bool,bytes)[])", "36100"), fn("0xa9059cbb", "transfer(address,uint256)", "1380")],
      headline: { medianMicroUsd: "1380", per1000Usd: "1.380000" },
    });
    expect(verdictSentence(report)).toBe(
      "Live and not verified on Sourcify. A typical call costs 0.138¢; the most expensive function is aggregate3 at 3.61¢.",
    );
  });

  it("keeps the first function when medians tie", () => {
    const report = makeReport({ functions: [fn("0x11111111", null, "500"), fn("0x22222222", null, "500")], headline: { medianMicroUsd: "500", per1000Usd: "0.5" } });
    expect(verdictSentence(report)).toContain("the most expensive function is 0x11111111 at 0.0500¢");
  });

  it("says there were no calls when the contract is idle, without a cost clause", () => {
    const report = makeReport({
      activity: { ...makeReport().activity, verdict: "fail", directCalls: 0, successfulCalls: 0 },
      functions: [],
      headline: { medianMicroUsd: null, per1000Usd: null },
    });
    expect(verdictSentence(report)).toBe("No direct calls in the last 1 h, and verified on Sourcify (exact match).");
  });

  it("covers quiet, partial and unknown verdicts", () => {
    const quiet = makeReport({
      activity: { ...makeReport().activity, verdict: "warn" },
      source: { verdict: "warn", match: "match", sourcifyUrl: "https://sourcify.dev/" },
      window: { ...makeReport().window, hours: 168 },
      functions: [],
      headline: { medianMicroUsd: null, per1000Usd: null },
    });
    expect(verdictSentence(quiet)).toBe("Quiet and partially verified on Sourcify. No priced calls in the last 7 d.");

    const unknown = makeReport({
      activity: { ...makeReport().activity, verdict: "unknown" },
      source: { verdict: "unknown", match: null, sourcifyUrl: "https://sourcify.dev/" },
    });
    expect(verdictSentence(unknown)).toMatch(/^Activity unknown, and Sourcify could not be checked\. A typical call/);

    const partial = makeReport({ source: { verdict: "pass", match: "match", sourcifyUrl: "https://sourcify.dev/" } });
    expect(verdictSentence(partial)).toContain("verified on Sourcify (partial match)");
  });

  it("is deterministic", () => {
    expect(verdictSentence(makeReport())).toBe(verdictSentence(makeReport()));
  });
});

describe("shortFunctionName", () => {
  it("drops the argument list", () => {
    expect(shortFunctionName({ name: "transfer(address,uint256)", selector: "0xa9059cbb" })).toBe("transfer");
    expect(shortFunctionName({ name: null, selector: "receive()" })).toBe("receive");
    expect(shortFunctionName({ name: null, selector: "deploy" })).toBe("deploy");
    expect(shortFunctionName({ name: null, selector: "0xa9059cbb" })).toBe("0xa9059cbb");
  });
});
