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

  const SELECT = { id: true, name: true, showDeveloperAttribution: true, traceViewerUrlTemplate: true } as const;

  app.get("/", { preHandler: requireAuth }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { workspaceId } = (request as FastifyRequest & { user: AuthPayload }).user;
    const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: SELECT });
    if (!workspace) return reply.status(404).send({ error: "Workspace not found" });
    return workspace;
  });

  // Update workspace settings (admin only). Partial: only provided fields change.
  app.put<{ Body: { showDeveloperAttribution?: boolean; traceViewerUrlTemplate?: string | null } }>(
    "/",
    { preHandler: requireAdmin },
    async (request, reply) => {
      const { workspaceId } = (request as FastifyRequest & { user: AuthPayload }).user;
      const body = request.body || {};
      const data: { showDeveloperAttribution?: boolean; traceViewerUrlTemplate?: string | null } = {};

      if (body.showDeveloperAttribution !== undefined) {
        if (typeof body.showDeveloperAttribution !== "boolean") {
          return reply.status(400).send({ error: "showDeveloperAttribution must be a boolean" });
        }
        data.showDeveloperAttribution = body.showDeveloperAttribution;
      }

      if (body.traceViewerUrlTemplate !== undefined) {
        const raw = body.traceViewerUrlTemplate;
        if (raw === null || raw === "") {
          data.traceViewerUrlTemplate = null;
        } else if (typeof raw !== "string") {
          return reply.status(400).send({ error: "traceViewerUrlTemplate must be a string or null" });
        } else {
          const trimmed = raw.trim();
          // Guard against SSRF/phishing links: require https and a {traceId} slot.
          if (!/^https:\/\//i.test(trimmed) || !trimmed.includes("{traceId}")) {
            return reply.status(400).send({
              error: "traceViewerUrlTemplate must be an https URL containing a {traceId} placeholder",
            });
          }
          data.traceViewerUrlTemplate = trimmed;
        }
      }

      if (Object.keys(data).length === 0) {
        return reply.status(400).send({ error: "No settings provided" });
      }

      const workspace = await prisma.workspace.update({ where: { id: workspaceId }, data, select: SELECT });
      return workspace;
    }
  );
}
