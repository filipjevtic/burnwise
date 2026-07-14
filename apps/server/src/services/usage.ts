import type { PrismaClient } from "../generated/prisma/client.js";
import { rollupEvents, type Rollup } from "./rollup.js";

/**
 * Current project-wide usage totals across ALL events — not just events on
 * completed ("done") tickets. This is the number that budget usage should be
 * measured against, and it is shared by the alerts, forecast, and dashboard
 * paths so they always agree (previously the forecast used done-only historical
 * totals, which disagreed with the alerts banner — see issue #10).
 *
 * NOTE: loads all project events into memory to roll them up (token/cost live in
 * event payload JSON, so this cannot be a SQL SUM today). Consistent with the
 * existing alerts path; the aggregation-scalability follow-up is tracked in #176.
 */
export async function getProjectUsageTotals(
  prisma: PrismaClient,
  projectId: string
): Promise<Rollup> {
  const events = await prisma.event.findMany({ where: { projectId } });
  return rollupEvents(events);
}
