/**
 * Portfolio rollup: velocity + AI-assisted effort across ALL projects in a
 * workspace, side by side — the EM/leadership view. Each row reuses the velocity
 * engine per project and pairs it with the project's total effort so a lead can
 * see throughput, estimate accuracy, recommended capacity, and effort-per-point
 * across the portfolio at once (issue #196; supersedes the per-project
 * "all sprints" ask in #191).
 *
 * Aggregate/team-first — no per-developer breakdown here (capacity-not-
 * surveillance guardrail). Pure functions only; Prisma stays in the route.
 */

import { computeVelocity, isCompleted, type SprintInput } from "./velocity.js";

export interface PortfolioProjectInput {
  id: string;
  name: string;
  sprints: SprintInput[];
  /** Total effort across all of the project's events. */
  tokens: number;
  cost: number;
  durationSeconds: number;
}

export interface PortfolioProject {
  projectId: string;
  name: string;
  sprintCount: number;
  avgCompletedPoints: number;
  estimateAccuracy: number; // avg completion rate, [0,1]
  recommendedPoints: number;
  capacityConfidence: "low" | "medium" | "high";
  completedPoints: number;
  tokens: number;
  cost: number;
  durationSeconds: number;
  tokensPerPoint: number;
  costPerPoint: number;
}

export interface PortfolioSummary {
  projects: PortfolioProject[];
  totals: {
    projectCount: number;
    completedPoints: number;
    tokens: number;
    cost: number;
    durationSeconds: number;
    tokensPerPoint: number;
    costPerPoint: number;
  };
}

export function computePortfolio(
  inputs: PortfolioProjectInput[],
  window = 3
): PortfolioSummary {
  const projects: PortfolioProject[] = inputs.map((p) => {
    const velocity = computeVelocity(p.sprints, window);
    const completedPoints = p.sprints.reduce(
      (sum, s) => sum + s.tickets.reduce((t, ticket) => t + (isCompleted(ticket.status) ? ticket.storyPoints ?? 0 : 0), 0),
      0
    );
    return {
      projectId: p.id,
      name: p.name,
      sprintCount: p.sprints.length,
      avgCompletedPoints: velocity.averageCompletedPoints,
      estimateAccuracy: velocity.averageCompletionRate,
      recommendedPoints: velocity.capacity.recommendedPoints,
      capacityConfidence: velocity.capacity.confidence,
      completedPoints,
      tokens: p.tokens,
      cost: round(p.cost),
      durationSeconds: p.durationSeconds,
      tokensPerPoint: completedPoints > 0 ? Math.round(p.tokens / completedPoints) : 0,
      costPerPoint: completedPoints > 0 ? round(p.cost / completedPoints) : 0,
    };
  });

  // Lead-first ordering: where is the AI effort going?
  projects.sort((a, b) => b.tokens - a.tokens);

  const sum = (sel: (p: PortfolioProject) => number) => projects.reduce((s, p) => s + sel(p), 0);
  const totalCompleted = sum((p) => p.completedPoints);
  const totalTokens = sum((p) => p.tokens);
  const totalCost = sum((p) => p.cost);

  return {
    projects,
    totals: {
      projectCount: projects.length,
      completedPoints: totalCompleted,
      tokens: totalTokens,
      cost: round(totalCost),
      durationSeconds: sum((p) => p.durationSeconds),
      tokensPerPoint: totalCompleted > 0 ? Math.round(totalTokens / totalCompleted) : 0,
      costPerPoint: totalCompleted > 0 ? round(totalCost / totalCompleted) : 0,
    },
  };
}

function round(value: number): number {
  return Math.round(value * 10000) / 10000;
}
