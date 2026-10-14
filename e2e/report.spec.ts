import { expect, test, type Page } from "@playwright/test";

/** Arc's USDC: always busy, so a 1 h window has calls to price. */
const USDC = "0x3600000000000000000000000000000000000000";

async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

test("scanner rejects an invalid address inline", async ({ page }) => {
  await page.goto("/app");
  await page.getByLabel("Contract address").fill("0x1234");
  await page.getByRole("button", { name: "Scan", exact: true }).click();

  await expect(page.getByText("An Arc address is 0x followed by 40 hex characters")).toBeVisible();
  await expect(page.getByLabel("Contract address")).toHaveAttribute("aria-invalid", "true");
  await expect(page).toHaveURL("/app");
  await expectNoHorizontalScroll(page);
});

test("an invalid address in the URL renders the invalid state, not a crash", async ({ page }) => {
  const response = await page.goto("/c/not-an-address");
  expect(response?.status()).toBeLessThan(500);
  await expect(page.getByRole("heading", { level: 1, name: "Not a valid Arc address" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Scan another address" })).toHaveAttribute("href", "/app");
});

test("paste address → streamed report → receipt lines → badge snippet → recompute hash", async ({ page }, testInfo) => {
  // One live build per run: the service allows one fresh report per contract per 5 minutes.
  test.skip(testInfo.project.name !== "desktop-chromium", "the live build runs once, on desktop");
  test.setTimeout(240_000);

  await page.goto("/app");
  await page.getByLabel("Contract address").fill(USDC);
  await page.getByRole("radio", { name: "1 h" }).check();
  await page.getByRole("button", { name: "Scan", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/c/${USDC}\\?hours=1`));

  // Either a fresh stream or a cached report ends in the printed receipt ("Printing receipt" is the in-progress heading).
  await expect(page.getByRole("heading", { name: "Receipt", exact: true })).toBeVisible({ timeout: 200_000 });
  const receipt = page.getByRole("article", { name: "Receipt", exact: true });
  await expect(receipt.getByText("Unique senders")).toBeVisible();
  await expect(receipt.getByText("Report hash")).toBeVisible();

  // Live data decides whether the window had direct calls: either the priced table or the no-activity state renders.
  const costs = page.getByRole("region", { name: "Cost per function, scrollable" });
  if ((await costs.count()) > 0) {
    const rows = costs.locator("tbody tr");
    await expect(rows.first()).toBeVisible();
    await expect(rows.first().getByRole("link")).toHaveAttribute("href", /^https:\/\/explorer\.arc\.io\/tx\/0x[0-9a-f]{64}$/);
  } else {
    await expect(page.getByText("No calls in this window.")).toBeVisible();
  }

  await expect(page.getByRole("tab", { name: "Badge" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText(`/badge/${USDC}.svg`).first()).toBeVisible();
  const badge = await page.request.get(`/badge/${USDC}.svg`);
  expect(badge.status()).toBe(200);
  expect(badge.headers()["content-type"]).toContain("image/svg+xml");

  await page.getByRole("tab", { name: "Verify" }).click();
  await page.getByRole("button", { name: "Recompute hash" }).click();
  await expect(page.getByText("Matches the stored report hash")).toBeVisible();

  await page.setViewportSize({ width: 360, height: 740 });
  await expectNoHorizontalScroll(page);
});
