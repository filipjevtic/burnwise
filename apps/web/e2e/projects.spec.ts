import { test, expect } from "@playwright/test";
import { loginAs } from "./helpers/auth.js";

const API_URL = "http://localhost:3000";

test.describe.serial("project management", () => {
  test("create a new project", async ({ request }) => {
    const loginRes = await request.post(`${API_URL}/api/v1/auth/login`, {
      data: { email: "e2e@test.com", password: "e2epassword" },
    });
    const { token } = await loginRes.json();

    const createRes = await request.post(`${API_URL}/api/v1/projects`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { name: "Test Project E2E" },
    });
    expect(createRes.ok()).toBeTruthy();
    const project = await createRes.json();
    expect(project.name).toBe("Test Project E2E");
  });

  test("project appears in sidebar selector", async ({ page }) => {
    await loginAs(page);
    await page.goto("/");
    const select = page.locator("#projectSelect");
    await expect(select).toBeVisible();
    await expect(select.locator("option", { hasText: "Test Project E2E" })).toBeAttached();
  });
});
