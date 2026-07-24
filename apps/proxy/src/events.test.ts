import { describe, it, afterEach } from "node:test";
import assert from "node:assert";
import { estimateCost, emitLlmEvents } from "./events.js";

function assertApprox(actual: number, expected: number, message?: string) {
  assert.ok(Math.abs(actual - expected) < 1e-10, message ?? `expected ${expected}, got ${actual}`);
}

describe("estimateCost", () => {
  it("estimates cost for gpt-4o", () => {
    const cost = estimateCost("openai", "gpt-4o", 1_000_000, 500_000);
    assertApprox(cost, 12.5);
  });

  it("estimates cost for gpt-4o-mini", () => {
    const cost = estimateCost("openai", "gpt-4o-mini", 1_000_000, 500_000);
    assertApprox(cost, 0.45);
  });

  it("estimates cost for claude-3-5-sonnet", () => {
    const cost = estimateCost("anthropic", "claude-3-5-sonnet", 1_000_000, 500_000);
    assertApprox(cost, 10.5);
  });

  it("falls back to default pricing for unknown models", () => {
    const cost = estimateCost("unknown", "custom-model", 1_000_000, 500_000);
    assertApprox(cost, 2.5);
  });
});

describe("emitLlmEvents", () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it("emits request+response events with provider-aware, Anthropic-parsed usage", async () => {
    let captured: { url: string; body: Record<string, unknown> } | undefined;
    globalThis.fetch = (async (url: string, init: { body: string }) => {
      captured = { url: String(url), body: JSON.parse(init.body) };
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;

    await emitLlmEvents({
      requestId: "req-1",
      provider: "anthropic",
      requestBody: {
        model: "claude-opus-4-8",
        system: "Be terse.",
        messages: [{ role: "user", content: "Hi" }],
      },
      responseBody: JSON.stringify({
        model: "claude-opus-4-8",
        usage: { input_tokens: 1_000_000, output_tokens: 500_000 },
        content: [{ type: "text", text: "Hello." }],
      }),
      latencyMs: 1234,
    });

    assert.ok(captured, "expected an ingest call");
    assert.match(captured!.url, /\/api\/v1\/events\/ingest$/);
    const events = captured!.body.events as Array<Record<string, unknown>>;
    assert.strictEqual(events.length, 2);

    const [reqEvent, respEvent] = events;
    assert.strictEqual(reqEvent.eventType, "llm.request");
    assert.strictEqual((reqEvent.payload as Record<string, unknown>).provider, "anthropic");

    const payload = respEvent.payload as Record<string, unknown>;
    assert.strictEqual(respEvent.eventType, "llm.response");
    assert.strictEqual(payload.provider, "anthropic");
    assert.strictEqual(payload.model, "claude-opus-4-8");
    assert.strictEqual(payload.promptTokens, 1_000_000);
    assert.strictEqual(payload.completionTokens, 500_000);
    assert.strictEqual(payload.totalTokens, 1_500_000);
    assert.strictEqual(payload.responseText, "Hello.");
    assert.strictEqual(payload.latencyMs, 1234);
    // claude-opus-4 → $5/MTok in + $25/MTok out = 5 + 12.5 = 17.5
    assertApprox(payload.costUsd as number, 17.5);
  });
});
