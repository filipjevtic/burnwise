import type { PrismaClient } from "../generated/prisma/client.js";

/**
 * Agent-session service. A session groups a developer's work (LLM calls,
 * activity, CI) on one ticket over a time window. The session resolves the
 * ticket once; events that reference the session inherit its ticket.
 */

export interface StartSessionInput {
  workspaceId: string;
  userId: string;
  projectId: string;
  /** Raw external ticket key, e.g. "PROJ-123" (resolved to a Ticket if synced). */
  ticketKey?: string | null;
  source: string;
  branch?: string | null;
}

export interface SessionInfo {
  id: string;
  workspaceId: string;
  projectId: string;
  userId: string;
  ticketId: string | null;
  ticketKey: string | null;
  source: string;
  status: string;
  branch: string | null;
  startedAt: Date;
  endedAt: Date | null;
}

/** Resolve an external ticket key to an internal ticket id within a project. */
export async function resolveTicketId(
  prisma: PrismaClient,
  projectId: string,
  ticketKey: string | null | undefined
): Promise<string | null> {
  if (!ticketKey) return null;
  const ticket = await prisma.ticket.findUnique({
    where: { projectId_externalId: { projectId, externalId: ticketKey } },
    select: { id: true },
  });
  return ticket?.id ?? null;
}

/** Start (or reuse) an active session for the given context. */
export async function startSession(
  prisma: PrismaClient,
  input: StartSessionInput
): Promise<SessionInfo> {
  const ticketId = await resolveTicketId(prisma, input.projectId, input.ticketKey);
  const session = await prisma.session.create({
    data: {
      workspaceId: input.workspaceId,
      userId: input.userId,
      projectId: input.projectId,
      ticketId,
      ticketKey: input.ticketKey ?? null,
      source: input.source,
      branch: input.branch ?? null,
      status: "active",
    },
  });
  return toInfo(session);
}

/** End a session, marking it complete. Returns null if not found/owned. */
export async function endSession(
  prisma: PrismaClient,
  sessionId: string,
  workspaceId: string
): Promise<SessionInfo | null> {
  const session = await prisma.session.findUnique({ where: { id: sessionId } });
  if (!session || session.workspaceId !== workspaceId) return null;
  const updated = await prisma.session.update({
    where: { id: sessionId },
    data: { status: "ended", endedAt: new Date() },
  });
  return toInfo(updated);
}

/** Fetch a session scoped to a workspace. */
export async function getSession(
  prisma: PrismaClient,
  sessionId: string,
  workspaceId: string
): Promise<SessionInfo | null> {
  const session = await prisma.session.findUnique({ where: { id: sessionId } });
  if (!session || session.workspaceId !== workspaceId) return null;
  return toInfo(session);
}

/**
 * Resolve the ticket id for a session, lazily resolving the stored ticketKey
 * against synced tickets if the FK wasn't set at start time.
 *
 * When `expectedProjectId` is provided, the session must belong to that project;
 * otherwise resolution returns null. This prevents an event from inheriting a
 * ticket by naming a session id from another project/tenant.
 */
export async function resolveSessionTicketId(
  prisma: PrismaClient,
  sessionId: string,
  expectedProjectId?: string
): Promise<string | null> {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    select: { ticketId: true, ticketKey: true, projectId: true },
  });
  if (!session) return null;
  if (expectedProjectId && session.projectId !== expectedProjectId) return null;
  if (session.ticketId) return session.ticketId;
  if (session.ticketKey) {
    return resolveTicketId(prisma, session.projectId, session.ticketKey);
  }
  return null;
}

function toInfo(s: {
  id: string;
  workspaceId: string;
  projectId: string;
  userId: string;
  ticketId: string | null;
  ticketKey: string | null;
  source: string;
  status: string;
  branch: string | null;
  startedAt: Date;
  endedAt: Date | null;
}): SessionInfo {
  return {
    id: s.id,
    workspaceId: s.workspaceId,
    projectId: s.projectId,
    userId: s.userId,
    ticketId: s.ticketId,
    ticketKey: s.ticketKey,
    source: s.source,
    status: s.status,
    branch: s.branch,
    startedAt: s.startedAt,
    endedAt: s.endedAt,
  };
}
