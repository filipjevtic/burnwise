import { describe, it } from "node:test";
import assert from "node:assert";
import { buildRecommendation, computeDeveloperCapacity, computeHistoricalStats, buildBudgetStatus } from "./forecast.js";

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
  it("builds per-developer capacity from rollups + distinct counts, sorted by tokens", () => {
    const rollups = new Map([
      ["a", { tokens: 100, cost: 1, durationSeconds: 0, eventCount: 2 }],
      ["b", { tokens: 500, cost: 5, durationSeconds: 60, eventCount: 1 }],
    ]);
    const sessionCounts = new Map([
      ["a", 2],
      ["b", 1],
    ]);
    const ticketCounts = new Map([
      ["a", 1],
      ["b", 3],
    ]);

    const result = computeDeveloperCapacity(rollups, sessionCounts, ticketCounts);

    // Sorted by tokens descending: b before a.
    assert.deepStrictEqual(result.map((d) => d.userId), ["b", "a"]);
    const a = result.find((d) => d.userId === "a")!;
    assert.strictEqual(a.tokens, 100);
    assert.strictEqual(a.sessionCount, 2);
    assert.strictEqual(a.ticketCount, 1);
    const b = result.find((d) => d.userId === "b")!;
    assert.strictEqual(b.durationSeconds, 60);
    assert.strictEqual(b.ticketCount, 3);
  });

  it("defaults missing distinct counts to zero", () => {
    const rollups = new Map([["a", { tokens: 10, cost: 0, durationSeconds: 0, eventCount: 1 }]]);
    const result = computeDeveloperCapacity(rollups, new Map(), new Map());
    assert.strictEqual(result[0].sessionCount, 0);
    assert.strictEqual(result[0].ticketCount, 0);
  });
});

describe("computeHistoricalStats", () => {
  it("computes per-story-point ratios from the effort rollup", () => {
    const stats = computeHistoricalStats(5, 10, { tokens: 10000, cost: 0.5, durationSeconds: 3600, eventCount: 20 });
    assert.strictEqual(stats.completedTickets, 5);
    assert.strictEqual(stats.tokensPerStoryPoint, 1000);
    assert.strictEqual(stats.costPerStoryPoint, 0.05);
    assert.strictEqual(stats.durationSecondsPerStoryPoint, 360);
  });

  it("avoids divide-by-zero when there are no story points", () => {
    const stats = computeHistoricalStats(0, 0, { tokens: 0, cost: 0, durationSeconds: 0, eventCount: 0 });
    assert.strictEqual(stats.tokensPerStoryPoint, 0);
    assert.strictEqual(stats.costPerStoryPoint, 0);
  });
});
