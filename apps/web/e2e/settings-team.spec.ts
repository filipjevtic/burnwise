import { test, expect } from "@playwright/test";
import { loginAs } from "./helpers/auth.js";

test.describe.serial("team management", () => {
  test("add a team member", async ({ page }) => {
    await loginAs(page);
    await page.goto("/settings");
    await page.getByRole("button", { name: "Team" }).click();
    await page.locator("#memberEmail").fill("teammate@test.com");
    await page.locator("#memberDisplayName").fill("Team Mate");
    await page.getByRole("button", { name: "Add member" }).click();
    await expect(page.getByText("teammate@test.com")).toBeVisible({ timeout: 5000 });
  });

  test("member persists after page reload", async ({ page }) => {
    await loginAs(page);
    await page.goto("/settings");
    await page.getByRole("button", { name: "Team" }).click();
    await expect(page.getByText("teammate@test.com")).toBeVisible();
  });
});
