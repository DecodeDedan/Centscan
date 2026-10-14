import type { Hex } from "viem";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { API_ERROR_CODES, type ApiError } from "@/lib/api";
import { canonicalHash } from "@/lib/canonical";
import { reportSchema, type ProgressEvent } from "@/lib/report";
import { NotAContractError } from "@/server/report/build";
import {
  API_STATUS,
  buildErrorToApi,
  clientIp,
  tryStartBuild,
  consumeRefreshLimit,
  errorResponse,
  getAttestationInfo,
  getCachedReport,
  getRecentReports,
  parseAddressParam,
  rateLimited,
  refreshReport,
  toPayload,
} from "@/server/service";
import { openStore, type Store } from "@/server/store";
import { makeReport, TARGET } from "./helpers/report";
import { loadFixture, rpcHttpFetch, scenarioNumber, scenarioString } from "./helpers/rpc-fixture";

const ADDRESS = "0x3600000000000000000000000000000000000000";
const MIXED = "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed";

describe("parseAddressParam", () => {
  it.each([
    [ADDRESS, ADDRESS],
    [MIXED, MIXED.toLowerCase()],
    [MIXED.toUpperCase().replace("0X", "0x"), MIXED.toLowerCase()],
    [`  ${ADDRESS}\n`, ADDRESS],
    ["0x3%36" + "0".repeat(38), ADDRESS],
    [encodeURIComponent(` ${MIXED} `), MIXED.toLowerCase()],
  ])("accepts %j", (raw, expected) => {
    expect(parseAddressParam(raw)).toBe(expected);
  });

  it.each([
    ["malformed percent-encoding", "%E0%A4%A"],
    ["a lone percent sign", "0x36%"],
    ["too short", "0x1234"],
    ["too long", `${ADDRESS}00`],
    ["no 0x prefix", ADDRESS.slice(2)],
    ["non-hex", `0x${"zz".repeat(20)}`],
    ["an ENS name", "vitalik.eth"],
    ["empty", ""],
  ])("rejects %s", (_label, raw) => {
    expect(parseAddressParam(raw)).toBeNull();
  });
});

describe("clientIp", () => {
  it("takes the last X-Forwarded-For hop, the one the hosting proxy appended", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": " 203.0.113.7 , 10.0.0.1", "x-real-ip": "198.51.100.1" }))).toBe("10.0.0.1");
  });

  it("ignores a forged first hop so rotating it cannot mint new rate-limit keys", () => {
    const forged = (n: number) => new Headers({ "x-forwarded-for": `1.2.3.${n}, 198.51.100.9` });
    expect(clientIp(forged(1))).toBe(clientIp(forged(2)));
  });

  it("falls back to a valid X-Real-IP, then to unknown, rejecting non-IP junk", () => {
    expect(clientIp(new Headers({ "x-real-ip": " 198.51.100.1 " }))).toBe("198.51.100.1");
    expect(clientIp(new Headers({ "x-forwarded-for": "10.0.0.1, not-an-ip", "x-real-ip": "198.51.100.1" }))).toBe("198.51.100.1");
    expect(clientIp(new Headers({ "x-real-ip": "<script>" }))).toBe("unknown");
    expect(clientIp(new Headers())).toBe("unknown");
  });
});

describe("tryStartBuild", () => {
  it("allows three builds at once and frees a slot exactly once per release", () => {
    // Arrange
    const releases = [tryStartBuild(), tryStartBuild(), tryStartBuild()];

    // Act
    const fourth = tryStartBuild();
    releases[0]?.();
    releases[0]?.();
    const afterRelease = tryStartBuild();
    const overCapacity = tryStartBuild();

    // Assert
    expect(releases.every((r) => r !== null)).toBe(true);
    expect(fourth).toBeNull();
    expect(afterRelease).not.toBeNull();
    expect(overCapacity).toBeNull();
    [releases[1], releases[2], afterRelease].forEach((release) => release?.());
  });
});

describe("consumeRefreshLimit", () => {
  let store: Store;

  beforeEach(() => {
    store = openStore(":memory:");
  });

  it("allows one refresh per contract per five minutes", () => {
    // Act
    const first = consumeRefreshLimit(ADDRESS, "203.0.113.7", store);
    const second = consumeRefreshLimit(ADDRESS, "198.51.100.1", store);

    // Assert
    expect(first).toBeNull();
    expect(second).toEqual({
      code: "RATE_LIMITED",
      message: "This contract was refreshed in the last 5 minutes.",
      retryAfterSeconds: 300,
    });
  });

  it("allows 20 refreshes per IP per hour across contracts", () => {
    // Arrange
    const addresses = Array.from({ length: 21 }, (_, i) => `0x${(i + 1).toString(16).padStart(40, "0")}` as Hex);

    // Act
    const results = addresses.map((a) => consumeRefreshLimit(a, "203.0.113.7", store));

    // Assert
    expect(results.slice(0, 20).every((r) => r === null)).toBe(true);
    expect(results[20]).toEqual({
      code: "RATE_LIMITED",
      message: "Too many refreshes from your network. Try again later.",
      retryAfterSeconds: 3600,
    });
  });

  it("does not spend the contract's refresh when the IP is over its limit", () => {
    // Arrange
    for (let i = 0; i < 20; i++) consumeRefreshLimit(`0x${(i + 1).toString(16).padStart(40, "0")}`, "203.0.113.7", store);

    // Act
    const blocked = consumeRefreshLimit(ADDRESS, "203.0.113.7", store);
    const otherIp = consumeRefreshLimit(ADDRESS, "198.51.100.1", store);

    // Assert
    expect(blocked?.code).toBe("RATE_LIMITED");
    expect(otherIp).toBeNull();
  });
});

describe("error mapping", () => {
  it("maps a missing contract to NOT_A_CONTRACT and anything else to RPC_UNAVAILABLE", () => {
    expect(buildErrorToApi(new NotAContractError(ADDRESS))).toEqual({ code: "NOT_A_CONTRACT", message: "Not a contract on Arc mainnet." });
    for (const error of [new Error("secret internal detail"), "string", null]) {
      expect(buildErrorToApi(error)).toEqual({ code: "RPC_UNAVAILABLE", message: "Arc RPC did not answer in time. Try again in a minute." });
    }
  });

  it("rounds a rate-limit wait up to whole seconds, at least one", () => {
    expect(rateLimited(1, "m").retryAfterSeconds).toBe(1);
    expect(rateLimited(0, "m").retryAfterSeconds).toBe(1);
    expect(rateLimited(1_001, "m").retryAfterSeconds).toBe(2);
    expect(rateLimited(300_000, "m")).toEqual({ code: "RATE_LIMITED", message: "m", retryAfterSeconds: 300 });
  });

  it("has an HTTP status for every API error code", () => {
    expect(Object.keys(API_STATUS).sort()).toEqual([...API_ERROR_CODES].sort());
  });

  it.each([
    ["INVALID_ADDRESS", 400],
    ["INVALID_WINDOW", 400],
    ["NOT_A_CONTRACT", 404],
    ["NOT_FOUND", 404],
    ["RATE_LIMITED", 429],
    ["RPC_UNAVAILABLE", 503],
    ["ATTEST_DISABLED", 503],
    ["REPORT_TOO_OLD", 409],
    ["STALE_WINDOW", 409],
    ["ATTESTER_UNFUNDED", 503],
    ["INTERNAL", 500],
  ] as const)("answers %s with HTTP %i, uncached, in the error envelope", async (code, status) => {
    // Arrange
    const error: ApiError = { code, message: "msg" };

    // Act
    const res = errorResponse(error);

    // Assert
    expect(res.status).toBe(status);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("retry-after")).toBeNull();
    await expect(res.json()).resolves.toEqual({ ok: false, error });
  });

  it("sets Retry-After on rate-limit responses", () => {
    const res = errorResponse(rateLimited(42_000, "slow down"));
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("42");
  });
});

describe("toPayload", () => {
  it("attaches the attestation for the report hash when there is one", () => {
    // Arrange
    const store = openStore(":memory:");
    const report = makeReport();
    const reportHash = canonicalHash(report);
    const stored = { report, reportHash, createdAt: "2026-10-14T12:00:00.000Z" };
    const attestation = {
      reportHash,
      txHash: `0x${"12".repeat(32)}` as Hex,
      attester: `0x${"ee".repeat(20)}` as Hex,
      blockNumber: 25_920_600,
      createdAt: "2026-10-14T12:01:00.000Z",
    };

    // Act
    const before = toPayload(stored, store);
    store.saveAttestation(TARGET, attestation);
    const after = toPayload(stored, store);

    // Assert
    expect(before).toEqual({ ...stored, attestation: null });
    expect(after.attestation).toEqual(attestation);
  });
});

describe("report service against recorded Arc mainnet traffic", () => {
  const fx = loadFixture("build.json");
  const target = scenarioString(fx, "target") as Hex;
  const eoa = scenarioString(fx, "eoa") as Hex;
  const sourcify = "https://sourcify.test/server";
  const signatureDb = "https://openchain.test/signature-database/v1";
  const registry = "0x00000000000000000000000000000000000000Aa";
  const attester = "0x00000000000000000000000000000000000000Bb";
  const network = rpcHttpFetch(fx, (url) => {
    if (url.startsWith(sourcify)) return Response.json({ match: "match", abi: [] });
    if (url.startsWith(signatureDb)) return Response.json({ ok: true, result: { function: {} } });
    return undefined;
  });

  beforeAll(() => {
    // Config is read from process.env exactly as in production; only the network is replaced.
    const env: Record<string, string> = {
      ARC_RPC_URL: fx.rpcUrl,
      ARC_CHAIN_ID: "5042",
      DATABASE_PATH: ":memory:",
      SOURCIFY_URL: sourcify,
      SIGNATURE_DB_URL: signatureDb,
      REGISTRY_ADDRESS: registry,
      ATTESTER_ADDRESS: attester,
      ATTESTER_PRIVATE_KEY: "",
      RPC_MAX_CALLS_PER_SECOND: "10000",
      RPC_BURST: "10000",
      SCAN_FALLBACK_BLOCKS: String(scenarioNumber(fx, "fallbackBlocks")),
      MAX_TXS_PER_REPORT: String(scenarioNumber(fx, "maxTxs")),
    };
    for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
    vi.stubGlobal("fetch", network.fetch);
  });

  afterAll(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("has nothing cached before the first build", () => {
    expect(getCachedReport(target, 1)).toBeNull();
    expect(getRecentReports(5)).toEqual([]);
  });

  it("builds, hashes, stores and then serves a report", async () => {
    // Arrange
    const progress: ProgressEvent[] = [];

    // Act
    const payload = await refreshReport(target, 1, { onProgress: (e) => progress.push(e) });
    const cached = getCachedReport(target, 1);

    // Assert
    expect(reportSchema.parse(payload.report)).toEqual(payload.report);
    expect(payload.report.target).toBe(target);
    expect(payload.report.window.toBlock).toBe(scenarioString(fx, "toBlock"));
    expect(payload.report.source).toMatchObject({ verdict: "pass", match: "match" });
    expect(payload.reportHash).toBe(canonicalHash(payload.report));
    expect(payload.attestation).toBeNull();
    expect(cached).toEqual(payload);
    expect(getCachedReport(target, 24)).toBeNull();
    expect(getRecentReports(5)).toEqual([payload]);
    expect(progress.map((e) => e.step)).toContain("transactions");
    expect(network.replay.requests[0]?.method).toBe("eth_chainId");
  });

  it("surfaces a non-contract as NotAContractError", async () => {
    await expect(refreshReport(eoa, 1)).rejects.toBeInstanceOf(NotAContractError);
  });

  it("exposes the attestation settings without a signing key", () => {
    expect(getAttestationInfo()).toEqual({ registry: registry.toLowerCase(), attester: attester.toLowerCase(), canAttest: false });
  });
});
