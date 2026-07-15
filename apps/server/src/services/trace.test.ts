import { describe, it } from "node:test";
import assert from "node:assert";
import { computeTraceSummary } from "./trace.js";

describe("computeTraceSummary", () => {
  it("summarizes spans: count, errors, distinct traces, total ms, slowest-first", () => {
    const s = computeTraceSummary([
      {
        eventType: "trace.span",
        traceId: "t1",
        spanId: "s1",
        payload: { name: "chat", startTime: "2026-01-01T00:00:00.000Z", endTime: "2026-01-01T00:00:01.000Z", status: "ok" },
      },
      {
        eventType: "trace.span",
        traceId: "t1",
        spanId: "s2",
        payload: { name: "retrieve", startTime: "2026-01-01T00:00:00.000Z", endTime: "2026-01-01T00:00:03.000Z", status: "error" },
      },
      // non-trace events are ignored
      { eventType: "llm.response", payload: { totalTokens: 100 } },
    ]);

    assert.strictEqual(s.spanCount, 2);
    assert.strictEqual(s.errorCount, 1);
    assert.strictEqual(s.traceCount, 1);
    assert.strictEqual(s.totalSpanMs, 4000);
    // slowest first
    assert.deepStrictEqual(s.spans.map((x) => x.name), ["retrieve", "chat"]);
    assert.strictEqual(s.spans[0].durationMs, 3000);
  });

  it("handles spans without an end time (duration null, contributes 0)", () => {
    const s = computeTraceSummary([
      { eventType: "trace.span", payload: { name: "open", startTime: "2026-01-01T00:00:00.000Z", status: "unset" } },
    ]);
    assert.strictEqual(s.spanCount, 1);
    assert.strictEqual(s.totalSpanMs, 0);
    assert.strictEqual(s.spans[0].durationMs, null);
  });

  it("returns an empty summary when there are no spans", () => {
    const s = computeTraceSummary([{ eventType: "llm.response", payload: {} }]);
    assert.deepStrictEqual(s, { spanCount: 0, errorCount: 0, traceCount: 0, totalSpanMs: 0, spans: [] });
  });

  it("caps the span list at 50 but still counts all", () => {
    const many = Array.from({ length: 60 }, (_, i) => ({
      eventType: "trace.span" as const,
      payload: { name: `s${i}`, startTime: "2026-01-01T00:00:00.000Z", endTime: "2026-01-01T00:00:00.010Z", status: "ok" },
    }));
    const s = computeTraceSummary(many);
    assert.strictEqual(s.spanCount, 60);
    assert.strictEqual(s.spans.length, 50);
  });
});
