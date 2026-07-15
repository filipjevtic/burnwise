import { describe, it } from "node:test";
import assert from "node:assert";
import { normalizeGitLabState } from "./gitlab.js";
import { isCompleted } from "../services/velocity.js";

describe("normalizeGitLabState", () => {
  it("maps closed -> done (recognized as completed)", () => {
    assert.strictEqual(normalizeGitLabState("closed"), "done");
    assert.strictEqual(isCompleted(normalizeGitLabState("closed")), true);
  });

  it("maps opened -> in progress (not completed)", () => {
    assert.strictEqual(normalizeGitLabState("opened"), "in progress");
    assert.strictEqual(isCompleted(normalizeGitLabState("opened")), false);
  });

  it("is case/whitespace insensitive", () => {
    assert.strictEqual(normalizeGitLabState("  CLOSED "), "done");
    assert.strictEqual(normalizeGitLabState("Opened"), "in progress");
  });

  it("falls through unknown states lowercased rather than dropping them", () => {
    assert.strictEqual(normalizeGitLabState("locked"), "locked");
  });

  it("handles null/empty defensively", () => {
    assert.strictEqual(normalizeGitLabState(null), "unknown");
    assert.strictEqual(normalizeGitLabState(""), "unknown");
    assert.strictEqual(normalizeGitLabState(undefined), "unknown");
  });
});
