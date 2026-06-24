import type { FastifyInstance, FastifyPluginOptions, FastifyRequest, FastifyReply } from "fastify";
import { getPrisma } from "../db.js";
import { requireAuth, type AuthPayload } from "../middleware/auth.js";
import { assertProjectInWorkspace, assertSprintInWorkspace } from "../middleware/scope.js";

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
        tickets: {
          include: { events: true },
        },
      },
    });

    if (!sprint) {
      return reply.status(404).send({ error: "Sprint not found" });
    }

    let totalTokens = 0;
    let totalCost = 0;
    let totalDuration = 0;
    const ticketSummaries = [];

    for (const ticket of sprint.tickets) {
      let ticketTokens = 0;
      let ticketCost = 0;
      let ticketDuration = 0;

      for (const event of ticket.events) {
        const payload = event.payload as Record<string, unknown>;
        if (event.eventType === "llm.response") {
          ticketTokens += (payload.totalTokens as number) || 0;
          ticketCost += (payload.costUsd as number) || 0;
        } else if (event.eventType === "session.activity") {
          ticketDuration += (payload.durationSeconds as number) || 0;
        } else if (event.eventType === "ci.run") {
          ticketCost += (payload.costUsd as number) || 0;
        }
      }

      totalTokens += ticketTokens;
      totalCost += ticketCost;
      totalDuration += ticketDuration;

      ticketSummaries.push({
        ticketId: ticket.id,
        externalId: ticket.externalId,
        title: ticket.title,
        tokens: ticketTokens,
        cost: ticketCost,
        durationSeconds: ticketDuration,
        events: ticket.events.length,
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
        eventCount: sprint.tickets.reduce((sum: number, t: { events: unknown[] }) => sum + t.events.length, 0),
      },
      tickets: ticketSummaries,
    };
  });
}
