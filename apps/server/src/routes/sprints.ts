import type { FastifyInstance, FastifyPluginOptions, FastifyRequest, FastifyReply } from "fastify";
import { getPrisma } from "../db.js";
import { requireAuth, type AuthPayload } from "../middleware/auth.js";
import { assertProjectInWorkspace, assertSprintInWorkspace } from "../middleware/scope.js";
import { emptyRollup } from "../services/rollup.js";
import { dbRollupByField } from "../services/aggregate-db.js";

export async function registerSprintRoutes(
  app: FastifyInstance,
  _opts: FastifyPluginOptions
) {
  const prisma = await getPrisma();

  app.get<{ Params: { projectId: string } }>("/project/:projectId", { preHandler: requireAuth }, async (request, reply) => {
    const { workspaceId } = (request as FastifyRequest & { user: AuthPayload }).user;
    if (!(await assertProjectInWorkspace(prisma, reply, request.params.projectId, workspaceId))) return;
    const sprints = await prisma.sprint.findMany({
      where: { projectId: request.params.projectId },
      orderBy: { startDate: "desc" },
    });
    return { sprints };
  });

  app.get<{ Params: { sprintId: string } }>("/summary/:sprintId", { preHandler: requireAuth }, async (request, reply) => {
    const { workspaceId } = (request as FastifyRequest & { user: AuthPayload }).user;
    if (!(await assertSprintInWorkspace(prisma, reply, request.params.sprintId, workspaceId))) return;
    const sprint = await prisma.sprint.findUnique({
      where: { id: request.params.sprintId },
      include: {
        tickets: { select: { id: true, externalId: true, title: true } },
      },
    });

    if (!sprint) {
      return reply.status(404).send({ error: "Sprint not found" });
    }

    // Roll up all tickets' events in a single grouped DB query (#176) instead of
    // loading every event for every ticket in the sprint.
    const ticketIds = sprint.tickets.map((t) => t.id);
    const rollups =
      ticketIds.length > 0
        ? await dbRollupByField(prisma, { ticketId: { in: ticketIds } }, "ticketId")
        : new Map();

    let totalTokens = 0;
    let totalCost = 0;
    let totalDuration = 0;
    let totalEvents = 0;
    const ticketSummaries = [];

    for (const ticket of sprint.tickets) {
      const rollup = rollups.get(ticket.id) ?? emptyRollup();

      totalTokens += rollup.tokens;
      totalCost += rollup.cost;
      totalDuration += rollup.durationSeconds;
      totalEvents += rollup.eventCount;

      ticketSummaries.push({
        ticketId: ticket.id,
        externalId: ticket.externalId,
        title: ticket.title,
        tokens: rollup.tokens,
        cost: rollup.cost,
        durationSeconds: rollup.durationSeconds,
        events: rollup.eventCount,
      });
    }

    return {
      sprint: {
        id: sprint.id,
        name: sprint.name,
        startDate: sprint.startDate,
        endDate: sprint.endDate,
        status: sprint.status,
      },
      summary: {
        totalTokens,
        totalCost,
        totalDurationSeconds: totalDuration,
        ticketCount: sprint.tickets.length,
        eventCount: totalEvents,
      },
      tickets: ticketSummaries,
    };
  });
}
