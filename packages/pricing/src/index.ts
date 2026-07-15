/**
 * Central LLM pricing shared by the proxy (which prices events as it emits
 * them) and the server (which backfills cost on ingest for events that arrive
 * without one). Keeping a single price table avoids the two drifting apart.
 *
 * Prices are USD per 1,000,000 tokens, split by prompt vs completion.
 *
 * Pricing is keyed by (provider, model): the same model can cost a different
 * amount depending on where it runs (a Claude model billed via AWS Bedrock or
 * GCP Vertex vs. the direct Anthropic API, GPT via Azure vs. OpenAI, etc.).
 * Lookups consult the provider's own table first, then a shared, provider-
 * agnostic table, then a default — so a new model only needs a provider entry
 * where its rate actually differs. See issue #197.
 *
 * This is a *fallback* table for events that arrive without a cost. Operators
 * should override it to match their negotiated/enterprise rates.
 */

export interface ModelPrice {
  prompt: number;
  completion: number;
}

/**
 * Provider-agnostic price list. Keys are matched as substrings of the model
 * name (longest key wins), so e.g. "gpt-4o-2024-08-06" matches "gpt-4o" and
 * "anthropic.claude-opus-4-8" (Bedrock's prefixed id) matches "claude-opus-4-8".
 */
export const MODEL_PRICES: Record<string, ModelPrice> = {
  // OpenAI
  "gpt-4o-mini": { prompt: 0.15, completion: 0.6 },
  "gpt-4o": { prompt: 5.0, completion: 15.0 },
  "gpt-4-turbo": { prompt: 10.0, completion: 30.0 },
  // Anthropic (current)
  "claude-opus-4": { prompt: 5.0, completion: 25.0 },
  "claude-sonnet-4": { prompt: 3.0, completion: 15.0 },
  "claude-haiku-4": { prompt: 1.0, completion: 5.0 },
  "claude-fable-5": { prompt: 10.0, completion: 50.0 },
  // Anthropic (legacy)
  "claude-3-5-sonnet": { prompt: 3.0, completion: 15.0 },
  "claude-3-5-haiku": { prompt: 0.8, completion: 4.0 },
  "claude-3-haiku": { prompt: 0.25, completion: 1.25 },
  "claude-3-opus": { prompt: 15.0, completion: 75.0 },
  // Google
  "gemini-2.5-pro": { prompt: 1.25, completion: 10.0 },
  "gemini-2.5-flash": { prompt: 0.3, completion: 2.5 },
};

/**
 * Per-provider overrides, consulted before the shared table. Only list a model
 * here when its rate for that provider genuinely differs from the shared entry
 * — otherwise the shared table already covers it (including provider-prefixed
 * ids via substring match). Provider keys are lowercased on lookup.
 *
 * Anthropic/OpenAI models on Bedrock/Vertex/Azure currently list at the same
 * per-token price as the first-party API, so those providers deliberately have
 * no overrides yet — they fall through to MODEL_PRICES. This table is the seam
 * where a real per-provider difference (e.g. a negotiated Bedrock rate or a
 * Bedrock-native model like Titan) gets encoded without touching the shared
 * table.
 */
export const PROVIDER_MODEL_PRICES: Record<string, Record<string, ModelPrice>> = {
  bedrock: {
    // Amazon Bedrock native models (not in the shared table).
    "amazon.titan-text-express": { prompt: 0.2, completion: 0.6 },
    "amazon.titan-text-lite": { prompt: 0.15, completion: 0.2 },
  },
};

export const DEFAULT_PRICE: ModelPrice = { prompt: 1.0, completion: 3.0 };

/** Longest-substring match of `model` against a price table, or undefined. */
function matchInTable(table: Record<string, ModelPrice>, model: string): ModelPrice | undefined {
  const key = Object.keys(table)
    .sort((a, b) => b.length - a.length)
    .find((k) => model.includes(k));
  return key ? table[key] : undefined;
}

/**
 * Resolve the price entry for a (provider, model) pair via longest-substring
 * match. The provider's own table wins over the shared table, which wins over
 * the default. `provider` is optional/case-insensitive; an unknown provider
 * simply falls through to the shared table.
 */
export function priceForModel(model: string, provider?: string): ModelPrice {
  if (provider) {
    const providerTable = PROVIDER_MODEL_PRICES[provider.toLowerCase()];
    if (providerTable) {
      const providerMatch = matchInTable(providerTable, model);
      if (providerMatch) return providerMatch;
    }
  }
  return matchInTable(MODEL_PRICES, model) ?? DEFAULT_PRICE;
}

/**
 * Estimate the USD cost of a single LLM call from its token counts, using the
 * (provider, model) price entry.
 */
export function estimateCost(
  provider: string,
  model: string,
  promptTokens: number,
  completionTokens: number
): number {
  const price = priceForModel(model, provider);
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
 *   estimated from the (provider, model) price table.
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
