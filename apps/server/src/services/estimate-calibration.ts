/**
 * Estimate calibration: are your story-point estimates consistent with the
 * *actual* AI-assisted effort they took? Groups completed tickets by their
 * story-point value and, per bucket, reports the average/median effort and how
 * noisy it is — plus "inversions" where a smaller estimate consumed more effort
 * than a larger one. This is the PM/EM-facing signal for recalibrating points in
 * the AI era (issue #195).
 *
 * Pure functions only (no Prisma) so the math is unit-testable in isolation.
 */

import { rollupEvents, type RollupEvent } from "./rollup.js";
import { isCompleted } from "./velocity.js";

export interface CalibrationTicketInput {
  status: string;
  storyPoints: number | null;
  events: RollupEvent[];
}

export type Consistency = "consistent" | "moderate" | "noisy";

export interface CalibrationBucket {
  storyPoints: number;
  ticketCount: number;
  avgTokens: number;
  medianTokens: number;
  avgCost: number;
  avgDurationSeconds: number;
  /** Coefficient of variation of per-ticket tokens (spread ÷ mean). */
  tokensCv: number;
  consistency: Consistency;
}

export interface CalibrationInversion {
  lowerPoints: number;
  higherPoints: number;
  lowerAvgTokens: number;
  higherAvgTokens: number;
}

export interface CalibrationSummary {
  buckets: CalibrationBucket[];
  inversions: CalibrationInversion[];
  /** Completed tickets with story points that fed the calibration. */
  sampleSize: number;
}

export function computeEstimateCalibration(
  tickets: CalibrationTicketInput[]
): CalibrationSummary {
  const completed = tickets.filter(
    (t) => isCompleted(t.status) && (t.storyPoints ?? 0) > 0
  );

  const byPoints = new Map<number, CalibrationTicketInput[]>();
  for (const t of completed) {
    const key = t.storyPoints as number;
    const group = byPoints.get(key);
    if (group) group.push(t);
    else byPoints.set(key, [t]);
  }

  const buckets: CalibrationBucket[] = [...byPoints.entries()]
    .map(([storyPoints, group]) => {
      const tokensPer = group.map((t) => rollupEvents(t.events).tokens);
      const costPer = group.map((t) => rollupEvents(t.events).cost);
      const durationPer = group.map((t) => rollupEvents(t.events).durationSeconds);
      const avgTokens = mean(tokensPer);
      const cv = avgTokens > 0 ? stdDev(tokensPer) / avgTokens : 0;
      return {
        storyPoints,
        ticketCount: group.length,
        avgTokens: round(avgTokens),
        medianTokens: round(median(tokensPer)),
        avgCost: round(mean(costPer)),
        avgDurationSeconds: round(mean(durationPer)),
        tokensCv: round(cv),
        consistency: classifyConsistency(cv, group.length),
      };
    })
    .sort((a, b) => a.storyPoints - b.storyPoints);

  // Inversions: a lower-point bucket whose average effort exceeds a
  // higher-point bucket's — a sign the two point values aren't distinguishing
  // effort. Compare adjacent buckets (in point order) with real samples.
  const inversions: CalibrationInversion[] = [];
  const scored = buckets.filter((b) => b.ticketCount >= 2);
  for (let i = 0; i < scored.length - 1; i++) {
    const lower = scored[i];
    const higher = scored[i + 1];
    if (lower.avgTokens > higher.avgTokens) {
      inversions.push({
        lowerPoints: lower.storyPoints,
        higherPoints: higher.storyPoints,
        lowerAvgTokens: lower.avgTokens,
        higherAvgTokens: higher.avgTokens,
      });
    }
  }

  return { buckets, inversions, sampleSize: completed.length };
}

/** <2 samples can't be judged; otherwise CV thresholds. */
function classifyConsistency(cv: number, count: number): Consistency {
  if (count < 2) return "moderate";
  if (cv < 0.3) return "consistent";
  if (cv < 0.7) return "moderate";
  return "noisy";
}

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0;
}

function median(xs: number[]): number {
  if (!xs.length) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function stdDev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  const variance = xs.reduce((s, x) => s + (x - m) ** 2, 0) / xs.length;
  return Math.sqrt(variance);
}

function round(value: number): number {
  return Math.round(value * 10000) / 10000;
}
