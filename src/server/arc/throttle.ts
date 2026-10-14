export type FetchFn = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export interface Clock {
  now: () => number;
  sleep: (ms: number) => Promise<void>;
}

const realClock: Clock = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

/** Number of JSON-RPC calls in a request body: a batch array counts each element. */
export function rpcCallCount(body: BodyInit | null | undefined): number {
  if (typeof body !== "string" || !body.startsWith("[")) return 1;
  try {
    const parsed: unknown = JSON.parse(body);
    return Array.isArray(parsed) ? Math.max(1, parsed.length) : 1;
  } catch {
    // Unparseable bodies are still one HTTP request; count them as one call.
    return 1;
  }
}

/**
 * Token bucket over JSON-RPC calls (not HTTP requests), because Arc's public RPC meters each call in a batch.
 * Measured on 13 Oct 2026: ~500-call bursts pass, sustained 25-call batches at ~115 calls/s never hit 429.
 * Waiters are served strictly in order so large batches cannot starve.
 */
export function createThrottledFetch(callsPerSecond: number, burst: number, inner: FetchFn = fetch, clock: Clock = realClock): FetchFn {
  let tokens = burst;
  let refilledAt = clock.now();
  let queue: Promise<void> = Promise.resolve();

  const refill = (): void => {
    const now = clock.now();
    tokens = Math.min(burst, tokens + ((now - refilledAt) / 1_000) * callsPerSecond);
    refilledAt = now;
  };

  const acquire = async (cost: number): Promise<void> => {
    const needed = Math.min(cost, burst);
    refill();
    while (tokens < needed) {
      await clock.sleep(Math.ceil(((needed - tokens) / callsPerSecond) * 1_000));
      refill();
    }
    tokens -= needed;
  };

  return (input, init) => {
    const turn = queue.then(() => acquire(rpcCallCount(init?.body)));
    queue = turn.catch(() => undefined);
    return turn.then(() => inner(input, init));
  };
}
