/**
 * Provider-format knowledge for the proxy. Burnwise sits in front of more than
 * one LLM API, so it has to speak both wire formats:
 *
 *   - OpenAI-compatible: POST /v1/chat/completions, `Authorization: Bearer …`,
 *     usage `{prompt_tokens, completion_tokens, total_tokens}`, text in
 *     `choices[].message.content` (or SSE `choices[].delta.content`).
 *   - Anthropic Messages: POST /v1/messages, `x-api-key` + `anthropic-version`,
 *     usage `{input_tokens, output_tokens}`, text in `content[].text` (or SSE
 *     `content_block_delta`/`message_delta`).
 *
 * This module keeps that per-format parsing in one place so `events.ts` stays
 * provider-neutral. It handles both plain-JSON and streamed (SSE) responses,
 * since Claude Code and most agents stream by default (#139/#140).
 */

export type Provider = "openai" | "anthropic";

export interface DetectInput {
  path: string;
  headers: Record<string, string | string[] | undefined>;
  body: unknown;
}

/**
 * Best-effort provider detection so a single proxy can front both APIs. Order,
 * most reliable first: request path → model-name prefix → auth header shape.
 * Falls back to the configured default when nothing matches (e.g. a bare
 * single-provider deployment). The return type is a plain string because the
 * fallback may be an operator-supplied value we don't otherwise model.
 */
export function detectProvider(input: DetectInput, fallback: string): string {
  const path = input.path.toLowerCase();
  if (path.includes("/messages")) return "anthropic";
  if (path.includes("/chat/completions") || path.includes("/completions") || path.includes("/responses")) {
    return "openai";
  }

  const model = typeof (input.body as Record<string, unknown>)?.model === "string"
    ? ((input.body as Record<string, unknown>).model as string).toLowerCase()
    : "";
  if (model.startsWith("claude")) return "anthropic";
  if (/^(gpt|o1|o3|o4|text-|davinci|chatgpt)/.test(model)) return "openai";

  const lower: Record<string, string | string[] | undefined> = {};
  for (const [k, v] of Object.entries(input.headers)) lower[k.toLowerCase()] = v;
  if (lower["x-api-key"] !== undefined && lower["authorization"] === undefined) return "anthropic";
  if (lower["authorization"] !== undefined) return "openai";

  return fallback;
}

export interface ParsedResponse {
  model?: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  responseText?: string;
}

export interface ParsedRequest {
  model?: string;
  messages?: Array<Record<string, unknown>>;
  promptText?: string;
}

/** Parse an upstream response body (JSON or SSE) into normalized usage/text. */
export function parseResponse(provider: string, rawBody: string): ParsedResponse {
  if (looksLikeSse(rawBody)) {
    const chunks = parseSseChunks(rawBody);
    return provider === "anthropic" ? parseAnthropicSse(chunks) : parseOpenAiSse(chunks);
  }
  const json = safeJson(rawBody);
  return provider === "anthropic" ? parseAnthropicJson(json) : parseOpenAiJson(json);
}

/** Pull model/messages/prompt text out of a request body for the request event. */
export function extractRequest(provider: string, requestBody: unknown): ParsedRequest {
  const body = (requestBody ?? {}) as Record<string, unknown>;
  const model = typeof body.model === "string" ? body.model : undefined;
  const messages = Array.isArray(body.messages)
    ? (body.messages as Array<Record<string, unknown>>)
    : undefined;

  const parts: string[] = [];
  if (provider === "anthropic") {
    // Anthropic carries the system prompt at the top level, not in messages.
    parts.push(flattenContent(body.system));
  }
  for (const m of messages ?? []) parts.push(flattenContent(m.content));
  const promptText = parts.filter(Boolean).join("\n") || undefined;

  return { model, messages, promptText };
}

// --- OpenAI --------------------------------------------------------------

function parseOpenAiJson(json: Record<string, unknown> | null): ParsedResponse {
  const usage = (json?.usage as Record<string, number>) ?? {};
  const promptTokens = usage.prompt_tokens ?? 0;
  const completionTokens = usage.completion_tokens ?? 0;
  const choices = json?.choices as Array<Record<string, unknown>> | undefined;
  const first = choices?.[0];
  const responseText =
    (first?.message as Record<string, unknown>)?.content as string | undefined ??
    (first?.text as string | undefined);
  return {
    model: json?.model as string | undefined,
    promptTokens,
    completionTokens,
    totalTokens: usage.total_tokens ?? promptTokens + completionTokens,
    responseText: responseText || undefined,
  };
}

function parseOpenAiSse(chunks: Record<string, unknown>[]): ParsedResponse {
  let model: string | undefined;
  let text = "";
  const usage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
  for (const chunk of chunks) {
    if (!model && typeof chunk.model === "string") model = chunk.model;
    const choices = chunk.choices as Array<Record<string, unknown>> | undefined;
    const delta = choices?.[0]?.delta as Record<string, unknown> | undefined;
    if (typeof delta?.content === "string") text += delta.content;
    // Present only when the client sets stream_options.include_usage.
    const u = chunk.usage as Record<string, number> | undefined;
    if (u) {
      usage.prompt_tokens = u.prompt_tokens ?? usage.prompt_tokens;
      usage.completion_tokens = u.completion_tokens ?? usage.completion_tokens;
      usage.total_tokens = u.total_tokens ?? usage.total_tokens;
    }
  }
  return {
    model,
    promptTokens: usage.prompt_tokens,
    completionTokens: usage.completion_tokens,
    totalTokens: usage.total_tokens || usage.prompt_tokens + usage.completion_tokens,
    responseText: text || undefined,
  };
}

// --- Anthropic -----------------------------------------------------------

function parseAnthropicJson(json: Record<string, unknown> | null): ParsedResponse {
  const usage = (json?.usage as Record<string, number>) ?? {};
  const promptTokens = anthropicInputTokens(usage);
  const completionTokens = usage.output_tokens ?? 0;
  const content = json?.content as Array<Record<string, unknown>> | undefined;
  const responseText = flattenAnthropicContent(content);
  return {
    model: json?.model as string | undefined,
    promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens,
    responseText: responseText || undefined,
  };
}

function parseAnthropicSse(chunks: Record<string, unknown>[]): ParsedResponse {
  let model: string | undefined;
  let promptTokens = 0;
  let completionTokens = 0;
  let text = "";
  for (const chunk of chunks) {
    const type = chunk.type as string | undefined;
    if (type === "message_start") {
      const message = chunk.message as Record<string, unknown> | undefined;
      if (typeof message?.model === "string") model = message.model;
      promptTokens = anthropicInputTokens((message?.usage as Record<string, number>) ?? {});
    } else if (type === "content_block_delta") {
      const delta = chunk.delta as Record<string, unknown> | undefined;
      if (delta?.type === "text_delta" && typeof delta.text === "string") text += delta.text;
    } else if (type === "message_delta") {
      // Final output_tokens land here (cumulative for the whole message).
      const u = chunk.usage as Record<string, number> | undefined;
      if (typeof u?.output_tokens === "number") completionTokens = u.output_tokens;
    }
  }
  return {
    model,
    promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens,
    responseText: text || undefined,
  };
}

/**
 * Anthropic reports uncached input separately from cache reads/writes. Sum them
 * so token totals (and cost) reflect everything the request actually consumed.
 */
function anthropicInputTokens(usage: Record<string, number>): number {
  return (
    (usage.input_tokens ?? 0) +
    (usage.cache_read_input_tokens ?? 0) +
    (usage.cache_creation_input_tokens ?? 0)
  );
}

function flattenAnthropicContent(content: Array<Record<string, unknown>> | undefined): string {
  if (!content) return "";
  return content
    .filter((block) => block.type === "text" && typeof block.text === "string")
    .map((block) => block.text as string)
    .join("");
}

// --- Shared helpers ------------------------------------------------------

function looksLikeSse(raw: string): boolean {
  const trimmed = raw.trimStart();
  return trimmed.startsWith("data:") || trimmed.startsWith("event:") || raw.includes("\ndata:");
}

/** Collect the JSON objects carried on `data:` lines of an SSE stream. */
function parseSseChunks(raw: string): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (const line of raw.split(/\r?\n/)) {
    if (!line.startsWith("data:")) continue;
    const data = line.slice("data:".length).trim();
    if (!data || data === "[DONE]") continue;
    const parsed = safeJson(data);
    if (parsed) out.push(parsed);
  }
  return out;
}

/** Coerce a message `content` (string, or array of blocks) into plain text. */
function flattenContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        const p = part as Record<string, unknown>;
        return (typeof p?.text === "string" ? p.text : "") || "";
      })
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

function safeJson(text: string): Record<string, unknown> | null {
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return null;
  }
}
