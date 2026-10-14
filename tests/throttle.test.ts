import { describe, expect, it, vi } from "vitest";
import { createThrottledFetch, rpcCallCount, type Clock, type FetchFn } from "@/server/arc/throttle";

interface FakeClock extends Clock {
  advance: (ms: number) => void;
  sleeps: number[];
}

/** Virtual time: sleeping advances the clock instantly and records the requested delay. */
function fakeClock(): FakeClock {
  let t = 0;
  const sleeps: number[] = [];
  return {
    sleeps,
    now: () => t,
    advance: (ms) => {
      t += ms;
    },
    sleep: async (ms) => {
      sleeps.push(ms);
      t += ms;
    },
  };
}

const batch = (n: number): RequestInit => ({
  method: "POST",
  body: JSON.stringify(Array.from({ length: n }, (_, i) => ({ jsonrpc: "2.0", id: i, method: "eth_blockNumber", params: [] }))),
});
const single: RequestInit = { method: "POST", body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }) };

function innerFetch(): ReturnType<typeof vi.fn<FetchFn>> {
  return vi.fn<FetchFn>(async () => new Response("{}"));
}

describe("rpcCallCount", () => {
  it.each([
    ["a single request object", single.body, 1],
    ["a batch of 3", batch(3).body, 3],
    ["an empty batch", "[]", 1],
    ["an unparseable batch", "[{", 1],
    ["no body", undefined, 1],
    ["null", null, 1],
    ["a non-string body", new URLSearchParams("a=1"), 1],
  ])("counts %s as %i", (_label, body, expected) => {
    expect(rpcCallCount(body)).toBe(expected);
  });
});

describe("createThrottledFetch", () => {
  it("lets a full burst through without waiting", async () => {
    // Arrange
    const clock = fakeClock();
    const inner = innerFetch();
    const throttled = createThrottledFetch(10, 5, inner, clock);

    // Act
    for (let i = 0; i < 5; i++) await throttled("https://rpc.test", single);

    // Assert
    expect(inner).toHaveBeenCalledTimes(5);
    expect(clock.sleeps).toEqual([]);
  });

  it("charges every call in a batch and waits for the refill", async () => {
    // Arrange
    const clock = fakeClock();
    const inner = innerFetch();
    const throttled = createThrottledFetch(10, 5, inner, clock);

    // Act: a 3-call batch leaves 2 tokens, so the next 3-call batch waits for 1 token (100 ms at 10/s).
    await throttled("https://rpc.test", batch(3));
    await throttled("https://rpc.test", batch(3));

    // Assert
    expect(clock.sleeps).toEqual([100]);
    expect(inner).toHaveBeenCalledTimes(2);
  });

  it("caps a batch larger than the burst at the burst size", async () => {
    // Arrange
    const clock = fakeClock();
    const throttled = createThrottledFetch(10, 5, innerFetch(), clock);

    // Act
    await throttled("https://rpc.test", batch(30));
    await throttled("https://rpc.test", batch(30));

    // Assert: the first drains the bucket, the second waits for a full refill of 5 tokens.
    expect(clock.sleeps).toEqual([500]);
  });

  it("refills from elapsed time, up to the burst", async () => {
    // Arrange
    const clock = fakeClock();
    const throttled = createThrottledFetch(10, 5, innerFetch(), clock);
    await throttled("https://rpc.test", batch(5));

    // Act
    clock.advance(10_000);
    await throttled("https://rpc.test", batch(5));
    await throttled("https://rpc.test", single);

    // Assert: 10 s refills only to the burst of 5, so the third call waits 100 ms.
    expect(clock.sleeps).toEqual([100]);
  });

  it("serves concurrent callers strictly in arrival order", async () => {
    // Arrange
    const clock = fakeClock();
    const inner = innerFetch();
    const throttled = createThrottledFetch(10, 2, inner, clock);

    // Act
    await Promise.all([
      throttled("https://rpc.test/a", batch(2)),
      throttled("https://rpc.test/b", batch(2)),
      throttled("https://rpc.test/c", single),
    ]);

    // Assert
    expect(inner.mock.calls.map(([url]) => url)).toEqual(["https://rpc.test/a", "https://rpc.test/b", "https://rpc.test/c"]);
    expect(clock.sleeps).toEqual([200, 100]);
  });

  it("keeps serving after the inner fetch fails", async () => {
    // Arrange
    const clock = fakeClock();
    const inner = vi.fn<FetchFn>().mockRejectedValueOnce(new TypeError("fetch failed")).mockResolvedValue(new Response("{}"));
    const throttled = createThrottledFetch(10, 5, inner, clock);

    // Act
    const first = throttled("https://rpc.test", single);
    const second = throttled("https://rpc.test", single);

    // Assert
    await expect(first).rejects.toThrow("fetch failed");
    await expect(second).resolves.toBeInstanceOf(Response);
  });

  it("rejects the waiting call when sleeping fails, and the queue moves on", async () => {
    // Arrange
    const clock = fakeClock();
    const failingSleep = vi.fn<Clock["sleep"]>().mockRejectedValueOnce(new Error("timer cancelled")).mockImplementation(clock.sleep);
    const inner = innerFetch();
    const throttled = createThrottledFetch(10, 1, inner, { now: clock.now, sleep: failingSleep });
    await throttled("https://rpc.test", single);

    // Act
    const blocked = throttled("https://rpc.test/blocked", single);
    const next = throttled("https://rpc.test/next", single);

    // Assert
    await expect(blocked).rejects.toThrow("timer cancelled");
    await expect(next).resolves.toBeInstanceOf(Response);
    expect(inner.mock.calls.map(([url]) => url)).toEqual(["https://rpc.test", "https://rpc.test/next"]);
  });

  it("uses the real clock and global fetch by default", async () => {
    // Arrange
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}"));
    const throttled = createThrottledFetch(1_000, 10);

    // Act
    const res = await throttled("https://rpc.test", single);

    // Assert
    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledOnce();
    fetchSpy.mockRestore();
  });
});
