import { describe, it } from "node:test";
import assert from "node:assert";
import { computePortfolio, type PortfolioProjectInput } from "./portfolio.js";

function project(id: string, name: string, opts: Partial<PortfolioProjectInput> = {}): PortfolioProjectInput {
  return {
    id,
    name,
    sprints: [],
    tokens: 0,
    cost: 0,
    durationSeconds: 0,
    ...opts,
  };
}

const sprint = (name: string, tickets: Array<[string, number | null]>) => ({
  id: name,
  name,
  status: "closed",
  tickets: tickets.map(([status, storyPoints]) => ({ status, storyPoints })),
});

describe("computePortfolio", () => {
  it("summarizes velocity + effort per project and rolls up totals", () => {
    const result = computePortfolio([
      project("p1", "Alpha", {
        sprints: [sprint("S1", [["done", 5], ["done", 3], ["in_progress", 2]])],
        tokens: 16000,
        cost: 1.6,
      }),
      project("p2", "Beta", {
        sprints: [sprint("S1", [["done", 4]])],
        tokens: 4000,
        cost: 0.4,
      }),
    ]);

    const alpha = result.projects.find((p) => p.projectId === "p1")!;
    assert.strictEqual(alpha.completedPoints, 8); // 5 + 3, not the in_progress 2
    assert.strictEqual(alpha.tokensPerPoint, 2000); // 16000 / 8
    assert.strictEqual(result.projects.find((p) => p.projectId === "p2")!.completedPoints, 4);

    // Totals across the portfolio
    assert.strictEqual(result.totals.projectCount, 2);
    assert.strictEqual(result.totals.completedPoints, 12);
    assert.strictEqual(result.totals.tokens, 20000);
    assert.strictEqual(result.totals.tokensPerPoint, Math.round(20000 / 12));
  });

  it("sorts projects by tokens descending (where is effort going)", () => {
    const result = computePortfolio([
      project("low", "Low", { sprints: [sprint("S", [["done", 1]])], tokens: 100 }),
      project("high", "High", { sprints: [sprint("S", [["done", 1]])], tokens: 9000 }),
    ]);
    assert.deepStrictEqual(result.projects.map((p) => p.projectId), ["high", "low"]);
  });

  it("guards divide-by-zero when a project has no completed points", () => {
    const result = computePortfolio([
      project("p", "NoPoints", { sprints: [sprint("S", [["in_progress", 3]])], tokens: 5000 }),
    ]);
    assert.strictEqual(result.projects[0].completedPoints, 0);
    assert.strictEqual(result.projects[0].tokensPerPoint, 0);
    assert.strictEqual(result.totals.tokensPerPoint, 0);
  });

  it("handles an empty workspace", () => {
    const result = computePortfolio([]);
    assert.deepStrictEqual(result.projects, []);
    assert.strictEqual(result.totals.projectCount, 0);
    assert.strictEqual(result.totals.tokensPerPoint, 0);
  });
});
