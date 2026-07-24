import { describe, it } from "node:test";
import assert from "node:assert";
import { buildRuleExclusion, isRejectionRuleField } from "./rejection-rules.js";

describe("isRejectionRuleField", () => {
  it("accepts the supported fields", () => {
    assert.equal(isRejectionRuleField("source"), true);
    assert.equal(isRejectionRuleField("userId"), true);
  });
  it("rejects anything else", () => {
    assert.equal(isRejectionRuleField("payload"), false);
    assert.equal(isRejectionRuleField(""), false);
    assert.equal(isRejectionRuleField(undefined), false);
  });
});

describe("buildRuleExclusion", () => {
  it("returns [] for no rules (caller adds no exclusion)", () => {
    assert.deepEqual(buildRuleExclusion([]), []);
  });

  it("groups values per field into one `in` clause each", () => {
    const out = buildRuleExclusion([
      { field: "source", value: "cli" },
      { field: "source", value: "browser" },
      { field: "userId", value: "bot-1" },
    ]);
    assert.deepEqual(out, [{ source: { in: ["cli", "browser"] } }, { userId: { in: ["bot-1"] } }]);
  });

  it("ignores unknown fields", () => {
    const out = buildRuleExclusion([
      { field: "payload", value: "x" },
      { field: "source", value: "otel" },
    ]);
    assert.deepEqual(out, [{ source: { in: ["otel"] } }]);
  });
});
