import type { FastifyInstance, FastifyPluginOptions, FastifyRequest, FastifyReply } from "fastify";
import { getPrisma } from "../db.js";
import { requireAuth, requireAdmin, type AuthPayload } from "../middleware/auth.js";

/**
 * Workspace-level settings. Currently the capacity-not-surveillance guardrail
 * (#199): whether per-developer attribution is shown across the app.
 */
export async function registerWorkspaceRoutes(
  app: FastifyInstance,
  _opts: FastifyPluginOptions
) {
  const prisma = await getPrisma();

  app.get("/", { preHandler: requireAuth }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { workspaceId } = (request as FastifyRequest & { user: AuthPayload }).user;
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { id: true, name: true, showDeveloperAttribution: true },
    });
    if (!workspace) return reply.status(404).send({ error: "Workspace not found" });
    return workspace;
  });

  // Update workspace settings (admin only).
  app.put<{ Body: { showDeveloperAttribution?: boolean } }>("/", { preHandler: requireAdmin }, async (request, reply) => {
    const { workspaceId } = (request as FastifyRequest & { user: AuthPayload }).user;
    const { showDeveloperAttribution } = request.body || {};
    if (typeof showDeveloperAttribution !== "boolean") {
      return reply.status(400).send({ error: "showDeveloperAttribution (boolean) is required" });
    }
    const workspace = await prisma.workspace.update({
      where: { id: workspaceId },
      data: { showDeveloperAttribution },
      select: { id: true, name: true, showDeveloperAttribution: true },
    });
    return workspace;
  });
}
