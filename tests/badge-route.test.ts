import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/badge/[file]/route";
import { getStore } from "@/server/store";
import { makeReport, TARGET } from "./helpers/report";

const params = (file: string) => ({ params: Promise.resolve({ file }) });
const title = async (res: Response): Promise<string | undefined> => /<title>(.*?)<\/title>/.exec(await res.text())?.[1];

describe("GET /badge/<address>.svg", () => {
  beforeAll(() => {
    const env: Record<string, string> = {
      ARC_RPC_URL: "https://rpc.example.invalid",
      ARC_CHAIN_ID: "5042",
      DATABASE_PATH: ":memory:",
      SOURCIFY_URL: "https://sourcify.example.invalid/server",
      SIGNATURE_DB_URL: "https://sig.example.invalid/v1",
    };
    for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
    // The 1 h report is newer but has no priced calls; the 24 h report has a median.
    const day = makeReport({ window: { fromBlock: "100", toBlock: "200", hours: 24, blockTimeMs: 507 } });
    const hour = makeReport({
      window: { fromBlock: "190", toBlock: "201", hours: 1, blockTimeMs: 507 },
      headline: { medianMicroUsd: null, per1000Usd: null },
    });
    getStore().saveReport(day, "0x01", "2026-10-14T10:00:00.000Z");
    getStore().saveReport(hour, "0x02", "2026-10-14T11:00:00.000Z");
  });

  afterAll(() => vi.unstubAllEnvs());

  it("uses the newest report in any window when no window is given", async () => {
    const res = await GET(new Request(`http://x/badge/${TARGET}.svg`), params(`${TARGET}.svg`));

    expect(res.status).toBe(200);
    expect(await title(res)).not.toContain("¢/call");
  });

  it("uses the requested window so a report page's badge matches its receipt", async () => {
    const res = await GET(new Request(`http://x/badge/${TARGET}.svg?hours=24`), params(`${TARGET}.svg`));

    expect(res.status).toBe(200);
    expect(await title(res)).toContain("¢/call");
  });

  it("rejects an unsupported window and an invalid address", async () => {
    const badWindow = await GET(new Request(`http://x/badge/${TARGET}.svg?hours=2`), params(`${TARGET}.svg`));
    const badAddress = await GET(new Request("http://x/badge/nope.svg"), params("nope.svg"));

    expect(badWindow.status).toBe(400);
    expect(badAddress.status).toBe(404);
  });

  it("reports an unscanned contract as not scanned", async () => {
    const other = `0x${"7".repeat(40)}`;
    const res = await GET(new Request(`http://x/badge/${other}.svg?hours=24`), params(`${other}.svg`));

    expect(await title(res)).toBe("centscan: not scanned");
  });
});
