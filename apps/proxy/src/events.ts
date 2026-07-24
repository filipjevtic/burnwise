import { config } from "./config.js";
import type { Event } from "@burnwise/schema";
import { estimateCost } from "@burnwise/pricing";
import type { Attribution } from "./attribution.js";
import { parseResponse, extractRequest } from "./providers.js";

// Re-exported so existing importers (and tests) keep a stable path.
export { estimateCost };

interface EmitLlmEventsInput {
  requestId: string;
  /** Provider detected for this request (anthropic / openai / …). */
  provider: string;
  requestBody: unknown;
  responseBody: string;
  latencyMs: number;
  attribution?: Attribution;
}

export async function emitLlmEvents(input: EmitLlmEventsInput): Promise<void> {
  const now = new Date().toISOString();
  const provider = input.provider;

  const request = extractRequest(provider, input.requestBody);
  const response = parseResponse(provider, input.responseBody);

  // The response echoes the resolved model; fall back to the requested one.
  const model = response.model || request.model || "unknown";
  const promptTokens = response.promptTokens;
  const completionTokens = response.completionTokens;
  const totalTokens = response.totalTokens || promptTokens + completionTokens;

  const attr = input.attribution;
  // Identity: prefer per-request attribution headers, fall back to env config.
  // When a personal key is supplied, the server re-derives user/workspace from
  // it, so these values act as defaults/placeholders.
  const userId = attr?.userId || config.userId;
  const projectId = attr?.projectId || config.projectId;
  const sharedMetadata: Record<string, unknown> = {
    proxyProvider: provider,
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
      provider,
      model,
      messages: request.messages,
      promptText: request.promptText,
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
      provider,
      model,
      promptTokens,
      completionTokens,
      totalTokens,
      costUsd: estimateCost(provider, model, promptTokens, completionTokens),
      latencyMs: input.latencyMs,
      responseText: response.responseText,
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
