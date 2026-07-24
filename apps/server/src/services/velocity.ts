/**
 * Sprint velocity math. Velocity is the heart of Burnwise's sprint-planning
 * story: how many story points a team commits to vs actually completes each
 * sprint, the completion rate (estimate accuracy), and a rolling average that
 * smooths noise so planners can forecast realistic capacity.
 *
 * Pure functions only — no Prisma — so the math is unit-testable in isolation.
 */

import { meanStddev, detectHighOutliers } from "./anomaly.js";

export interface SprintTicketInput {
  status: string;
  storyPoints: number | null;
}

export interface SprintInput {
  id: string;
  name: string;
  startDate?: Date | string | null;
  endDate?: Date | string | null;
  status: string;
  tickets: SprintTicketInput[];
}

export interface SprintVelocity {
  sprintId: string;
  name: string;
  startDate: string | null;
  endDate: string | null;
  status: string;
  committedPoints: number;
  completedPoints: number;
  /** completedPoints / committedPoints, in [0,1]; 0 when nothing committed. */
  completionRate: number;
  committedTickets: number;
  completedTickets: number;
  /** Rolling average of completedPoints over the trailing window (inclusive). */
  rollingAveragePoints: number;
}

export interface CapacityRecommendation {
  /** Robust point estimate for next-sprint capacity (median of clean history). */
  recommendedPoints: number;
  mean: number;
  median: number;
  /** Lower/upper planning band (mean ± 1 stddev of clean history, floored at 0). */
  low: number;
  high: number;
  /** Number of sprints used after dropping high outliers. */
  sampleSize: number;
  confidence: "low" | "medium" | "high";
}

export interface VelocitySummary {
  sprints: SprintVelocity[];
  /** Mean completed points across sprints with any committed work. */
  averageCompletedPoints: number;
  /** Mean completion rate across sprints with any committed work. */
  averageCompletionRate: number;
  /** Most recent sprint's rolling average, the headline planning number. */
  latestRollingAveragePoints: number;
  /** Velocity-based recommendation for how many points to commit next sprint. */
  capacity: CapacityRecommendation;
}

export const DONE_STATUSES = ["done", "closed", "completed", "resolved"];
const DONE_STATUS_SET = new Set(DONE_STATUSES);

/** A ticket counts as completed when its status is a terminal/done state. */
export function isCompleted(status: string): boolean {
  return DONE_STATUS_SET.has(status.trim().toLowerCase());
}

function toIso(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/**
 * Compute per-sprint velocity with a trailing rolling average of completed
 * points. Sprints are processed in the order given (caller sorts chronologically).
 */
export function computeVelocity(
  sprints: SprintInput[],
  rollingWindow = 3
): VelocitySummary {
  const window = Math.max(1, Math.floor(rollingWindow));
  const completedHistory: number[] = [];

  const result: SprintVelocity[] = sprints.map((sprint) => {
    let committedPoints = 0;
    let completedPoints = 0;
    let committedTickets = 0;
    let completedTickets = 0;

    for (const ticket of sprint.tickets) {
      const points = ticket.storyPoints ?? 0;
      committedPoints += points;
      committedTickets += 1;
      if (isCompleted(ticket.status)) {
        completedPoints += points;
        completedTickets += 1;
      }
    }

    completedHistory.push(completedPoints);
    const windowSlice = completedHistory.slice(-window);
    const rollingAveragePoints =
      windowSlice.reduce((sum, v) => sum + v, 0) / windowSlice.length;

    return {
      sprintId: sprint.id,
      name: sprint.name,
      startDate: toIso(sprint.startDate),
      endDate: toIso(sprint.endDate),
      status: sprint.status,
      committedPoints,
      completedPoints,
      completionRate: committedPoints > 0 ? completedPoints / committedPoints : 0,
      committedTickets,
      completedTickets,
      rollingAveragePoints: round(rollingAveragePoints),
    };
  });

  const scored = result.filter((s) => s.committedPoints > 0);
  const averageCompletedPoints =
    scored.length > 0
      ? scored.reduce((sum, s) => sum + s.completedPoints, 0) / scored.length
      : 0;
  const averageCompletionRate =
    scored.length > 0
      ? scored.reduce((sum, s) => sum + s.completionRate, 0) / scored.length
      : 0;

  return {
    sprints: result,
    averageCompletedPoints: round(averageCompletedPoints),
    averageCompletionRate: round(averageCompletionRate),
    latestRollingAveragePoints:
      result.length > 0 ? result[result.length - 1].rollingAveragePoints : 0,
    capacity: recommendCapacity(scored.map((s) => s.completedPoints)),
  };
}

/**
 * Recommend next-sprint capacity from completed-points history. Anomaly-aware:
 * high outliers (a freakishly large sprint) are dropped before computing the
 * estimate so they don't inflate the plan. Uses the median as the headline
 * (robust) and a mean ± 1 stddev band for the range.
 */
export function recommendCapacity(completedHistory: number[]): CapacityRecommendation {
  if (completedHistory.length === 0) {
    return { recommendedPoints: 0, mean: 0, median: 0, low: 0, high: 0, sampleSize: 0, confidence: "low" };
  }

  const outliers = detectHighOutliers(completedHistory);
  const clean = completedHistory.filter((_, i) => !outliers[i]);
  const sample = clean.length > 0 ? clean : completedHistory;

  const { mean, stddev } = meanStddev(sample);
  const median = computeMedian(sample);
  const confidence = sample.length < 3 ? "low" : sample.length < 6 ? "medium" : "high";

  return {
    recommendedPoints: Math.round(median),
    mean: round(mean),
    median: round(median),
    low: round(Math.max(0, mean - stddev)),
    high: round(mean + stddev),
    sampleSize: sample.length,
    confidence,
  };
}

export interface BacklogTicketInput {
  id: string;
  externalId?: string | null;
  title?: string | null;
  storyPoints: number | null;
}

export interface CommitTicket {
  id: string;
  externalId: string | null;
  title: string | null;
  storyPoints: number;
}

export interface SprintCommitRecommendation {
  /** Capacity target the commit is planned against (capacity.recommendedPoints). */
  targetPoints: number;
  /** Planning band carried through from the capacity recommendation. */
  low: number;
  high: number;
  confidence: "low" | "medium" | "high";
  /** Sum of the selected tickets' points (≤ targetPoints). */
  committedPoints: number;
  selected: CommitTicket[];
  /** Tickets that didn't make the cut, each with why. */
  deferred: Array<CommitTicket & { reason: "over-capacity" | "unestimated" }>;
}

/**
 * Recommend a committable set for the next sprint (#198): fill the capacity
 * target with backlog tickets in the given order (caller sorts by priority),
 * turning the capacity estimate into an actual plan ("commit ~24 pts; these 7
 * tickets fit").
 *
 * Greedy fill: include a ticket while the running total stays within the target;
 * a ticket that would overflow is deferred (a too-big one is a signal to split)
 * and filling continues with the rest. Unestimated tickets can't be planned, so
 * they are deferred and surfaced separately.
 */
export function recommendSprintCommit(
  capacity: CapacityRecommendation,
  backlog: BacklogTicketInput[]
): SprintCommitRecommendation {
  const target = capacity.recommendedPoints;
  const selected: CommitTicket[] = [];
  const deferred: SprintCommitRecommendation["deferred"] = [];
  let committedPoints = 0;

  for (const ticket of backlog) {
    const base: CommitTicket = {
      id: ticket.id,
      externalId: ticket.externalId ?? null,
      title: ticket.title ?? null,
      storyPoints: ticket.storyPoints ?? 0,
    };
    if (ticket.storyPoints == null) {
      deferred.push({ ...base, reason: "unestimated" });
    } else if (committedPoints + ticket.storyPoints <= target) {
      selected.push(base);
      committedPoints += ticket.storyPoints;
    } else {
      deferred.push({ ...base, reason: "over-capacity" });
    }
  }

  return {
    targetPoints: target,
    low: capacity.low,
    high: capacity.high,
    confidence: capacity.confidence,
    committedPoints,
    selected,
    deferred,
  };
}

function computeMedian(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
