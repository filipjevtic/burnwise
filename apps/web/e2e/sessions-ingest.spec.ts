import { test, expect } from "@playwright/test";
import { loginAs } from "./helpers/auth.js";
import {
  getToken,
  createApiKey,
  ingestEvents,
  startSession,
  endSession,
  listProjects,
} from "./helpers/api.js";

test.describe.serial("sessions and event ingestion", () => {
  let apiKeySecret: string;
  let projectId: string;
  let sessionId: string;

  test.beforeAll(async () => {
    const token = await getToken();
    const projects = await listProjects(token);
    projectId = projects[0].id;
    const key = await createApiKey(token, { note: "session-test" });
    apiKeySecret = key.secretKey;

    const session = await startSession(apiKeySecret, {
      projectId,
      ticketKey: "SESS-1",
      source: "cli",
    });
    sessionId = (session as { id: string }).id;

    const events = Array.from({ length: 5 }, (_, i) => ({
      eventId: crypto.randomUUID(),
      eventType: "llm.response" as const,
      timestamp: new Date(Date.now() - (5 - i) * 60000).toISOString(),
      source: "proxy" as const,
      workspaceId: "placeholder",
      projectId,
      userId: "placeholder",
      sessionId,
      payload: {
        provider: "openai",
        model: "gpt-4o",
        promptTokens: 500 + i * 100,
        completionTokens: 200 + i * 50,
        totalTokens: 700 + i * 150,
      },
    }));
    await ingestEvents(apiKeySecret, events);
  });

  test("sessions page shows ingested session", async ({ page }) => {
    await loginAs(page);
    await page.goto("/sessions");
    await expect(page.getByRole("heading", { name: "Sessions", exact: true })).toBeVisible();
    await expect(page.locator("table tbody tr").first()).toBeVisible();
    await expect(page.getByRole("cell", { name: "SESS-1" })).toBeVisible();
  });

  test("session shows token rollup", async ({ page }) => {
    await loginAs(page);
    await page.goto("/sessions");
    await expect(page.locator("table tbody tr").first()).toBeVisible();
    await expect(page.getByText("5,000")).toBeVisible();
  });

  test("end session updates status", async ({ page }) => {
    await endSession(apiKeySecret, sessionId);
    await loginAs(page);
    await page.goto("/sessions");
    await expect(page.locator("table tbody tr").first()).toBeVisible();
    await expect(page.getByText("ended")).toBeVisible();
  });
});
