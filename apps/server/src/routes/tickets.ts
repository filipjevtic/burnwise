import type { FastifyInstance, FastifyPluginOptions, FastifyRequest, FastifyReply } from "fastify";
import { getPrisma } from "../db.js";
import { requireAuth, type AuthPayload } from "../middleware/auth.js";
import { assertProjectInWorkspace, assertTicketInWorkspace } from "../middleware/scope.js";
import { dbRollup } from "../services/aggregate-db.js";
import { parsePagination, buildPaginationMeta } from "../lib/pagination.js";

export async function registerTicketRoutes(
  app: FastifyInstance,
  _opts: FastifyPluginOptions
) {
  const prisma = await getPrisma();

  app.get<{ Params: { projectId: string }; Querystring: { limit?: string; offset?: string } }>("/project/:projectId", { preHandler: requireAuth }, async (request, reply) => {
    const { workspaceId } = (request as FastifyRequest & { user: AuthPayload }).user;
    if (!(await assertProjectInWorkspace(prisma, reply, request.params.projectId, workspaceId))) return;
    const pagination = parsePagination(request.query, { defaultLimit: 200 });
    const where = { projectId: request.params.projectId };
    const [tickets, total] = await Promise.all([
      prisma.ticket.findMany({
        where,
        include: { sprint: true },
        orderBy: { updatedAt: "desc" },
        skip: pagination.offset,
        take: pagination.limit,
      }),
      prisma.ticket.count({ where }),
    ]);
    return { tickets, pagination: buildPaginationMeta(pagination, total) };
  });

  app.get<{ Params: { ticketId: string } }>("/summary/:ticketId", { preHandler: requireAuth }, async (request, reply) => {
    const { workspaceId } = (request as FastifyRequest & { user: AuthPayload }).user;
    if (!(await assertTicketInWorkspace(prisma, reply, request.params.ticketId, workspaceId))) return;
    const ticket = await prisma.ticket.findUnique({
      where: { id: request.params.ticketId },
    });

    if (!ticket) {
      return reply.status(404).send({ error: "Ticket not found" });
    }

    // Roll up this ticket's events in the DB rather than loading them (#176).
    const rollup = await dbRollup(prisma, { ticketId: ticket.id });

    return {
      ticket: {
        id: ticket.id,
        externalId: ticket.externalId,
        title: ticket.title,
        status: ticket.status,
        storyPoints: ticket.storyPoints,
      },
      summary: {
        totalTokens: rollup.tokens,
        totalCost: rollup.cost,
        totalDurationSeconds: rollup.durationSeconds,
        eventCount: rollup.eventCount,
      },
    };
  });
}
