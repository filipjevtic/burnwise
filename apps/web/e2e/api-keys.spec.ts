import { test, expect } from "@playwright/test";
import { loginAs } from "./helpers/auth.js";

test("create API key and verify secret shown", async ({ page }) => {
  await loginAs(page);
  await page.goto("/settings");
  await page.getByRole("button", { name: "API Keys" }).click();
  await page.locator("#keyNote").fill("e2e-key-test");
  await page.getByRole("button", { name: "Create key" }).click();
  await expect(page.getByText("bw_sk_").first()).toBeVisible({ timeout: 5000 });
  await expect(page.getByText("e2e-key-test")).toBeVisible();
});
