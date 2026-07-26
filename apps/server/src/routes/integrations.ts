import type { FastifyInstance, FastifyPluginOptions, FastifyReply, FastifyRequest } from "fastify";
import { getPrisma } from "../db.js";
import { syncGitHub, syncJira, syncGitLab } from "../integrations/index.js";
import { requireAuth, type AuthPayload } from "../middleware/auth.js";
import { requireProjectRole } from "../middleware/rbac.js";
import { encryptSecret, decryptSecret } from "../lib/crypto.js";
import { assertSafeIntegrationUrl, SsrfError } from "../lib/ssrf.js";
import { FetchTimeoutError } from "../lib/fetch-timeout.js";
import { recordAudit } from "../services/audit.js";
import { parseGitHubRepo, parseGitLabProjectPath } from "../lib/repo-url.js";

export async function registerIntegrationRoutes(
  app: FastifyInstance,
  _opts: FastifyPluginOptions
) {
  const prisma = await getPrisma();

  // Audit an integration credential change (#20). Records who connected which
  // provider to which project — never the token itself.
  async function auditConnect(request: FastifyRequest, projectId: string, provider: string, baseUrl: string) {
    const actor = (request as FastifyRequest & { user: AuthPayload }).user;
    await recordAudit(prisma, {
      workspaceId: actor.workspaceId,
      actorUserId: actor.userId,
      action: "integration.connect",
      targetType: "project",
      targetId: projectId,
      metadata: { provider, baseUrl },
    });
  }

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

  // Effective token for a sync: prefer the one just entered; otherwise reuse the
  // stored (encrypted) token so a saved config can re-sync without re-entering it
  // (#70). Returns undefined when neither exists.
  async function resolveToken(projectId: string, bodyToken?: string): Promise<string | undefined> {
    if (bodyToken) return bodyToken;
    const cfg = await prisma.issueTrackerConfig.findUnique({ where: { projectId }, select: { apiToken: true } });
    return decryptSecret(cfg?.apiToken) ?? undefined;
  }

  // Return the saved config so the UI can pre-populate the form (#70). Never
  // returns the token itself — only whether one is stored (hasToken) so the
  // form can show it as already configured.
  app.get<{ Params: { projectId: string } }>("/config/:projectId", { preHandler: requireAuth }, async (request, reply) => {
    const cfg = await prisma.issueTrackerConfig.findUnique({
      where: { projectId: request.params.projectId },
      select: { provider: true, baseUrl: true, repository: true, projectKey: true, storyPointsField: true, apiToken: true },
    });
    if (!cfg) return reply.status(404).send({ error: "No integration configured" });
    const { apiToken, ...rest } = cfg;
    return { ...rest, hasToken: Boolean(apiToken) };
  });

  // Configuring/syncing an integration requires project admin (workspace admins
  // bypass).
  app.post<{ Params: { projectId: string }; Body: { token?: string; owner: string; repo: string } }>("/github/:projectId", { preHandler: requireAuth }, async (request, reply) => {
    const { projectId } = request.params;
    const { token } = request.body;

    // Accept a full github.com URL or "owner/repo" in either field (#70) and
    // normalize to bare owner + repo so the GitHub API doesn't 404.
    const parsed = parseGitHubRepo(request.body.owner || "", request.body.repo || "");
    if (!parsed) {
      return reply.status(400).send({ error: "Provide the repository as owner and repo (or a github.com URL)" });
    }
    const { owner, repo } = parsed;

    if (!(await requireProjectRole(prisma, request, reply, projectId, "admin"))) return;

    // Reuse the stored token when the field is left blank (re-sync of a saved
    // config). Only overwrite apiToken when a new one is supplied (#70).
    const effectiveToken = await resolveToken(projectId, token);
    const tokenUpdate = token ? { apiToken: encryptSecret(token) } : {};

    await prisma.issueTrackerConfig.upsert({
      where: { projectId },
      update: {
        provider: "github",
        baseUrl: `https://github.com/${owner}/${repo}`,
        repository: `${owner}/${repo}`,
        ...tokenUpdate,
      },
      create: {
        projectId,
        provider: "github",
        baseUrl: `https://github.com/${owner}/${repo}`,
        apiToken: encryptSecret(token),
        repository: `${owner}/${repo}`,
      },
    });
    await auditConnect(request, projectId, "github", `https://github.com/${owner}/${repo}`);

    const result = await runSync(reply, () => syncGitHub({
      token: effectiveToken || "",
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

    if (!baseUrl || !email || !projectKey) {
      return reply.status(400).send({ error: "baseUrl, email, and projectKey are required" });
    }

    if (!(await requireProjectRole(prisma, request, reply, projectId, "admin"))) return;

    try {
      await assertSafeIntegrationUrl(baseUrl);
    } catch (err) {
      if (err instanceof SsrfError) return reply.status(400).send({ error: err.message });
      throw err;
    }

    // Reuse the stored token when blank (re-sync of a saved config) (#70).
    const effectiveToken = await resolveToken(projectId, token);
    if (!effectiveToken) return reply.status(400).send({ error: "token is required" });
    const tokenUpdate = token ? { apiToken: encryptSecret(token) } : {};

    await prisma.issueTrackerConfig.upsert({
      where: { projectId },
      update: {
        provider: "jira",
        baseUrl,
        projectKey,
        storyPointsField,
        ...tokenUpdate,
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
    await auditConnect(request, projectId, "jira", baseUrl);

    const result = await runSync(reply, () => syncJira({
      baseUrl,
      email,
      token: effectiveToken,
      projectKey,
      projectId,
      storyPointsField,
    }));
    if (!result) return;

    return { success: true, provider: "jira", ...result };
  });

  app.post<{ Params: { projectId: string }; Body: { baseUrl?: string; token: string; projectPath: string } }>("/gitlab/:projectId", { preHandler: requireAuth }, async (request, reply) => {
    const { projectId } = request.params;
    const { baseUrl = "https://gitlab.com", token } = request.body;

    // Accept a full GitLab URL or "group/project" and normalize (#70).
    const projectPath = parseGitLabProjectPath(request.body.projectPath || "");
    if (!projectPath) {
      return reply.status(400).send({ error: "projectPath must be group/project (or a GitLab URL)" });
    }

    if (!(await requireProjectRole(prisma, request, reply, projectId, "admin"))) return;

    try {
      await assertSafeIntegrationUrl(baseUrl);
    } catch (err) {
      if (err instanceof SsrfError) return reply.status(400).send({ error: err.message });
      throw err;
    }

    // Reuse the stored token when blank (re-sync of a saved config) (#70).
    const effectiveToken = await resolveToken(projectId, token);
    if (!effectiveToken) return reply.status(400).send({ error: "token is required" });
    const tokenUpdate = token ? { apiToken: encryptSecret(token) } : {};

    await prisma.issueTrackerConfig.upsert({
      where: { projectId },
      update: {
        provider: "gitlab",
        baseUrl,
        repository: projectPath,
        ...tokenUpdate,
      },
      create: {
        projectId,
        provider: "gitlab",
        baseUrl,
        apiToken: encryptSecret(token),
        repository: projectPath,
      },
    });
    await auditConnect(request, projectId, "gitlab", baseUrl);

    const result = await runSync(reply, () => syncGitLab({
      baseUrl,
      token: effectiveToken,
      projectPath,
      projectId,
    }));
    if (!result) return;

    return { success: true, provider: "gitlab", ...result };
  });
}
