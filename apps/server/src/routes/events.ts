import type { FastifyInstance, FastifyPluginOptions, FastifyRequest, FastifyReply } from "fastify";
import { ingestBatchSchema, type IngestResponse } from "@burnwise/schema";
import { config } from "../config.js";
import { getPrisma } from "../db.js";
import { associateEvent } from "../services/association.js";
import { requireAuth, type AuthPayload } from "../middleware/auth.js";
import { assertProjectInWorkspace, assertTicketInWorkspace } from "../middleware/scope.js";
import { verifyApiKey } from "../services/apikey.js";

export async function registerEventRoutes(
  app: FastifyInstance,
  _opts: FastifyPluginOptions
) {
  const prisma = await getPrisma();

  app.post("/ingest", async (request: FastifyRequest, reply: FastifyReply) => {
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

    const response: IngestResponse = { accepted: 0, rejected: 0, errors: [] };

    for (const [index, event] of parsed.data.events.entries()) {
      try {
        // When authenticated with a personal key, override the identity fields
        // from the key so events cannot be spoofed onto other users/workspaces.
        const resolved = keyContext
          ? {
              workspaceId: keyContext.workspaceId,
              userId: keyContext.userId,
              projectId: keyContext.projectId ?? event.projectId,
            }
          : {
              workspaceId: event.workspaceId,
              userId: event.userId,
              projectId: event.projectId,
            };

        const association = await associateEvent({ ...event, ...resolved });

        await prisma.event.create({
          data: {
            eventId: event.eventId,
            eventType: event.eventType,
            timestamp: new Date(event.timestamp),
            source: event.source,
            workspaceId: resolved.workspaceId,
            projectId: resolved.projectId,
            userId: resolved.userId,
            ticketId: association.ticketId,
            sessionId: event.sessionId ?? null,
            traceId: event.traceId,
            spanId: event.spanId,
            parentSpanId: event.parentSpanId,
            payload: event.payload as any,
            metadata: event.metadata as any,
            associationMethod: association.method,
            associationConfidence: association.confidence,
          },
        });

        response.accepted++;
      } catch (err) {
        response.rejected++;
        response.errors.push({
          index,
          message: err instanceof Error ? err.message : "Unknown error",
        });
      }
    }

    return response;
  });

  app.get<{ Params: { ticketId: string } }>("/by-ticket/:ticketId", { preHandler: requireAuth }, async (request, reply) => {
    const { workspaceId } = (request as FastifyRequest & { user: AuthPayload }).user;
    if (!(await assertTicketInWorkspace(prisma, reply, request.params.ticketId, workspaceId))) return;
    const events = await prisma.event.findMany({
      where: { ticketId: request.params.ticketId },
      orderBy: { timestamp: "desc" },
      take: 1000,
    });
    return { events };
  });

  app.get<{ Params: { projectId: string }; Querystring: { from?: string; to?: string } }>("/by-project/:projectId", { preHandler: requireAuth }, async (request, reply) => {
    const { workspaceId } = (request as FastifyRequest & { user: AuthPayload }).user;
    const { projectId } = request.params;
    if (!(await assertProjectInWorkspace(prisma, reply, projectId, workspaceId))) return;
    const { from, to } = request.query;
    const events = await prisma.event.findMany({
      where: {
        projectId,
        timestamp: {
          gte: from ? new Date(from) : undefined,
          lte: to ? new Date(to) : undefined,
        },
      },
      orderBy: { timestamp: "desc" },
      take: 1000,
    });
    return { events };
  });
}
