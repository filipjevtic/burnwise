import type { FastifyInstance, FastifyPluginOptions, FastifyRequest, FastifyReply } from "fastify";
import { getPrisma } from "../db.js";
import { verifyApiKey, type VerifiedApiKey } from "../services/apikey.js";
import { startSession, endSession, getSession } from "../services/session.js";
import { assertProjectInWorkspace } from "../middleware/scope.js";

/** Resolve the API-key context from the Authorization header, or null. */
async function apiKeyFromRequest(
  prisma: Awaited<ReturnType<typeof getPrisma>>,
  request: FastifyRequest
): Promise<VerifiedApiKey | null> {
  const header = request.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return null;
  return verifyApiKey(prisma, token);
}

export async function registerSessionRoutes(
  app: FastifyInstance,
  _opts: FastifyPluginOptions
) {
  const prisma = await getPrisma();

  // Start an agent session. Authenticated with a personal API key so the
  // session is bound to the real developer + workspace.
  app.post<{
    Body: { projectId?: string; ticketKey?: string; source?: string; branch?: string };
  }>("/start", async (request, reply) => {
    const key = await apiKeyFromRequest(prisma, request);
    if (!key) return reply.status(401).send({ error: "Unauthorized" });

    const body = request.body || {};
    // Project: a project-scoped key fixes the project; otherwise require one
    // and verify it belongs to the key's workspace.
    const projectId = key.projectId ?? body.projectId;
    if (!projectId) {
      return reply.status(400).send({ error: "projectId is required for a workspace-scoped key" });
    }
    if (!key.projectId) {
      if (!(await assertProjectInWorkspace(prisma, reply, projectId, key.workspaceId))) return;
    }

    const session = await startSession(prisma, {
      workspaceId: key.workspaceId,
      userId: key.userId,
      projectId,
      ticketKey: body.ticketKey ?? null,
      source: body.source || "cli",
      branch: body.branch ?? null,
    });
    return reply.status(201).send(session);
  });

  // End a session.
  app.post<{ Params: { id: string } }>("/:id/end", async (request, reply) => {
    const key = await apiKeyFromRequest(prisma, request);
    if (!key) return reply.status(401).send({ error: "Unauthorized" });
    const session = await endSession(prisma, request.params.id, key.workspaceId);
    if (!session) return reply.status(404).send({ error: "Session not found" });
    return session;
  });

  // Get a session.
  app.get<{ Params: { id: string } }>("/:id", async (request, reply) => {
    const key = await apiKeyFromRequest(prisma, request);
    if (!key) return reply.status(401).send({ error: "Unauthorized" });
    const session = await getSession(prisma, request.params.id, key.workspaceId);
    if (!session) return reply.status(404).send({ error: "Session not found" });
    return session;
  });
}
