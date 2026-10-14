import { toFunctionSelector } from "viem";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FetchLike } from "@/server/http";
import { getSourceStatus, sourcifyLookupUrl } from "@/server/sourcify";

const BASE = "https://sourcify.test/server";
const ADDRESS = `0x${"ab".repeat(20)}`;
const opts = (fetchImpl: FetchLike, signal?: AbortSignal) => ({ baseUrl: BASE, chainId: 5042, fetchImpl, signal });

const ABI = [
  { type: "constructor", inputs: [{ name: "owner", type: "address" }] },
  { type: "function", name: "transfer", inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }], outputs: [] },
  {
    type: "function",
    name: "submit",
    inputs: [
      {
        name: "orders",
        type: "tuple[]",
        components: [
          { name: "maker", type: "address" },
          { name: "legs", type: "tuple", components: [{ name: "id", type: "uint256" }, { name: "data", type: "bytes" }] },
        ],
      },
    ],
  },
  { type: "function", name: "pause" },
  { type: "event", name: "Transfer", inputs: [{ name: "from", type: "address", indexed: true }] },
  { type: "function" },
];

describe("getSourceStatus", () => {
  beforeEach(() => {
    vi.spyOn(Math, "random").mockReturnValue(0);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("asks Sourcify v2 for the ABI of the contract on this chain", async () => {
    // Arrange
    const fetchImpl = vi.fn<FetchLike>(async () => Response.json({ match: null }));

    // Act
    await getSourceStatus(ADDRESS, opts(fetchImpl));

    // Assert
    expect(fetchImpl.mock.calls[0]?.[0]).toBe(`${BASE}/v2/contract/5042/${ADDRESS}?fields=abi`);
  });

  it("passes an exact match and names every function in the ABI, tuples included", async () => {
    // Arrange
    const fetchImpl = vi.fn<FetchLike>(async () => Response.json({ match: "exact_match", abi: ABI, extra: "ignored" }));

    // Act
    const status = await getSourceStatus(ADDRESS, opts(fetchImpl));

    // Assert
    expect(status.verdict).toBe("pass");
    expect(status.match).toBe("exact_match");
    expect(status.sourcifyUrl).toBe(`https://sourcify.dev/#/lookup/${ADDRESS}`);
    expect(Object.fromEntries(status.abiNames)).toEqual({
      "0xa9059cbb": "transfer(address,uint256)",
      [toFunctionSelector("submit((address,(uint256,bytes))[])")]: "submit((address,(uint256,bytes))[])",
      [toFunctionSelector("pause()")]: "pause()",
    });
  });

  it("passes a partial match with an empty name map when the ABI is missing", async () => {
    const status = await getSourceStatus(ADDRESS, opts(async () => Response.json({ match: "match", abi: null })));
    expect(status).toMatchObject({ verdict: "pass", match: "match" });
    expect(status.abiNames.size).toBe(0);
  });

  it("fails an unverified contract", async () => {
    const status = await getSourceStatus(ADDRESS, opts(async () => Response.json({ match: null })));
    expect(status).toMatchObject({ verdict: "fail", match: null });
  });

  it("fails a contract Sourcify has never seen (404)", async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => new Response(null, { status: 404 }));
    const status = await getSourceStatus(ADDRESS, opts(fetchImpl));
    expect(status).toMatchObject({ verdict: "fail", match: null });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it.each([
    ["the network is down", (): Promise<Response> => Promise.reject(new TypeError("fetch failed"))],
    ["Sourcify keeps answering 503", async (): Promise<Response> => new Response(null, { status: 503 })],
    ["Sourcify returns an unexpected body", async (): Promise<Response> => Response.json({ match: "partial" })],
    ["Sourcify rejects the request", async (): Promise<Response> => new Response(null, { status: 400 })],
  ])("reports unknown, never fail, when %s", async (_label, impl) => {
    const status = await getSourceStatus(ADDRESS, opts(impl));
    expect(status).toEqual({ verdict: "unknown", match: null, sourcifyUrl: sourcifyLookupUrl(ADDRESS), abiNames: new Map() });
  });

  it("propagates cancellation instead of reporting unknown", async () => {
    const signal = AbortSignal.abort(new Error("client gone"));
    await expect(getSourceStatus(ADDRESS, opts(async () => Response.json({ match: null }), signal))).rejects.toThrow("client gone");
  });
});
