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
});
