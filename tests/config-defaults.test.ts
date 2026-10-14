import { describe, expect, it, vi } from "vitest";
import { getConfig, PUBLIC_DEFAULTS, withDefaults } from "@/server/config";
import { readOrFallback } from "@/server/service";

/** Next types ProcessEnv with a required NODE_ENV; tests pass partial environments. */
const env = (vars: Record<string, string> = {}): NodeJS.ProcessEnv => ({ NODE_ENV: "test", ...vars });

describe("withDefaults", () => {
  it("boots with no environment at all, using the public Arc endpoints and a local database", () => {
    const config = getConfig(env({}));

    expect(config.ARC_RPC_URL).toBe(PUBLIC_DEFAULTS.ARC_RPC_URL);
    expect(config.ARC_CHAIN_ID).toBe(5042);
    expect(config.DATABASE_PATH).toBe("./data/centscan.db");
  });

  it("puts the database under /tmp on Vercel, where nothing else is writable", () => {
    expect(withDefaults(env({ VERCEL: "1" })).DATABASE_PATH).toBe("/tmp/centscan.db");
    expect(withDefaults(env({ VERCEL: "1", DATABASE_PATH: "./data/centscan.db" })).DATABASE_PATH).toBe("/tmp/centscan.db");
    expect(withDefaults(env({ VERCEL: "1", DATABASE_PATH: "/tmp/other.db" })).DATABASE_PATH).toBe("/tmp/other.db");
  });

  it("never overrides values that are set, and still validates them", () => {
    expect(withDefaults(env({ ARC_RPC_URL: "https://rpc.example.org" })).ARC_RPC_URL).toBe("https://rpc.example.org");
    expect(() => getConfig(env({ ARC_CHAIN_ID: "1" }))).toThrow(/ARC_CHAIN_ID/);
  });
});

describe("readOrFallback", () => {
  it("returns the read value, or the fallback when the read throws", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    expect(readOrFallback("/t", [], () => [1])).toEqual([1]);
    expect(
      readOrFallback("/t", [], () => {
        throw new Error("SQLITE_CANTOPEN");
      }),
    ).toEqual([]);
  });
});
