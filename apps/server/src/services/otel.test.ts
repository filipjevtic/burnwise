import { describe, it } from "node:test";
import assert from "node:assert";
import { mapOtlpTracesToEvents, attributesToObject, nanoToIso, type OtlpTracesPayload } from "./otel.js";

const IDENTITY = { workspaceId: "ws1", userId: "u1", projectId: "p1" };
let counter = 0;
const newId = () => `evt-${++counter}`;

function attr(key: string, value: unknown) {
  if (typeof value === "number") return { key, value: { intValue: String(value) } };
  if (typeof value === "boolean") return { key, value: { boolValue: value } };
  return { key, value: { stringValue: String(value) } };
}

const START = "1700000000000000000"; // unix nanos
const END = "1700000002000000000"; // +2s

function payload(attrs: ReturnType<typeof attr>[], over: Record<string, unknown> = {}): OtlpTracesPayload {
  return {
    resourceSpans: [
      {
        resource: { attributes: [attr("service.name", "agent")] },
        scopeSpans: [
          {
            scope: { name: "openllmetry" },
            spans: [
              {
                traceId: "abc123",
                spanId: "span1",
                parentSpanId: "parent1",
                name: "chat",
                startTimeUnixNano: START,
                endTimeUnixNano: END,
                attributes: attrs,
                status: { code: 1 },
                ...over,
              },
            ],
          },
        ],
      },
    ],
  };
}

describe("nanoToIso", () => {
  it("converts unix nanos to ISO", () => {
    assert.strictEqual(nanoToIso("1700000000000000000"), new Date(1700000000000).toISOString());
  });
  it("returns null for missing/invalid", () => {
    assert.strictEqual(nanoToIso(undefined), null);
    assert.strictEqual(nanoToIso("0"), null);
    assert.strictEqual(nanoToIso("nope"), null);
  });
});

describe("attributesToObject", () => {
  it("flattens typed AnyValues", () => {
    const o = attributesToObject([
      attr("s", "hi"),
      attr("n", 42),
      attr("b", true),
      { key: "d", value: { doubleValue: 1.5 } },
    ]);
    assert.deepStrictEqual(o, { s: "hi", n: 42, b: true, d: 1.5 });
  });

  it("drops prototype-polluting keys from attacker-controlled attributes", () => {
    const o = attributesToObject([attr("__proto__", "x"), attr("constructor", "y"), attr("safe", "z")]);
    assert.deepStrictEqual(o, { safe: "z" });
    // Object.prototype must be untouched.
    assert.strictEqual(({} as Record<string, unknown>).polluted, undefined);
  });
});

describe("mapOtlpTracesToEvents", () => {
  it("maps a GenAI span to an llm.response event with tokens + provider", () => {
    const { events } = mapOtlpTracesToEvents(
      payload([
        attr("gen_ai.system", "openai"),
        attr("gen_ai.request.model", "gpt-4o"),
        attr("gen_ai.usage.input_tokens", 1000),
        attr("gen_ai.usage.output_tokens", 200),
      ]),
      IDENTITY,
      newId
    );
    assert.strictEqual(events.length, 1);
    const e = events[0];
    assert.strictEqual(e.eventType, "llm.response");
    assert.strictEqual(e.source, "otel");
    assert.strictEqual(e.traceId, "abc123");
    assert.strictEqual(e.spanId, "span1");
    const p = e.payload as Record<string, unknown>;
    assert.strictEqual(p.provider, "openai");
    assert.strictEqual(p.model, "gpt-4o");
    assert.strictEqual(p.promptTokens, 1000);
    assert.strictEqual(p.completionTokens, 200);
    assert.strictEqual(p.totalTokens, 1200);
    assert.strictEqual(p.latencyMs, 2000);
  });

  it("prefers newer provider/token attribute names and honors total_tokens", () => {
    const { events } = mapOtlpTracesToEvents(
      payload([
        attr("gen_ai.provider.name", "anthropic"),
        attr("gen_ai.response.model", "claude-opus-4-8"),
        attr("gen_ai.usage.input_tokens", 10),
        attr("gen_ai.usage.output_tokens", 5),
        attr("gen_ai.usage.total_tokens", 99),
      ]),
      IDENTITY,
      newId
    );
    const p = events[0].payload as Record<string, unknown>;
    assert.strictEqual(p.provider, "anthropic");
    assert.strictEqual(p.model, "claude-opus-4-8");
    assert.strictEqual(p.totalTokens, 99);
  });

  it("defaults provider to unknown when absent but a model is present", () => {
    const { events } = mapOtlpTracesToEvents(
      payload([attr("gen_ai.request.model", "mystery-model")]),
      IDENTITY,
      newId
    );
    const p = events[0].payload as Record<string, unknown>;
    assert.strictEqual(p.provider, "unknown");
    assert.strictEqual(p.totalTokens, 0);
  });

  it("maps a non-GenAI span to a trace.span event", () => {
    const { events } = mapOtlpTracesToEvents(
      payload([attr("http.method", "GET")], { status: { code: 2 } }),
      IDENTITY,
      newId
    );
    const e = events[0];
    assert.strictEqual(e.eventType, "trace.span");
    const p = e.payload as Record<string, unknown>;
    assert.strictEqual(p.name, "chat");
    assert.strictEqual(p.status, "error");
    assert.deepStrictEqual(p.attributes, { "http.method": "GET" });
  });

  it("surfaces burnwise.ticket / session attribution hooks", () => {
    const { events } = mapOtlpTracesToEvents(
      payload([
        attr("gen_ai.request.model", "gpt-4o"),
        attr("burnwise.ticket", "DEMO-42"),
        attr("gen_ai.conversation.id", "sess-9"),
      ]),
      IDENTITY,
      newId
    );
    assert.strictEqual(events[0].ticketId, "DEMO-42");
    assert.strictEqual(events[0].sessionId, "sess-9");
  });

  it("skips spans without a usable start time", () => {
    const { events, skipped } = mapOtlpTracesToEvents(
      payload([attr("gen_ai.request.model", "gpt-4o")], { startTimeUnixNano: "0" }),
      IDENTITY,
      newId
    );
    assert.strictEqual(events.length, 0);
    assert.strictEqual(skipped, 1);
  });

  it("returns nothing for an empty payload", () => {
    assert.deepStrictEqual(mapOtlpTracesToEvents({}, IDENTITY, newId), { events: [], skipped: 0 });
  });
});
