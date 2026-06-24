import { describe, it } from "node:test";
import assert from "node:assert";
import { extractAttribution, stripBurnwiseHeaders } from "./attribution.js";

describe("extractAttribution", () => {
  it("reads key/ticket/session/user/project headers (case-insensitive)", () => {
    const attr = extractAttribution({
      "X-Burnwise-Key": "bw_sk_123",
      "x-burnwise-ticket": "PROJ-123",
      "X-Burnwise-Session": "sess-1",
      "x-burnwise-user": "user-1",
      "X-Burnwise-Project": "proj-1",
      authorization: "Bearer provider-key",
    });
    assert.strictEqual(attr.key, "bw_sk_123");
    assert.strictEqual(attr.ticketId, "PROJ-123");
    assert.strictEqual(attr.sessionId, "sess-1");
    assert.strictEqual(attr.userId, "user-1");
    assert.strictEqual(attr.projectId, "proj-1");
  });

  it("collects custom properties", () => {
    const attr = extractAttribution({
      "x-burnwise-property-env": "prod",
      "X-Burnwise-Property-App": "mobile",
    });
    assert.deepStrictEqual(attr.properties, { env: "prod", app: "mobile" });
  });

  it("returns empty attribution when no headers present", () => {
    const attr = extractAttribution({ authorization: "Bearer x", "content-type": "application/json" });
    assert.strictEqual(attr.ticketId, undefined);
    assert.deepStrictEqual(attr.properties, {});
  });

  it("takes the first value for array-valued headers", () => {
    const attr = extractAttribution({ "x-burnwise-ticket": ["PROJ-1", "PROJ-2"] });
    assert.strictEqual(attr.ticketId, "PROJ-1");
  });
});

describe("stripBurnwiseHeaders", () => {
  it("removes all x-burnwise-* headers but keeps the rest", () => {
    const stripped = stripBurnwiseHeaders({
      "X-Burnwise-Key": "bw_sk_123",
      "x-burnwise-ticket": "PROJ-123",
      "x-burnwise-property-env": "prod",
      authorization: "Bearer provider-key",
      "content-type": "application/json",
    });
    assert.ok(!("X-Burnwise-Key" in stripped));
    assert.ok(!("x-burnwise-ticket" in stripped));
    assert.ok(!("x-burnwise-property-env" in stripped));
    assert.strictEqual(stripped["authorization"], "Bearer provider-key");
    assert.strictEqual(stripped["content-type"], "application/json");
  });
});
