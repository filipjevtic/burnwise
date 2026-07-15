/**
 * OpenTelemetry (OTLP/HTTP JSON) trace ingestion (#207).
 *
 * Maps OTLP trace spans onto Burnwise's event model instead of inventing a
 * trace protocol — almost every agent/LLM tool can emit OTel, so this makes
 * Burnwise a universal, vendor-neutral sink. Spans that carry GenAI semantic-
 * convention attributes (`gen_ai.*`) become `llm.response` events (so they flow
 * into the by-tool/by-provider/cost analytics); everything else becomes a
 * `trace.span` event. Burnwise's differentiator is the attribution layer on top
 * (trace -> ticket -> sprint -> developer), applied by the shared ingest path.
 *
 * This module is a pure mapper (no Prisma, no I/O) so the mapping is fully
 * unit-testable; identity (workspace/user/project) is resolved by the caller
 * from the API key and passed in.
 */

import type { Event } from "@burnwise/schema";

/** Minimal OTLP/JSON shapes we read (a subset of the full proto-JSON spec). */
interface OtlpAnyValue {
  stringValue?: string;
  intValue?: string | number;
  doubleValue?: number;
  boolValue?: boolean;
  arrayValue?: { values?: OtlpAnyValue[] };
  kvlistValue?: { values?: OtlpKeyValue[] };
}
interface OtlpKeyValue {
  key: string;
  value?: OtlpAnyValue;
}
interface OtlpSpan {
  traceId?: string;
  spanId?: string;
  parentSpanId?: string;
  name?: string;
  startTimeUnixNano?: string | number;
  endTimeUnixNano?: string | number;
  attributes?: OtlpKeyValue[];
  status?: { code?: number };
}
interface OtlpScopeSpans {
  scope?: { name?: string };
  spans?: OtlpSpan[];
}
interface OtlpResourceSpans {
  resource?: { attributes?: OtlpKeyValue[] };
  scopeSpans?: OtlpScopeSpans[];
}
export interface OtlpTracesPayload {
  resourceSpans?: OtlpResourceSpans[];
}

export interface OtelIdentity {
  workspaceId: string;
  userId: string;
  projectId: string;
}

/** Flatten an OTLP AnyValue into a plain JS value. */
function anyValue(v: OtlpAnyValue | undefined): unknown {
  if (!v) return undefined;
  if (v.stringValue !== undefined) return v.stringValue;
  if (v.intValue !== undefined) return typeof v.intValue === "string" ? Number(v.intValue) : v.intValue;
  if (v.doubleValue !== undefined) return v.doubleValue;
  if (v.boolValue !== undefined) return v.boolValue;
  if (v.arrayValue) return (v.arrayValue.values ?? []).map(anyValue);
  if (v.kvlistValue) return attributesToObject(v.kvlistValue.values);
  return undefined;
}

// Span attribute keys are attacker-controlled. Keys that could pollute the
// prototype chain are filtered out, and the object is built via
// Object.fromEntries (define-property semantics, not a dynamic bracket write),
// so there's no prototype-pollution sink.
const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/** Turn an OTLP key/value attribute list into a plain object. */
export function attributesToObject(attrs: OtlpKeyValue[] | undefined): Record<string, unknown> {
  return Object.fromEntries(
    (attrs ?? [])
      .filter((a): a is OtlpKeyValue => !!a && typeof a.key === "string" && !UNSAFE_KEYS.has(a.key))
      .map((a) => [a.key, anyValue(a.value)])
  );
}

/** OTLP unix-nano timestamp (string or number) -> ISO 8601, or null. */
export function nanoToIso(nano: string | number | undefined): string | null {
  if (nano === undefined || nano === null) return null;
  const n = typeof nano === "string" ? Number(nano) : nano;
  if (!Number.isFinite(n) || n <= 0) return null;
  return new Date(Math.round(n / 1e6)).toISOString();
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

/** A span is a GenAI/LLM span if it names a model via the gen_ai conventions. */
function genAiModel(attrs: Record<string, unknown>): string | undefined {
  return firstString(
    attrs["gen_ai.response.model"],
    attrs["gen_ai.request.model"],
    attrs["llm.model_name"], // OpenLLMetry/Traceloop legacy
    attrs["ai.model.id"] // Vercel AI SDK legacy
  );
}

/**
 * Map an OTLP/JSON traces payload to Burnwise events. `newId` supplies event ids
 * (injected so the mapper stays pure/deterministic in tests). Spans without a
 * usable start time are skipped.
 */
export function mapOtlpTracesToEvents(
  payload: OtlpTracesPayload,
  identity: OtelIdentity,
  newId: () => string
): { events: Event[]; skipped: number } {
  const events: Event[] = [];
  let skipped = 0;

  for (const rs of payload.resourceSpans ?? []) {
    const resourceAttrs = attributesToObject(rs.resource?.attributes);
    for (const ss of rs.scopeSpans ?? []) {
      const scopeName = ss.scope?.name;
      for (const span of ss.spans ?? []) {
        const startIso = nanoToIso(span.startTimeUnixNano);
        if (!startIso) {
          skipped++;
          continue;
        }
        const attrs = attributesToObject(span.attributes);
        const endIso = nanoToIso(span.endTimeUnixNano);
        const latencyMs =
          endIso && startIso ? Math.max(0, new Date(endIso).getTime() - new Date(startIso).getTime()) : undefined;

        // Explicit attribution hooks + git context, surfaced to the shared
        // association service via ticketId/sessionId/metadata.
        const ticketRef = firstString(attrs["burnwise.ticket"], attrs["burnwise.ticket_id"]);
        const sessionRef = firstString(
          attrs["burnwise.session_id"],
          attrs["session.id"],
          attrs["gen_ai.conversation.id"]
        );
        const metadata: Record<string, unknown> = {
          otelSpanName: span.name,
          otelScope: scopeName,
          serviceName: resourceAttrs["service.name"],
          attributes: attrs,
        };

        const base = {
          eventId: newId(),
          timestamp: startIso,
          source: "otel" as const,
          workspaceId: identity.workspaceId,
          projectId: identity.projectId,
          userId: identity.userId,
          ticketId: ticketRef,
          sessionId: sessionRef,
          traceId: firstString(span.traceId),
          spanId: firstString(span.spanId),
          parentSpanId: firstString(span.parentSpanId),
          metadata,
        };

        const model = genAiModel(attrs);
        if (model) {
          const promptTokens = firstNumber(
            attrs["gen_ai.usage.input_tokens"],
            attrs["gen_ai.usage.prompt_tokens"],
            attrs["llm.usage.prompt_tokens"]
          );
          const completionTokens = firstNumber(
            attrs["gen_ai.usage.output_tokens"],
            attrs["gen_ai.usage.completion_tokens"],
            attrs["llm.usage.completion_tokens"]
          );
          const totalTokens = firstNumber(attrs["gen_ai.usage.total_tokens"]) || promptTokens + completionTokens;
          const provider =
            firstString(attrs["gen_ai.provider.name"], attrs["gen_ai.system"], attrs["llm.vendor"]) || "unknown";
          const costUsd = firstNumber(attrs["gen_ai.usage.cost"], attrs["llm.usage.cost"]) || undefined;

          events.push({
            ...base,
            eventType: "llm.response",
            payload: {
              provider,
              model,
              promptTokens,
              completionTokens,
              totalTokens,
              ...(costUsd !== undefined ? { costUsd } : {}),
              ...(latencyMs !== undefined ? { latencyMs } : {}),
            },
          } as Event);
        } else {
          events.push({
            ...base,
            eventType: "trace.span",
            payload: {
              name: span.name || "span",
              startTime: startIso,
              ...(endIso ? { endTime: endIso } : {}),
              status: span.status?.code === 2 ? "error" : span.status?.code === 1 ? "ok" : "unset",
              attributes: attrs,
              events: [],
            },
          } as Event);
        }
      }
    }
  }

  return { events, skipped };
}
