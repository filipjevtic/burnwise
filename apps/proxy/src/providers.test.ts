import { describe, it } from "node:test";
import assert from "node:assert";
import { detectProvider, parseResponse, extractRequest } from "./providers.js";

describe("detectProvider", () => {
  const base = { headers: {}, body: {} };

  it("detects anthropic from the /v1/messages path", () => {
    assert.strictEqual(detectProvider({ ...base, path: "/v1/messages" }, "openai"), "anthropic");
  });

  it("detects openai from the /v1/chat/completions path", () => {
    assert.strictEqual(detectProvider({ ...base, path: "/v1/chat/completions" }, "anthropic"), "openai");
  });

  it("falls back to the model prefix when the path is ambiguous", () => {
    assert.strictEqual(
      detectProvider({ path: "/proxy", headers: {}, body: { model: "claude-opus-4-8" } }, "openai"),
      "anthropic"
    );
    assert.strictEqual(
      detectProvider({ path: "/proxy", headers: {}, body: { model: "gpt-4o" } }, "anthropic"),
      "openai"
    );
  });

  it("falls back to the auth header shape", () => {
    assert.strictEqual(
      detectProvider({ path: "/x", headers: { "x-api-key": "sk-ant" }, body: {} }, "openai"),
      "anthropic"
    );
    assert.strictEqual(
      detectProvider({ path: "/x", headers: { authorization: "Bearer sk" }, body: {} }, "anthropic"),
      "openai"
    );
  });

  it("uses the configured default when nothing matches", () => {
    assert.strictEqual(detectProvider({ path: "/x", headers: {}, body: {} }, "openai"), "openai");
  });
});

describe("parseResponse — OpenAI", () => {
  it("parses a non-streaming chat completion", () => {
    const body = JSON.stringify({
      model: "gpt-4o",
      usage: { prompt_tokens: 100, completion_tokens: 40, total_tokens: 140 },
      choices: [{ message: { content: "Hello there" } }],
    });
    const r = parseResponse("openai", body);
    assert.strictEqual(r.model, "gpt-4o");
    assert.strictEqual(r.promptTokens, 100);
    assert.strictEqual(r.completionTokens, 40);
    assert.strictEqual(r.totalTokens, 140);
    assert.strictEqual(r.responseText, "Hello there");
  });

  it("aggregates a streamed (SSE) chat completion with usage", () => {
    const sse = [
      `data: ${JSON.stringify({ model: "gpt-4o", choices: [{ delta: { content: "Hel" } }] })}`,
      `data: ${JSON.stringify({ choices: [{ delta: { content: "lo" } }] })}`,
      `data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 } })}`,
      "data: [DONE]",
    ].join("\n\n");
    const r = parseResponse("openai", sse);
    assert.strictEqual(r.model, "gpt-4o");
    assert.strictEqual(r.responseText, "Hello");
    assert.strictEqual(r.promptTokens, 10);
    assert.strictEqual(r.completionTokens, 2);
    assert.strictEqual(r.totalTokens, 12);
  });
});

describe("parseResponse — Anthropic", () => {
  it("parses a non-streaming messages response", () => {
    const body = JSON.stringify({
      model: "claude-opus-4-8",
      usage: { input_tokens: 200, output_tokens: 50 },
      content: [
        { type: "text", text: "Part one. " },
        { type: "text", text: "Part two." },
      ],
    });
    const r = parseResponse("anthropic", body);
    assert.strictEqual(r.model, "claude-opus-4-8");
    assert.strictEqual(r.promptTokens, 200);
    assert.strictEqual(r.completionTokens, 50);
    assert.strictEqual(r.totalTokens, 250);
    assert.strictEqual(r.responseText, "Part one. Part two.");
  });

  it("includes cache tokens in the prompt total", () => {
    const body = JSON.stringify({
      model: "claude-opus-4-8",
      usage: { input_tokens: 100, cache_read_input_tokens: 30, cache_creation_input_tokens: 20, output_tokens: 10 },
      content: [{ type: "text", text: "hi" }],
    });
    const r = parseResponse("anthropic", body);
    assert.strictEqual(r.promptTokens, 150);
    assert.strictEqual(r.completionTokens, 10);
    assert.strictEqual(r.totalTokens, 160);
  });

  it("aggregates a streamed (SSE) messages response", () => {
    const sse = [
      `event: message_start\ndata: ${JSON.stringify({ type: "message_start", message: { model: "claude-opus-4-8", usage: { input_tokens: 300 } } })}`,
      `event: content_block_delta\ndata: ${JSON.stringify({ type: "content_block_delta", delta: { type: "text_delta", text: "Str" } })}`,
      `event: content_block_delta\ndata: ${JSON.stringify({ type: "content_block_delta", delta: { type: "text_delta", text: "eamed" } })}`,
      `event: message_delta\ndata: ${JSON.stringify({ type: "message_delta", usage: { output_tokens: 25 } })}`,
      `event: message_stop\ndata: ${JSON.stringify({ type: "message_stop" })}`,
    ].join("\n\n");
    const r = parseResponse("anthropic", sse);
    assert.strictEqual(r.model, "claude-opus-4-8");
    assert.strictEqual(r.responseText, "Streamed");
    assert.strictEqual(r.promptTokens, 300);
    assert.strictEqual(r.completionTokens, 25);
    assert.strictEqual(r.totalTokens, 325);
  });
});

describe("extractRequest", () => {
  it("extracts openai messages and prompt text", () => {
    const r = extractRequest("openai", {
      model: "gpt-4o",
      messages: [
        { role: "system", content: "Be terse." },
        { role: "user", content: "Hi" },
      ],
    });
    assert.strictEqual(r.model, "gpt-4o");
    assert.strictEqual(r.messages?.length, 2);
    assert.strictEqual(r.promptText, "Be terse.\nHi");
  });

  it("includes the anthropic top-level system prompt and array content", () => {
    const r = extractRequest("anthropic", {
      model: "claude-opus-4-8",
      system: "You are helpful.",
      messages: [{ role: "user", content: [{ type: "text", text: "Question?" }] }],
    });
    assert.strictEqual(r.promptText, "You are helpful.\nQuestion?");
  });
});
