/**
 * CI runner cost estimation (#16).
 *
 * GitHub bills hosted runners per minute at a rate that depends on the OS
 * family, so the estimate must honor the actual runner rather than assuming
 * Linux. Kept as a pure module so it's unit-testable and reusable.
 */

// GitHub-hosted standard-runner per-minute prices (2-core), by OS family.
// Larger/custom runners cost more and aren't modeled here.
const GITHUB_COST_PER_MINUTE = {
  ubuntu: 0.008,
  windows: 0.016,
  macos: 0.08,
};

/**
 * Resolve the GitHub per-minute rate for a runner label by OS family. Handles
 * any version suffix (ubuntu-latest / ubuntu-22.04 / windows-2022 / macos-14,
 * …); unknown or absent labels fall back to the Linux rate.
 */
export function resolveGitHubRunnerRate(runner?: string): number {
  const label = (runner || "").trim().toLowerCase();
  if (label.startsWith("windows")) return GITHUB_COST_PER_MINUTE.windows;
  if (label.startsWith("macos")) return GITHUB_COST_PER_MINUTE.macos;
  return GITHUB_COST_PER_MINUTE.ubuntu;
}

/**
 * Estimate the USD cost of a CI run from its duration and runner. Only GitHub
 * is priced today (per-minute by runner OS); other providers return undefined
 * so a caller-supplied cost is used instead.
 */
export function estimateCiCost(provider: string, durationSeconds?: number, runner?: string): number | undefined {
  if (!durationSeconds) return undefined;
  const minutes = durationSeconds / 60;
  if (provider === "github") {
    return Number((minutes * resolveGitHubRunnerRate(runner)).toFixed(4));
  }
  return undefined;
}
