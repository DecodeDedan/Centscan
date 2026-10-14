import type { Hex } from "viem";
import { describe, expect, it } from "vitest";
import { formatMicroUsd } from "@/lib/format";
import {
  costWei,
  microUsdToUsdString,
  nearestRank,
  selectorOf,
  summarizeCalls,
  weiToMicroUsd,
  type ObservedCall,
} from "@/server/report/price";

// A real Arc mainnet receipt: 183,288 gas at 24,000,001,249 wei per gas.
const REAL_GAS = 183_288n;
const REAL_PRICE = 24_000_001_249n;

const hash = (n: number): Hex => `0x${n.toString(16).padStart(64, "0")}`;
const sender = (n: number): Hex => `0x${n.toString(16).padStart(40, "0")}`;

function call(overrides: Partial<ObservedCall> & { n: number }): ObservedCall {
  const { n, ...rest } = overrides;
  return {
    hash: hash(n),
    from: sender(1),
    blockNumber: BigInt(1_000 + n),
    input: "0xa9059cbb0000",
    gasUsed: 100_000n,
    effectiveGasPrice: 10n ** 7n, // 100,000 gas × 1e7 wei = 1e12 wei = 1 µ$
    success: true,
    kind: "call",
    ...rest,
  };
}

describe("cost maths", () => {
  it("prices the real receipt at 0.440¢", () => {
    // Act
    const wei = costWei(REAL_GAS, REAL_PRICE);
    const micro = weiToMicroUsd(wei);

    // Assert
    expect(wei).toBe(4_398_912_228_926_712n);
    expect(micro).toBe(4_399n);
    expect(formatMicroUsd(micro)).toBe("0.440¢");
  });

  it("rounds half a micro-dollar up and anything less down", () => {
    expect(weiToMicroUsd(499_999_999_999n)).toBe(0n);
    expect(weiToMicroUsd(500_000_000_000n)).toBe(1n);
    expect(weiToMicroUsd(1_499_999_999_999n)).toBe(1n);
    expect(weiToMicroUsd(0n)).toBe(0n);
  });

  it("stays exact beyond Number precision", () => {
    expect(weiToMicroUsd(10n ** 30n)).toBe(10n ** 18n);
  });

  it.each([
    [0n, "0.000000"],
    [4_399n, "0.004399"],
    [4_399_000n, "4.399000"],
    [12_345_678_901n, "12345.678901"],
  ])("renders %s µ$ as %s USD", (micro, usd) => {
    expect(microUsdToUsdString(micro)).toBe(usd);
  });
});

describe("selectorOf", () => {
  it("takes the first four bytes, lower-cased", () => {
    expect(selectorOf({ input: "0xA9059CBB000000", kind: "call" })).toBe("0xa9059cbb");
  });

  it("treats empty or short calldata as receive()", () => {
    expect(selectorOf({ input: "0x", kind: "call" })).toBe("receive()");
    expect(selectorOf({ input: "0xa9059c", kind: "call" })).toBe("receive()");
  });

  it("labels the creation transaction deploy whatever its init code", () => {
    expect(selectorOf({ input: "0x6080604052", kind: "deploy" })).toBe("deploy");
  });
});

describe("nearestRank", () => {
  const ten = [1n, 2n, 3n, 4n, 5n, 6n, 7n, 8n, 9n, 10n];

  it("returns the nearest-rank median and p90", () => {
    expect(nearestRank(ten, 50)).toBe(5n);
    expect(nearestRank(ten, 90)).toBe(9n);
    expect(nearestRank(ten, 100)).toBe(10n);
    expect(nearestRank(ten, 1)).toBe(1n);
  });

  it("uses ceil(p × n) for odd and tiny inputs", () => {
    expect(nearestRank([1n, 2n, 3n], 50)).toBe(2n);
    expect(nearestRank([1n, 2n, 3n], 90)).toBe(3n);
    expect(nearestRank([7n], 50)).toBe(7n);
    expect(nearestRank([1n, 2n], 50)).toBe(1n);
  });

  it("rejects an empty input or a percentile outside (0, 100]", () => {
    expect(() => nearestRank([], 50)).toThrow(RangeError);
    expect(() => nearestRank(ten, 0)).toThrow(RangeError);
    expect(() => nearestRank(ten, 101)).toThrow(RangeError);
  });
});

describe("summarizeCalls", () => {
  it("returns an empty summary for no calls", () => {
    expect(summarizeCalls([])).toEqual({
      functions: [],
      reverted: { calls: 0, totalMicroUsd: "0" },
      headline: { medianMicroUsd: null, per1000Usd: null },
      successfulCalls: 0,
      uniqueSenders: 0,
      firstSeenBlock: null,
      lastSeenBlock: null,
    });
  });

  it("prices the real receipt as a one-call function", () => {
    // Arrange
    const real = call({ n: 1, gasUsed: REAL_GAS, effectiveGasPrice: REAL_PRICE });

    // Act
    const summary = summarizeCalls([real]);

    // Assert
    expect(summary.functions).toEqual([
      {
        selector: "0xa9059cbb",
        calls: 1,
        medianGas: "183288",
        costMicroUsd: { median: "4399", p90: "4399", min: "4399", max: "4399" },
        sampleTx: real.hash,
      },
    ]);
    expect(summary.headline).toEqual({ medianMicroUsd: "4399", per1000Usd: "4.399000" });
  });

  it("computes per-function nearest-rank median, p90, min, max and median gas", () => {
    // Arrange: ten calls costing 1..10 µ$ (gas 100k..1M at 1e7 wei), shuffled.
    const calls = [7, 3, 10, 1, 9, 2, 8, 4, 6, 5].map((k) => call({ n: k, gasUsed: BigInt(k) * 100_000n }));

    // Act
    const [fn] = summarizeCalls(calls).functions;

    // Assert
    expect(fn).toMatchObject({
      calls: 10,
      medianGas: "500000",
      costMicroUsd: { median: "5", p90: "9", min: "1", max: "10" },
      sampleTx: hash(10),
    });
  });

  it("groups by selector, most-called first, ties by selector", () => {
    // Arrange
    const calls = [
      call({ n: 1, input: "0x095ea7b3aa" }),
      call({ n: 2, input: "0xa9059cbbaa" }),
      call({ n: 3, input: "0xa9059cbbbb" }),
      call({ n: 4, input: "0x" }),
      call({ n: 5, input: "0x23b872dd00" }),
    ];

    // Act
    const selectors = summarizeCalls(calls).functions.map((f) => [f.selector, f.calls]);

    // Assert
    expect(selectors).toEqual([
      ["0xa9059cbb", 2],
      ["0x095ea7b3", 1],
      ["0x23b872dd", 1],
      ["receive()", 1],
    ]);
  });

  it("totals reverted calls separately and keeps them out of the headline", () => {
    // Arrange
    const calls = [
      call({ n: 1, gasUsed: 300_000n }),
      call({ n: 2, gasUsed: 2_000_000n, success: false }),
      call({ n: 3, gasUsed: 5_000_000n, success: false, input: "0xdeadbeef" }),
    ];

    // Act
    const summary = summarizeCalls(calls);

    // Assert
    expect(summary.reverted).toEqual({ calls: 2, totalMicroUsd: "70" });
    expect(summary.functions.map((f) => f.selector)).toEqual(["0xa9059cbb"]);
    expect(summary.headline).toEqual({ medianMicroUsd: "3", per1000Usd: "0.003000" });
    expect(summary.successfulCalls).toBe(1);
  });

  it("has a null headline when every call reverted, but still records activity", () => {
    const summary = summarizeCalls([call({ n: 4, success: false }), call({ n: 2, success: false })]);
    expect(summary.headline).toEqual({ medianMicroUsd: null, per1000Usd: null });
    expect(summary.functions).toEqual([]);
    expect(summary.firstSeenBlock).toBe("1002");
    expect(summary.lastSeenBlock).toBe("1004");
  });

  it("prices the deployment as its own row", () => {
    const summary = summarizeCalls([call({ n: 1, kind: "deploy", input: "0x6080" }), call({ n: 2 })]);
    expect(summary.functions.map((f) => f.selector).sort()).toEqual(["0xa9059cbb", "deploy"]);
  });

  it("counts senders case-insensitively and spans first to last block across all calls", () => {
    // Arrange
    const upper = sender(0xabc).toUpperCase().replace("0X", "0x") as Hex;
    const calls = [
      call({ n: 50, from: sender(0xabc) }),
      call({ n: 7, from: upper, success: false }),
      call({ n: 20, from: sender(2) }),
    ];

    // Act
    const summary = summarizeCalls(calls);

    // Assert
    expect(summary.uniqueSenders).toBe(2);
    expect(summary.firstSeenBlock).toBe("1007");
    expect(summary.lastSeenBlock).toBe("1050");
  });
});
