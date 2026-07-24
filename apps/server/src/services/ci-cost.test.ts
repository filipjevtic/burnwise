import { describe, it } from "node:test";
import assert from "node:assert";
import { resolveGitHubRunnerRate, estimateCiCost } from "./ci-cost.js";

describe("resolveGitHubRunnerRate", () => {
  it("prices Linux runners (and unknown/absent) at the Linux rate", () => {
    assert.strictEqual(resolveGitHubRunnerRate("ubuntu-latest"), 0.008);
    assert.strictEqual(resolveGitHubRunnerRate("ubuntu-22.04"), 0.008);
    assert.strictEqual(resolveGitHubRunnerRate(undefined), 0.008);
    assert.strictEqual(resolveGitHubRunnerRate("self-hosted-x"), 0.008);
  });

  it("prices Windows runners higher regardless of version", () => {
    assert.strictEqual(resolveGitHubRunnerRate("windows-latest"), 0.016);
    assert.strictEqual(resolveGitHubRunnerRate("windows-2022"), 0.016);
  });

  it("prices macOS runners highest regardless of version", () => {
    assert.strictEqual(resolveGitHubRunnerRate("macos-latest"), 0.08);
    assert.strictEqual(resolveGitHubRunnerRate("macOS-14"), 0.08);
  });
});

describe("estimateCiCost", () => {
  it("honors the runner instead of assuming Linux (#16)", () => {
    // 10 minutes on each runner family.
    assert.strictEqual(estimateCiCost("github", 600, "ubuntu-latest"), 0.08);
    assert.strictEqual(estimateCiCost("github", 600, "windows-latest"), 0.16);
    assert.strictEqual(estimateCiCost("github", 600, "macos-latest"), 0.8);
  });

  it("defaults to the Linux rate when no runner is given", () => {
    assert.strictEqual(estimateCiCost("github", 600), 0.08);
  });

  it("returns undefined without a duration or for non-github providers", () => {
    assert.strictEqual(estimateCiCost("github", undefined, "ubuntu-latest"), undefined);
    assert.strictEqual(estimateCiCost("github", 0), undefined);
    assert.strictEqual(estimateCiCost("gitlab", 600, "ubuntu-latest"), undefined);
    assert.strictEqual(estimateCiCost("generic", 600), undefined);
  });
});
