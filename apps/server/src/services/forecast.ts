import type { PrismaClient } from "../generated/prisma/client.js";
import { emptyRollup, type DeveloperRollup, type Rollup } from "./rollup.js";
import { dbRollup, dbRollupByField, dbDistinctCountByField } from "./aggregate-db.js";
import { getProjectUsageTotals } from "./usage.js";

export interface HistoricalStats {
  completedTickets: number;
  totalStoryPoints: number;
  totalTokens: number;
  totalCost: number;
  totalDurationSeconds: number;
  tokensPerStoryPoint: number;
  costPerStoryPoint: number;
  durationSecondsPerStoryPoint: number;
}

export interface ForecastInput {
  targetStoryPoints?: number;
  targetTokenBudget?: number;
  targetCostBudget?: number;
  targetDurationSeconds?: number;
}

export interface DeveloperCapacity extends DeveloperRollup {
  name?: string;
  email?: string | null;
}

export interface ForecastResult {
  projectId: string;
  historical: HistoricalStats;
  developers: DeveloperCapacity[];
  recommendation: {
    recommendedStoryPoints?: number;
    recommendedTokenBudget?: number;
    recommendedCostBudget?: number;
    recommendedDurationSeconds?: number;
    confidence: "low" | "medium" | "high";
  };
  budget: {
    tokenBudget?: number;
    costBudget?: number;
    tokenUsagePercent?: number;
    costUsagePercent?: number;
  } | null;
}

export async function generateForecast(
  prisma: PrismaClient,
  projectId: string,
  input: ForecastInput
): Promise<ForecastResult> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      tokenBudget: true,
      costBudget: true,
      // Completed tickets only — historical velocity is measured over done work.
      tickets: { where: { status: "done" }, select: { id: true, storyPoints: true } },
    },
  });

  if (!project) {
    throw new Error("Project not found");
  }

  // Only tickets with story points contribute to per-point velocity.
  const completed = project.tickets.filter((t) => t.storyPoints && t.storyPoints > 0);
  const ticketIds = completed.map((t) => t.id);
  const totalStoryPoints = completed.reduce((sum, t) => sum + (t.storyPoints || 0), 0);

  // Aggregate those tickets' events in the DB rather than loading them (#176).
  const scope = { ticketId: { in: ticketIds } };
  const [effort, devRollups, sessionCounts, ticketCounts] = ticketIds.length
    ? await Promise.all([
        dbRollup(prisma, scope),
        dbRollupByField(prisma, scope, "userId"),
        dbDistinctCountByField(prisma, scope, "userId", "sessionId"),
        dbDistinctCountByField(prisma, scope, "userId", "ticketId"),
      ])
    : [emptyRollup(), new Map<string, Rollup>(), new Map<string, number>(), new Map<string, number>()];

  const historical = computeHistoricalStats(completed.length, totalStoryPoints, effort);
  const developers = computeDeveloperCapacity(devRollups, sessionCounts, ticketCounts);

  const recommendation = buildRecommendation(historical, input);

  // Budget usage must reflect CURRENT project-wide usage (all events), not the
  // done-only historical totals — otherwise it disagrees with the alerts banner
  // and dashboard (issue #10). Shared helper keeps all three in sync.
  const usage = await getProjectUsageTotals(prisma, projectId);
  const budget = buildBudgetStatus(
    { tokenBudget: project.tokenBudget, costBudget: project.costBudget },
    usage,
    input
  );

  return {
    projectId,
    historical,
    developers,
    recommendation,
    budget,
  };
}

/**
 * Per-developer capacity over completed tickets: who has been doing how much
 * AI-assisted work, so planners can reason about realistic team throughput.
 * Built from DB-aggregated rollups (keyed by userId) plus distinct session/ticket
 * counts, sorted by tokens descending.
 */
export function computeDeveloperCapacity(
  rollups: Map<string, Rollup>,
  sessionCounts: Map<string, number>,
  ticketCounts: Map<string, number>
): DeveloperCapacity[] {
  return [...rollups.entries()]
    .map(([userId, r]) => ({
      userId,
      ...r,
      sessionCount: sessionCounts.get(userId) ?? 0,
      ticketCount: ticketCounts.get(userId) ?? 0,
    }))
    .sort((a, b) => b.tokens - a.tokens);
}

/**
 * Historical velocity stats from the completed-ticket count, their total story
 * points, and their DB-aggregated effort rollup (tokens/cost/duration).
 */
export function computeHistoricalStats(
  completedTickets: number,
  totalStoryPoints: number,
  effort: Rollup
): HistoricalStats {
  const { tokens: totalTokens, cost: totalCost, durationSeconds: totalDurationSeconds } = effort;
  return {
    completedTickets,
    totalStoryPoints,
    totalTokens,
    totalCost,
    totalDurationSeconds,
    tokensPerStoryPoint: totalStoryPoints > 0 ? totalTokens / totalStoryPoints : 0,
    costPerStoryPoint: totalStoryPoints > 0 ? totalCost / totalStoryPoints : 0,
    durationSecondsPerStoryPoint: totalStoryPoints > 0 ? totalDurationSeconds / totalStoryPoints : 0,
  };
}

export function buildRecommendation(
  historical: HistoricalStats,
  input: ForecastInput
): ForecastResult["recommendation"] {
  const confidence = historical.completedTickets < 3 ? "low" : historical.completedTickets < 8 ? "medium" : "high";

  if (input.targetStoryPoints !== undefined) {
    return {
      recommendedTokenBudget: Math.ceil(input.targetStoryPoints * historical.tokensPerStoryPoint),
      recommendedCostBudget: input.targetStoryPoints * historical.costPerStoryPoint,
      recommendedDurationSeconds: Math.ceil(input.targetStoryPoints * historical.durationSecondsPerStoryPoint),
      confidence,
    };
  }

  if (input.targetTokenBudget !== undefined) {
    return {
      recommendedStoryPoints: Math.floor(input.targetTokenBudget / Math.max(historical.tokensPerStoryPoint, 1)),
      recommendedCostBudget: (input.targetTokenBudget / Math.max(historical.tokensPerStoryPoint, 1)) * historical.costPerStoryPoint,
      recommendedDurationSeconds: Math.ceil((input.targetTokenBudget / Math.max(historical.tokensPerStoryPoint, 1)) * historical.durationSecondsPerStoryPoint),
      confidence,
    };
  }

  if (input.targetCostBudget !== undefined) {
    return {
      recommendedStoryPoints: Math.floor(input.targetCostBudget / Math.max(historical.costPerStoryPoint, 0.01)),
      recommendedTokenBudget: (input.targetCostBudget / Math.max(historical.costPerStoryPoint, 0.01)) * historical.tokensPerStoryPoint,
      recommendedDurationSeconds: Math.ceil((input.targetCostBudget / Math.max(historical.costPerStoryPoint, 0.01)) * historical.durationSecondsPerStoryPoint),
      confidence,
    };
  }

  if (input.targetDurationSeconds !== undefined) {
    return {
      recommendedStoryPoints: Math.floor(input.targetDurationSeconds / Math.max(historical.durationSecondsPerStoryPoint, 1)),
      recommendedTokenBudget: (input.targetDurationSeconds / Math.max(historical.durationSecondsPerStoryPoint, 1)) * historical.tokensPerStoryPoint,
      recommendedCostBudget: (input.targetDurationSeconds / Math.max(historical.durationSecondsPerStoryPoint, 1)) * historical.costPerStoryPoint,
      confidence,
    };
  }

  return { confidence };
}

/**
 * Budget status uses CURRENT project usage (all events), passed in as `usage`,
 * so it matches the alerts service and dashboard. Exported for unit testing.
 */
export function buildBudgetStatus(
  project: { tokenBudget: number | null; costBudget: number | null },
  usage: { tokens: number; cost: number },
  input: ForecastInput
): ForecastResult["budget"] {
  const tokenBudget = input.targetTokenBudget ?? project.tokenBudget ?? undefined;
  const costBudget = input.targetCostBudget ?? project.costBudget ?? undefined;

  if (tokenBudget === undefined && costBudget === undefined) {
    return null;
  }

  return {
    tokenBudget,
    costBudget,
    tokenUsagePercent: tokenBudget !== undefined && usage.tokens > 0 ? (usage.tokens / tokenBudget) * 100 : undefined,
    costUsagePercent: costBudget !== undefined && usage.cost > 0 ? (usage.cost / costBudget) * 100 : undefined,
  };
}
