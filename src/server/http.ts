import type { z } from "zod";

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export class HttpError extends Error {
  constructor(
    readonly url: string,
    readonly status: number,
  ) {
    super(`HTTP ${status} from ${new URL(url).host}`);
    this.name = "HttpError";
  }
}

export interface FetchJsonOptions {
  fetchImpl?: FetchLike;
  timeoutMs?: number;
  retries?: number;
  baseDelayMs?: number;
  signal?: AbortSignal;
  /** Status codes that are an answer, not a failure (e.g. 404 = "not found"). */
  acceptStatus?: readonly number[];
}

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

const sleep = (ms: number, signal?: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(signal.reason);
    }, { once: true });
  });

/** GET a JSON document with timeout, retry (exponential backoff + full jitter) and schema validation. */
export async function fetchJson<S extends z.ZodType>(
  url: string,
  schema: S,
  { fetchImpl = fetch, timeoutMs = 8_000, retries = 3, baseDelayMs = 250, signal, acceptStatus = [] }: FetchJsonOptions = {},
): Promise<{ status: number; data: z.infer<S> | null }> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    signal?.throwIfAborted();
    try {
      const timeout = AbortSignal.timeout(timeoutMs);
      const res = await fetchImpl(url, {
        headers: { accept: "application/json" },
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      });
      if (acceptStatus.includes(res.status)) return { status: res.status, data: null };
      if (!res.ok) {
        lastError = new HttpError(url, res.status);
        if (!RETRYABLE_STATUS.has(res.status)) throw lastError;
      } else {
        return { status: res.status, data: schema.parse(await res.json()) };
      }
    } catch (error) {
      if (signal?.aborted) throw error;
      if (error instanceof HttpError && !RETRYABLE_STATUS.has(error.status)) throw error;
      if (error instanceof Error && error.name === "ZodError") throw error;
      lastError = error;
    }
    if (attempt < retries) await sleep(Math.random() * baseDelayMs * 2 ** attempt, signal);
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
