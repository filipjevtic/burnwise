import { describe, it } from "node:test";
import assert from "node:assert";
import { computeEstimateCalibration } from "./estimate-calibration.js";

function ticket(status: string, storyPoints: number | null, tokenTotals: number[]) {
  return {
    status,
    storyPoints,
    events: tokenTotals.map((t) => ({ eventType: "llm.response", payload: { totalTokens: t } })),
  };
}

describe("computeEstimateCalibration", () => {
  it("groups completed tickets by story points with per-bucket effort", () => {
    const result = computeEstimateCalibration([
      ticket("done", 3, [1000]),
      ticket("done", 3, [3000]),
      ticket("closed", 5, [8000]),
    ]);

    assert.strictEqual(result.sampleSize, 3);
    assert.deepStrictEqual(result.buckets.map((b) => b.storyPoints), [3, 5]);
    const three = result.buckets[0];
    assert.strictEqual(three.ticketCount, 2);
    assert.strictEqual(three.avgTokens, 2000);
    assert.strictEqual(three.medianTokens, 2000);
    assert.strictEqual(result.buckets[1].avgTokens, 8000);
  });

  it("excludes non-completed tickets and tickets without story points", () => {
    const result = computeEstimateCalibration([
      ticket("in_progress", 3, [9999]),
      ticket("done", null, [9999]),
      ticket("done", 2, [500]),
    ]);
    assert.strictEqual(result.sampleSize, 1);
    assert.strictEqual(result.buckets.length, 1);
    assert.strictEqual(result.buckets[0].storyPoints, 2);
  });

  it("flags consistency from the coefficient of variation", () => {
    const tight = computeEstimateCalibration([
      ticket("done", 3, [1000]),
      ticket("done", 3, [1050]),
      ticket("done", 3, [950]),
    ]);
    assert.strictEqual(tight.buckets[0].consistency, "consistent");

    const noisy = computeEstimateCalibration([
      ticket("done", 3, [500]),
      ticket("done", 3, [9000]),
    ]);
    assert.strictEqual(noisy.buckets[0].consistency, "noisy");
  });

  it("detects an inversion: a smaller estimate that costs more than a larger one", () => {
    const result = computeEstimateCalibration([
      ticket("done", 3, [8000]),
      ticket("done", 3, [8000]),
      ticket("done", 5, [3000]),
      ticket("done", 5, [3000]),
    ]);
    assert.strictEqual(result.inversions.length, 1);
    assert.deepStrictEqual(result.inversions[0], {
      lowerPoints: 3,
      higherPoints: 5,
      lowerAvgTokens: 8000,
      higherAvgTokens: 3000,
    });
  });

  it("returns empty results when there is no completed pointed work", () => {
    const result = computeEstimateCalibration([ticket("in_progress", 3, [100])]);
    assert.deepStrictEqual(result, { buckets: [], inversions: [], sampleSize: 0 });
  });
});
