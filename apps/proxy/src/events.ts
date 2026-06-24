import { config } from "./config.js";
import type { Event } from "@burnwise/schema";
import { estimateCost } from "@burnwise/pricing";
import type { Attribution } from "./attribution.js";

// Re-exported so existing importers (and tests) keep a stable path.
export { estimateCost };

interface EmitLlmEventsInput {
  requestId: string;
  requestBody: unknown;
  responseBody: string;
  latencyMs: number;
  attribution?: Attribution;
}

export async function emitLlmEvents(input: EmitLlmEventsInput): Promise<void> {
  const now = new Date().toISOString();
  const requestBody = input.requestBody as Record<string, unknown>;
  const responseBody = parseJson(input.responseBody);

  const model = extractModel(requestBody, responseBody);
  const promptTokens = extractPromptTokens(responseBody);
  const completionTokens = extractCompletionTokens(responseBody);
  const totalTokens = extractTotalTokens(responseBody) || promptTokens + completionTokens;

  const attr = input.attribution;
  // Identity: prefer per-request attribution headers, fall back to env config.
  // When a personal key is supplied, the server re-derives user/workspace from
  // it, so these values act as defaults/placeholders.
  const userId = attr?.userId || config.userId;
  const projectId = attr?.projectId || config.projectId;
  const sharedMetadata: Record<string, unknown> = {
    proxyProvider: config.provider,
    ...(attr?.properties || {}),
  };

  const requestEvent: Event = {
    eventId: crypto.randomUUID(),
    eventType: "llm.request",
    timestamp: now,
    source: "proxy",
    workspaceId: config.workspaceId,
    projectId,
    userId,
    ticketId: attr?.ticketId,
    sessionId: attr?.sessionId,
    traceId: input.requestId,
    metadata: { ...sharedMetadata },
    payload: {
      provider: config.provider,
      model,
      messages: (requestBody.messages as Record<string, unknown>[]) || undefined,
      promptText: extractPromptText(requestBody),
    },
  };

  const responseEvent: Event = {
    eventId: crypto.randomUUID(),
    eventType: "llm.response",
    timestamp: now,
    source: "proxy",
    workspaceId: config.workspaceId,
    projectId,
    userId,
    ticketId: attr?.ticketId,
    sessionId: attr?.sessionId,
    traceId: input.requestId,
    metadata: { ...sharedMetadata, requestId: input.requestId },
    payload: {
      provider: config.provider,
      model,
      promptTokens,
      completionTokens,
      totalTokens,
      costUsd: estimateCost(config.provider, model, promptTokens, completionTokens),
      latencyMs: input.latencyMs,
      responseText: extractResponseText(responseBody),
      requestId: input.requestId,
    },
  };

  await fetch(`${config.serverUrl}/api/v1/events/ingest`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // Prefer the caller's personal key (server derives identity); fall back
      // to the shared ingest key for unattributed traffic.
      Authorization: `Bearer ${attr?.key || config.ingestApiKey}`,
    },
    body: JSON.stringify({ events: [requestEvent, responseEvent] }),
  });
}

function parseJson(text: string): Record<string, unknown> | null {
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function extractModel(requestBody: Record<string, unknown>, responseBody: Record<string, unknown> | null): string {
  return (responseBody?.model as string) || (requestBody.model as string) || "unknown";
}

function extractPromptTokens(responseBody: Record<string, unknown> | null): number {
  return (responseBody?.usage as Record<string, number>)?.prompt_tokens || 0;
}

function extractCompletionTokens(responseBody: Record<string, unknown> | null): number {
  return (responseBody?.usage as Record<string, number>)?.completion_tokens || 0;
}

function extractTotalTokens(responseBody: Record<string, unknown> | null): number {
  return (responseBody?.usage as Record<string, number>)?.total_tokens || 0;
}

function extractPromptText(requestBody: Record<string, unknown>): string | undefined {
  const messages = requestBody.messages as Array<Record<string, unknown>>;
  if (!messages) return undefined;
  return messages
    .map((m) => (m.content as string) || "")
    .filter(Boolean)
    .join("\n");
}

function extractResponseText(responseBody: Record<string, unknown> | null): string | undefined {
  if (!responseBody) return undefined;
  const choices = responseBody.choices as Array<Record<string, unknown>>;
  if (!choices || choices.length === 0) return undefined;
  const message = choices[0].message as Record<string, unknown>;
  return (message?.content as string) || (choices[0].text as string);
}

