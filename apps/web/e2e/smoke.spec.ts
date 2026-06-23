import { test, expect } from "@playwright/test";
import { loginAs } from "./helpers/auth.js";

test.describe("smoke tests", () => {
  test("dashboard loads", async ({ page }) => {
    await loginAs(page);
    await page.goto("/");
    await expect(page).toHaveTitle(/Burnwise/);
    await expect(page.getByText("Dashboard").first()).toBeVisible();
  });

  test("navigation links work", async ({ page }) => {
    await loginAs(page);
    await page.goto("/");
    await page.getByRole("link", { name: "Forecast" }).click();
    await expect(page.getByRole("heading", { name: "Forecast & Capacity" })).toBeVisible();

    await page.getByRole("link", { name: "Integrations" }).click();
    await expect(page.getByRole("heading", { name: "Integrations" })).toBeVisible();

    await page.getByRole("link", { name: "Settings" }).click();
    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  });

  test("server health endpoint is up", async ({ request }) => {
    const response = await request.get("http://localhost:3000/health");
    expect(response.ok()).toBeTruthy();
  });
});
