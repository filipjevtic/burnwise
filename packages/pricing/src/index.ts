/**
 * Central LLM pricing shared by the proxy (which prices events as it emits
 * them) and the server (which backfills cost on ingest for events that arrive
 * without one). Keeping a single price table avoids the two drifting apart.
 *
 * Prices are USD per 1,000,000 tokens, split by prompt vs completion.
 */

export interface ModelPrice {
  prompt: number;
  completion: number;
}

/**
 * Fallback price list. Keys are matched as substrings of the model name
 * (longest key wins), so e.g. "gpt-4o-2024-08-06" matches "gpt-4o". Operators
 * should override these to match their negotiated rates.
 */
export const MODEL_PRICES: Record<string, ModelPrice> = {
  "gpt-4o-mini": { prompt: 0.15, completion: 0.6 },
  "gpt-4o": { prompt: 5.0, completion: 15.0 },
  "gpt-4-turbo": { prompt: 10.0, completion: 30.0 },
  "claude-3-5-sonnet": { prompt: 3.0, completion: 15.0 },
  "claude-3-haiku": { prompt: 0.25, completion: 1.25 },
};

export const DEFAULT_PRICE: ModelPrice = { prompt: 1.0, completion: 3.0 };

/** Resolve the price entry for a model name via longest-substring match. */
export function priceForModel(model: string): ModelPrice {
  const key = Object.keys(MODEL_PRICES)
    .sort((a, b) => b.length - a.length)
    .find((k) => model.includes(k));
  return key ? MODEL_PRICES[key] : DEFAULT_PRICE;
}

/**
 * Estimate the USD cost of a single LLM call from its token counts.
 * `provider` is accepted for API symmetry/future per-provider tables but the
 * current price table keys on model name only.
 */
export function estimateCost(
  _provider: string,
  model: string,
  promptTokens: number,
  completionTokens: number
): number {
  const price = priceForModel(model);
  const prompt = isNonNegativeNumber(promptTokens) ? promptTokens : 0;
  const completion = isNonNegativeNumber(completionTokens) ? completionTokens : 0;
  return (prompt * price.prompt + completion * price.completion) / 1_000_000;
}

export interface CostInput {
  provider?: string;
  model?: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  costUsd?: number;
}

/**
 * Resolve the authoritative cost for an llm.response payload.
 *
 * - If a positive `costUsd` is already present, it is trusted and returned.
 * - Otherwise, if a model and token counts are available, the cost is
 *   estimated from the price table.
 * - If there is nothing to price (no model, or no tokens), returns undefined so
 *   callers can leave the field unset.
 */
export function resolveCostUsd(input: CostInput): number | undefined {
  if (isPositiveNumber(input.costUsd)) return input.costUsd;
  if (!input.model) return undefined;

  const prompt = isNonNegativeNumber(input.promptTokens) ? input.promptTokens : 0;
  const completion = isNonNegativeNumber(input.completionTokens) ? input.completionTokens : 0;

  if (prompt === 0 && completion === 0) return undefined;
  return estimateCost(input.provider ?? "", input.model, prompt, completion);
}

function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isPositiveNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}
