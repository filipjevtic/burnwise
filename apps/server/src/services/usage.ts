import type { PrismaClient } from "../generated/prisma/client.js";
import type { Rollup } from "./rollup.js";
import { dbRollup } from "./aggregate-db.js";

/**
 * Current project-wide usage totals across ALL events — not just events on
 * completed ("done") tickets. This is the number that budget usage should be
 * measured against, and it is shared by the alerts, forecast, and dashboard
 * paths so they always agree (previously the forecast used done-only historical
 * totals, which disagreed with the alerts banner — see issue #10).
 *
 * Aggregated in Postgres over the denormalized metric columns (#176) so this
 * scales to large projects without loading event payloads into Node.
 */
export async function getProjectUsageTotals(
  prisma: PrismaClient,
  projectId: string
): Promise<Rollup> {
  return dbRollup(prisma, { projectId });
}
