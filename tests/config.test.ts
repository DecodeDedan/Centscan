import { afterEach, describe, expect, it, vi } from "vitest";
import { getAttestationConfig, getConfig } from "@/server/config";

const REQUIRED = {
  ARC_RPC_URL: "https://rpc.mainnet.arc.io",
  ARC_CHAIN_ID: "5042",
  DATABASE_PATH: "./data/centscan.db",
  SOURCIFY_URL: "https://sourcify.dev/server",
  SIGNATURE_DB_URL: "https://api.openchain.xyz/signature-database/v1",
} as const;

const REGISTRY = "0xAbCdEf0000000000000000000000000000000001";
const ATTESTER = "0x00000000000000000000000000000000000000Ff";
const KEY = `0x${"a1".repeat(32)}`;

/** Next.js types NODE_ENV as required on ProcessEnv; the schema ignores it. */
const configFrom = (vars: Record<string, string>): ReturnType<typeof getConfig> => getConfig({ NODE_ENV: "test", ...vars });

describe("getConfig", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("applies documented defaults to a minimal environment", () => {
    // Act
    const config = configFrom({ ...REQUIRED });

    // Assert
    expect(config).toEqual({
      ...REQUIRED,
      ARC_CHAIN_ID: 5042,
      RPC_MAX_CALLS_PER_SECOND: 10,
      RPC_BURST: 25,
      SCAN_FALLBACK_BLOCKS: 300,
      MAX_TXS_PER_REPORT: 150,
      LOG_LEVEL: "info",
    });
  });

  it("coerces numbers, lower-cases addresses and keeps the key", () => {
    // Act
    const config = configFrom({
      ...REQUIRED,
      REGISTRY_ADDRESS: REGISTRY,
      ATTESTER_ADDRESS: ATTESTER,
      ATTESTER_PRIVATE_KEY: KEY,
      RPC_MAX_CALLS_PER_SECOND: "200",
      RPC_BURST: "400",
      SCAN_FALLBACK_BLOCKS: "100",
      MAX_TXS_PER_REPORT: "2000",
      LOG_LEVEL: "debug",
    });

    // Assert
    expect(config).toMatchObject({
      REGISTRY_ADDRESS: REGISTRY.toLowerCase(),
      ATTESTER_ADDRESS: ATTESTER.toLowerCase(),
      ATTESTER_PRIVATE_KEY: KEY,
      RPC_MAX_CALLS_PER_SECOND: 200,
      RPC_BURST: 400,
      SCAN_FALLBACK_BLOCKS: 100,
      MAX_TXS_PER_REPORT: 2000,
      LOG_LEVEL: "debug",
    });
  });

  it("treats blank optional values as unset, as .env.example ships them", () => {
    const config = configFrom({ ...REQUIRED, REGISTRY_ADDRESS: "", ATTESTER_ADDRESS: "  ", ATTESTER_PRIVATE_KEY: "" });
    expect(config.REGISTRY_ADDRESS).toBeUndefined();
    expect(config.ATTESTER_ADDRESS).toBeUndefined();
    expect(config.ATTESTER_PRIVATE_KEY).toBeUndefined();
  });

  it("lists every problem in one error", () => {
    // Act
    const run = (): unknown => configFrom({ ARC_CHAIN_ID: "1", DATABASE_PATH: "", REGISTRY_ADDRESS: "0x123", MAX_TXS_PER_REPORT: "5" });

    // Assert
    expect(run).toThrow(/^Invalid configuration: /);
    const message = (() => {
      try {
        run();
        return "";
      } catch (error) {
        return (error as Error).message;
      }
    })();
    for (const field of ["ARC_RPC_URL", "ARC_CHAIN_ID", "DATABASE_PATH", "SOURCIFY_URL", "SIGNATURE_DB_URL", "REGISTRY_ADDRESS", "MAX_TXS_PER_REPORT"]) {
      expect(message).toContain(`${field}:`);
    }
    expect(message).toContain("must be 5042 (Arc mainnet)");
  });

  it.each([
    ["a malformed private key", { ATTESTER_PRIVATE_KEY: "0x1234" }],
    ["an unknown log level", { LOG_LEVEL: "verbose" }],
    ["a zero rate", { RPC_MAX_CALLS_PER_SECOND: "0" }],
    ["a fallback scan past the cap", { SCAN_FALLBACK_BLOCKS: "50001" }],
    ["a non-URL RPC", { ARC_RPC_URL: "rpc.mainnet.arc.io" }],
  ])("rejects %s", (_label, override) => {
    expect(() => configFrom({ ...REQUIRED, ...override })).toThrow(/^Invalid configuration: /);
  });

  it("parses process.env once and reuses the result", () => {
    // Arrange
    for (const [key, value] of Object.entries(REQUIRED)) vi.stubEnv(key, value);

    // Act
    const first = getConfig();
    vi.stubEnv("MAX_TXS_PER_REPORT", "999");
    const second = getConfig();

    // Assert
    expect(second).toBe(first);
    expect(second.MAX_TXS_PER_REPORT).toBe(150);
  });
});

describe("getAttestationConfig", () => {
  it("is null until both registry and attester are configured", () => {
    expect(getAttestationConfig(configFrom({ ...REQUIRED }))).toBeNull();
    expect(getAttestationConfig(configFrom({ ...REQUIRED, REGISTRY_ADDRESS: REGISTRY }))).toBeNull();
    expect(getAttestationConfig(configFrom({ ...REQUIRED, ATTESTER_ADDRESS: ATTESTER }))).toBeNull();
  });

  it("returns lower-cased addresses with or without a signing key", () => {
    const readOnly = getAttestationConfig(configFrom({ ...REQUIRED, REGISTRY_ADDRESS: REGISTRY, ATTESTER_ADDRESS: ATTESTER }));
    expect(readOnly).toEqual({ registry: REGISTRY.toLowerCase(), attester: ATTESTER.toLowerCase(), privateKey: undefined });

    const signing = getAttestationConfig(
      configFrom({ ...REQUIRED, REGISTRY_ADDRESS: REGISTRY, ATTESTER_ADDRESS: ATTESTER, ATTESTER_PRIVATE_KEY: KEY }),
    );
    expect(signing?.privateKey).toBe(KEY);
  });
});
