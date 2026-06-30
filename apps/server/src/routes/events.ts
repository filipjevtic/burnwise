import type { FastifyInstance, FastifyPluginOptions, FastifyRequest, FastifyReply } from "fastify";
import type { Prisma } from "../generated/prisma/client.js";
import { ingestBatchSchema, type IngestResponse } from "@burnwise/schema";
import { config } from "../config.js";
import { getPrisma } from "../db.js";
import { associateEvent, createAssociationCache } from "../services/association.js";
import { requireAuth, type AuthPayload } from "../middleware/auth.js";
import { assertProjectInWorkspace, assertTicketInWorkspace } from "../middleware/scope.js";
import { verifyApiKey } from "../services/apikey.js";
import { parsePagination, buildPaginationMeta } from "../lib/pagination.js";
import { resolveCostUsd } from "@burnwise/pricing";

/** Max rows per createMany statement to keep parameter counts well-bounded. */
const INSERT_CHUNK_SIZE = 500;

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

    const response: IngestResponse = { accepted: 0, rejected: 0, errors: [] };

    // Phase 1: resolve ticket associations and build insert rows. A per-batch
    // cache memoizes ticket/session lookups so a batch that targets one
    // ticket/session costs a couple of queries instead of one per event.
    const cache = createAssociationCache();
    const rows: Array<{ index: number; data: Prisma.EventCreateManyInput }> = [];

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

        const association = await associateEvent({ ...event, ...resolved }, cache);

        // Cost is authoritative server-side: for llm.response events that
        // arrive without a cost (e.g. from the CLI or direct API callers), or
        // with a zero cost, derive it from the central price table so all cost
        // analytics use one consistent source of truth.
        const payload = backfillEventCost(event.eventType, event.payload);

        rows.push({
          index,
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
            payload: payload as Prisma.InputJsonValue,
            metadata: event.metadata as Prisma.InputJsonValue,
            associationMethod: association.method,
            associationConfidence: association.confidence,
          },
        });
      } catch (err) {
        response.rejected++;
        response.errors.push({
          index,
          message: err instanceof Error ? err.message : "Unknown error",
        });
      }
    }

    // Phase 2: bulk-insert in chunks. createMany with skipDuplicates makes
    // re-delivery idempotent (duplicate eventIds are silently ignored). If a
    // chunk fails (e.g. an FK violation on one row), fall back to per-row
    // inserts for that chunk so a single bad event doesn't reject the rest.
    for (let i = 0; i < rows.length; i += INSERT_CHUNK_SIZE) {
      const chunk = rows.slice(i, i + INSERT_CHUNK_SIZE);
      try {
        const result = await prisma.event.createMany({
          data: chunk.map((r) => r.data),
          skipDuplicates: true,
        });
        response.accepted += result.count;
      } catch {
        for (const row of chunk) {
          try {
            await prisma.event.create({ data: row.data });
            response.accepted++;
          } catch (err) {
            response.rejected++;
            response.errors.push({
              index: row.index,
              message: err instanceof Error ? err.message : "Unknown error",
            });
          }
        }
      }
    }

    return response;
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

/**
 * For llm.response events, ensure `costUsd` is set on the payload using the
 * central pricing table. Returns the payload unchanged for other event types
 * or when there is nothing to price. Never mutates the input payload.
 */
function backfillEventCost(eventType: string, payload: unknown): unknown {
  if (eventType !== "llm.response" || payload === null || typeof payload !== "object") {
    return payload;
  }
  const p = payload as Record<string, unknown>;
  const costUsd = resolveCostUsd({
    provider: typeof p.provider === "string" ? p.provider : undefined,
    model: typeof p.model === "string" ? p.model : undefined,
    promptTokens: typeof p.promptTokens === "number" ? p.promptTokens : undefined,
    completionTokens: typeof p.completionTokens === "number" ? p.completionTokens : undefined,
    totalTokens: typeof p.totalTokens === "number" ? p.totalTokens : undefined,
    costUsd: typeof p.costUsd === "number" ? p.costUsd : undefined,
  });
  if (costUsd === undefined || costUsd === p.costUsd) return payload;
  return { ...p, costUsd };
}
