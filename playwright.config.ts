import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineConfig, devices } from "@playwright/test";

const isCI = Boolean(process.env.CI);
const PORT = 3000;
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "e2e",
  // A report streams 30-60 s on the public RPC, so per-test and per-assertion budgets are generous.
  timeout: 120_000,
  expect: { timeout: 90_000 },
  fullyParallel: false,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  workers: isCI ? 1 : undefined,
  reporter: isCI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "desktop-chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } },
    },
    {
      name: "mobile-360",
      use: { ...devices["Desktop Chrome"], viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true },
    },
  ],
  webServer: {
    command: "pnpm build && pnpm start",
    url: BASE_URL,
    reuseExistingServer: !isCI,
    timeout: 300_000,
    // Process env beats .env files in Next, so the run uses the public-RPC budget measured on 14 Oct 2026
    // whatever a developer's .env.local says.
    env: {
      // A fresh database per run: rate limits left by an earlier run must not fail this one.
      DATABASE_PATH: join(tmpdir(), `centscan-e2e-${Date.now()}.db`),
      RPC_MAX_CALLS_PER_SECOND: "10", RPC_BURST: "25", MAX_TXS_PER_REPORT: "150", SCAN_FALLBACK_BLOCKS: "300" },
    stdout: "pipe",
    stderr: "pipe",
  },
});
