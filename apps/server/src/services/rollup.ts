/**
 * Shared event-rollup math. Tokens/cost/duration are derived from event
 * payloads in exactly one place so ticket, sprint, session, and developer
 * summaries stay consistent.
 */

export interface RollupEvent {
  eventType: string;
  payload: unknown;
}

export interface Rollup {
  tokens: number;
  cost: number;
  durationSeconds: number;
  eventCount: number;
}

export function emptyRollup(): Rollup {
  return { tokens: 0, cost: 0, durationSeconds: 0, eventCount: 0 };
}

/** Aggregate a list of events into a single rollup. */
export function rollupEvents(events: RollupEvent[]): Rollup {
  const acc = emptyRollup();
  for (const event of events) {
    accumulate(acc, event);
  }
  return acc;
}

/** Group events by a key and roll up each group. */
export function rollupBy<T extends RollupEvent>(
  events: T[],
  keyFn: (event: T) => string | null | undefined
): Map<string, Rollup> {
  const groups = new Map<string, Rollup>();
  for (const event of events) {
    const key = keyFn(event);
    if (key == null) continue;
    let group = groups.get(key);
    if (!group) {
      group = emptyRollup();
      groups.set(key, group);
    }
    accumulate(group, event);
  }
  return groups;
}

export interface DeveloperEvent extends RollupEvent {
  userId: string;
  sessionId?: string | null;
  ticketId?: string | null;
}

export interface DeveloperRollup extends Rollup {
  userId: string;
  sessionCount: number;
  ticketCount: number;
}

/**
 * Aggregate events per developer, including distinct session/ticket counts,
 * sorted by token usage descending.
 */
export function aggregateByDeveloper(events: DeveloperEvent[]): DeveloperRollup[] {
  const rollups = new Map<string, Rollup>();
  const sessions = new Map<string, Set<string>>();
  const tickets = new Map<string, Set<string>>();

  for (const event of events) {
    const userId = event.userId;
    let rollup = rollups.get(userId);
    if (!rollup) {
      rollup = emptyRollup();
      rollups.set(userId, rollup);
      sessions.set(userId, new Set());
      tickets.set(userId, new Set());
    }
    accumulate(rollup, event);
    if (event.sessionId) sessions.get(userId)!.add(event.sessionId);
    if (event.ticketId) tickets.get(userId)!.add(event.ticketId);
  }

  return [...rollups.entries()]
    .map(([userId, rollup]) => ({
      userId,
      ...rollup,
      sessionCount: sessions.get(userId)!.size,
      ticketCount: tickets.get(userId)!.size,
    }))
    .sort((a, b) => b.tokens - a.tokens);
}

export interface SourceEvent extends RollupEvent {
  source?: string | null;
  sessionId?: string | null;
}

export interface SourceRollup extends Rollup {
  source: string;
  sessionCount: number;
}

/**
 * Aggregate events per collection source (proxy / cli / ide-plugin / ci /
 * browser), with distinct session counts, sorted by tokens descending. This is
 * the cross-tool breakdown: which AI tools/collectors drove how much effort.
 * Events with no source are bucketed under "unknown".
 */
export function aggregateBySource(events: SourceEvent[]): SourceRollup[] {
  const rollups = new Map<string, Rollup>();
  const sessions = new Map<string, Set<string>>();

  for (const event of events) {
    const source = event.source || "unknown";
    let rollup = rollups.get(source);
    if (!rollup) {
      rollup = emptyRollup();
      rollups.set(source, rollup);
      sessions.set(source, new Set());
    }
    accumulate(rollup, event);
    if (event.sessionId) sessions.get(source)!.add(event.sessionId);
  }

  return [...rollups.entries()]
    .map(([source, rollup]) => ({
      source,
      ...rollup,
      sessionCount: sessions.get(source)!.size,
    }))
    .sort((a, b) => b.tokens - a.tokens);
}

function accumulate(acc: Rollup, event: RollupEvent): void {
  const payload = (event.payload ?? {}) as Record<string, unknown>;
  if (event.eventType === "llm.response") {
    acc.tokens += num(payload.totalTokens);
    acc.cost += num(payload.costUsd);
  } else if (event.eventType === "session.activity") {
    acc.durationSeconds += num(payload.durationSeconds);
  } else if (event.eventType === "ci.run") {
    acc.cost += num(payload.costUsd);
  }
  acc.eventCount += 1;
}

function num(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
