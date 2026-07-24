import type { PrismaClient } from "../generated/prisma/client.js";
import type { Event } from "@burnwise/schema";
import { getPrisma } from "../db.js";
import { resolveSessionTicketId } from "./session.js";

export interface AssociationResult {
  ticketId: string | null;
  method: string | null;
  confidence: number | null;
}

/**
 * Per-batch memoization for ingest. A single batch usually targets one project
 * and a handful of tickets/sessions, so caching these lookups turns thousands
 * of duplicate DB round-trips into a few.
 */
export interface AssociationCache {
  /** `${projectId}::${externalId}` -> internal ticket id (or null if absent). */
  tickets: Map<string, string | null>;
  /** sessionId -> resolved ticket id (or null). */
  sessions: Map<string, string | null>;
}

/** Resolve an external ticket key to an internal id, memoized via the cache. */
async function lookupTicketByExternalId(
  prisma: PrismaClient,
  projectId: string,
  externalId: string,
  cache?: AssociationCache
): Promise<string | null> {
  const key = `${projectId}::${externalId}`;
  const cached = cache?.tickets.get(key);
  if (cached !== undefined) return cached;
  const ticket = await prisma.ticket.findUnique({
    where: { projectId_externalId: { projectId, externalId } },
    select: { id: true },
  });
  const id = ticket?.id ?? null;
  cache?.tickets.set(key, id);
  return id;
}

/**
 * Verify an internal ticket UUID actually belongs to the event's project.
 * Without this, a collector could attach events to any ticket in any project
 * by sending a well-formed UUID. Memoized via the cache.
 */
async function verifyTicketInProject(
  prisma: PrismaClient,
  projectId: string,
  ticketId: string,
  cache?: AssociationCache
): Promise<string | null> {
  const key = `${projectId}::id::${ticketId}`;
  const cached = cache?.tickets.get(key);
  if (cached !== undefined) return cached;
  const ticket = await prisma.ticket.findFirst({
    where: { id: ticketId, projectId },
    select: { id: true },
  });
  const id = ticket?.id ?? null;
  cache?.tickets.set(key, id);
  return id;
}

/**
 * Association rules, in order of confidence:
 * 1. Event already carries a ticketId.
 * 2. Ticket ID appears in the LLM prompt text.
 * 3. Ticket ID appears in the git branch or commit.
 * 4. Payload metadata includes a ticket reference.
 */
export async function associateEvent(
  event: Event,
  cache?: AssociationCache
): Promise<AssociationResult> {
  // Highest confidence: explicit ticketId on the event.
  if (event.ticketId) {
    const prisma = await getPrisma();
    const ticketId = await lookupTicketByExternalId(prisma, event.projectId, event.ticketId, cache);
    if (ticketId) {
      return { ticketId, method: "explicit", confidence: 1.0 };
    }
    // If it looks like a UUID, accept it as an internal id ONLY after verifying
    // it belongs to this event's project (prevents cross-project attachment).
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(event.ticketId)) {
      const verified = await verifyTicketInProject(prisma, event.projectId, event.ticketId, cache);
      if (verified) {
        return { ticketId: verified, method: "explicit", confidence: 1.0 };
      }
    }
  }

  // Second-highest confidence: the event belongs to an active session that is
  // already bound to a ticket. The session resolves the ticket once and all
  // events in it inherit that association.
  if (event.sessionId) {
    const prisma = await getPrisma();
    const sessionKey = `${event.projectId}::${event.sessionId}`;
    const cached = cache?.sessions.get(sessionKey);
    const ticketId =
      cached !== undefined
        ? cached
        : await resolveSessionTicketId(prisma, event.sessionId, event.projectId);
    cache?.sessions.set(sessionKey, ticketId);
    if (ticketId) {
      return { ticketId, method: "session", confidence: 0.95 };
    }
  }

  const candidates = await findTicketCandidates(event, cache);
  if (candidates.length > 0) {
    return {
      ticketId: candidates[0].ticketId,
      method: candidates[0].method,
      confidence: candidates[0].confidence,
    };
  }

  return { ticketId: null, method: null, confidence: null };
}

export function extractTicketKeys(text: string): string[] {
  const matches = text.match(/\b[A-Z]{2,6}-\d{1,6}\b/g) || [];
  return [...new Set(matches)];
}

interface Candidate {
  ticketId: string;
  method: string;
  confidence: number;
  matchedValue: string;
}

async function findTicketCandidates(
  event: Event,
  cache?: AssociationCache
): Promise<Candidate[]> {
  const prisma = await getPrisma();
  const candidates: Candidate[] = [];

  // 1. LLM prompt text.
  const promptText = extractTextFromEvent(event);
  if (promptText) {
    const keys = extractTicketKeys(promptText);
    for (const key of keys) {
      const ticketId = await lookupTicketByExternalId(prisma, event.projectId, key, cache);
      if (ticketId) {
        candidates.push({ ticketId, method: "prompt-text", confidence: 0.85, matchedValue: key });
      }
    }
  }

  // 2. Git branch / commit from session or trace metadata.
  const branch = extractBranchFromEvent(event);
  const commitSha = extractCommitFromEvent(event);
  const gitContext = [branch, commitSha].filter(Boolean).join(" ");
  if (gitContext) {
    const keys = extractTicketKeys(gitContext);
    for (const key of keys) {
      const ticketId = await lookupTicketByExternalId(prisma, event.projectId, key, cache);
      if (ticketId) {
        candidates.push({ ticketId, method: "git-context", confidence: 0.75, matchedValue: key });
      }
    }
  }

  // 3. Event metadata.
  const metaText = JSON.stringify(event.metadata);
  const metaKeys = extractTicketKeys(metaText);
  for (const key of metaKeys) {
    const ticketId = await lookupTicketByExternalId(prisma, event.projectId, key, cache);
    if (ticketId) {
      candidates.push({ ticketId, method: "metadata", confidence: 0.65, matchedValue: key });
    }
  }

  return candidates.sort((a, b) => b.confidence - a.confidence);
}

function extractTextFromEvent(event: Event): string | null {
  const payload = event.payload as Record<string, unknown>;
  if (event.eventType === "llm.request" || event.eventType === "llm.response") {
    const prompt = (payload.promptText as string) || "";
    const response = (payload.responseText as string) || "";
    return `${prompt} ${response}`.trim() || null;
  }
  if (event.eventType === "trace.span") {
    const attrs = (payload.attributes as Record<string, unknown>) || {};
    const attrText = Object.values(attrs).join(" ");
    return attrText || null;
  }
  return null;
}

function extractBranchFromEvent(event: Event): string | null {
  const payload = event.payload as Record<string, unknown>;
  if (event.eventType === "session.activity") {
    return (payload.branch as string) || null;
  }
  const meta = event.metadata as Record<string, unknown>;
  return (meta.branch as string) || (payload.branch as string) || null;
}

function extractCommitFromEvent(event: Event): string | null {
  const payload = event.payload as Record<string, unknown>;
  if (event.eventType === "session.activity") {
    return (payload.commitSha as string) || null;
  }
  const meta = event.metadata as Record<string, unknown>;
  return (meta.commitSha as string) || (payload.commitSha as string) || null;
}
