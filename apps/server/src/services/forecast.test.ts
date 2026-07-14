import { describe, it } from "node:test";
import assert from "node:assert";
import { buildRecommendation, computeDeveloperCapacity, buildBudgetStatus } from "./forecast.js";

function makeHistorical(overrides: Partial<Parameters<typeof buildRecommendation>[0]> = {}) {
  return {
    completedTickets: 5,
    totalStoryPoints: 10,
    totalTokens: 10000,
    totalCost: 0.5,
    totalDurationSeconds: 3600,
    tokensPerStoryPoint: 1000,
    costPerStoryPoint: 0.05,
    durationSecondsPerStoryPoint: 360,
    ...overrides,
  };
}

describe("buildRecommendation", () => {
  it("recommends budget from target story points", () => {
    const historical = makeHistorical();
    const recommendation = buildRecommendation(historical, { targetStoryPoints: 20 });
    assert.strictEqual(recommendation.recommendedTokenBudget, 20000);
    assert.strictEqual(recommendation.recommendedCostBudget, 1);
    assert.strictEqual(recommendation.recommendedDurationSeconds, 7200);
    assert.strictEqual(recommendation.confidence, "medium");
  });

  it("recommends story points from token budget", () => {
    const historical = makeHistorical();
    const recommendation = buildRecommendation(historical, { targetTokenBudget: 5000 });
    assert.strictEqual(recommendation.recommendedStoryPoints, 5);
  });

  it("marks low confidence with few samples", () => {
    const historical = makeHistorical({ completedTickets: 2 });
    const recommendation = buildRecommendation(historical, {});
    assert.strictEqual(recommendation.confidence, "low");
  });
});

describe("buildBudgetStatus", () => {
  it("measures usage against CURRENT usage totals, not done-only historical", () => {
    // Regression for #10: budget usage must reflect all project events. If this
    // used historical/done-only numbers it would report a different (lower) %.
    const budget = buildBudgetStatus(
      { tokenBudget: 1000, costBudget: 10 },
      { tokens: 800, cost: 4 },
      {}
    );
    assert.strictEqual(budget?.tokenUsagePercent, 80);
    assert.strictEqual(budget?.costUsagePercent, 40);
  });

  it("returns null when no project or target budgets are set", () => {
    assert.strictEqual(
      buildBudgetStatus({ tokenBudget: null, costBudget: null }, { tokens: 5, cost: 5 }, {}),
      null
    );
  });

  it("prefers input target budgets over project budgets", () => {
    const budget = buildBudgetStatus(
      { tokenBudget: 1000, costBudget: null },
      { tokens: 500, cost: 0 },
      { targetTokenBudget: 5000 }
    );
    assert.strictEqual(budget?.tokenBudget, 5000);
    assert.strictEqual(budget?.tokenUsagePercent, 10);
  });

  it("omits a usage percent when usage is zero", () => {
    const budget = buildBudgetStatus(
      { tokenBudget: 1000, costBudget: 10 },
      { tokens: 0, cost: 0 },
      {}
    );
    assert.strictEqual(budget?.tokenUsagePercent, undefined);
    assert.strictEqual(budget?.costUsagePercent, undefined);
  });
});

describe("computeDeveloperCapacity", () => {
  it("aggregates only completed tickets' events per developer", () => {
    const result = computeDeveloperCapacity([
      {
        storyPoints: 3,
        events: [
          { eventType: "llm.response", payload: { totalTokens: 100 }, userId: "a", ticketId: "t1" },
          { eventType: "session.activity", payload: { durationSeconds: 60 }, userId: "b", ticketId: "t1" },
        ],
      },
      {
        // Not completed (no story points) -> excluded.
        storyPoints: null,
        events: [{ eventType: "llm.response", payload: { totalTokens: 999 }, userId: "a", ticketId: "t2" }],
      },
    ]);

    const a = result.find((d) => d.userId === "a")!;
    assert.strictEqual(a.tokens, 100);
    assert.strictEqual(a.ticketCount, 1);
    const b = result.find((d) => d.userId === "b")!;
    assert.strictEqual(b.durationSeconds, 60);
  });

  it("ignores events without a userId", () => {
    const result = computeDeveloperCapacity([
      {
        storyPoints: 2,
        events: [{ eventType: "llm.response", payload: { totalTokens: 10 } }],
      },
    ]);
    assert.strictEqual(result.length, 0);
  });
});
