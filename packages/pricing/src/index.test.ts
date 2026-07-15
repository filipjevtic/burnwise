import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { estimateCost, resolveCostUsd, priceForModel, DEFAULT_PRICE } from "./index.js";

function assertApprox(actual: number, expected: number, message?: string) {
  assert.ok(Math.abs(actual - expected) < 1e-10, message ?? `expected ${expected}, got ${actual}`);
}

describe("estimateCost", () => {
  it("prices gpt-4o", () => {
    assertApprox(estimateCost("openai", "gpt-4o", 1_000_000, 500_000), 12.5);
  });

  it("prices gpt-4o-mini (longest-match wins over gpt-4o)", () => {
    assertApprox(estimateCost("openai", "gpt-4o-mini", 1_000_000, 500_000), 0.45);
  });

  it("prices claude-3-5-sonnet", () => {
    assertApprox(estimateCost("anthropic", "claude-3-5-sonnet", 1_000_000, 500_000), 10.5);
  });

  it("prices current claude-opus-4-8 at $5/$25", () => {
    assertApprox(estimateCost("anthropic", "claude-opus-4-8", 1_000_000, 500_000), 17.5);
  });

  it("matches dated/suffixed model names by substring", () => {
    assertApprox(estimateCost("openai", "gpt-4o-2024-08-06", 1_000_000, 0), 5.0);
  });

  it("falls back to default pricing for unknown models", () => {
    assertApprox(estimateCost("unknown", "custom-model", 1_000_000, 500_000), 2.5);
  });

  it("treats negative/invalid token counts as zero", () => {
    assertApprox(estimateCost("openai", "gpt-4o", -10, Number.NaN), 0);
  });
});

describe("priceForModel (provider-aware)", () => {
  it("returns the default price for an unknown model", () => {
    assert.deepEqual(priceForModel("mystery"), DEFAULT_PRICE);
  });

  it("matches a Bedrock-prefixed Claude id against the shared table", () => {
    // "anthropic.claude-opus-4-8" should still resolve to the claude-opus-4 entry.
    assert.deepEqual(priceForModel("anthropic.claude-opus-4-8", "bedrock"), {
      prompt: 5.0,
      completion: 25.0,
    });
  });

  it("matches a Vertex @-versioned Claude id against the shared table", () => {
    assert.deepEqual(priceForModel("claude-haiku-4-5@20251001", "vertex"), {
      prompt: 1.0,
      completion: 5.0,
    });
  });

  it("uses a provider override before the shared table", () => {
    // Bedrock-native Titan is only in the provider table, not the shared one.
    assert.deepEqual(priceForModel("amazon.titan-text-express-v1", "bedrock"), {
      prompt: 0.2,
      completion: 0.6,
    });
  });

  it("is case-insensitive on the provider name", () => {
    assert.deepEqual(priceForModel("amazon.titan-text-lite", "BEDROCK"), {
      prompt: 0.15,
      completion: 0.2,
    });
  });

  it("falls through to the shared table for an unknown provider", () => {
    assert.deepEqual(priceForModel("gpt-4o", "some-unknown-provider"), {
      prompt: 5.0,
      completion: 15.0,
    });
  });
});

describe("resolveCostUsd", () => {
  it("trusts an existing positive cost", () => {
    assert.equal(resolveCostUsd({ costUsd: 1.23, model: "gpt-4o", promptTokens: 100 }), 1.23);
  });

  it("estimates when cost is missing", () => {
    assertApprox(
      resolveCostUsd({ model: "gpt-4o", promptTokens: 1_000_000, completionTokens: 0 })!,
      5.0
    );
  });

  it("estimates using the provider dimension", () => {
    // Bedrock Titan is only priced via the provider table.
    assertApprox(
      resolveCostUsd({
        provider: "bedrock",
        model: "amazon.titan-text-express-v1",
        promptTokens: 1_000_000,
        completionTokens: 0,
      })!,
      0.2
    );
  });

  it("estimates when cost is zero", () => {
    assertApprox(
      resolveCostUsd({ costUsd: 0, model: "gpt-4o-mini", promptTokens: 1_000_000, completionTokens: 0 })!,
      0.15
    );
  });

  it("returns undefined when there is no model", () => {
    assert.equal(resolveCostUsd({ promptTokens: 100, completionTokens: 50 }), undefined);
  });

  it("returns undefined when there are no tokens to price", () => {
    assert.equal(resolveCostUsd({ model: "gpt-4o" }), undefined);
    assert.equal(resolveCostUsd({ model: "gpt-4o", promptTokens: 0, completionTokens: 0 }), undefined);
  });
});
