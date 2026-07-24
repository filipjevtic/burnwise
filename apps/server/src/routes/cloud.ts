import type { FastifyInstance, FastifyPluginOptions, FastifyRequest, FastifyReply } from "fastify";
import { randomUUID } from "crypto";
import { config } from "../config.js";
import { getPrisma } from "../db.js";
import { verifyApiKey } from "../services/apikey.js";
import { persistEvents } from "../services/ingest.js";
import { mapCloudLogsToEvents, type CloudLogsPayload } from "../services/cloudlogs.js";

/**
 * Cloud-log ingestion (#142). LLM calls made directly to AWS Bedrock or GCP
 * Vertex AI can't be proxied, but both clouds log every invocation with token
 * counts. Forward those logs to `<server>/api/v1/cloud/logs` (via a Cloud
 * Logging sink, CloudWatch subscription filter, scheduled export, or a small
 * Lambda/Cloud Function) as `{ entries: [...] }` with a project-scoped Burnwise
 * API key as the Authorization bearer. Each recognized entry becomes an
 * `llm.response` event and flows into the by-provider/by-tool/cost analytics.
 */
export async function registerCloudRoutes(app: FastifyInstance, _opts: FastifyPluginOptions) {
  const prisma = await getPrisma();

  app.post("/logs", {
    config: { rateLimit: { max: config.rateLimit.ingestMax, timeWindow: config.rateLimit.timeWindow } },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const authHeader = request.headers.authorization;
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) {
      return reply.status(401).send({ error: "Unauthorized" });
    }

    // Cloud log records carry no Burnwise identity, so a project-scoped personal
    // API key is required — it supplies workspace/user/project. The shared ingest
    // key (which trusts client-provided identity) can't attribute these.
    const keyContext = await verifyApiKey(prisma, token);
    if (!keyContext) {
      return reply.status(401).send({ error: "Unauthorized" });
    }
    if (!keyContext.projectId) {
      return reply.status(400).send({
        error: "Cloud-log ingestion requires a project-scoped API key so entries can be attributed to a project.",
      });
    }

    const payload = request.body as CloudLogsPayload;
    if (!payload || typeof payload !== "object" || !Array.isArray(payload.entries)) {
      return reply.status(400).send({ error: "Invalid cloud logs payload: expected { entries: [...] }" });
    }

    const { events, skipped } = mapCloudLogsToEvents(
      payload,
      { workspaceId: keyContext.workspaceId, userId: keyContext.userId, projectId: keyContext.projectId },
      randomUUID
    );

    const result =
      events.length > 0 ? await persistEvents(prisma, events) : { accepted: 0, rejected: 0, errors: [] };

    return reply.status(200).send({
      accepted: result.accepted,
      rejected: result.rejected,
      skipped,
      errors: result.errors,
    });
  });
}
