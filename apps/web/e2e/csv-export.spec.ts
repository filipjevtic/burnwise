import { test, expect } from "@playwright/test";
import { loginAs } from "./helpers/auth.js";
import { seedSessionWithEvents } from "./helpers/seed.js";

test.describe("CSV export", () => {
  test.beforeAll(async () => {
    // Ensure there is at least one session with events so the export button is enabled
    await seedSessionWithEvents();
  });

  test("export sessions CSV", async ({ page }) => {
    await loginAs(page);
    await page.goto("/sessions");
    await expect(page.getByRole("heading", { name: "Sessions", exact: true })).toBeVisible();
    // Wait for the table to load so the export button becomes enabled
    await expect(page.locator("table tbody tr").first()).toBeVisible();

    // The Sessions page uses downloadCsv() which creates an <a download> element
    // and clicks it programmatically. Playwright's "download" event catches this.
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export CSV" }).click();
    const download = await downloadPromise;

    // Verify file name
    expect(download.suggestedFilename()).toContain(".csv");

    // Read and verify content has CSV structure (headers + at least one data row)
    const path = await download.path();
    expect(path).toBeTruthy();
    const fs = await import("fs");
    const content = fs.readFileSync(path!, "utf-8");
    expect(content).toContain(",");
    expect(content.split("\n").length).toBeGreaterThan(1);
  });
});
