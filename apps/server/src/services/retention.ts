/**
 * Configurable event retention (#27). Operators can enforce a rolling window by
 * setting EVENT_RETENTION_DAYS; a daily in-process sweep deletes raw events
 * older than the cutoff. Off by default (0 = keep forever).
 *
 * ponytail: single-node in-process sweep with one deleteMany. Fine for typical
 * self-hosted volumes; for very large tables run the purge as an external cron /
 * batched delete instead so a big sweep doesn't hold a long transaction.
 */

import type { PrismaClient } from "../generated/prisma/client.js";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** The timestamp before which events are considered expired. Pure. */
export function retentionCutoff(now: Date, days: number): Date {
  return new Date(now.getTime() - days * MS_PER_DAY);
}

interface RetentionLogger {
  info: (obj: unknown, msg?: string) => void;
  error: (obj: unknown, msg?: string) => void;
}

/**
 * Delete events whose `timestamp` is older than the retention window. A
 * non-positive `days` disables retention and deletes nothing. Returns the number
 * of rows removed.
 */
export async function purgeOldEvents(
  prisma: Pick<PrismaClient, "event">,
  days: number,
  now: Date = new Date()
): Promise<number> {
  if (!Number.isFinite(days) || days <= 0) return 0;
  const cutoff = retentionCutoff(now, days);
  const { count } = await prisma.event.deleteMany({ where: { timestamp: { lt: cutoff } } });
  return count;
}

/**
 * Start the daily retention sweep: purge once now, then every 24h. No-op when
 * retention is disabled. Returns the interval timer (unref'd so it never keeps
 * the process alive) or null when disabled, so callers/tests can stop it.
 */
export function startRetentionSweep(
  prisma: Pick<PrismaClient, "event">,
  days: number,
  log: RetentionLogger
): NodeJS.Timeout | null {
  if (!Number.isFinite(days) || days <= 0) return null;

  const sweep = async () => {
    try {
      const removed = await purgeOldEvents(prisma, days);
      if (removed > 0) log.info({ removed, retentionDays: days }, "retention: purged expired events");
    } catch (err) {
      log.error({ err }, "retention: purge failed");
    }
  };

  void sweep();
  const timer = setInterval(() => void sweep(), MS_PER_DAY);
  timer.unref?.();
  return timer;
}
