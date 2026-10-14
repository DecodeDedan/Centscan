import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FetchLike } from "@/server/http";
import { resolveNames } from "@/server/report/names";

const DB = "https://openchain.test/signature-database/v1";
const TRANSFER = "0xa9059cbb";
const APPROVE = "0x095ea7b3";
const UNKNOWN = "0xdeadbeef";

/** Answers lookups the way openchain does: every requested selector is a key, unmatched ones are null or []. */
function signatureDb(known: Record<string, string>): ReturnType<typeof vi.fn<FetchLike>> {
  return vi.fn<FetchLike>(async (url) => {
    const requested = new URL(url).searchParams.get("function")?.split(",") ?? [];
    const fn = Object.fromEntries(requested.map((s) => [s, known[s] ? [{ name: known[s] }, { name: "collision()" }] : null]));
    return Response.json({ ok: true, result: { event: {}, function: fn } });
  });
}

describe("resolveNames", () => {
  beforeEach(() => {
    vi.spyOn(Math, "random").mockReturnValue(0);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("names receive() and deploy without any lookup", async () => {
    // Arrange
    const fetchImpl = signatureDb({});

    // Act
    const names = await resolveNames(["receive()", "deploy"], new Map(), { signatureDbUrl: DB, fetchImpl });

    // Assert
    expect(Object.fromEntries(names)).toEqual({
      "receive()": { name: "receive()", source: null },
      deploy: { name: "deploy (contract creation)", source: null },
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("prefers the verified ABI and asks the signature DB only for the rest", async () => {
    // Arrange
    const fetchImpl = signatureDb({ [APPROVE]: "approve(address,uint256)" });
    const abi = new Map([[TRANSFER, "transfer(address,uint256)"]]);

    // Act
    const names = await resolveNames([TRANSFER, APPROVE, UNKNOWN], abi, { signatureDbUrl: DB, fetchImpl });

    // Assert
    expect(Object.fromEntries(names)).toEqual({
      [TRANSFER]: { name: "transfer(address,uint256)", source: "abi" },
      [APPROVE]: { name: "approve(address,uint256)", source: "signature-db" },
      [UNKNOWN]: { name: null, source: null },
    });
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(fetchImpl.mock.calls[0]?.[0]).toBe(`${DB}/lookup?function=${APPROVE},${UNKNOWN}&filter=true`);
  });

  it("matches signature DB keys case-insensitively", async () => {
    const fetchImpl = vi.fn<FetchLike>(async () =>
      Response.json({ ok: true, result: { function: { "0xA9059CBB": [{ name: "transfer(address,uint256)" }] } } }),
    );
    const names = await resolveNames([TRANSFER], new Map(), { signatureDbUrl: DB, fetchImpl });
    expect(names.get(TRANSFER)).toEqual({ name: "transfer(address,uint256)", source: "signature-db" });
  });

  it("looks up selectors in chunks of 50", async () => {
    // Arrange
    const selectors = Array.from({ length: 120 }, (_, i) => `0x${i.toString(16).padStart(8, "0")}`);
    const fetchImpl = signatureDb({ [selectors[119] as string]: "last()" });

    // Act
    const names = await resolveNames(selectors, new Map(), { signatureDbUrl: DB, fetchImpl });

    // Assert
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    const sizes = fetchImpl.mock.calls.map(([url]) => new URL(url).searchParams.get("function")?.split(",").length);
    expect(sizes).toEqual([50, 50, 20]);
    expect(names.get(selectors[119] as string)).toEqual({ name: "last()", source: "signature-db" });
    expect(names.size).toBe(120);
  });

  it("leaves selectors unnamed when the DB answers ok: false", async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => Response.json({ ok: false, result: { function: {} } }));
    const names = await resolveNames([UNKNOWN], new Map(), { signatureDbUrl: DB, fetchImpl });
    expect(names.get(UNKNOWN)).toEqual({ name: null, source: null });
  });

  it.each([
    ["is unreachable", (): Promise<Response> => Promise.reject(new TypeError("fetch failed"))],
    ["is down", async (): Promise<Response> => new Response(null, { status: 503 })],
    ["returns garbage", async (): Promise<Response> => Response.json({ nope: true })],
  ])("falls back to raw selectors when the DB %s", async (_label, impl) => {
    // Arrange
    const abi = new Map([[TRANSFER, "transfer(address,uint256)"]]);

    // Act
    const names = await resolveNames([TRANSFER, UNKNOWN], abi, { signatureDbUrl: DB, fetchImpl: impl });

    // Assert
    expect(names.get(TRANSFER)).toEqual({ name: "transfer(address,uint256)", source: "abi" });
    expect(names.get(UNKNOWN)).toEqual({ name: null, source: null });
  });

  it("propagates cancellation instead of degrading", async () => {
    const signal = AbortSignal.abort(new Error("client gone"));
    await expect(resolveNames([UNKNOWN], new Map(), { signatureDbUrl: DB, fetchImpl: signatureDb({}), signal })).rejects.toThrow(
      "client gone",
    );
  });
});
