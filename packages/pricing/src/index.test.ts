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

describe("priceForModel", () => {
  it("returns the default price for an unknown model", () => {
    assert.deepEqual(priceForModel("mystery"), DEFAULT_PRICE);
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
