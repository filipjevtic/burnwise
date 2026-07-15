import type { FastifyInstance, FastifyPluginOptions, FastifyRequest, FastifyReply } from "fastify";
import type { Event } from "@burnwise/schema";
import { ingestBatchSchema } from "@burnwise/schema";
import { config } from "../config.js";
import { getPrisma } from "../db.js";
import { persistEvents } from "../services/ingest.js";
import { requireAuth, type AuthPayload } from "../middleware/auth.js";
import { assertProjectInWorkspace, assertTicketInWorkspace } from "../middleware/scope.js";
import { verifyApiKey } from "../services/apikey.js";
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

    return persistEvents(prisma, resolvedEvents);
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
}
