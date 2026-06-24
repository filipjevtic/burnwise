/**
 * Sprint efficiency math: how much AI effort (cost, tokens, agent time) it took
 * to deliver one completed story point, per sprint. This is the "are we getting
 * cheaper/faster per point" trend that complements raw velocity — the signal a
 * planner uses to calibrate AI-era estimates.
 *
 * Pure functions only (no Prisma) so the math is unit-testable in isolation.
 * Effort is rolled up from events on *completed* tickets and divided by the
 * completed story points, so cost-per-point reflects delivered work.
 */

import { rollupEvents, type RollupEvent } from "./rollup.js";
import { isCompleted } from "./velocity.js";

export interface EfficiencyTicketInput {
  status: string;
  storyPoints: number | null;
  events: RollupEvent[];
}

export interface EfficiencySprintInput {
  id: string;
  name: string;
  startDate?: Date | string | null;
  endDate?: Date | string | null;
  status: string;
  tickets: EfficiencyTicketInput[];
}

export interface SprintEfficiency {
  sprintId: string;
  name: string;
  startDate: string | null;
  endDate: string | null;
  status: string;
  completedPoints: number;
  tokens: number;
  cost: number;
  durationSeconds: number;
  /** Effort per completed story point; 0 when no points completed. */
  costPerPoint: number;
  tokensPerPoint: number;
  durationSecondsPerPoint: number;
}

export interface EfficiencySummary {
  sprints: SprintEfficiency[];
  /** Means across sprints that completed at least one story point. */
  averageCostPerPoint: number;
  averageTokensPerPoint: number;
  averageDurationSecondsPerPoint: number;
}

function toIso(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function computeEfficiency(sprints: EfficiencySprintInput[]): EfficiencySummary {
  const result: SprintEfficiency[] = sprints.map((sprint) => {
    const completed = sprint.tickets.filter((t) => isCompleted(t.status));
    const completedPoints = completed.reduce((sum, t) => sum + (t.storyPoints ?? 0), 0);
    const rollup = rollupEvents(completed.flatMap((t) => t.events));

    return {
      sprintId: sprint.id,
      name: sprint.name,
      startDate: toIso(sprint.startDate),
      endDate: toIso(sprint.endDate),
      status: sprint.status,
      completedPoints,
      tokens: rollup.tokens,
      cost: round(rollup.cost),
      durationSeconds: rollup.durationSeconds,
      costPerPoint: completedPoints > 0 ? round(rollup.cost / completedPoints) : 0,
      tokensPerPoint: completedPoints > 0 ? round(rollup.tokens / completedPoints) : 0,
      durationSecondsPerPoint:
        completedPoints > 0 ? round(rollup.durationSeconds / completedPoints) : 0,
    };
  });

  const scored = result.filter((s) => s.completedPoints > 0);
  const avg = (selector: (s: SprintEfficiency) => number) =>
    scored.length > 0 ? round(scored.reduce((sum, s) => sum + selector(s), 0) / scored.length) : 0;

  return {
    sprints: result,
    averageCostPerPoint: avg((s) => s.costPerPoint),
    averageTokensPerPoint: avg((s) => s.tokensPerPoint),
    averageDurationSecondsPerPoint: avg((s) => s.durationSecondsPerPoint),
  };
}

function round(value: number): number {
  return Math.round(value * 10000) / 10000;
}
