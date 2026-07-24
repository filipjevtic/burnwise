import { describe, it } from "node:test";
import assert from "node:assert";
import { mapCloudLogsToEvents, detectCloudSource } from "./cloudlogs.js";

const identity = { workspaceId: "ws1", userId: "u1", projectId: "p1" };
let counter = 0;
const newId = () => `evt-${++counter}`;

describe("detectCloudSource", () => {
  it("detects Bedrock model-invocation records", () => {
    assert.strictEqual(
      detectCloudSource({ modelId: "anthropic.claude-3-5-sonnet", input: { inputTokenCount: 1 } }),
      "bedrock"
    );
  });
  it("detects Vertex Cloud Logging entries", () => {
    assert.strictEqual(detectCloudSource({ logName: "projects/x/logs/aiplatform.googleapis.com" }), "vertex");
    assert.strictEqual(detectCloudSource({ resource: { type: "aiplatform.googleapis.com/Endpoint" } }), "vertex");
  });
  it("detects pre-normalized entries", () => {
    assert.strictEqual(detectCloudSource({ provider: "bedrock", model: "x", promptTokens: 1 }), "normalized");
  });
  it("returns null for unrecognized records", () => {
    assert.strictEqual(detectCloudSource({ hello: "world" }), null);
    assert.strictEqual(detectCloudSource(null as unknown as Record<string, unknown>), null);
  });
});

describe("mapCloudLogsToEvents — AWS Bedrock", () => {
  it("maps a model-invocation log to an llm.response event", () => {
    const { events, skipped } = mapCloudLogsToEvents(
      {
        entries: [
          {
            schemaType: "ModelInvocationLog",
            timestamp: "2026-07-20T10:00:00Z",
            region: "us-east-1",
            requestId: "req-abc",
            operation: "InvokeModel",
            modelId: "anthropic.claude-3-5-sonnet-20240620-v1:0",
            input: { inputTokenCount: 1200 },
            output: { outputTokenCount: 350 },
            requestMetadata: { "burnwise.ticket": "PROJ-42", "burnwise.session_id": "sess-9" },
          },
        ],
      },
      identity,
      newId
    );

    assert.strictEqual(skipped, 0);
    assert.strictEqual(events.length, 1);
    const e = events[0];
    assert.strictEqual(e.eventType, "llm.response");
    assert.strictEqual(e.source, "cloud");
    assert.strictEqual(e.timestamp, "2026-07-20T10:00:00.000Z");
    assert.strictEqual(e.ticketId, "PROJ-42");
    assert.strictEqual(e.sessionId, "sess-9");
    assert.strictEqual(e.workspaceId, "ws1");
    const p = e.payload as Record<string, unknown>;
    assert.strictEqual(p.provider, "bedrock");
    assert.strictEqual(p.model, "anthropic.claude-3-5-sonnet-20240620-v1:0");
    assert.strictEqual(p.promptTokens, 1200);
    assert.strictEqual(p.completionTokens, 350);
    assert.strictEqual(p.totalTokens, 1550);
    // Cost is deliberately unset; the ingest path backfills it from pricing.
    assert.strictEqual(p.costUsd, undefined);
    assert.strictEqual((e.metadata as Record<string, unknown>).region, "us-east-1");
  });
});

describe("mapCloudLogsToEvents — GCP Vertex AI", () => {
  it("maps a Gemini Cloud Logging entry (usageMetadata)", () => {
    const { events } = mapCloudLogsToEvents(
      {
        entries: [
          {
            logName: "projects/x/logs/aiplatform.googleapis.com%2Fprediction",
            timestamp: "2026-07-20T11:00:00Z",
            resource: { type: "aiplatform.googleapis.com/Endpoint", labels: { model_id: "gemini-2.5-pro", location: "us-central1" } },
            labels: { "burnwise.ticket": "PROJ-7" },
            jsonPayload: { usageMetadata: { promptTokenCount: 500, candidatesTokenCount: 120, totalTokenCount: 620 } },
          },
        ],
      },
      identity,
      newId
    );

    assert.strictEqual(events.length, 1);
    const p = events[0].payload as Record<string, unknown>;
    assert.strictEqual(p.provider, "vertex");
    assert.strictEqual(p.model, "gemini-2.5-pro");
    assert.strictEqual(p.promptTokens, 500);
    assert.strictEqual(p.completionTokens, 120);
    assert.strictEqual(p.totalTokens, 620);
    assert.strictEqual(events[0].ticketId, "PROJ-7");
    assert.strictEqual((events[0].metadata as Record<string, unknown>).location, "us-central1");
  });

  it("maps a Claude-on-Vertex entry (Anthropic-style usage)", () => {
    const { events } = mapCloudLogsToEvents(
      {
        entries: [
          {
            logName: "projects/x/logs/aiplatform.googleapis.com",
            timestamp: "2026-07-20T12:00:00Z",
            resource: { labels: { model_id: "claude-opus-4-8" } },
            jsonPayload: { usage: { input_tokens: 800, output_tokens: 200 } },
          },
        ],
      },
      identity,
      newId
    );
    const p = events[0].payload as Record<string, unknown>;
    assert.strictEqual(p.provider, "vertex");
    assert.strictEqual(p.model, "claude-opus-4-8");
    assert.strictEqual(p.promptTokens, 800);
    assert.strictEqual(p.completionTokens, 200);
    assert.strictEqual(p.totalTokens, 1000);
  });
});

describe("mapCloudLogsToEvents — normalized + skipping", () => {
  it("maps a pre-normalized entry", () => {
    const { events } = mapCloudLogsToEvents(
      { entries: [{ provider: "bedrock", model: "amazon.titan-text-express", inputTokens: 10, outputTokens: 5, timestamp: "2026-07-20T00:00:00Z", ticket: "PROJ-1" }] },
      identity,
      newId
    );
    assert.strictEqual(events.length, 1);
    const p = events[0].payload as Record<string, unknown>;
    assert.strictEqual(p.promptTokens, 10);
    assert.strictEqual(p.completionTokens, 5);
    assert.strictEqual(events[0].ticketId, "PROJ-1");
  });

  it("skips unrecognized entries and ones without usage, without rejecting the batch", () => {
    const { events, skipped } = mapCloudLogsToEvents(
      {
        entries: [
          { hello: "world" }, // unrecognized
          { modelId: "anthropic.claude-3-haiku", input: {}, output: {} }, // recognized but no tokens
          { modelId: "anthropic.claude-3-haiku", input: { inputTokenCount: 5 }, output: { outputTokenCount: 1 } }, // valid
        ],
      },
      identity,
      newId
    );
    assert.strictEqual(events.length, 1);
    assert.strictEqual(skipped, 2);
  });

  it("ignores prototype-polluting label keys safely", () => {
    const { events } = mapCloudLogsToEvents(
      {
        entries: [
          {
            modelId: "anthropic.claude-3-haiku",
            input: { inputTokenCount: 5 },
            output: { outputTokenCount: 1 },
            requestMetadata: JSON.parse('{"__proto__": {"polluted": true}, "burnwise.ticket": "PROJ-9"}'),
          },
        ],
      },
      identity,
      newId
    );
    assert.strictEqual(events[0].ticketId, "PROJ-9");
    assert.strictEqual(({} as Record<string, unknown>).polluted, undefined);
  });
});
