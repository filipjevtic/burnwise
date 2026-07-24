/**
 * Database-side event rollups (#176).
 *
 * Instead of `findMany`-ing every event (payload JSON included) and aggregating
 * in Node, these helpers push the aggregation into Postgres over the denormalized
 * metric columns (`totalTokens` / `costUsd` / `durationSeconds` / `provider`,
 * populated at ingest — see deriveEventMetrics). Result shapes match the in-JS
 * rollups in `rollup.ts` so callers and the frontend are unaffected; the JS
 * versions remain the spec (and are used for already-bounded, per-session sets).
 */

import type { PrismaClient, Prisma } from "../generated/prisma/client.js";
import type { Rollup } from "./rollup.js";
import type { Bucket, TrendPoint } from "./trends.js";

type EventWhere = Prisma.EventWhereInput;

/**
 * Group events matching `where` by a scalar column, summing the metrics. Rows
 * with a null group value are skipped unless `nullKey` is given, in which case
 * they are bucketed under it (mirroring the JS rollups' "unknown" fallback).
 */
export async function dbRollupByField(
  prisma: PrismaClient,
  where: EventWhere,
  field: "provider" | "source" | "userId" | "ticketId" | "projectId" | "sessionId",
  nullKey?: string
): Promise<Map<string, Rollup>> {
  const grouped = await prisma.event.groupBy({
    by: [field],
    where,
    _sum: { totalTokens: true, costUsd: true, durationSeconds: true },
    _count: { _all: true },
  });

  const out = new Map<string, Rollup>();
  for (const row of grouped) {
    const raw = (row as Record<string, unknown>)[field];
    const key = raw == null ? nullKey : String(raw);
    if (key == null) continue;
    // Multiple raw values can map to the same key (e.g. null -> "unknown"); merge.
    const existing = out.get(key) ?? { tokens: 0, cost: 0, durationSeconds: 0, eventCount: 0 };
    out.set(key, {
      tokens: existing.tokens + (row._sum.totalTokens ?? 0),
      cost: existing.cost + (row._sum.costUsd ?? 0),
      durationSeconds: existing.durationSeconds + (row._sum.durationSeconds ?? 0),
      eventCount: existing.eventCount + row._count._all,
    });
  }
  return out;
}

/**
 * Count distinct values of `distinctField` per `groupField` (e.g. sessions per
 * source, tickets per developer) without loading rows — a two-column groupBy
 * returns the distinct pairs and we tally per group.
 */
export async function dbDistinctCountByField(
  prisma: PrismaClient,
  where: EventWhere,
  groupField: "source" | "userId",
  distinctField: "sessionId" | "ticketId"
): Promise<Map<string, number>> {
  const grouped = await prisma.event.groupBy({
    by: [groupField, distinctField],
    where: { ...where, [distinctField]: { not: null } },
  });

  const counts = new Map<string, number>();
  for (const row of grouped) {
    const key = (row as Record<string, unknown>)[groupField];
    if (key == null) continue;
    counts.set(String(key), (counts.get(String(key)) ?? 0) + 1);
  }
  return counts;
}

/**
 * Time-bucketed usage trends aggregated in Postgres via `date_trunc`. `day` and
 * `week` match the JS `periodKey` (Postgres `date_trunc('week', …)` starts on
 * Monday, like the ISO-week bucketing). Sums/counts are cast to float/int so no
 * BigInt reaches JSON. `ticketIds` (when a sprint filter is active) is resolved
 * by the caller, since the relation filter can't cross into raw SQL.
 */
export async function dbTrends(
  prisma: PrismaClient,
  projectId: string,
  ticketIds: string[] | null,
  bucket: Bucket
): Promise<TrendPoint[]> {
  // bucket is a validated enum ("day" | "week"); values are bound parameters.
  const params: unknown[] = [projectId, bucket];
  let sql =
    `SELECT to_char(date_trunc($2, "timestamp"), 'YYYY-MM-DD') AS period,` +
    ` COALESCE(SUM("totalTokens"), 0)::float AS tokens,` +
    ` COALESCE(SUM("costUsd"), 0)::float AS cost,` +
    ` COALESCE(SUM("durationSeconds"), 0)::float AS "durationSeconds",` +
    ` COUNT(*)::int AS "eventCount"` +
    ` FROM "Event" WHERE "projectId" = $1`;
  if (ticketIds) {
    sql += ` AND "ticketId" = ANY($3)`;
    params.push(ticketIds);
  }
  sql += ` GROUP BY 1 ORDER BY 1 ASC`;

  const rows = await prisma.$queryRawUnsafe<TrendPoint[]>(sql, ...params);
  return rows;
}
