/**
 * Shared event-ingest core: association + server-side cost backfill + chunked,
 * idempotent bulk insert. Used by both the generic /events/ingest endpoint and
 * the OTLP trace endpoint (#207) so every ingestion path attributes and prices
 * events the same way.
 *
 * Callers pass events whose identity (workspace/user/project) is already
 * resolved from the API key — this module does not do auth.
 */

import type { Prisma, PrismaClient } from "../generated/prisma/client.js";
import type { Event, IngestResponse } from "@burnwise/schema";
import { resolveCostUsd } from "@burnwise/pricing";
import { associateEvent, type AssociationCache } from "./association.js";
import { deriveEventMetrics } from "./rollup.js";
import { dispatchWebhooks } from "./webhook-delivery.js";

interface Logger {
  warn: (obj: unknown, msg?: string) => void;
}

/** Max rows per createMany statement to keep parameter counts well-bounded. */
const INSERT_CHUNK_SIZE = 500;

/**
 * For llm.response events, ensure `costUsd` is set on the payload using the
 * central pricing table. Returns the payload unchanged for other event types
 * or when there is nothing to price. Never mutates the input payload.
 */
export function backfillEventCost(eventType: string, payload: unknown): unknown {
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

/**
 * Associate, cost-backfill, and bulk-insert a batch of already-identity-resolved
 * events. Returns per-event accepted/rejected counts. Insert is idempotent:
 * duplicate eventIds are silently skipped, so webhook/exporter re-delivery is
 * safe.
 */
export async function persistEvents(
  prisma: PrismaClient,
  events: Event[],
  logger?: Logger
): Promise<IngestResponse> {
  const response: IngestResponse = { accepted: 0, rejected: 0, errors: [] };
  const cache: AssociationCache = { tickets: new Map(), sessions: new Map() };
  const rows: Array<{ index: number; data: Prisma.EventCreateManyInput; event: Event }> = [];
  // Events that were actually persisted, for outbound webhook delivery (#21).
  const persisted: Event[] = [];

  // Phase 1: resolve ticket associations and build insert rows.
  for (const [index, event] of events.entries()) {
    try {
      const association = await associateEvent(event, cache);
      const payload = backfillEventCost(event.eventType, event.payload);
      // Denormalize metrics from the (cost-backfilled) payload so DB-side
      // rollups don't have to load payload JSON (#176).
      const metrics = deriveEventMetrics(event.eventType, payload);
      // Deliver what was actually persisted: the cost-backfilled payload and the
      // resolved ticket, so webhook consumers see the same data as the DB (#21).
      const persistedEvent = { ...event, payload, ticketId: association.ticketId } as Event;
      rows.push({
        index,
        event: persistedEvent,
        data: {
          eventId: event.eventId,
          eventType: event.eventType,
          timestamp: new Date(event.timestamp),
          source: event.source,
          workspaceId: event.workspaceId,
          projectId: event.projectId,
          userId: event.userId,
          ticketId: association.ticketId,
          sessionId: event.sessionId ?? null,
          traceId: event.traceId,
          spanId: event.spanId,
          parentSpanId: event.parentSpanId,
          payload: payload as Prisma.InputJsonValue,
          metadata: event.metadata as Prisma.InputJsonValue,
          totalTokens: metrics.totalTokens,
          costUsd: metrics.costUsd,
          durationSeconds: metrics.durationSeconds,
          provider: metrics.provider,
          associationMethod: association.method,
          associationConfidence: association.confidence,
        },
      });
    } catch (err) {
      response.rejected++;
      response.errors.push({ index, message: err instanceof Error ? err.message : "Unknown error" });
    }
  }

  // Phase 2: chunked bulk insert with per-row fallback so one bad row (e.g. an
  // FK violation) doesn't reject the whole chunk.
  for (let i = 0; i < rows.length; i += INSERT_CHUNK_SIZE) {
    const chunk = rows.slice(i, i + INSERT_CHUNK_SIZE);
    try {
      const result = await prisma.event.createMany({ data: chunk.map((r) => r.data), skipDuplicates: true });
      response.accepted += result.count;
      // createMany can't say which rows were dedup-skipped; fire for the whole
      // chunk (webhooks are at-least-once — consumers dedup on eventId).
      for (const row of chunk) persisted.push(row.event);
    } catch {
      for (const row of chunk) {
        try {
          await prisma.event.create({ data: row.data });
          response.accepted++;
          persisted.push(row.event);
        } catch (err) {
          response.rejected++;
          response.errors.push({ index: row.index, message: err instanceof Error ? err.message : "Unknown error" });
        }
      }
    }
  }

  // Fire outbound webhooks without blocking the ingest response (#21).
  void dispatchWebhooks(prisma, persisted, logger).catch(() => {});

  return response;
}
