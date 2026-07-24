/**
 * Audit logging (#20): an immutable record of sensitive mutations — association
 * changes, team changes, and the like — so admins can see who changed what.
 *
 * recordAudit is best-effort and never throws: an audit-write failure must not
 * break the action being audited. Entries are insert-only; there is no update or
 * delete path.
 */

import type { PrismaClient, Prisma } from "../generated/prisma/client.js";

export interface AuditEntry {
  workspaceId: string;
  actorUserId?: string | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  metadata?: Record<string, unknown>;
}

export async function recordAudit(prisma: PrismaClient, entry: AuditEntry): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        workspaceId: entry.workspaceId,
        actorUserId: entry.actorUserId ?? null,
        action: entry.action,
        targetType: entry.targetType ?? null,
        targetId: entry.targetId ?? null,
        metadata: (entry.metadata ?? {}) as Prisma.InputJsonValue,
      },
    });
  } catch {
    // Best-effort: auditing must never break the audited action.
  }
}
