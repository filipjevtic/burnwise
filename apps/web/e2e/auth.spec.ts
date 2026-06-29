import { test, expect } from "@playwright/test";

const API_URL = "http://localhost:3000";

test.describe("authentication", () => {
  test("providers endpoint returns all disabled", async ({ request }) => {
    const res = await request.get(`${API_URL}/api/v1/auth/providers`);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.github).toBe(false);
    expect(body.google).toBe(false);
    expect(body.gitlab).toBe(false);
    expect(body.oidc.enabled).toBe(false);
  });

  test("login page shows no SSO buttons", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    await expect(page.getByRole("button", { name: "GitHub" })).not.toBeVisible();
    await expect(page.getByRole("button", { name: "Google" })).not.toBeVisible();
    await expect(page.getByRole("button", { name: "GitLab" })).not.toBeVisible();
  });

  test("login with valid credentials", async ({ page }) => {
    await page.goto("/login");
    await page.locator("#email").fill("e2e@test.com");
    await page.locator("#password").fill("e2epassword");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText("Dashboard").first()).toBeVisible({ timeout: 10000 });
  });

  test("login with wrong password shows error", async ({ page }) => {
    await page.goto("/login");
    await page.locator("#email").fill("e2e@test.com");
    await page.locator("#password").fill("wrongpassword");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("alert")).toBeVisible({ timeout: 5000 });
  });

  test("me endpoint returns user info", async ({ request }) => {
    const loginRes = await request.post(`${API_URL}/api/v1/auth/login`, {
      data: { email: "e2e@test.com", password: "e2epassword" },
    });
    if (!loginRes.ok()) return;
    const { token } = await loginRes.json();

    const meRes = await request.get(`${API_URL}/api/v1/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(meRes.ok()).toBeTruthy();
    const user = await meRes.json();
    expect(user.email).toBe("e2e@test.com");
  });
});
