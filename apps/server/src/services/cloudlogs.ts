/**
 * Cloud-log ingestion for LLMs that can't be proxied (#142).
 *
 * Claude Code on AWS Bedrock or GCP Vertex AI sends requests straight to the
 * cloud provider, so the Burnwise proxy never sees them. Both clouds, however,
 * log every model invocation — with token counts — to their native log systems:
 *
 *   - AWS Bedrock model-invocation logging (CloudWatch/S3): one JSON record per
 *     call with `modelId` and `input.inputTokenCount` / `output.outputTokenCount`.
 *   - GCP Vertex AI request/response logging (Cloud Logging LogEntry): the model
 *     is in `resource.labels.model_id`, usage in the payload's `usageMetadata`
 *     (Gemini) or `usage` (Claude on Vertex).
 *
 * Teams forward those logs here (a Cloud Logging sink, a CloudWatch subscription
 * filter, a scheduled export, etc.) and this mapper turns each entry into an
 * `llm.response` event so cloud-hosted usage flows into the same by-provider /
 * by-tool / cost analytics as proxied traffic. Cost is left unset and backfilled
 * from the provider-aware price table by the shared ingest path (#197).
 *
 * Pure mapper: no Prisma, no I/O. Identity (workspace/user/project) is resolved
 * by the caller from the API key and passed in, so the mapping is unit-testable.
 */

import type { Event } from "@burnwise/schema";

export interface CloudIdentity {
  workspaceId: string;
  userId: string;
  projectId: string;
}

/** A single raw cloud log record. Shape varies by provider; read defensively. */
export type CloudLogEntry = Record<string, unknown>;

export interface CloudLogsPayload {
  entries?: CloudLogEntry[];
}

// User-controlled keys (labels/metadata) are never used as dynamic object keys
// here, so there's no prototype-pollution sink; but guard the ticket/session
// lookups against inherited props anyway.
const TICKET_KEYS = ["burnwise.ticket", "burnwise.ticket_id", "burnwise_ticket", "ticket"];
const SESSION_KEYS = ["burnwise.session_id", "burnwise.session", "burnwise_session", "session_id", "session"];

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

/** Safe nested get by dot path (own-properties only). */
function getPath(obj: unknown, path: string): unknown {
  let cur: unknown = obj;
  for (const key of path.split(".")) {
    if (!isRecord(cur) || !Object.prototype.hasOwnProperty.call(cur, key)) return undefined;
    cur = cur[key];
  }
  return cur;
}

function firstNumber(...vals: unknown[]): number {
  for (const v of vals) {
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  }
  return 0;
}

function firstString(...vals: unknown[]): string | undefined {
  for (const v of vals) {
    if (typeof v === "string" && v.trim() !== "") return v;
  }
  return undefined;
}

/** Pull a ticket/session ref out of any of the candidate label maps. */
function pickLabel(keys: string[], ...maps: unknown[]): string | undefined {
  for (const map of maps) {
    if (!isRecord(map)) continue;
    for (const key of keys) {
      if (Object.prototype.hasOwnProperty.call(map, key)) {
        const val = map[key];
        if (typeof val === "string" && val.trim() !== "") return val;
      }
    }
  }
  return undefined;
}

function toIso(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

interface Mapped {
  provider: string;
  model?: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  timestamp: string | null;
  ticketId?: string;
  sessionId?: string;
  metadata: Record<string, unknown>;
}

/** AWS Bedrock model-invocation log record → normalized usage. */
function mapBedrock(entry: CloudLogEntry): Mapped {
  const input = entry.input as Record<string, unknown> | undefined;
  const output = entry.output as Record<string, unknown> | undefined;
  const promptTokens = firstNumber(input?.inputTokenCount, getPath(entry, "usage.inputTokens"));
  const completionTokens = firstNumber(output?.outputTokenCount, getPath(entry, "usage.outputTokens"));
  // Bedrock's optional InvokeModel requestMetadata is echoed into the log.
  const requestMetadata = entry.requestMetadata;
  return {
    provider: "bedrock",
    model: firstString(entry.modelId),
    promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens,
    timestamp: toIso(entry.timestamp),
    ticketId: pickLabel(TICKET_KEYS, requestMetadata),
    sessionId: pickLabel(SESSION_KEYS, requestMetadata),
    metadata: {
      cloudSource: "bedrock",
      modelId: entry.modelId,
      region: entry.region,
      requestId: entry.requestId,
      operation: entry.operation,
    },
  };
}

/** GCP Vertex AI Cloud Logging LogEntry → normalized usage. */
function mapVertex(entry: CloudLogEntry): Mapped {
  const payload = (entry.jsonPayload ?? entry.protoPayload) as Record<string, unknown> | undefined;
  const resourceLabels = getPath(entry, "resource.labels");
  const model = firstString(
    getPath(resourceLabels, "model_id"),
    payload?.model,
    getPath(payload, "request.model"),
    getPath(payload, "response.model")
  );

  // Gemini reports usageMetadata; Claude-on-Vertex reports Anthropic-style usage.
  const promptTokens = firstNumber(
    getPath(payload, "usageMetadata.promptTokenCount"),
    getPath(payload, "usage.input_tokens"),
    getPath(payload, "response.usageMetadata.promptTokenCount"),
    getPath(payload, "response.usage.input_tokens")
  );
  const completionTokens = firstNumber(
    getPath(payload, "usageMetadata.candidatesTokenCount"),
    getPath(payload, "usage.output_tokens"),
    getPath(payload, "response.usageMetadata.candidatesTokenCount"),
    getPath(payload, "response.usage.output_tokens")
  );
  const totalTokens =
    firstNumber(getPath(payload, "usageMetadata.totalTokenCount"), getPath(payload, "response.usageMetadata.totalTokenCount")) ||
    promptTokens + completionTokens;

  return {
    provider: "vertex",
    model,
    promptTokens,
    completionTokens,
    totalTokens,
    timestamp: toIso(entry.timestamp ?? entry.receiveTimestamp),
    ticketId: pickLabel(TICKET_KEYS, entry.labels, resourceLabels, payload?.labels),
    sessionId: pickLabel(SESSION_KEYS, entry.labels, resourceLabels, payload?.labels),
    metadata: {
      cloudSource: "vertex",
      resourceType: getPath(entry, "resource.type"),
      logName: entry.logName,
      location: getPath(resourceLabels, "location"),
    },
  };
}

/**
 * A pre-normalized entry: `{ provider, model, promptTokens, completionTokens }`.
 * Lets a custom exporter (Lambda/Cloud Function) send clean records without us
 * having to know its log shape.
 */
function mapNormalized(entry: CloudLogEntry): Mapped {
  const promptTokens = firstNumber(entry.promptTokens, entry.inputTokens);
  const completionTokens = firstNumber(entry.completionTokens, entry.outputTokens);
  return {
    provider: firstString(entry.provider) ?? "unknown",
    model: firstString(entry.model),
    promptTokens,
    completionTokens,
    totalTokens: firstNumber(entry.totalTokens) || promptTokens + completionTokens,
    timestamp: toIso(entry.timestamp),
    ticketId: pickLabel(TICKET_KEYS, entry, entry.labels),
    sessionId: pickLabel(SESSION_KEYS, entry, entry.labels),
    metadata: { cloudSource: firstString(entry.provider) ?? "cloud" },
  };
}

/**
 * Detect which cloud a raw entry came from. Bedrock records carry `modelId`
 * with `input`/`output`; Vertex records are Cloud Logging entries (`resource`,
 * `logName`, or a JSON/proto payload); a `provider` field marks a pre-normalized
 * entry. Returns null for anything we can't recognize.
 */
export function detectCloudSource(entry: CloudLogEntry): "bedrock" | "vertex" | "normalized" | null {
  if (!isRecord(entry)) return null;
  if (typeof entry.provider === "string" && (entry.promptTokens !== undefined || entry.completionTokens !== undefined || entry.model !== undefined)) {
    return "normalized";
  }
  if (typeof entry.modelId === "string" && (isRecord(entry.input) || isRecord(entry.output))) {
    return "bedrock";
  }
  if (entry.resource !== undefined || entry.logName !== undefined || entry.jsonPayload !== undefined || entry.protoPayload !== undefined) {
    return "vertex";
  }
  return null;
}

/**
 * Map a batch of raw cloud log entries to Burnwise `llm.response` events. Entries
 * that can't be recognized, or that carry no usable token counts, are skipped
 * (counted) rather than rejected, so a mixed log export still ingests cleanly.
 * `newId` is injected so the mapper stays pure/deterministic in tests.
 */
export function mapCloudLogsToEvents(
  payload: CloudLogsPayload,
  identity: CloudIdentity,
  newId: () => string
): { events: Event[]; skipped: number } {
  const events: Event[] = [];
  let skipped = 0;

  for (const entry of payload.entries ?? []) {
    const source = detectCloudSource(entry);
    if (!source) {
      skipped++;
      continue;
    }
    const mapped =
      source === "bedrock" ? mapBedrock(entry) : source === "vertex" ? mapVertex(entry) : mapNormalized(entry);

    // Require a model and some usage — an entry with neither isn't a billable call.
    if (!mapped.model || (mapped.promptTokens === 0 && mapped.completionTokens === 0)) {
      skipped++;
      continue;
    }

    events.push({
      eventId: newId(),
      eventType: "llm.response",
      timestamp: mapped.timestamp ?? new Date().toISOString(),
      source: "cloud",
      workspaceId: identity.workspaceId,
      projectId: identity.projectId,
      userId: identity.userId,
      ticketId: mapped.ticketId,
      sessionId: mapped.sessionId,
      metadata: mapped.metadata,
      payload: {
        provider: mapped.provider,
        model: mapped.model,
        promptTokens: mapped.promptTokens,
        completionTokens: mapped.completionTokens,
        totalTokens: mapped.totalTokens,
      },
    } as Event);
  }

  return { events, skipped };
}
