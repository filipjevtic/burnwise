import { test, expect } from "@playwright/test";
import { loginAs } from "./helpers/auth.js";

test("budget form loads with inputs", async ({ page }) => {
  await loginAs(page);
  await page.goto("/settings");
  await page.getByRole("button", { name: "Budget", exact: true }).click();
  await expect(page.locator("#tokenBudget")).toBeVisible();
  await expect(page.locator("#costBudget")).toBeVisible();
  await expect(page.getByRole("button", { name: "Save budget" })).toBeVisible();
});
