import { describe, it } from "node:test";
import assert from "node:assert";
import {
  resolveStoryPointsField,
  extractStoryPoints,
  DEFAULT_STORY_POINTS_FIELD,
} from "./jira.js";

describe("resolveStoryPointsField", () => {
  it("uses the configured field id when present", () => {
    assert.strictEqual(resolveStoryPointsField("customfield_10024"), "customfield_10024");
  });

  it("trims surrounding whitespace", () => {
    assert.strictEqual(resolveStoryPointsField("  customfield_10024  "), "customfield_10024");
  });

  it("falls back to the default for null/empty/whitespace", () => {
    assert.strictEqual(resolveStoryPointsField(null), DEFAULT_STORY_POINTS_FIELD);
    assert.strictEqual(resolveStoryPointsField(undefined), DEFAULT_STORY_POINTS_FIELD);
    assert.strictEqual(resolveStoryPointsField(""), DEFAULT_STORY_POINTS_FIELD);
    assert.strictEqual(resolveStoryPointsField("   "), DEFAULT_STORY_POINTS_FIELD);
  });
});

describe("extractStoryPoints", () => {
  it("reads a numeric value from the configured field", () => {
    assert.strictEqual(extractStoryPoints({ customfield_10024: 8 }, "customfield_10024"), 8);
  });

  it("reads from a non-default field when configured", () => {
    // The old hardcoded field is empty; the real value lives elsewhere.
    const fields = { customfield_10016: undefined, customfield_10024: 5 };
    assert.strictEqual(extractStoryPoints(fields, "customfield_10024"), 5);
  });

  it("returns null when the field is missing or non-numeric", () => {
    assert.strictEqual(extractStoryPoints({}, "customfield_10024"), null);
    assert.strictEqual(extractStoryPoints({ customfield_10024: "8" }, "customfield_10024"), null);
    assert.strictEqual(extractStoryPoints({ customfield_10024: null }, "customfield_10024"), null);
    assert.strictEqual(extractStoryPoints({ customfield_10024: NaN }, "customfield_10024"), null);
  });

  it("accepts zero as a valid value", () => {
    assert.strictEqual(extractStoryPoints({ customfield_10024: 0 }, "customfield_10024"), 0);
  });
});
