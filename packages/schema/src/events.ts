import { z } from "zod";

export const baseEventSchema = z.object({
  eventId: z.string().uuid(),
  eventType: z.enum([
    "llm.request",
    "llm.response",
    "trace.span",
    "session.activity",
    "ci.run",
  ]),
  timestamp: z.string().datetime(),
  source: z.enum(["proxy", "ide-plugin", "cli", "ci", "browser"]),
  workspaceId: z.string().min(1),
  projectId: z.string().min(1),
  userId: z.string().min(1),
  ticketId: z.string().optional(),
  sessionId: z.string().optional(),
  traceId: z.string().optional(),
  spanId: z.string().optional(),
  parentSpanId: z.string().optional(),
  metadata: z.record(z.unknown()).default({}),
});

export type BaseEvent = z.infer<typeof baseEventSchema>;

export const llmRequestPayloadSchema = z.object({
  provider: z.string().min(1),
  model: z.string().min(1),
  messages: z.array(z.record(z.unknown())).optional(),
  promptText: z.string().optional(),
});

export const llmResponsePayloadSchema = z.object({
  provider: z.string().min(1),
  model: z.string().min(1),
  promptTokens: z.number().int().min(0),
  completionTokens: z.number().int().min(0),
  totalTokens: z.number().int().min(0),
  costUsd: z.number().min(0).optional(),
  latencyMs: z.number().int().min(0).optional(),
  responseText: z.string().optional(),
  requestId: z.string().optional(),
});

export const traceSpanPayloadSchema = z.object({
  name: z.string().min(1),
  startTime: z.string().datetime(),
  endTime: z.string().datetime().optional(),
  status: z.enum(["ok", "error", "unset"]).default("unset"),
  attributes: z.record(z.unknown()).default({}),
  events: z
    .array(
      z.object({
        name: z.string(),
        timestamp: z.string().datetime(),
        attributes: z.record(z.unknown()).default({}),
      })
    )
    .default([]),
});

export const sessionActivityPayloadSchema = z.object({
  activityType: z.enum(["coding", "review", "planning", "debugging", "other"]),
  startTime: z.string().datetime(),
  endTime: z.string().datetime().optional(),
  durationSeconds: z.number().int().min(0).optional(),
  branch: z.string().optional(),
  commitSha: z.string().optional(),
});

export const ciRunPayloadSchema = z.object({
  pipelineName: z.string().min(1),
  runId: z.string().min(1),
  status: z.enum(["success", "failure", "cancelled", "running"]),
  durationSeconds: z.number().int().min(0).optional(),
  costUsd: z.number().min(0).optional(),
  triggerBranch: z.string().optional(),
  triggerCommitSha: z.string().optional(),
});

export const eventPayloadSchema = z.discriminatedUnion("eventType", [
  z.object({ eventType: z.literal("llm.request"), payload: llmRequestPayloadSchema }),
  z.object({ eventType: z.literal("llm.response"), payload: llmResponsePayloadSchema }),
  z.object({ eventType: z.literal("trace.span"), payload: traceSpanPayloadSchema }),
  z.object({ eventType: z.literal("session.activity"), payload: sessionActivityPayloadSchema }),
  z.object({ eventType: z.literal("ci.run"), payload: ciRunPayloadSchema }),
]);

export const eventSchema = baseEventSchema.and(eventPayloadSchema);

export type Event = z.infer<typeof eventSchema>;

export const ingestBatchSchema = z.object({
  events: z.array(eventSchema).min(1).max(1000),
});

export type IngestBatch = z.infer<typeof ingestBatchSchema>;

export const ingestResponseSchema = z.object({
  accepted: z.number().int().min(0),
  rejected: z.number().int().min(0),
  errors: z.array(
    z.object({
      index: z.number().int().min(0),
      message: z.string(),
    })
  ),
});

export type IngestResponse = z.infer<typeof ingestResponseSchema>;
