import type { FastifyInstance, FastifyPluginOptions, FastifyRequest } from "fastify";
import { getPrisma } from "../db.js";
import { requireAuth, requireAdmin, type AuthPayload } from "../middleware/auth.js";
import { parsePagination, buildPaginationMeta } from "../lib/pagination.js";

/**
 * Read-only audit log (#20). Workspace-admin only. Immutable — there is no
 * write/update/delete API; entries are appended by the audited actions via
 * recordAudit. Scoped to the caller's workspace so tenants only see their own.
 */
export async function registerAuditRoutes(app: FastifyInstance, _opts: FastifyPluginOptions) {
  const prisma = await getPrisma();

  app.get<{
    Querystring: { action?: string; actorUserId?: string; limit?: string; offset?: string };
  }>("/", { preHandler: [requireAuth, requireAdmin] }, async (request) => {
    const { workspaceId } = (request as FastifyRequest & { user: AuthPayload }).user;
    const { action, actorUserId } = request.query;
    const pagination = parsePagination(request.query, { defaultLimit: 50, maxLimit: 200 });

    const where = {
      workspaceId,
      ...(action ? { action } : {}),
      ...(actorUserId ? { actorUserId } : {}),
    };
    const [entries, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: pagination.offset,
        take: pagination.limit,
      }),
      prisma.auditLog.count({ where }),
    ]);

    return { entries, pagination: buildPaginationMeta(pagination, total) };
  });
}
