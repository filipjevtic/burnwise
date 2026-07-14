import { describe, it } from "node:test";
import assert from "node:assert";
import { computeReportedUsage, isEmptyUsage, ZERO_BASELINE } from "./usage.js";

describe("computeReportedUsage (cumulative)", () => {
  it("first report emits the full total and advances the baseline", () => {
    const { emit, nextBaseline } = computeReportedUsage(
      { promptTokens: 3000, completionTokens: 2000, totalTokens: 5000 },
      ZERO_BASELINE,
      "cumulative"
    );
    assert.strictEqual(emit.totalTokens, 5000);
    assert.strictEqual(nextBaseline.totalTokens, 5000);
  });

  it("attributes only the delta since the last report (the #149 bug)", () => {
    // Regression: after a ticket switch, a cumulative report must not re-attribute
    // the whole running total to the new ticket.
    const first = computeReportedUsage(
      { promptTokens: 3000, completionTokens: 2000, totalTokens: 5000 },
      ZERO_BASELINE,
      "cumulative"
    );
    const second = computeReportedUsage(
      { promptTokens: 7000, completionTokens: 5000, totalTokens: 12000 },
      first.nextBaseline,
      "cumulative"
    );
    assert.strictEqual(second.emit.totalTokens, 7000); // 12000 - 5000, not 12000
    assert.strictEqual(second.emit.promptTokens, 4000);
    assert.strictEqual(second.emit.completionTokens, 3000);
  });

  it("computes cumulative cost deltas too", () => {
    const first = computeReportedUsage(
      { promptTokens: 1, completionTokens: 1, totalTokens: 2, costUsd: 0.5 },
      ZERO_BASELINE,
      "cumulative"
    );
    const second = computeReportedUsage(
      { promptTokens: 2, completionTokens: 2, totalTokens: 4, costUsd: 1.25 },
      first.nextBaseline,
      "cumulative"
    );
    assert.ok(Math.abs((second.emit.costUsd ?? 0) - 0.75) < 1e-9);
  });

  it("is reset-safe: a lower total than baseline is treated as fresh usage", () => {
    const baseline = { promptTokens: 6000, completionTokens: 4000, totalTokens: 10000, costUsd: 1 };
    const { emit, nextBaseline } = computeReportedUsage(
      { promptTokens: 1200, completionTokens: 800, totalTokens: 2000 },
      baseline,
      "cumulative"
    );
    assert.strictEqual(emit.totalTokens, 2000); // counter reset → emit current
    assert.strictEqual(nextBaseline.totalTokens, 2000);
  });

  it("emits an empty delta when nothing new was used", () => {
    const baseline = { promptTokens: 3000, completionTokens: 2000, totalTokens: 5000, costUsd: 0 };
    const { emit } = computeReportedUsage(
      { promptTokens: 3000, completionTokens: 2000, totalTokens: 5000 },
      baseline,
      "cumulative"
    );
    assert.ok(isEmptyUsage(emit));
  });
});

describe("computeReportedUsage (incremental)", () => {
  it("emits the chunk as-is and leaves the baseline untouched", () => {
    const baseline = { promptTokens: 100, completionTokens: 100, totalTokens: 200, costUsd: 0 };
    const { emit, nextBaseline } = computeReportedUsage(
      { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      baseline,
      "incremental"
    );
    assert.strictEqual(emit.totalTokens, 15);
    assert.deepStrictEqual(nextBaseline, baseline);
  });
});
