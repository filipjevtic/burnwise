import { test, expect } from "@playwright/test";
import { loginAs } from "./helpers/auth.js";

test("dashboard loads", async ({ page }) => {
  await loginAs(page);
  await page.goto("/");
  await expect(page.getByText("Dashboard").first()).toBeVisible();
});
