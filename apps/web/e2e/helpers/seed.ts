import { randomUUID } from "crypto";
import {
  getToken,
  createApiKey,
  ingestEvents,
  startSession,
  listProjects,
} from "./api.js";

const PLACEHOLDER_WORKSPACE = "00000000-0000-0000-0000-000000000000";
const PLACEHOLDER_USER = "00000000-0000-0000-0000-000000000000";

function makeLlmResponseEvent(projectId: string, sessionId: string) {
  return {
    eventId: randomUUID(),
    eventType: "llm.response" as const,
    timestamp: new Date().toISOString(),
    source: "proxy" as const,
    workspaceId: PLACEHOLDER_WORKSPACE,
    projectId,
    userId: PLACEHOLDER_USER,
    sessionId,
    payload: {
      provider: "openai",
      model: "gpt-4o",
      promptTokens: 500,
      completionTokens: 200,
      totalTokens: 700,
    },
  };
}

export async function seedSessionWithEvents(opts?: { projectId?: string }): Promise<{
  token: string;
  apiKey: string;
  projectId: string;
  sessionId: string;
  eventCount: number;
}> {
  const token = await getToken();

  let projectId = opts?.projectId;
  if (!projectId) {
    const projects = await listProjects(token);
    const e2eProject = projects.find((p) => p.slug === "e2e-project") ?? projects[0];
    if (!e2eProject) throw new Error("No project found — run global-setup first");
    projectId = e2eProject.id;
  }

  const key = await createApiKey(token, { note: "e2e-seed" });

  const session = await startSession(key.secretKey, {
    projectId,
    ticketKey: "E2E-1",
    source: "cli",
  });
  const sessionId = (session as { id: string }).id;

  const events = Array.from({ length: 5 }, () =>
    makeLlmResponseEvent(projectId!, sessionId)
  );
  await ingestEvents(key.secretKey, events);

  return {
    token,
    apiKey: key.secretKey,
    projectId,
    sessionId,
    eventCount: events.length,
  };
}
