import { describe, it } from "node:test";
import assert from "node:assert";
import { redactPii, redactEventPayload } from "./redact.js";

describe("redactPii", () => {
  it("masks emails", () => {
    assert.equal(redactPii("contact jane.doe+test@example.co.uk please"), "contact [redacted-email] please");
  });
  it("masks SSNs and credit-card numbers", () => {
    assert.equal(redactPii("ssn 123-45-6789"), "ssn [redacted-ssn]");
    assert.equal(redactPii("card 4111 1111 1111 1111"), "card [redacted-cc]");
    assert.equal(redactPii("card 4111-1111-1111-1111"), "card [redacted-cc]");
  });
  it("masks common secret keys", () => {
    assert.equal(redactPii("key sk-abcdefghijklmnop1234"), "key [redacted-key]");
    assert.equal(redactPii("token ghp_abcdefghijklmnopqrstuvwxyz0123"), "token [redacted-key]");
    assert.equal(redactPii("aws AKIAIOSFODNN7EXAMPLE"), "aws [redacted-key]");
  });
  it("leaves ordinary text untouched", () => {
    const s = "Refactor the auth module and add tests for the login flow.";
    assert.equal(redactPii(s), s);
  });
});

describe("redactEventPayload", () => {
  it("redacts promptText, responseText, and nested message content", () => {
    const out = redactEventPayload({
      provider: "openai",
      model: "gpt-4o",
      promptText: "email me at a@b.com",
      responseText: "your key is sk-abcdefghijklmnop1234",
      messages: [{ role: "user", content: "ssn 123-45-6789" }],
    }) as Record<string, unknown>;
    assert.equal(out.promptText, "email me at [redacted-email]");
    assert.equal(out.responseText, "your key is [redacted-key]");
    assert.deepEqual(out.messages, [{ role: "user", content: "ssn [redacted-ssn]" }]);
    // Structured fields untouched.
    assert.equal(out.provider, "openai");
    assert.equal(out.model, "gpt-4o");
  });
  it("returns non-object payloads unchanged", () => {
    assert.equal(redactEventPayload(null), null);
    assert.equal(redactEventPayload("x"), "x");
  });
});
