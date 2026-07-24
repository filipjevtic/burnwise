import type { FastifyInstance, FastifyPluginOptions } from "fastify";
import { getPrisma } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { requireProjectRole } from "../middleware/rbac.js";
import { encryptSecret } from "../lib/crypto.js";
import { assertSafeIntegrationUrl, SsrfError } from "../lib/ssrf.js";

// Event types a subscription may filter on. Kept in sync with the ingest schema.
const EVENT_TYPES = ["llm.request", "llm.response", "trace.span", "session.activity", "ci.run"];

// A subscription as returned to clients: the secret is never exposed, only
// whether one is set.
function toPublic(row: { id: string; url: string; secret: string | null; eventTypes: string[]; active: boolean; createdAt: Date }) {
  return {
    id: row.id,
    url: row.url,
    eventTypes: row.eventTypes,
    active: row.active,
    hasSecret: Boolean(row.secret),
    createdAt: row.createdAt,
  };
}

function validateEventTypes(eventTypes: unknown): string[] | null {
  if (eventTypes === undefined) return [];
  if (!Array.isArray(eventTypes) || !eventTypes.every((t) => typeof t === "string" && EVENT_TYPES.includes(t))) {
    return null;
  }
  return eventTypes as string[];
}

/**
 * Outbound webhook subscription management (#21). Project-admin only. Secrets
 * are encrypted at rest and never returned. URLs are SSRF-checked on write.
 */
export async function registerWebhookRoutes(
  app: FastifyInstance,
  _opts: FastifyPluginOptions
) {
  const prisma = await getPrisma();

  // List a project's subscriptions.
  app.get<{ Querystring: { projectId?: string } }>("/", { preHandler: requireAuth }, async (request, reply) => {
    const { projectId } = request.query;
    if (!projectId) return reply.status(400).send({ error: "projectId is required" });
    if (!(await requireProjectRole(prisma, request, reply, projectId, "admin"))) return;
    const rows = await prisma.webhookSubscription.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
    });
    return { subscriptions: rows.map(toPublic) };
  });

  // Create a subscription.
  app.post<{
    Body: { projectId?: string; url?: string; secret?: string; eventTypes?: string[]; active?: boolean };
  }>("/", { preHandler: requireAuth }, async (request, reply) => {
    const { projectId, url, secret, active } = request.body ?? {};
    if (!projectId || !url) return reply.status(400).send({ error: "projectId and url are required" });
    if (!(await requireProjectRole(prisma, request, reply, projectId, "admin"))) return;

    const eventTypes = validateEventTypes(request.body?.eventTypes);
    if (eventTypes === null) {
      return reply.status(400).send({ error: `eventTypes must be a subset of: ${EVENT_TYPES.join(", ")}` });
    }
    try {
      await assertSafeIntegrationUrl(url);
    } catch (err) {
      if (err instanceof SsrfError) return reply.status(400).send({ error: err.message });
      throw err;
    }

    const created = await prisma.webhookSubscription.create({
      data: {
        projectId,
        url,
        secret: secret ? (encryptSecret(secret) ?? null) : null,
        eventTypes,
        active: active ?? true,
      },
    });
    return reply.status(201).send({ subscription: toPublic(created) });
  });

  // Update a subscription. Omitted fields are left unchanged; `secret: null`
  // clears the secret, a string sets it.
  app.put<{
    Params: { id: string };
    Body: { url?: string; secret?: string | null; eventTypes?: string[]; active?: boolean };
  }>("/:id", { preHandler: requireAuth }, async (request, reply) => {
    const existing = await prisma.webhookSubscription.findUnique({ where: { id: request.params.id } });
    if (!existing) return reply.status(404).send({ error: "Subscription not found" });
    if (!(await requireProjectRole(prisma, request, reply, existing.projectId, "admin"))) return;

    const { url, secret, active } = request.body ?? {};
    const data: { url?: string; secret?: string | null; eventTypes?: string[]; active?: boolean } = {};

    if (url !== undefined) {
      try {
        await assertSafeIntegrationUrl(url);
      } catch (err) {
        if (err instanceof SsrfError) return reply.status(400).send({ error: err.message });
        throw err;
      }
      data.url = url;
    }
    if (request.body?.eventTypes !== undefined) {
      const eventTypes = validateEventTypes(request.body.eventTypes);
      if (eventTypes === null) {
        return reply.status(400).send({ error: `eventTypes must be a subset of: ${EVENT_TYPES.join(", ")}` });
      }
      data.eventTypes = eventTypes;
    }
    if (secret !== undefined) data.secret = secret ? (encryptSecret(secret) ?? null) : null;
    if (active !== undefined) data.active = active;

    const updated = await prisma.webhookSubscription.update({ where: { id: existing.id }, data });
    return { subscription: toPublic(updated) };
  });

  // Delete a subscription.
  app.delete<{ Params: { id: string } }>("/:id", { preHandler: requireAuth }, async (request, reply) => {
    const existing = await prisma.webhookSubscription.findUnique({ where: { id: request.params.id } });
    if (!existing) return reply.status(404).send({ error: "Subscription not found" });
    if (!(await requireProjectRole(prisma, request, reply, existing.projectId, "admin"))) return;
    await prisma.webhookSubscription.delete({ where: { id: existing.id } });
    return { ok: true };
  });
}

// Exported for reuse (docs/tests): the set of event types a webhook can filter.
export { EVENT_TYPES as WEBHOOK_EVENT_TYPES };
