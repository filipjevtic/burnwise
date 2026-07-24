import { describe, it } from "node:test";
import assert from "node:assert";
import {
  resolveStoryPointsField,
  extractStoryPoints,
  extractAdfText,
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

describe("extractAdfText", () => {
  it("returns null for empty/non-object input", () => {
    assert.strictEqual(extractAdfText(null), null);
    assert.strictEqual(extractAdfText({ type: "doc", content: [] }), null);
  });

  it("joins inline text within a paragraph without newlines", () => {
    const doc = {
      type: "doc",
      content: [
        { type: "paragraph", content: [
          { type: "text", text: "Hello " },
          { type: "text", text: "world", marks: [{ type: "strong" }] },
        ] },
      ],
    };
    assert.strictEqual(extractAdfText(doc), "Hello world");
  });

  it("separates block nodes (paragraphs) with newlines", () => {
    const doc = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "First" }] },
        { type: "paragraph", content: [{ type: "text", text: "Second" }] },
      ],
    };
    assert.strictEqual(extractAdfText(doc), "First\nSecond");
  });

  it("captures mentions, emoji, and inline cards", () => {
    const doc = {
      type: "doc",
      content: [
        { type: "paragraph", content: [
          { type: "text", text: "cc " },
          { type: "mention", attrs: { id: "557058:x", text: "@Jane Doe" } },
          { type: "text", text: " " },
          { type: "emoji", attrs: { shortName: ":tada:", text: "🎉" } },
          { type: "text", text: " see " },
          { type: "inlineCard", attrs: { url: "https://example.com/spec" } },
        ] },
      ],
    };
    assert.strictEqual(extractAdfText(doc), "cc @Jane Doe 🎉 see https://example.com/spec");
  });

  it("falls back to @id when a mention has no text", () => {
    const doc = { type: "doc", content: [{ type: "paragraph", content: [
      { type: "mention", attrs: { id: "abc-123" } },
    ] }] };
    assert.strictEqual(extractAdfText(doc), "@abc-123");
  });

  it("preserves code block contents", () => {
    const doc = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Run:" }] },
        { type: "codeBlock", attrs: { language: "bash" }, content: [{ type: "text", text: "npm test\nnpm run build" }] },
      ],
    };
    assert.strictEqual(extractAdfText(doc), "Run:\nnpm test\nnpm run build");
  });

  it("extracts table cells (tab-separated) and rows (newline-separated)", () => {
    const cell = (t: string) => ({ type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: t }] }] });
    const doc = {
      type: "doc",
      content: [
        { type: "table", content: [
          { type: "tableRow", content: [cell("Name"), cell("Points")] },
          { type: "tableRow", content: [cell("Login"), cell("3")] },
        ] },
      ],
    };
    assert.strictEqual(extractAdfText(doc), "Name\tPoints\nLogin\t3");
  });

  it("walks bullet lists", () => {
    const item = (t: string) => ({ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: t }] }] });
    const doc = { type: "doc", content: [{ type: "bulletList", content: [item("one"), item("two")] }] };
    assert.strictEqual(extractAdfText(doc), "one\ntwo");
  });
})
