import type { FastifyInstance, FastifyPluginOptions, FastifyReply, FastifyRequest } from "fastify";
import { getPrisma } from "../db.js";
import { syncGitHub, syncJira, syncGitLab } from "../integrations/index.js";
import { requireAuth, type AuthPayload } from "../middleware/auth.js";
import { requireProjectRole } from "../middleware/rbac.js";
import { encryptSecret, decryptSecret } from "../lib/crypto.js";
import { assertSafeIntegrationUrl, SsrfError } from "../lib/ssrf.js";
import { FetchTimeoutError, fetchWithTimeout } from "../lib/fetch-timeout.js";
import { recordAudit } from "../services/audit.js";
import { parseGitHubRepo, parseGitLabProjectPath, githubApiBase } from "../lib/repo-url.js";

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
  app.post<{ Params: { projectId: string }; Body: { token?: string; owner: string; repo: string; baseUrl?: string } }>("/github/:projectId", { preHandler: requireAuth }, async (request, reply) => {
    const { projectId } = request.params;
    const { token } = request.body;

    // Accept a full github.com URL or "owner/repo" in either field (#70) and
    // normalize to bare owner + repo so the GitHub API doesn't 404.
    const parsed = parseGitHubRepo(request.body.owner || "", request.body.repo || "");
    if (!parsed) {
      return reply.status(400).send({ error: "Provide the repository as owner and repo (or a github.com URL)" });
    }
    const { owner, repo } = parsed;

    // GitHub Enterprise Server host (#70); blank means public github.com.
    const webHost = (request.body.baseUrl || "https://github.com").replace(/\/+$/, "");
    const isEnterprise = webHost !== "https://github.com" && webHost !== "http://github.com";

    if (!(await requireProjectRole(prisma, request, reply, projectId, "admin"))) return;

    // Guard the Enterprise host against SSRF (public github.com is trusted).
    if (isEnterprise) {
      try {
        await assertSafeIntegrationUrl(webHost);
      } catch (err) {
        if (err instanceof SsrfError) return reply.status(400).send({ error: err.message });
        throw err;
      }
    }

    // Reuse the stored token when the field is left blank (re-sync of a saved
    // config). Only overwrite apiToken when a new one is supplied (#70).
    const effectiveToken = await resolveToken(projectId, token);
    const tokenUpdate = token ? { apiToken: encryptSecret(token) } : {};

    await prisma.issueTrackerConfig.upsert({
      where: { projectId },
      update: {
        provider: "github",
        baseUrl: webHost,
        repository: `${owner}/${repo}`,
        ...tokenUpdate,
      },
      create: {
        projectId,
        provider: "github",
        baseUrl: webHost,
        apiToken: encryptSecret(token),
        repository: `${owner}/${repo}`,
      },
    });
    await auditConnect(request, projectId, "github", webHost);

    const result = await runSync(reply, () => syncGitHub({
      token: effectiveToken || "",
      owner,
      repo,
      projectId,
      apiBaseUrl: githubApiBase(webHost),
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

  // Verify credentials and repo/project access without persisting or syncing
  // (#70). Returns { ok, message } — a failed check is a 200 with ok:false, not
  // an HTTP error, so the UI can show the result inline. A blank token reuses the
  // stored one (test a saved config as-is). Admin-only, since it uses credentials.
  const TEST_TIMEOUT_MS = 10_000;
  app.post<{
    Params: { projectId: string };
    Body: { provider: string; owner?: string; repo?: string; baseUrl?: string; email?: string; token?: string; projectKey?: string; projectPath?: string };
  }>("/test/:projectId", { preHandler: requireAuth }, async (request, reply) => {
    const { projectId } = request.params;
    const { provider } = request.body;
    if (!(await requireProjectRole(prisma, request, reply, projectId, "admin"))) return;

    const token = await resolveToken(projectId, request.body.token);

    // Guard a user-supplied host before we fetch it (github.com is trusted).
    async function guard(host: string): Promise<string | null> {
      try {
        await assertSafeIntegrationUrl(host);
        return null;
      } catch (err) {
        if (err instanceof SsrfError) return err.message;
        throw err;
      }
    }

    // A 2xx means the credentials reach the resource; map common failures to a
    // clear message instead of a raw status.
    function explain(status: number): string {
      if (status === 401 || status === 403) return "Authentication failed — check the token / permissions.";
      if (status === 404) return "Not found — check the repository / project path and base URL.";
      return `Provider returned HTTP ${status}.`;
    }

    try {
      if (provider === "github") {
        const parsed = parseGitHubRepo(request.body.owner || "", request.body.repo || "");
        if (!parsed) return reply.status(400).send({ ok: false, message: "Provide owner and repo." });
        const webHost = (request.body.baseUrl || "https://github.com").replace(/\/+$/, "");
        if (webHost !== "https://github.com" && webHost !== "http://github.com") {
          const bad = await guard(webHost);
          if (bad) return reply.send({ ok: false, message: bad });
        }
        const headers: Record<string, string> = { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" };
        if (token) headers.Authorization = `Bearer ${token}`;
        const res = await fetchWithTimeout(`${githubApiBase(webHost)}/repos/${parsed.owner}/${parsed.repo}`, { headers }, TEST_TIMEOUT_MS);
        return res.ok ? { ok: true, message: `Connected to ${parsed.owner}/${parsed.repo}.` } : { ok: false, message: explain(res.status) };
      }

      if (provider === "jira") {
        const { baseUrl, email } = request.body;
        if (!baseUrl || !email) return reply.status(400).send({ ok: false, message: "baseUrl and email are required." });
        if (!token) return reply.status(400).send({ ok: false, message: "token is required." });
        const bad = await guard(baseUrl);
        if (bad) return reply.send({ ok: false, message: bad });
        const auth = Buffer.from(`${email}:${token}`).toString("base64");
        const res = await fetchWithTimeout(`${baseUrl.replace(/\/+$/, "")}/rest/api/3/myself`, { headers: { Authorization: `Basic ${auth}`, Accept: "application/json" } }, TEST_TIMEOUT_MS);
        return res.ok ? { ok: true, message: "Jira credentials verified." } : { ok: false, message: explain(res.status) };
      }

      if (provider === "gitlab") {
        const baseUrl = (request.body.baseUrl || "https://gitlab.com").replace(/\/+$/, "");
        const projectPath = parseGitLabProjectPath(request.body.projectPath || "");
        if (!projectPath) return reply.status(400).send({ ok: false, message: "projectPath must be group/project." });
        if (!token) return reply.status(400).send({ ok: false, message: "token is required." });
        const bad = await guard(baseUrl);
        if (bad) return reply.send({ ok: false, message: bad });
        const res = await fetchWithTimeout(`${baseUrl}/api/v4/projects/${encodeURIComponent(projectPath)}`, { headers: { "PRIVATE-TOKEN": token } }, TEST_TIMEOUT_MS);
        return res.ok ? { ok: true, message: `Connected to ${projectPath}.` } : { ok: false, message: explain(res.status) };
      }

      return reply.status(400).send({ ok: false, message: `Unknown provider: ${provider}` });
    } catch (err) {
      if (err instanceof FetchTimeoutError) return reply.send({ ok: false, message: "The provider did not respond in time." });
      return reply.send({ ok: false, message: err instanceof Error ? err.message : "Connection test failed." });
    }
  });
}
