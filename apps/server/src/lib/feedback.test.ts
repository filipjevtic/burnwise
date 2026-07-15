import { describe, it } from "node:test";
import assert from "node:assert";
import { normalizeSessionFeedback } from "./feedback.js";

describe("normalizeSessionFeedback", () => {
  it("keeps a well-formed report and clamps effectiveness to 1-5", () => {
    const fb = normalizeSessionFeedback({
      effectiveness: 4,
      wins: ["shipped auth", "  refactored session store  "],
      blockers: ["flaky test"],
      summary: "  Completed the login flow.  ",
    });
    assert.deepStrictEqual(fb, {
      effectiveness: 4,
      wins: ["shipped auth", "refactored session store"],
      blockers: ["flaky test"],
      summary: "Completed the login flow.",
    });
  });

  it("rounds and clamps out-of-range effectiveness", () => {
    assert.strictEqual(normalizeSessionFeedback({ effectiveness: 9 })!.effectiveness, 5);
    assert.strictEqual(normalizeSessionFeedback({ effectiveness: 0 })!.effectiveness, 1);
    assert.strictEqual(normalizeSessionFeedback({ effectiveness: 3.6 })!.effectiveness, 4);
  });

  it("drops non-string / empty list items and empty lists", () => {
    const fb = normalizeSessionFeedback({ wins: [1, "", "  ", "real", null] });
    assert.deepStrictEqual(fb, { wins: ["real"] });
    assert.strictEqual(normalizeSessionFeedback({ blockers: ["", "   "] }), null);
  });

  it("caps list length, item length, and summary length", () => {
    const fb = normalizeSessionFeedback({
      wins: Array.from({ length: 50 }, (_, i) => `w${i}`),
      summary: "x".repeat(5000),
    })!;
    assert.strictEqual(fb.wins!.length, 20);
    assert.strictEqual(fb.summary!.length, 2000);
  });

  it("returns null for empty / invalid input", () => {
    assert.strictEqual(normalizeSessionFeedback(null), null);
    assert.strictEqual(normalizeSessionFeedback("nope"), null);
    assert.strictEqual(normalizeSessionFeedback({}), null);
    assert.strictEqual(normalizeSessionFeedback({ effectiveness: "high" }), null);
  });
});
