import { test, expect } from "@playwright/test";
import { loginAs } from "./helpers/auth.js";

test.describe("velocity", () => {
  test("velocity page loads and shows empty state", async ({ page }) => {
    await loginAs(page);
    await page.goto("/velocity");
    await expect(page.getByRole("heading", { name: "Velocity" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "No velocity data yet" })).toBeVisible();
  });
});
