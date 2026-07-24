import type { FastifyInstance, FastifyPluginOptions, FastifyRequest, FastifyReply } from "fastify";
import type { Event } from "@burnwise/schema";
import { ingestBatchSchema } from "@burnwise/schema";
import { config } from "../config.js";
import type { Prisma } from "../generated/prisma/client.js";
import { getPrisma } from "../db.js";
import { persistEvents } from "../services/ingest.js";
import { requireAuth, type AuthPayload } from "../middleware/auth.js";
import { assertProjectInWorkspace, assertTicketInWorkspace } from "../middleware/scope.js";
import { verifyApiKey } from "../services/apikey.js";
import { recordAudit } from "../services/audit.js";
import { parsePagination, buildPaginationMeta } from "../lib/pagination.js";

export async function registerEventRoutes(
  app: FastifyInstance,
  _opts: FastifyPluginOptions
) {
  const prisma = await getPrisma();

  app.post("/ingest", {
    config: { rateLimit: { max: config.rateLimit.ingestMax, timeWindow: config.rateLimit.timeWindow } },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const authHeader = request.headers.authorization;
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) {
      return reply.status(401).send({ error: "Unauthorized" });
    }

    // Two auth paths:
    //  1. A personal API key (recommended): we trust the server-resolved
    //     userId/workspaceId/projectId, NOT the client-provided values.
    //  2. The shared INGEST_API_KEY (legacy/CI): client-provided identity is
    //     trusted as before for backward compatibility.
    const keyContext = await verifyApiKey(prisma, token);
    const isSharedKey = token === config.ingestApiKey;
    if (!keyContext && !isSharedKey) {
      return reply.status(401).send({ error: "Unauthorized" });
    }

    const body = request.body;
    const parsed = ingestBatchSchema.safeParse(body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.format() });
    }

    // When authenticated with a personal key, override the identity fields from
    // the key so events cannot be spoofed onto other users/workspaces. The
    // shared INGEST_API_KEY path trusts client-provided identity (legacy/CI).
    const resolvedEvents: Event[] = parsed.data.events.map((event) =>
      keyContext
        ? {
            ...event,
            workspaceId: keyContext.workspaceId,
            userId: keyContext.userId,
            projectId: keyContext.projectId ?? event.projectId,
          }
        : event
    );

    return persistEvents(prisma, resolvedEvents, request.log);
  });

  app.get<{ Params: { ticketId: string }; Querystring: { limit?: string; offset?: string } }>("/by-ticket/:ticketId", { preHandler: requireAuth }, async (request, reply) => {
    const { workspaceId } = (request as FastifyRequest & { user: AuthPayload }).user;
    if (!(await assertTicketInWorkspace(prisma, reply, request.params.ticketId, workspaceId))) return;
    const pagination = parsePagination(request.query);
    const where = { ticketId: request.params.ticketId };
    const [events, total] = await Promise.all([
      prisma.event.findMany({
        where,
        orderBy: { timestamp: "desc" },
        skip: pagination.offset,
        take: pagination.limit,
      }),
      prisma.event.count({ where }),
    ]);
    return { events, pagination: buildPaginationMeta(pagination, total) };
  });

  app.get<{ Params: { projectId: string }; Querystring: { from?: string; to?: string; limit?: string; offset?: string } }>("/by-project/:projectId", { preHandler: requireAuth }, async (request, reply) => {
    const { workspaceId } = (request as FastifyRequest & { user: AuthPayload }).user;
    const { projectId } = request.params;
    if (!(await assertProjectInWorkspace(prisma, reply, projectId, workspaceId))) return;
    const { from, to } = request.query;
    const pagination = parsePagination(request.query);
    const where = {
      projectId,
      timestamp: {
        gte: from ? new Date(from) : undefined,
        lte: to ? new Date(to) : undefined,
      },
    };
    const [events, total] = await Promise.all([
      prisma.event.findMany({
        where,
        orderBy: { timestamp: "desc" },
        skip: pagination.offset,
        take: pagination.limit,
      }),
      prisma.event.count({ where }),
    ]);
    return { events, pagination: buildPaginationMeta(pagination, total) };
  });

  // Events the association pipeline couldn't attribute to a ticket, for manual
  // resolution (#24). Excludes ones already rejected. `not: "rejected"` alone
  // would drop NULL-method rows in SQL, so keep them via the OR.
  app.get<{
    Querystring: { projectId?: string; limit?: string; offset?: string };
  }>("/unresolved", { preHandler: requireAuth }, async (request, reply) => {
    const { workspaceId } = (request as FastifyRequest & { user: AuthPayload }).user;
    const { projectId } = request.query;
    if (!projectId) return reply.status(400).send({ error: "projectId is required" });
    if (!(await assertProjectInWorkspace(prisma, reply, projectId, workspaceId))) return;

    const pagination = parsePagination(request.query);
    const where = {
      projectId,
      ticketId: null,
      OR: [{ associationMethod: null }, { associationMethod: { not: "rejected" } }],
    };
    const [events, total] = await Promise.all([
      prisma.event.findMany({
        where,
        orderBy: { timestamp: "desc" },
        skip: pagination.offset,
        take: pagination.limit,
        select: {
          eventId: true,
          eventType: true,
          timestamp: true,
          source: true,
          sessionId: true,
          payload: true,
          metadata: true,
          associationMethod: true,
        },
      }),
      prisma.event.count({ where }),
    ]);
    return { events, pagination: buildPaginationMeta(pagination, total) };
  });

  // Manually attribute an unresolved event to a ticket (#24). Records it as a
  // high-confidence "manual" association; the ticket must be in the same project.
  app.post<{ Params: { eventId: string }; Body: { ticketId?: string } }>(
    "/:eventId/resolve",
    { preHandler: requireAuth },
    async (request, reply) => {
      const { workspaceId, userId } = (request as FastifyRequest & { user: AuthPayload }).user;
      const { ticketId } = request.body ?? {};
      if (!ticketId) return reply.status(400).send({ error: "ticketId is required" });

      const event = await prisma.event.findUnique({
        where: { eventId: request.params.eventId },
        select: { id: true, projectId: true, ticketId: true },
      });
      if (!event) return reply.status(404).send({ error: "Event not found" });
      if (!(await assertProjectInWorkspace(prisma, reply, event.projectId, workspaceId))) return;

      const ticket = await assertTicketInWorkspace(prisma, reply, ticketId, workspaceId);
      if (!ticket) return;
      if (ticket.projectId !== event.projectId) {
        return reply.status(400).send({ error: "Ticket belongs to a different project" });
      }

      await prisma.event.update({
        where: { id: event.id },
        data: { ticketId, associationMethod: "manual", associationConfidence: 1.0 },
      });
      await recordAudit(prisma, {
        workspaceId,
        actorUserId: userId,
        action: "event.resolve",
        targetType: "event",
        targetId: request.params.eventId,
        metadata: { projectId: event.projectId, from: event.ticketId ?? null, to: ticketId },
      });
      return { ok: true, eventId: request.params.eventId, ticketId };
    }
  );

  // Mark an unresolved event as intentionally not attributable (#24), so it drops
  // out of the resolution queue. Keeps ticketId null; stores an optional reason.
  app.post<{ Params: { eventId: string }; Body: { reason?: string } }>(
    "/:eventId/reject",
    { preHandler: requireAuth },
    async (request, reply) => {
      const { workspaceId, userId } = (request as FastifyRequest & { user: AuthPayload }).user;
      const event = await prisma.event.findUnique({
        where: { eventId: request.params.eventId },
        select: { id: true, projectId: true, metadata: true },
      });
      if (!event) return reply.status(404).send({ error: "Event not found" });
      if (!(await assertProjectInWorkspace(prisma, reply, event.projectId, workspaceId))) return;

      const reason = typeof request.body?.reason === "string" ? request.body.reason.trim() : "";
      const metadata = { ...((event.metadata as Record<string, unknown>) ?? {}) };
      if (reason) metadata.rejectionReason = reason;

      await prisma.event.update({
        where: { id: event.id },
        data: {
          associationMethod: "rejected",
          metadata: metadata as Prisma.InputJsonValue,
        },
      });
      await recordAudit(prisma, {
        workspaceId,
        actorUserId: userId,
        action: "event.reject",
        targetType: "event",
        targetId: request.params.eventId,
        metadata: { projectId: event.projectId, ...(reason ? { reason } : {}) },
      });
      return { ok: true, eventId: request.params.eventId };
    }
  );
}
