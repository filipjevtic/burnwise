/**
 * Outbound webhook delivery (#21). When events are persisted, matching active
 * subscriptions receive an HMAC-signed POST. Delivery is in-process and
 * fire-and-forget with a few timed retries — it never blocks or fails ingest.
 *
 * ponytail: in-process best-effort delivery. Webhooks are at-least-once
 * (consumers must dedup on `event.eventId`); a batch may re-fire on ingest
 * re-delivery. Add a durable queue (Redis/BullMQ) only if you need delivery to
 * survive a restart or need high webhook throughput.
 */

import { createHmac } from "crypto";
import type { PrismaClient } from "../generated/prisma/client.js";
import type { Event } from "@burnwise/schema";
import { decryptSecret } from "../lib/crypto.js";
import { fetchWithTimeout } from "../lib/fetch-timeout.js";

const WEBHOOK_TIMEOUT_MS = 10_000;
// Delays before each retry after the first attempt fails. Length = retry count.
const RETRY_DELAYS_MS = [1_000, 5_000, 15_000];

interface Logger {
  warn: (obj: unknown, msg?: string) => void;
}

export interface WebhookSub {
  id: string;
  url: string;
  /** Decrypted signing secret, or null when the subscription has none. */
  secret: string | null;
  eventTypes: string[];
}

/** True when the subscription wants this event type (empty list = all types). */
export function subscriptionMatches(sub: { eventTypes: string[] }, eventType: string): boolean {
  return sub.eventTypes.length === 0 || sub.eventTypes.includes(eventType);
}

/**
 * Build the request body + headers for one delivery. When the subscription has
 * a secret, the body is HMAC-SHA256 signed in `X-Burnwise-Signature`
 * (`sha256=<hex>`), matching the inbound CI-webhook scheme (see lib/webhook.ts).
 */
export function buildDelivery(
  sub: WebhookSub,
  event: Event,
  deliveredAt: string
): { body: string; headers: Record<string, string> } {
  const body = JSON.stringify({
    type: event.eventType,
    deliveredAt,
    event: {
      eventId: event.eventId,
      eventType: event.eventType,
      timestamp: event.timestamp,
      workspaceId: event.workspaceId,
      projectId: event.projectId,
      userId: event.userId,
      ticketId: event.ticketId ?? null,
      sessionId: event.sessionId ?? null,
      source: event.source,
      payload: event.payload,
    },
  });
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-burnwise-event": event.eventType,
  };
  if (sub.secret) {
    headers["x-burnwise-signature"] = "sha256=" + createHmac("sha256", sub.secret).update(body).digest("hex");
  }
  return { body, headers };
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** POST one delivery, retrying on network error or non-2xx. Never throws. */
async function deliver(sub: WebhookSub, event: Event, log: Logger): Promise<void> {
  const { body, headers } = buildDelivery(sub, event, new Date().toISOString());
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetchWithTimeout(sub.url, { method: "POST", body, headers }, WEBHOOK_TIMEOUT_MS);
      if (res.ok) return;
    } catch {
      // network error / timeout — fall through to retry
    }
    const delay = RETRY_DELAYS_MS[attempt];
    if (delay === undefined) {
      log.warn({ subscriptionId: sub.id, url: sub.url, eventId: event.eventId }, "Webhook delivery failed after retries");
      return;
    }
    await sleep(delay);
  }
}

/**
 * Deliver a batch of persisted events to every matching active subscription.
 * Resolves once all deliveries settle; callers fire-and-forget so ingest is
 * unaffected. Safe to call with any batch — no-ops when nothing subscribes.
 */
export async function dispatchWebhooks(
  prisma: PrismaClient,
  events: Event[],
  log: Logger = console
): Promise<void> {
  if (events.length === 0) return;
  const projectIds = [...new Set(events.map((e) => e.projectId))];
  const rows = await prisma.webhookSubscription.findMany({
    where: { projectId: { in: projectIds }, active: true },
    select: { id: true, url: true, secret: true, eventTypes: true, projectId: true },
  });
  if (rows.length === 0) return;

  const byProject = new Map<string, WebhookSub[]>();
  for (const r of rows) {
    const sub: WebhookSub = { id: r.id, url: r.url, secret: decryptSecret(r.secret) ?? null, eventTypes: r.eventTypes };
    const list = byProject.get(r.projectId) ?? [];
    list.push(sub);
    byProject.set(r.projectId, list);
  }

  const tasks: Promise<void>[] = [];
  for (const event of events) {
    for (const sub of byProject.get(event.projectId) ?? []) {
      if (subscriptionMatches(sub, event.eventType)) tasks.push(deliver(sub, event, log));
    }
  }
  await Promise.allSettled(tasks);
}
