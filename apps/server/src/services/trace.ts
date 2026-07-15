/**
 * Trace summary (#207). `trace.span` events are ingested (e.g. from OTLP GenAI
 * traces) but weren't analyzed anywhere — this rolls the spans of a
 * session/ticket into a compact summary the UI can render: how many spans, how
 * many errored, total span time, and the slowest spans. Pure function (no I/O)
 * so it's unit-testable and reusable across session/ticket surfaces.
 */

import type { RollupEvent } from "./rollup.js";

export interface TraceSpan {
  name: string;
  startTime: string | null;
  durationMs: number | null;
  status: string;
  traceId: string | null;
  spanId: string | null;
}

export interface TraceSummary {
  spanCount: number;
  errorCount: number;
  /** Distinct trace ids represented in these spans. */
  traceCount: number;
  /** Sum of span durations in ms (spans without an end time contribute 0). */
  totalSpanMs: number;
  /** Spans, slowest first, capped to keep the payload small. */
  spans: TraceSpan[];
}

/** trace.span events carry ids alongside the rollup payload. */
export interface TraceEvent extends RollupEvent {
  traceId?: string | null;
  spanId?: string | null;
}

const MAX_SPANS = 50;

function durationMs(start: unknown, end: unknown): number | null {
  if (typeof start !== "string" || typeof end !== "string") return null;
  const s = Date.parse(start);
  const e = Date.parse(end);
  if (!Number.isFinite(s) || !Number.isFinite(e)) return null;
  return Math.max(0, e - s);
}

export function computeTraceSummary(events: TraceEvent[]): TraceSummary {
  const spans: TraceSpan[] = [];
  const traceIds = new Set<string>();
  let errorCount = 0;
  let totalSpanMs = 0;

  for (const event of events) {
    if (event.eventType !== "trace.span") continue;
    const payload = (event.payload ?? {}) as Record<string, unknown>;
    const status = typeof payload.status === "string" ? payload.status : "unset";
    const dur = durationMs(payload.startTime, payload.endTime);
    if (status === "error") errorCount++;
    if (dur !== null) totalSpanMs += dur;
    if (event.traceId) traceIds.add(event.traceId);
    spans.push({
      name: typeof payload.name === "string" ? payload.name : "span",
      startTime: typeof payload.startTime === "string" ? payload.startTime : null,
      durationMs: dur,
      status,
      traceId: event.traceId ?? null,
      spanId: event.spanId ?? null,
    });
  }

  // Slowest first (nulls last), capped.
  spans.sort((a, b) => (b.durationMs ?? -1) - (a.durationMs ?? -1));

  return {
    spanCount: spans.length,
    errorCount,
    traceCount: traceIds.size,
    totalSpanMs,
    spans: spans.slice(0, MAX_SPANS),
  };
}
