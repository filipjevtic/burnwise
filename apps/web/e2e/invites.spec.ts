import { test, expect } from "@playwright/test";
import { loginAs } from "./helpers/auth.js";
import { getToken, listProjects, createInvite } from "./helpers/api.js";

test.describe("invite flow", () => {
  test("create and accept invite", async ({ page, browser }) => {
    // Create invite via API
    const token = await getToken();
    const projects = await listProjects(token);
    const invite = await createInvite(token, projects[0].id, { role: "member" });

    // Extract invite token from link (format: http://localhost:5173/invite/<token>)
    const inviteToken = invite.link.split("/invite/").pop();

    // Open invite page in a new incognito context (not logged in)
    const context = await browser.newContext();
    const invitePage = await context.newPage();
    await invitePage.goto(`/invite/${inviteToken}`);

    // The heading says "You're invited"
    await expect(invitePage.getByRole("heading", { name: /invited/i })).toBeVisible();

    // Fill acceptance form using label-based selectors matching InvitePage.tsx
    await invitePage.getByLabel("Email").fill("invited@test.com");
    await invitePage.getByLabel("Your name").fill("Invited User");
    // Password label contains "(optional if using SSO)" suffix; match by id
    await invitePage.locator("#password").fill("invitedpassword");
    await invitePage.getByRole("button", { name: "Accept invite" }).click();

    // Should redirect to dashboard after accepting
    await expect(invitePage.getByText("Dashboard").first()).toBeVisible({ timeout: 10000 });

    await context.close();
  });

  test("open invite cannot take over an existing account", async ({ request }) => {
    const API_URL = "http://localhost:3000";
    // The E2E admin already exists (created in global setup).
    const token = await getToken();
    const projects = await listProjects(token);
    const invite = await createInvite(token, projects[0].id, { role: "member" });
    const inviteToken = invite.link.split("/invite/").pop();

    // Attempt to accept the open invite with the existing admin's email and a
    // new password — must be refused, not silently overwrite the account.
    const res = await request.post(`${API_URL}/api/v1/invites/${inviteToken}/accept`, {
      data: { email: "e2e@test.com", password: "attacker-controlled-pw" },
    });
    expect(res.status()).toBe(409);

    // The admin's original password must still work (was not overwritten).
    const login = await request.post(`${API_URL}/api/v1/auth/login`, {
      data: { email: "e2e@test.com", password: "e2epassword" },
    });
    expect(login.ok()).toBeTruthy();

    // The attacker's password must NOT work.
    const attackerLogin = await request.post(`${API_URL}/api/v1/auth/login`, {
      data: { email: "e2e@test.com", password: "attacker-controlled-pw" },
    });
    expect(attackerLogin.status()).toBe(401);
  });
});
