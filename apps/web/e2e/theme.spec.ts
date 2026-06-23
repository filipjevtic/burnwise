import { test, expect } from "@playwright/test";
import { loginAs } from "./helpers/auth.js";

test("toggles dark mode", async ({ page }) => {
  await loginAs(page);
  await page.goto("/");
  const html = page.locator("html");

  await page.getByRole("button", { name: "Toggle theme" }).click();
  await expect(html).toHaveClass(/dark/);

  await page.getByRole("button", { name: "Toggle theme" }).click();
  await expect(html).not.toHaveClass(/dark/);
});
