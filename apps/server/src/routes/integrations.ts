import type { FastifyInstance, FastifyPluginOptions, FastifyRequest, FastifyReply } from "fastify";
import { getPrisma } from "../db.js";
import { syncGitHub, syncJira, syncGitLab } from "../integrations/index.js";
import { requireAdmin, type AuthPayload } from "../middleware/auth.js";
import { assertProjectInWorkspace } from "../middleware/scope.js";
import { encryptSecret } from "../lib/crypto.js";

export async function registerIntegrationRoutes(
  app: FastifyInstance,
  _opts: FastifyPluginOptions
) {
  const prisma = await getPrisma();

  app.post<{ Params: { projectId: string }; Body: { token?: string; owner: string; repo: string } }>("/github/:projectId", { preHandler: requireAdmin }, async (request, reply) => {
    const { projectId } = request.params;
    const { workspaceId } = (request as FastifyRequest & { user: AuthPayload }).user;
    const { token, owner, repo } = request.body;

    if (!owner || !repo) {
      return reply.status(400).send({ error: "owner and repo are required" });
    }

    if (!(await assertProjectInWorkspace(prisma, reply, projectId, workspaceId))) return;

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

    const result = await syncGitHub({
      token: token || "",
      owner,
      repo,
      projectId,
    });

    return { success: true, provider: "github", ...result };
  });

  app.post<{ Params: { projectId: string }; Body: { baseUrl: string; email: string; token: string; projectKey: string } }>("/jira/:projectId", { preHandler: requireAdmin }, async (request, reply) => {
    const { projectId } = request.params;
    const { workspaceId } = (request as FastifyRequest & { user: AuthPayload }).user;
    const { baseUrl, email, token, projectKey } = request.body;

    if (!baseUrl || !email || !token || !projectKey) {
      return reply.status(400).send({ error: "baseUrl, email, token, and projectKey are required" });
    }

    if (!(await assertProjectInWorkspace(prisma, reply, projectId, workspaceId))) return;

    await prisma.issueTrackerConfig.upsert({
      where: { projectId },
      update: {
        provider: "jira",
        baseUrl,
        apiToken: encryptSecret(token),
        projectKey,
      },
      create: {
        projectId,
        provider: "jira",
        baseUrl,
        apiToken: encryptSecret(token),
        projectKey,
      },
    });

    const result = await syncJira({
      baseUrl,
      email,
      token,
      projectKey,
      projectId,
    });

    return { success: true, provider: "jira", ...result };
  });

  app.post<{ Params: { projectId: string }; Body: { baseUrl?: string; token: string; projectPath: string } }>("/gitlab/:projectId", { preHandler: requireAdmin }, async (request, reply) => {
    const { projectId } = request.params;
    const { workspaceId } = (request as FastifyRequest & { user: AuthPayload }).user;
    const { baseUrl = "https://gitlab.com", token, projectPath } = request.body;

    if (!token || !projectPath) {
      return reply.status(400).send({ error: "token and projectPath are required" });
    }

    if (!(await assertProjectInWorkspace(prisma, reply, projectId, workspaceId))) return;

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

    const result = await syncGitLab({
      baseUrl,
      token,
      projectPath,
      projectId,
    });

    return { success: true, provider: "gitlab", ...result };
  });
}
