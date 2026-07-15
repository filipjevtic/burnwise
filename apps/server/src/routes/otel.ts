import type { FastifyInstance, FastifyPluginOptions, FastifyRequest, FastifyReply } from "fastify";
import { randomUUID } from "crypto";
import { config } from "../config.js";
import { getPrisma } from "../db.js";
import { verifyApiKey } from "../services/apikey.js";
import { persistEvents } from "../services/ingest.js";
import { mapOtlpTracesToEvents, type OtlpTracesPayload } from "../services/otel.js";

/**
 * OTLP/HTTP trace ingestion (#207). Point any OpenTelemetry exporter at
 * `<server>/api/v1/otel/v1/traces` with a Burnwise project-scoped API key as the
 * Authorization bearer. GenAI spans (gen_ai.*) become llm.response events and
 * flow into the by-tool/by-provider/cost analytics; other spans become
 * trace.span events. Attribution reuses the shared ingest pipeline.
 */
export async function registerOtelRoutes(app: FastifyInstance, _opts: FastifyPluginOptions) {
  const prisma = await getPrisma();

  app.post("/v1/traces", {
    config: { rateLimit: { max: config.rateLimit.ingestMax, timeWindow: config.rateLimit.timeWindow } },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const authHeader = request.headers.authorization;
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) {
      return reply.status(401).send({ error: "Unauthorized" });
    }

    // OTLP payloads carry no Burnwise identity, so a project-scoped personal API
    // key is required — it supplies workspace/user/project. The shared ingest
    // key (which trusts client-provided identity) can't attribute a trace.
    const keyContext = await verifyApiKey(prisma, token);
    if (!keyContext) {
      return reply.status(401).send({ error: "Unauthorized" });
    }
    if (!keyContext.projectId) {
      return reply.status(400).send({
        error: "OTLP ingestion requires a project-scoped API key so spans can be attributed to a project.",
      });
    }

    const payload = request.body as OtlpTracesPayload;
    if (!payload || typeof payload !== "object" || !Array.isArray(payload.resourceSpans)) {
      return reply.status(400).send({ error: "Invalid OTLP traces payload: expected { resourceSpans: [...] }" });
    }

    const { events, skipped } = mapOtlpTracesToEvents(
      payload,
      { workspaceId: keyContext.workspaceId, userId: keyContext.userId, projectId: keyContext.projectId },
      randomUUID
    );

    const result = events.length > 0 ? await persistEvents(prisma, events) : { accepted: 0, rejected: 0, errors: [] };
    const rejectedSpans = result.rejected + skipped;

    // OTLP/HTTP success response is an ExportTraceServiceResponse; report any
    // dropped spans via partialSuccess so well-behaved exporters can log them.
    return reply.status(200).send(
      rejectedSpans > 0
        ? {
            partialSuccess: {
              rejectedSpans,
              errorMessage: `${result.accepted} accepted, ${result.rejected} rejected, ${skipped} skipped (no start time or unsupported)`,
            },
          }
        : { partialSuccess: {} }
    );
  });
}
