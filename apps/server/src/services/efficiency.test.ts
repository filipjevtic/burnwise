import { describe, it } from "node:test";
import assert from "node:assert";
import { computeEfficiency, type EfficiencySprintInput } from "./efficiency.js";

function llm(totalTokens: number, costUsd: number) {
  return { eventType: "llm.response", payload: { totalTokens, costUsd } };
}
function activity(durationSeconds: number) {
  return { eventType: "session.activity", payload: { durationSeconds } };
}

function sprint(
  id: string,
  tickets: EfficiencySprintInput["tickets"],
  overrides: Partial<EfficiencySprintInput> = {}
): EfficiencySprintInput {
  return { id, name: `Sprint ${id}`, status: "closed", tickets, ...overrides };
}

describe("computeEfficiency", () => {
  it("computes effort per completed story point from completed tickets only", () => {
    const { sprints } = computeEfficiency([
      sprint("1", [
        { status: "done", storyPoints: 4, events: [llm(1000, 0.4), activity(800)] },
        // in-progress ticket: effort and points excluded
        { status: "in_progress", storyPoints: 2, events: [llm(9999, 9.99)] },
      ]),
    ]);
    const s = sprints[0];
    assert.strictEqual(s.completedPoints, 4);
    assert.strictEqual(s.tokens, 1000);
    assert.strictEqual(s.cost, 0.4);
    assert.strictEqual(s.durationSeconds, 800);
    assert.strictEqual(s.costPerPoint, 0.1);
    assert.strictEqual(s.tokensPerPoint, 250);
    assert.strictEqual(s.durationSecondsPerPoint, 200);
  });

  it("returns zero per-point metrics when no points completed", () => {
    const { sprints } = computeEfficiency([
      sprint("1", [{ status: "todo", storyPoints: 5, events: [llm(100, 0.1)] }]),
    ]);
    assert.strictEqual(sprints[0].completedPoints, 0);
    assert.strictEqual(sprints[0].costPerPoint, 0);
    assert.strictEqual(sprints[0].tokensPerPoint, 0);
  });

  it("averages only sprints that completed points", () => {
    const summary = computeEfficiency([
      sprint("1", [{ status: "done", storyPoints: 2, events: [llm(200, 0.2)] }]), // 0.1/pt, 100 tok/pt
      sprint("2", []), // excluded
      sprint("3", [{ status: "done", storyPoints: 4, events: [llm(1200, 1.2)] }]), // 0.3/pt, 300 tok/pt
    ]);
    assert.strictEqual(summary.averageCostPerPoint, 0.2); // (0.1 + 0.3) / 2
    assert.strictEqual(summary.averageTokensPerPoint, 200); // (100 + 300) / 2
  });

  it("returns zeros for empty input", () => {
    const summary = computeEfficiency([]);
    assert.deepStrictEqual(summary.sprints, []);
    assert.strictEqual(summary.averageCostPerPoint, 0);
    assert.strictEqual(summary.averageTokensPerPoint, 0);
    assert.strictEqual(summary.averageDurationSecondsPerPoint, 0);
  });
});
