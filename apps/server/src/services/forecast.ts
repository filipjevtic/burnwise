import type { PrismaClient } from "../generated/prisma/client.js";
import { rollupEvents, aggregateByDeveloper, type DeveloperRollup } from "./rollup.js";
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

interface PrismaEvent {
  eventType: string;
  payload: Record<string, unknown>;
  userId?: string;
  sessionId?: string | null;
  ticketId?: string | null;
}

interface TicketWithEvents {
  storyPoints: number | null;
  events: PrismaEvent[];
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
    include: {
      tickets: {
        where: { status: "done" },
        include: { events: true },
      },
    },
  });

  if (!project) {
    throw new Error("Project not found");
  }

  const tickets = project.tickets as unknown as TicketWithEvents[];
  const historical = computeHistoricalStats(tickets);
  const developers = computeDeveloperCapacity(tickets);

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
 */
export function computeDeveloperCapacity(tickets: TicketWithEvents[]): DeveloperCapacity[] {
  const completed = tickets.filter((t) => t.storyPoints && t.storyPoints > 0);
  const events = completed.flatMap((t) =>
    t.events
      .filter((e) => e.userId)
      .map((e) => ({
        eventType: e.eventType,
        payload: e.payload,
        userId: e.userId as string,
        sessionId: e.sessionId ?? null,
        ticketId: e.ticketId ?? null,
      }))
  );
  return aggregateByDeveloper(events);
}

function computeHistoricalStats(
  tickets: Array<{ storyPoints: number | null; events: PrismaEvent[] }>
): HistoricalStats {
  const completedTickets = tickets.filter((t) => t.storyPoints && t.storyPoints > 0);
  const totalStoryPoints = completedTickets.reduce((sum, t) => sum + (t.storyPoints || 0), 0);

  const rollup = rollupEvents(completedTickets.flatMap((t) => t.events));
  const { tokens: totalTokens, cost: totalCost, durationSeconds: totalDurationSeconds } = rollup;

  return {
    completedTickets: completedTickets.length,
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
