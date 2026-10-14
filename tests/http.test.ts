import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { fetchJson, HttpError, type FetchLike } from "@/server/http";

const URL_ = "https://api.example.test/thing";
const schema = z.object({ ok: z.boolean() });

const json = (body: unknown, status = 200): Response => Response.json(body, { status });
const status = (code: number): Response => new Response(null, { status: code });

/** Never answers until its signal aborts, like a server that hangs. */
const hanging: FetchLike = (_url, init) =>
  new Promise((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
  });

describe("fetchJson", () => {
  beforeEach(() => {
    // Full-jitter backoff draws from Math.random; zero makes every backoff immediate.
    vi.spyOn(Math, "random").mockReturnValue(0);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns parsed data and status, asking for JSON", async () => {
    // Arrange
    const fetchImpl = vi.fn<FetchLike>(async () => json({ ok: true, extra: 1 }));

    // Act
    const result = await fetchJson(URL_, schema, { fetchImpl });

    // Assert
    expect(result).toEqual({ status: 200, data: { ok: true } });
    expect(fetchImpl).toHaveBeenCalledOnce();
    const init = fetchImpl.mock.calls[0]?.[1];
    expect(init?.headers).toEqual({ accept: "application/json" });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("treats an accepted status as an answer with no data", async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => status(404));
    await expect(fetchJson(URL_, schema, { fetchImpl, acceptStatus: [404] })).resolves.toEqual({ status: 404, data: null });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("fails at once on a non-retryable status", async () => {
    // Arrange
    const fetchImpl = vi.fn<FetchLike>(async () => status(404));

    // Act
    const error = await fetchJson(URL_, schema, { fetchImpl }).catch((e: unknown) => e);

    // Assert
    expect(error).toBeInstanceOf(HttpError);
    expect(error).toMatchObject({ status: 404, url: URL_, message: "HTTP 404 from api.example.test" });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it.each([408, 425, 429, 500, 502, 503, 504])("retries status %i and then succeeds", async (code) => {
    const fetchImpl = vi.fn<FetchLike>().mockResolvedValueOnce(status(code)).mockResolvedValueOnce(json({ ok: true }));
    await expect(fetchJson(URL_, schema, { fetchImpl })).resolves.toEqual({ status: 200, data: { ok: true } });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("gives up after the retry budget with the last HTTP error", async () => {
    // Arrange
    const fetchImpl = vi.fn<FetchLike>(async () => status(503));

    // Act
    const error = await fetchJson(URL_, schema, { fetchImpl, retries: 2 }).catch((e: unknown) => e);

    // Assert
    expect(error).toBeInstanceOf(HttpError);
    expect(error).toMatchObject({ status: 503 });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("retries network errors", async () => {
    const fetchImpl = vi.fn<FetchLike>().mockRejectedValueOnce(new TypeError("fetch failed")).mockResolvedValueOnce(json({ ok: false }));
    await expect(fetchJson(URL_, schema, { fetchImpl })).resolves.toEqual({ status: 200, data: { ok: false } });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("wraps a non-Error rejection once retries are exhausted", async () => {
    const fetchImpl = vi.fn<FetchLike>(() => Promise.reject("socket hang up"));
    await expect(fetchJson(URL_, schema, { fetchImpl, retries: 1 })).rejects.toThrow(new Error("socket hang up"));
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("does not retry a response that fails the schema", async () => {
    // Arrange
    const fetchImpl = vi.fn<FetchLike>(async () => json({ ok: "yes" }));

    // Act
    const error = await fetchJson(URL_, schema, { fetchImpl }).catch((e: unknown) => e);

    // Assert
    expect(error).toBeInstanceOf(z.ZodError);
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("times out a hanging request on every attempt", async () => {
    // Arrange
    const fetchImpl = vi.fn<FetchLike>(hanging);

    // Act
    const error = await fetchJson(URL_, schema, { fetchImpl, timeoutMs: 5, retries: 1 }).catch((e: unknown) => e);

    // Assert
    expect(error).toMatchObject({ name: "TimeoutError" });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("backs off exponentially from the base delay", async () => {
    // Arrange
    vi.spyOn(Math, "random").mockReturnValue(1);
    const timeout = vi.spyOn(globalThis, "setTimeout");
    const fetchImpl = vi.fn<FetchLike>(async () => status(503));

    // Act
    await fetchJson(URL_, schema, { fetchImpl, retries: 3, baseDelayMs: 2 }).catch(() => undefined);

    // Assert
    const delays = timeout.mock.calls.map(([, ms]) => ms).filter((ms) => ms === 2 || ms === 4 || ms === 8);
    expect(delays).toEqual([2, 4, 8]);
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  it("does not call fetch when the caller already aborted", async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => json({ ok: true }));
    const signal = AbortSignal.abort(new Error("client gone"));
    await expect(fetchJson(URL_, schema, { fetchImpl, signal })).rejects.toThrow("client gone");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("stops an in-flight request when the caller aborts, without retrying", async () => {
    // Arrange
    const controller = new AbortController();
    const fetchImpl = vi.fn<FetchLike>((url, init) => {
      setTimeout(() => controller.abort(new Error("client gone")), 1);
      return hanging(url, init);
    });

    // Act
    const pending = fetchJson(URL_, schema, { fetchImpl, signal: controller.signal });

    // Assert
    await expect(pending).rejects.toThrow("client gone");
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("cancels the backoff sleep when the caller aborts", async () => {
    // Arrange
    vi.spyOn(Math, "random").mockReturnValue(1);
    const controller = new AbortController();
    const fetchImpl = vi.fn<FetchLike>(async () => {
      setTimeout(() => controller.abort(new Error("client gone")), 5);
      return status(503);
    });
    const started = Date.now();

    // Act
    const error = await fetchJson(URL_, schema, { fetchImpl, signal: controller.signal, baseDelayMs: 5_000 }).catch((e: unknown) => e);

    // Assert
    expect(error).toEqual(new Error("client gone"));
    expect(Date.now() - started).toBeLessThan(2_000);
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("skips the backoff sleep when the caller aborted before it started", async () => {
    // Arrange: abort lands while the failing response is being handled, before the sleep begins.
    vi.spyOn(Math, "random").mockReturnValue(1);
    const controller = new AbortController();
    const fetchImpl = vi.fn<FetchLike>(async () => {
      controller.abort(new Error("client gone"));
      return status(503);
    });
    const started = Date.now();

    // Act
    const error = await fetchJson(URL_, schema, { fetchImpl, signal: controller.signal, baseDelayMs: 5_000 }).catch((e: unknown) => e);

    // Assert
    expect(error).toEqual(new Error("client gone"));
    expect(Date.now() - started).toBeLessThan(1_000);
    expect(fetchImpl).toHaveBeenCalledOnce();
  });
});
