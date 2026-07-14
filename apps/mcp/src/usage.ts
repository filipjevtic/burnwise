/**
 * Token attribution for multi-task sessions (#149).
 *
 * Agents like Claude Code report **cumulative** session token totals. The MCP
 * server starts a fresh session per `set_ticket`, so if `report_usage` emitted
 * the raw cumulative number each time, every ticket switch would re-attribute
 * ALL tokens to the newest ticket (observed: 615k tokens dumped on a 5-minute
 * fix). Instead we track a running baseline and attribute only the **delta**
 * since the last report to the current ticket.
 */

export type Reporting = "cumulative" | "incremental";

export interface UsageNumbers {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd?: number;
}

export interface Baseline {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd: number;
}

export const ZERO_BASELINE: Baseline = {
  promptTokens: 0,
  completionTokens: 0,
  totalTokens: 0,
  costUsd: 0,
};

/**
 * Reset-safe delta: if the current cumulative value is below the baseline the
 * agent's counter reset (new run in the same server process), so the current
 * value itself is the new usage.
 */
function delta(current: number, last: number): number {
  return current >= last ? current - last : current;
}

/**
 * Given the numbers a caller reported, the previous baseline, and the reporting
 * mode, return the usage to actually emit and the next baseline.
 *
 * - `cumulative` (default): `current` is a running session total; emit the delta
 *   since the last report and advance the baseline to `current`.
 * - `incremental`: `current` is a standalone chunk; emit it as-is and leave the
 *   baseline untouched (for callers that already report per-chunk amounts).
 */
export function computeReportedUsage(
  current: UsageNumbers,
  last: Baseline,
  reporting: Reporting
): { emit: UsageNumbers; nextBaseline: Baseline } {
  if (reporting === "incremental") {
    return { emit: { ...current }, nextBaseline: last };
  }

  const emit: UsageNumbers = {
    promptTokens: delta(current.promptTokens, last.promptTokens),
    completionTokens: delta(current.completionTokens, last.completionTokens),
    totalTokens: delta(current.totalTokens, last.totalTokens),
  };
  if (current.costUsd != null) {
    emit.costUsd = delta(current.costUsd, last.costUsd);
  }

  const nextBaseline: Baseline = {
    promptTokens: current.promptTokens,
    completionTokens: current.completionTokens,
    totalTokens: current.totalTokens,
    costUsd: current.costUsd ?? last.costUsd,
  };
  return { emit, nextBaseline };
}

/** True when a computed usage delta carries no new tokens (skip emitting). */
export function isEmptyUsage(u: UsageNumbers): boolean {
  return u.promptTokens <= 0 && u.completionTokens <= 0 && u.totalTokens <= 0;
}
