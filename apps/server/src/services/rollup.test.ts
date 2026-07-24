import { describe, it } from "node:test";
import assert from "node:assert";
import { rollupEvents, rollupBy, emptyRollup, aggregateByDeveloper, aggregateBySource, aggregateByProvider, deriveEventMetrics } from "./rollup.js";

describe("rollupEvents", () => {
  it("returns an empty rollup for no events", () => {
    assert.deepStrictEqual(rollupEvents([]), emptyRollup());
  });

  it("sums tokens and cost from llm.response events", () => {
    const r = rollupEvents([
      { eventType: "llm.response", payload: { totalTokens: 100, costUsd: 0.5 } },
      { eventType: "llm.response", payload: { totalTokens: 50, costUsd: 0.25 } },
    ]);
    assert.strictEqual(r.tokens, 150);
    assert.strictEqual(r.cost, 0.75);
    assert.strictEqual(r.eventCount, 2);
  });

  it("sums duration from session.activity and cost from ci.run", () => {
    const r = rollupEvents([
      { eventType: "session.activity", payload: { durationSeconds: 600 } },
      { eventType: "ci.run", payload: { costUsd: 1.25 } },
    ]);
    assert.strictEqual(r.durationSeconds, 600);
    assert.strictEqual(r.cost, 1.25);
    assert.strictEqual(r.eventCount, 2);
  });

  it("ignores llm.request payloads and non-numeric values", () => {
    const r = rollupEvents([
      { eventType: "llm.request", payload: { promptText: "hi" } },
      { eventType: "llm.response", payload: { totalTokens: "oops", costUsd: null } },
    ]);
    assert.strictEqual(r.tokens, 0);
    assert.strictEqual(r.cost, 0);
    assert.strictEqual(r.eventCount, 2);
  });

  it("tolerates null/undefined payloads", () => {
    const r = rollupEvents([
      { eventType: "llm.response", payload: null },
      { eventType: "session.activity", payload: undefined },
    ]);
    assert.deepStrictEqual(r, { tokens: 0, cost: 0, durationSeconds: 0, eventCount: 2 });
  });
});

describe("rollupBy", () => {
  it("groups events by key and rolls up each group", () => {
    const groups = rollupBy(
      [
        { eventType: "llm.response", payload: { totalTokens: 10 }, userId: "a" },
        { eventType: "llm.response", payload: { totalTokens: 5 }, userId: "b" },
        { eventType: "session.activity", payload: { durationSeconds: 30 }, userId: "a" },
      ],
      (e) => e.userId
    );
    assert.strictEqual(groups.get("a")?.tokens, 10);
    assert.strictEqual(groups.get("a")?.durationSeconds, 30);
    assert.strictEqual(groups.get("a")?.eventCount, 2);
    assert.strictEqual(groups.get("b")?.tokens, 5);
    assert.strictEqual(groups.get("b")?.eventCount, 1);
  });

  it("skips events with null keys", () => {
    const groups = rollupBy(
      [{ eventType: "llm.response", payload: { totalTokens: 10 }, sessionId: null }],
      (e) => e.sessionId
    );
    assert.strictEqual(groups.size, 0);
  });
});

describe("aggregateByDeveloper", () => {
  it("rolls up per developer with distinct session/ticket counts", () => {
    const result = aggregateByDeveloper([
      { userId: "a", eventType: "llm.response", payload: { totalTokens: 100, costUsd: 1 }, sessionId: "s1", ticketId: "t1" },
      { userId: "a", eventType: "session.activity", payload: { durationSeconds: 60 }, sessionId: "s1", ticketId: "t1" },
      { userId: "a", eventType: "llm.response", payload: { totalTokens: 50 }, sessionId: "s2", ticketId: "t2" },
      { userId: "b", eventType: "llm.response", payload: { totalTokens: 10 }, sessionId: "s3", ticketId: "t1" },
    ]);

    const a = result.find((d) => d.userId === "a")!;
    assert.strictEqual(a.tokens, 150);
    assert.strictEqual(a.cost, 1);
    assert.strictEqual(a.durationSeconds, 60);
    assert.strictEqual(a.eventCount, 3);
    assert.strictEqual(a.sessionCount, 2);
    assert.strictEqual(a.ticketCount, 2);
  });

  it("sorts developers by tokens descending", () => {
    const result = aggregateByDeveloper([
      { userId: "low", eventType: "llm.response", payload: { totalTokens: 5 } },
      { userId: "high", eventType: "llm.response", payload: { totalTokens: 500 } },
    ]);
    assert.deepStrictEqual(result.map((d) => d.userId), ["high", "low"]);
  });

  it("does not count null session/ticket ids", () => {
    const result = aggregateByDeveloper([
      { userId: "a", eventType: "llm.response", payload: { totalTokens: 1 }, sessionId: null, ticketId: null },
    ]);
    assert.strictEqual(result[0].sessionCount, 0);
    assert.strictEqual(result[0].ticketCount, 0);
  });
});

describe("aggregateBySource", () => {
  it("rolls up per source with distinct session counts, sorted by tokens", () => {
    const result = aggregateBySource([
      { source: "proxy", eventType: "llm.response", payload: { totalTokens: 200, costUsd: 2 }, sessionId: "s1" },
      { source: "proxy", eventType: "llm.response", payload: { totalTokens: 100 }, sessionId: "s2" },
      { source: "cli", eventType: "llm.response", payload: { totalTokens: 50 }, sessionId: "s3" },
      { source: "cli", eventType: "session.activity", payload: { durationSeconds: 90 }, sessionId: "s3" },
    ]);

    assert.deepStrictEqual(result.map((r) => r.source), ["proxy", "cli"]);
    const proxy = result.find((r) => r.source === "proxy")!;
    assert.strictEqual(proxy.tokens, 300);
    assert.strictEqual(proxy.cost, 2);
    assert.strictEqual(proxy.sessionCount, 2);
    const cli = result.find((r) => r.source === "cli")!;
    assert.strictEqual(cli.tokens, 50);
    assert.strictEqual(cli.durationSeconds, 90);
    assert.strictEqual(cli.sessionCount, 1);
  });

  it("buckets missing source under 'unknown'", () => {
    const result = aggregateBySource([
      { source: null, eventType: "llm.response", payload: { totalTokens: 10 } },
      { eventType: "llm.response", payload: { totalTokens: 5 } },
    ]);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].source, "unknown");
    assert.strictEqual(result[0].tokens, 15);
  });
});

describe("aggregateByProvider", () => {
  it("rolls up per provider from the payload, sorted by tokens", () => {
    const result = aggregateByProvider([
      { eventType: "llm.response", payload: { provider: "anthropic", totalTokens: 200, costUsd: 3 } },
      { eventType: "llm.response", payload: { provider: "anthropic", totalTokens: 100, costUsd: 1 } },
      { eventType: "llm.response", payload: { provider: "openai", totalTokens: 50, costUsd: 0.5 } },
    ]);

    assert.deepStrictEqual(result.map((r) => r.provider), ["anthropic", "openai"]);
    const anthropic = result.find((r) => r.provider === "anthropic")!;
    assert.strictEqual(anthropic.tokens, 300);
    assert.strictEqual(anthropic.cost, 4);
    const openai = result.find((r) => r.provider === "openai")!;
    assert.strictEqual(openai.tokens, 50);
  });

  it("buckets missing/blank provider under 'unknown'", () => {
    const result = aggregateByProvider([
      { eventType: "llm.response", payload: { totalTokens: 10 } },
      { eventType: "llm.response", payload: { provider: "  ", totalTokens: 5 } },
    ]);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].provider, "unknown");
    assert.strictEqual(result[0].tokens, 15);
  });
});

describe("deriveEventMetrics", () => {
  it("derives tokens/cost/provider for llm.response, matching accumulate semantics", () => {
    assert.deepStrictEqual(
      deriveEventMetrics("llm.response", { provider: "anthropic", totalTokens: 1500, costUsd: 0.42 }),
      { totalTokens: 1500, costUsd: 0.42, durationSeconds: null, provider: "anthropic" }
    );
  });

  it("derives only cost for ci.run", () => {
    assert.deepStrictEqual(
      deriveEventMetrics("ci.run", { costUsd: 1.25 }),
      { totalTokens: null, costUsd: 1.25, durationSeconds: null, provider: null }
    );
  });

  it("derives only duration for session.activity", () => {
    assert.deepStrictEqual(
      deriveEventMetrics("session.activity", { durationSeconds: 300 }),
      { totalTokens: null, costUsd: null, durationSeconds: 300, provider: null }
    );
  });

  it("returns nulls for non-numeric or blank fields and other event types", () => {
    assert.deepStrictEqual(
      deriveEventMetrics("llm.response", { provider: "  ", totalTokens: "nope", costUsd: null }),
      { totalTokens: null, costUsd: null, durationSeconds: null, provider: null }
    );
    assert.deepStrictEqual(
      deriveEventMetrics("trace.span", { name: "x" }),
      { totalTokens: null, costUsd: null, durationSeconds: null, provider: null }
    );
  });

  it("agrees with rollupEvents totals when summed", () => {
    const events = [
      { eventType: "llm.response", payload: { provider: "openai", totalTokens: 100, costUsd: 1 } },
      { eventType: "ci.run", payload: { costUsd: 2 } },
      { eventType: "session.activity", payload: { durationSeconds: 60 } },
    ];
    const summed = events.reduce(
      (acc, e) => {
        const m = deriveEventMetrics(e.eventType, e.payload);
        acc.tokens += m.totalTokens ?? 0;
        acc.cost += m.costUsd ?? 0;
        acc.durationSeconds += m.durationSeconds ?? 0;
        return acc;
      },
      { tokens: 0, cost: 0, durationSeconds: 0 }
    );
    const rolled = rollupEvents(events);
    assert.strictEqual(summed.tokens, rolled.tokens);
    assert.strictEqual(summed.cost, rolled.cost);
    assert.strictEqual(summed.durationSeconds, rolled.durationSeconds);
  });
});
