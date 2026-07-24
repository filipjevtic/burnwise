import { describe, it } from "node:test";
import assert from "node:assert";
import { createHmac } from "node:crypto";
import { subscriptionMatches, buildDelivery, type WebhookSub } from "./webhook-delivery.js";
import type { Event } from "@burnwise/schema";

const event: Event = {
  eventId: "11111111-1111-1111-1111-111111111111",
  eventType: "llm.response",
  timestamp: "2026-07-24T00:00:00.000Z",
  source: "proxy",
  workspaceId: "ws1",
  projectId: "p1",
  userId: "u1",
  ticketId: "t1",
  sessionId: "s1",
  payload: { model: "claude-opus-4-8", totalTokens: 100 },
} as unknown as Event;

describe("subscriptionMatches", () => {
  it("matches when the event type is listed", () => {
    assert.equal(subscriptionMatches({ eventTypes: ["llm.response", "ci.run"] }, "llm.response"), true);
  });
  it("does not match when the event type is absent", () => {
    assert.equal(subscriptionMatches({ eventTypes: ["ci.run"] }, "llm.response"), false);
  });
  it("matches every type when the list is empty (subscribe to all)", () => {
    assert.equal(subscriptionMatches({ eventTypes: [] }, "trace.span"), true);
  });
});

describe("buildDelivery", () => {
  const deliveredAt = "2026-07-24T01:00:00.000Z";

  it("signs the body with HMAC-SHA256 a consumer can verify", () => {
    const sub: WebhookSub = { id: "w1", url: "https://x", secret: "s3cret", eventTypes: [] };
    const { body, headers } = buildDelivery(sub, event, deliveredAt);
    const expected = "sha256=" + createHmac("sha256", "s3cret").update(body).digest("hex");
    assert.equal(headers["x-burnwise-signature"], expected);
    assert.equal(headers["x-burnwise-event"], "llm.response");
    assert.equal(headers["content-type"], "application/json");
  });

  it("omits the signature header when the subscription has no secret", () => {
    const sub: WebhookSub = { id: "w1", url: "https://x", secret: null, eventTypes: [] };
    const { headers } = buildDelivery(sub, event, deliveredAt);
    assert.equal("x-burnwise-signature" in headers, false);
  });

  it("serializes the event envelope with the key fields", () => {
    const sub: WebhookSub = { id: "w1", url: "https://x", secret: null, eventTypes: [] };
    const { body } = buildDelivery(sub, event, deliveredAt);
    const parsed = JSON.parse(body);
    assert.equal(parsed.type, "llm.response");
    assert.equal(parsed.deliveredAt, deliveredAt);
    assert.equal(parsed.event.eventId, event.eventId);
    assert.equal(parsed.event.projectId, "p1");
    assert.equal(parsed.event.ticketId, "t1");
    assert.deepEqual(parsed.event.payload, { model: "claude-opus-4-8", totalTokens: 100 });
  });
});
