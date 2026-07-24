import { describe, it } from "node:test";
import assert from "node:assert";
import {
  parseTranscriptUsage,
  computeUsageDeltas,
  resolveTicket,
  branchFromGitHead,
  type Baseline,
} from "./hook-usage.js";

function line(obj: unknown): string {
  return JSON.stringify(obj);
}

describe("parseTranscriptUsage", () => {
  it("sums usage per model across assistant turns, incl. cache tokens", () => {
    const jsonl = [
      line({ type: "user", message: { role: "user" } }),
      line({
        type: "assistant",
        message: { model: "claude-opus-4-8", usage: { input_tokens: 100, output_tokens: 20 } },
      }),
      line({
        type: "assistant",
        message: {
          model: "claude-opus-4-8",
          usage: { input_tokens: 50, cache_read_input_tokens: 30, cache_creation_input_tokens: 10, output_tokens: 5 },
        },
      }),
      line({ type: "assistant", message: { model: "claude-haiku-4-5", usage: { input_tokens: 10, output_tokens: 2 } } }),
    ].join("\n");

    const usage = parseTranscriptUsage(jsonl);
    const opus = usage.get("claude-opus-4-8")!;
    // prompt: (100) + (50+30+10) = 190; completion: 20+5 = 25
    assert.strictEqual(opus.promptTokens, 190);
    assert.strictEqual(opus.completionTokens, 25);
    assert.strictEqual(opus.totalTokens, 215);
    const haiku = usage.get("claude-haiku-4-5")!;
    assert.strictEqual(haiku.totalTokens, 12);
  });

  it("skips blank, malformed, and non-assistant lines", () => {
    const jsonl = ["", "not json", line({ type: "assistant", message: { model: "m" } }), "  "].join("\n");
    const usage = parseTranscriptUsage(jsonl);
    assert.strictEqual(usage.size, 0);
  });

  it("labels usage with no model as 'unknown'", () => {
    const usage = parseTranscriptUsage(line({ type: "assistant", message: { usage: { input_tokens: 5, output_tokens: 1 } } }));
    assert.strictEqual(usage.get("unknown")?.totalTokens, 6);
  });
});

describe("computeUsageDeltas", () => {
  it("emits only the increase since the baseline and advances it", () => {
    const current = new Map([["m", { promptTokens: 100, completionTokens: 40, totalTokens: 140 }]]);
    const baseline: Baseline = { m: { promptTokens: 60, completionTokens: 30, totalTokens: 90 } };
    const { deltas, nextBaseline } = computeUsageDeltas(current, baseline);
    assert.deepStrictEqual(deltas.get("m"), { promptTokens: 40, completionTokens: 10, totalTokens: 50 });
    assert.deepStrictEqual(nextBaseline.m, current.get("m"));
  });

  it("emits nothing when there is no new usage (idempotent re-fire)", () => {
    const current = new Map([["m", { promptTokens: 100, completionTokens: 40, totalTokens: 140 }]]);
    const baseline: Baseline = { m: { promptTokens: 100, completionTokens: 40, totalTokens: 140 } };
    const { deltas } = computeUsageDeltas(current, baseline);
    assert.strictEqual(deltas.size, 0);
  });

  it("treats a model absent from the baseline as all-new", () => {
    const current = new Map([["new", { promptTokens: 10, completionTokens: 2, totalTokens: 12 }]]);
    const { deltas } = computeUsageDeltas(current, {});
    assert.deepStrictEqual(deltas.get("new"), { promptTokens: 10, completionTokens: 2, totalTokens: 12 });
  });
});

describe("resolveTicket", () => {
  it("prefers the env override, then file, then branch", () => {
    assert.strictEqual(resolveTicket({ envTicket: "PROJ-1", fileTicket: "PROJ-2", branch: "feature/PROJ-3-x" }), "PROJ-1");
    assert.strictEqual(resolveTicket({ fileTicket: " PROJ-2 ", branch: "feature/PROJ-3-x" }), "PROJ-2");
    assert.strictEqual(resolveTicket({ branch: "feature/PROJ-3-add-thing" }), "PROJ-3");
  });

  it("returns undefined when nothing yields a ticket", () => {
    assert.strictEqual(resolveTicket({ branch: "main" }), undefined);
    assert.strictEqual(resolveTicket({}), undefined);
  });
});

describe("branchFromGitHead", () => {
  it("extracts the branch from a symbolic HEAD ref", () => {
    assert.strictEqual(branchFromGitHead("ref: refs/heads/feature/PROJ-9\n"), "feature/PROJ-9");
  });
  it("returns undefined for a detached HEAD (raw sha)", () => {
    assert.strictEqual(branchFromGitHead("a1b2c3d4e5f6"), undefined);
  });
});
