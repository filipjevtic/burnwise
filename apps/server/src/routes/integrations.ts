import type { FastifyInstance, FastifyPluginOptions, FastifyReply } from "fastify";
import { getPrisma } from "../db.js";
import { syncGitHub, syncJira, syncGitLab } from "../integrations/index.js";
import { requireAuth } from "../middleware/auth.js";
import { requireProjectRole } from "../middleware/rbac.js";
import { encryptSecret } from "../lib/crypto.js";
import { assertSafeIntegrationUrl, SsrfError } from "../lib/ssrf.js";
import { FetchTimeoutError } from "../lib/fetch-timeout.js";

export async function registerIntegrationRoutes(
  app: FastifyInstance,
  _opts: FastifyPluginOptions
) {
  const prisma = await getPrisma();

  // Run an integration sync, mapping a provider timeout (#11) to a clear 504 so
  // a slow/unresponsive tracker doesn't surface as an opaque 500. Returns null
  // (and sends the response) on timeout; the caller returns early.
  async function runSync<T>(reply: FastifyReply, fn: () => Promise<T>): Promise<T | null> {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof FetchTimeoutError) {
        reply.status(504).send({ error: "The issue tracker did not respond in time. Please try again." });
        return null;
      }
      throw err;
    }
  }

  // Configuring/syncing an integration requires project admin (workspace admins
  // bypass).
  app.post<{ Params: { projectId: string }; Body: { token?: string; owner: string; repo: string } }>("/github/:projectId", { preHandler: requireAuth }, async (request, reply) => {
    const { projectId } = request.params;
    const { token, owner, repo } = request.body;

    if (!owner || !repo) {
      return reply.status(400).send({ error: "owner and repo are required" });
    }

    if (!(await requireProjectRole(prisma, request, reply, projectId, "admin"))) return;

    await prisma.issueTrackerConfig.upsert({
      where: { projectId },
      update: {
        provider: "github",
        baseUrl: `https://github.com/${owner}/${repo}`,
        apiToken: encryptSecret(token),
        repository: `${owner}/${repo}`,
      },
      create: {
        projectId,
        provider: "github",
        baseUrl: `https://github.com/${owner}/${repo}`,
        apiToken: encryptSecret(token),
        repository: `${owner}/${repo}`,
      },
    });

    const result = await runSync(reply, () => syncGitHub({
      token: token || "",
      owner,
      repo,
      projectId,
    }));
    if (!result) return;

    return { success: true, provider: "github", ...result };
  });

  app.post<{ Params: { projectId: string }; Body: { baseUrl: string; email: string; token: string; projectKey: string; storyPointsField?: string } }>("/jira/:projectId", { preHandler: requireAuth }, async (request, reply) => {
    const { projectId } = request.params;
    const { baseUrl, email, token, projectKey } = request.body;
    const storyPointsField = request.body.storyPointsField?.trim() || null;

    if (!baseUrl || !email || !token || !projectKey) {
      return reply.status(400).send({ error: "baseUrl, email, token, and projectKey are required" });
    }

    if (!(await requireProjectRole(prisma, request, reply, projectId, "admin"))) return;

    try {
      await assertSafeIntegrationUrl(baseUrl);
    } catch (err) {
      if (err instanceof SsrfError) return reply.status(400).send({ error: err.message });
      throw err;
    }

    await prisma.issueTrackerConfig.upsert({
      where: { projectId },
      update: {
        provider: "jira",
        baseUrl,
        apiToken: encryptSecret(token),
        projectKey,
        storyPointsField,
      },
      create: {
        projectId,
        provider: "jira",
        baseUrl,
        apiToken: encryptSecret(token),
        projectKey,
        storyPointsField,
      },
    });

    const result = await runSync(reply, () => syncJira({
      baseUrl,
      email,
      token,
      projectKey,
      projectId,
      storyPointsField,
    }));
    if (!result) return;

    return { success: true, provider: "jira", ...result };
  });

  app.post<{ Params: { projectId: string }; Body: { baseUrl?: string; token: string; projectPath: string } }>("/gitlab/:projectId", { preHandler: requireAuth }, async (request, reply) => {
    const { projectId } = request.params;
    const { baseUrl = "https://gitlab.com", token, projectPath } = request.body;

    if (!token || !projectPath) {
      return reply.status(400).send({ error: "token and projectPath are required" });
    }

    if (!(await requireProjectRole(prisma, request, reply, projectId, "admin"))) return;

    try {
      await assertSafeIntegrationUrl(baseUrl);
    } catch (err) {
      if (err instanceof SsrfError) return reply.status(400).send({ error: err.message });
      throw err;
    }

    await prisma.issueTrackerConfig.upsert({
      where: { projectId },
      update: {
        provider: "gitlab",
        baseUrl,
        apiToken: encryptSecret(token),
        repository: projectPath,
      },
      create: {
        projectId,
        provider: "gitlab",
        baseUrl,
        apiToken: encryptSecret(token),
        repository: projectPath,
      },
    });

    const result = await runSync(reply, () => syncGitLab({
      baseUrl,
      token,
      projectPath,
      projectId,
    }));
    if (!result) return;

    return { success: true, provider: "gitlab", ...result };
  });
}
