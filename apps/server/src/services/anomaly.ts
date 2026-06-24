/**
 * Simple statistical outlier detection for usage metrics (e.g. per-session
 * tokens or cost). We flag unusually *high* values using a one-sided z-score,
 * with a minimum-sample guard so small datasets don't produce noise.
 */

export interface AnomalyOptions {
  /** z-score above the mean to flag (default 2). */
  threshold?: number;
  /** Minimum sample size before any flagging happens (default 5). */
  minSamples?: number;
}

export function meanStddev(values: number[]): { mean: number; stddev: number } {
  if (values.length === 0) return { mean: 0, stddev: 0 };
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  return { mean, stddev: Math.sqrt(variance) };
}

/**
 * Return a boolean per value: true if the value is a high outlier. Returns all
 * false when there are too few samples or no variance.
 */
export function detectHighOutliers(values: number[], opts: AnomalyOptions = {}): boolean[] {
  const threshold = opts.threshold ?? 2;
  const minSamples = opts.minSamples ?? 5;
  if (values.length < minSamples) return values.map(() => false);

  const { mean, stddev } = meanStddev(values);
  if (stddev === 0) return values.map(() => false);

  return values.map((v) => (v - mean) / stddev > threshold);
}
