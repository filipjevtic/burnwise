import type { FastifyInstance, FastifyPluginOptions, FastifyRequest, FastifyReply } from "fastify";
import { getPrisma } from "../db.js";
import { requireAuth, type AuthPayload } from "../middleware/auth.js";
import { assertProjectInWorkspace } from "../middleware/scope.js";
import { createApiKey } from "../services/apikey.js";

export async function registerKeyRoutes(
  app: FastifyInstance,
  _opts: FastifyPluginOptions
) {
  const prisma = await getPrisma();

  // List the current user's API keys (never returns secrets).
  app.get("/", { preHandler: requireAuth }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { userId, workspaceId } = (request as FastifyRequest & { user: AuthPayload }).user;
    const keys = await prisma.apiKey.findMany({
      where: { userId, workspaceId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        publicKey: true,
        displaySecretKey: true,
        note: true,
        scope: true,
        projectId: true,
        isActive: true,
        lastUsedAt: true,
        expiresAt: true,
        revokedAt: true,
        createdAt: true,
      },
    });
    return { keys };
  });

  // Create a new personal API key. The secret is returned exactly once.
  app.post<{
    Body: {
      note?: string;
      scope?: "workspace" | "project";
      projectId?: string;
      rateLimitWindow?: number;
      rateLimitCount?: number;
      expiresAt?: string;
    };
  }>("/", { preHandler: requireAuth }, async (request, reply) => {
    const { userId, workspaceId } = (request as FastifyRequest & { user: AuthPayload }).user;
    const body = request.body || {};

    if (body.projectId) {
      if (!(await assertProjectInWorkspace(prisma, reply, body.projectId, workspaceId))) return;
    }

    const created = await createApiKey(prisma, {
      workspaceId,
      userId,
      projectId: body.projectId ?? null,
      scope: body.scope,
      note: body.note,
      rateLimitWindow: body.rateLimitWindow,
      rateLimitCount: body.rateLimitCount,
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
    });

    return reply.status(201).send(created);
  });

  // Revoke (deactivate) a key owned by the current user.
  app.delete<{ Params: { id: string } }>("/:id", { preHandler: requireAuth }, async (request, reply) => {
    const { userId, workspaceId } = (request as FastifyRequest & { user: AuthPayload }).user;
    const key = await prisma.apiKey.findUnique({ where: { id: request.params.id } });
    if (!key || key.userId !== userId || key.workspaceId !== workspaceId) {
      return reply.status(404).send({ error: "API key not found" });
    }
    await prisma.apiKey.update({
      where: { id: key.id },
      data: { isActive: false, revokedAt: new Date() },
    });
    return { success: true };
  });
}
