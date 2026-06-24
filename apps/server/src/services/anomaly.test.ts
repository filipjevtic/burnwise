import { describe, it } from "node:test";
import assert from "node:assert";
import { meanStddev, detectHighOutliers } from "./anomaly.js";

describe("meanStddev", () => {
  it("computes mean and population stddev", () => {
    const { mean, stddev } = meanStddev([2, 4, 4, 4, 5, 5, 7, 9]);
    assert.strictEqual(mean, 5);
    assert.strictEqual(stddev, 2);
  });

  it("returns zeros for an empty list", () => {
    assert.deepStrictEqual(meanStddev([]), { mean: 0, stddev: 0 });
  });
});

describe("detectHighOutliers", () => {
  it("flags a high outlier above the z threshold", () => {
    // Tight cluster with one large spike.
    const values = [10, 11, 9, 10, 12, 100];
    const flags = detectHighOutliers(values, { threshold: 2, minSamples: 5 });
    assert.deepStrictEqual(flags, [false, false, false, false, false, true]);
  });

  it("does not flag low outliers (one-sided)", () => {
    const values = [100, 101, 99, 100, 102, 1];
    const flags = detectHighOutliers(values, { threshold: 2 });
    assert.strictEqual(flags[5], false);
  });

  it("returns all false below the minimum sample size", () => {
    assert.deepStrictEqual(detectHighOutliers([1, 1000], { minSamples: 5 }), [false, false]);
  });

  it("returns all false when there is no variance", () => {
    assert.deepStrictEqual(detectHighOutliers([5, 5, 5, 5, 5]), [false, false, false, false, false]);
  });
});
