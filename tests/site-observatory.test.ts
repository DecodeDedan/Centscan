import { describe, expect, it } from "vitest";
import type { ReportPayload } from "@/lib/api";
import { canonicalHash } from "@/lib/canonical";
import { blockAgeSeconds, chainLabels, normaliseAddress, parseChainResponse, scrambleDigits } from "@/components/site/chainStatus";
import { rampCss, rampPositions, rampRank, rampSegment } from "@/components/site/costRamp";
import {
  buildObservatory,
  documentedReceiptCost,
  layoutNodes,
  MAX_NODES,
  NODE_RADIUS,
  NODE_SIZE,
  pipelineStages,
  shortFunctionName,
  verdictSentence,
} from "@/components/site/observatoryData";
import { cappedDpr, isOnScreen, ndcToScreen, nearestNode, nextQualityStep, orbitPoint, SLOW_FRAME_MS } from "@/components/site/sceneMath";

const fn = (selector: string, calls: number, median: string, name: string | null = null) => ({
  selector,
  name,
  nameSource: name ? ("signature-db" as const) : null,
  calls,
  medianGas: "50000",
  costMicroUsd: { median, p90: median, min: median, max: median },
  sampleTx: `0x${"a".repeat(64)}`,
});

/** Shaped like the multicall report cached on the dev server (0xca11…ca11, 1 h window). */
function payload(functions = [fn("0x82ad56cb", 19, "10836", "aggregate3((address,bool,bytes)[])"), fn("0x174dea71", 6, "6406", "aggregate3Value((address,bool,uint256,bytes)[])")]): ReportPayload {
  return {
    reportHash: `0x${"b".repeat(64)}`,
    createdAt: "2026-10-14T12:31:07.845Z",
    attestation: null,
    report: {
      schemaVersion: 1,
      chainId: 5042,
      target: "0xca11bde05977b3631167028862be2a173976ca11",
      window: { fromBlock: "25913373", toBlock: "25920473", hours: 1, blockTimeMs: 507 },
      generatedAt: "2026-10-14T12:31:07.839Z",
      source: { verdict: "fail", match: null, sourcifyUrl: "https://sourcify.dev/" },
      activity: {
        verdict: "pass",
        directCalls: 25,
        successfulCalls: 25,
        indirectTxs: 0,
        uniqueSenders: 8,
        firstSeenBlock: "25913793",
        lastSeenBlock: "25920446",
        coverage: { kind: "block-scan", blocks: 7101 },
        sampled: null,
      },
      functions,
      reverted: { calls: 0, totalMicroUsd: "0" },
      headline: { medianMicroUsd: "9755", per1000Usd: "9.755000" },
    },
  };
}

describe("cost ramp", () => {
  it("maps log10 of the median across the report's own range", () => {
    expect(rampPositions([10n, 100n, 1000n])).toEqual([0, 0.5, 1]);
  });

  it("puts every function at 0 (green) when the report has one price", () => {
    expect(rampPositions([500n, 500n])).toEqual([0, 0]);
    expect(rampPositions([])).toEqual([]);
  });

  it("treats a free call as 1 micro-USD so the logarithm stays finite", () => {
    const [free, paid] = rampPositions([0n, 100n]);
    expect(free).toBe(0);
    expect(paid).toBe(1);
  });

  it("ranks positions in words so colour is never the only signal", () => {
    expect(rampRank(0, 1)).toBe("only");
    expect(rampRank(0, 3)).toBe("lowest");
    expect(rampRank(1, 3)).toBe("highest");
    expect(rampRank(0.4, 3)).toBe("between");
  });

  it("splits the ramp into green→amber and amber→red halves", () => {
    expect(rampSegment(0)).toEqual({ from: "--accent", to: "--warning", amount: 0 });
    expect(rampSegment(0.5)).toEqual({ from: "--accent", to: "--warning", amount: 1 });
    expect(rampSegment(0.75)).toEqual({ from: "--warning", to: "--danger", amount: 0.5 });
    expect(rampSegment(2)).toEqual({ from: "--warning", to: "--danger", amount: 1 });
    expect(rampCss(0.25)).toBe("color-mix(in oklab, var(--accent), var(--warning) 50.0%)");
  });
});

describe("observatory data", () => {
  it("shortens function names to the identifier and keeps bare selectors", () => {
    expect(shortFunctionName({ name: "aggregate3((address,bool,bytes)[])", selector: "0x82ad56cb" })).toBe("aggregate3");
    expect(shortFunctionName({ name: null, selector: "0x12345678" })).toBe("0x12345678");
    expect(shortFunctionName({ name: "receive", selector: "receive()" })).toBe("receive");
  });

  it("lays out nodes busiest first, dearest furthest out, sized by calls, with real labels", () => {
    const nodes = layoutNodes(payload().report.functions);
    expect(nodes.map((n) => n.name)).toEqual(["aggregate3", "aggregate3Value"]);
    const [busy, quiet] = nodes;
    expect(busy?.label).toBe("aggregate3 · 19 calls · 1.08¢");
    expect(busy?.rank).toBe("highest");
    expect(busy?.radius).toBeCloseTo(NODE_RADIUS.max);
    expect(busy?.size).toBeCloseTo(NODE_SIZE.max);
    expect(quiet?.rank).toBe("lowest");
    expect(quiet?.radius).toBeCloseTo(NODE_RADIUS.min);
    expect(quiet?.size).toBeGreaterThan(NODE_SIZE.min);
    expect(quiet?.size).toBeLessThan(NODE_SIZE.max);
    expect(busy?.phase).not.toBe(quiet?.phase);
  });

  it("caps the orbit at MAX_NODES and returns nothing for an empty report", () => {
    const many = Array.from({ length: MAX_NODES + 5 }, (_, i) => fn(`0x${i.toString(16).padStart(8, "0")}`, i + 1, String(100 * (i + 1))));
    expect(layoutNodes(many)).toHaveLength(MAX_NODES);
    expect(layoutNodes([])).toEqual([]);
  });

  it("writes the verdict sentence only from report fields", () => {
    expect(verdictSentence(payload().report)).toBe(
      "In the last 1 h, 0xca11…ca11 took 25 direct calls from 8 senders at a median 0.976¢ per call; its source is not verified on Sourcify.",
    );
    const quiet = payload([]);
    quiet.report.activity.directCalls = 0;
    quiet.report.source = { verdict: "pass", match: "exact_match", sourcifyUrl: "https://sourcify.dev/" };
    expect(verdictSentence(quiet.report)).toBe("In the last 1 h, 0xca11…ca11 received no direct calls; its source is verified on Sourcify (exact match).");
  });

  it("returns null without a report and a full summary with one", () => {
    expect(buildObservatory(null)).toBeNull();
    const data = buildObservatory(payload());
    expect(data).toMatchObject({ windowLabel: "1 h", directCalls: 25, uniqueSenders: 8, functionCount: 2, medianLabel: "0.976¢", attestationTx: null });
  });

  it("fills each pipeline stage from the newest report, and only the method without one", () => {
    const stages = pipelineStages(payload());
    expect(stages.map((s) => s.figure)).toEqual([
      "7,101 blocks read",
      "25 transactions",
      "2 functions",
      "0.976¢ median",
      `0xbbbbbbbb…bbbbbb`,
      "not attested yet",
    ]);
    expect(pipelineStages(null).every((s) => s.figure === null && s.method.length > 0)).toBe(true);
  });

  it("prices the documented receipt at 0.440¢", () => {
    expect(documentedReceiptCost()).toBe("0.440¢");
  });

  it("hashes the report identically after the server-to-browser JSON round trip the proof demo relies on", () => {
    const p = payload();
    expect(canonicalHash(p.report)).toBe(canonicalHash(JSON.parse(JSON.stringify(p.report))));
  });
});

describe("chain readout", () => {
  const good = { ok: true, data: { blockNumber: "25920473", baseFeeGwei: "20", timestamp: 1_792_000_000, transferMicroUsd: "420" } };

  it("parses a live reading and labels it", () => {
    const parsed = parseChainResponse(good);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(chainLabels(parsed.reading)).toEqual({ block: "25,920,473", baseFee: "20 gwei", transfer: "0.0420¢" });
  });

  it("reports the server's reason when the readout is down, and rejects malformed bodies", () => {
    expect(parseChainResponse({ ok: false, error: { code: "RPC_UNAVAILABLE", message: "Arc RPC did not answer." } })).toEqual({
      ok: false,
      reason: "Arc RPC did not answer.",
    });
    expect(parseChainResponse({ ok: true, data: { ...good.data, blockNumber: "-1" } }).ok).toBe(false);
    expect(parseChainResponse("<html>").ok).toBe(false);
  });

  it("never shows a negative block age when the visitor's clock is behind", () => {
    expect(blockAgeSeconds(100, 103_900)).toBe(3);
    expect(blockAgeSeconds(100, 90_000)).toBe(0);
  });

  it("validates and lowercases pasted addresses", () => {
    expect(normaliseAddress("  0xCA11bde05977b3631167028862be2a173976ca11 ")).toEqual({ ok: true, address: "0xca11bde05977b3631167028862be2a173976ca11" });
    expect(normaliseAddress("").ok).toBe(false);
    expect(normaliseAddress("ca11bde05977b3631167028862be2a173976ca11")).toEqual({ ok: false, reason: "An Arc address starts with 0x." });
    expect(normaliseAddress("0x1234")).toEqual({ ok: false, reason: "An address is 42 characters; this one is 6." });
    expect(normaliseAddress(`0x${"g".repeat(40)}`).ok).toBe(false);
  });

  it("scrambles only digits and locks them left to right toward the true value", () => {
    expect(scrambleDigits("25,920", 1)).toBe("25,920");
    expect(scrambleDigits("25,920", 0, () => 0)).toBe("00,000");
    expect(scrambleDigits("0.042¢", 0.5, () => 0.99)).toBe("0.099¢");
  });
});

describe("scene maths", () => {
  it("moves outer orbits more slowly than inner ones", () => {
    const inner = orbitPoint(2, 0, 1, 1);
    const outer = orbitPoint(4, 0, 1, 1);
    expect(Math.atan2(inner.z, inner.x)).toBeCloseTo(1);
    expect(Math.atan2(outer.z, outer.x)).toBeCloseTo(0.5);
    expect(Math.hypot(outer.x, outer.z)).toBeCloseTo(4);
  });

  it("projects NDC to CSS pixels with y down", () => {
    expect(ndcToScreen(0, 0, 800, 600)).toEqual({ x: 400, y: 300 });
    expect(ndcToScreen(-1, 1, 800, 600)).toEqual({ x: 0, y: 0 });
    expect(ndcToScreen(1, -1, 800, 600)).toEqual({ x: 800, y: 600 });
    expect(isOnScreen({ x: 801, y: 10 }, 800, 600)).toBe(false);
    expect(isOnScreen({ x: 790, y: 10 }, 800, 600, -8)).toBe(true);
  });

  it("hit-tests the nearest visible node within reach", () => {
    const nodes = [{ x: 100, y: 100 }, null, { x: 120, y: 100 }];
    expect(nearestNode({ x: 115, y: 100 }, nodes, 28)).toBe(2);
    expect(nearestNode({ x: 300, y: 300 }, nodes, 28)).toBeNull();
    expect(nearestNode({ x: 0, y: 0 }, [null], 28)).toBeNull();
  });

  it("steps quality down in order: pixel ratio, then particles, then stops", () => {
    expect(nextQualityStep(SLOW_FRAME_MS, 2, false)).toBe("none");
    expect(nextQualityStep(30, 1.75, false)).toBe("drop-dpr");
    expect(nextQualityStep(30, 1, false)).toBe("halve-particles");
    expect(nextQualityStep(30, 1, true)).toBe("none");
  });

  it("caps the pixel ratio at 1.75 and never below 1", () => {
    expect(cappedDpr(3)).toBe(1.75);
    expect(cappedDpr(0.5)).toBe(1);
  });
});
