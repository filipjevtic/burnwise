import type { Event } from "@burnwise/schema";
import { getPrisma } from "../db.js";
import { resolveSessionTicketId } from "./session.js";

export interface AssociationResult {
  ticketId: string | null;
  method: string | null;
  confidence: number | null;
}

/**
 * Association rules, in order of confidence:
 * 1. Event already carries a ticketId.
 * 2. Ticket ID appears in the LLM prompt text.
 * 3. Ticket ID appears in the git branch or commit.
 * 4. Payload metadata includes a ticket reference.
 */
export async function associateEvent(event: Event): Promise<AssociationResult> {
  // Highest confidence: explicit ticketId on the event.
  if (event.ticketId) {
    const prisma = await getPrisma();
    const ticket = await prisma.ticket.findUnique({
      where: { projectId_externalId: { projectId: event.projectId, externalId: event.ticketId } },
    });
    if (ticket) {
      return {
        ticketId: ticket.id,
        method: "explicit",
        confidence: 1.0,
      };
    }
    // If it looks like a UUID, trust it as an internal id.
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(event.ticketId)) {
      return {
        ticketId: event.ticketId,
        method: "explicit",
        confidence: 1.0,
      };
    }
  }

  // Second-highest confidence: the event belongs to an active session that is
  // already bound to a ticket. The session resolves the ticket once and all
  // events in it inherit that association.
  if (event.sessionId) {
    const prisma = await getPrisma();
    const ticketId = await resolveSessionTicketId(prisma, event.sessionId);
    if (ticketId) {
      return { ticketId, method: "session", confidence: 0.95 };
    }
  }

  const candidates = await findTicketCandidates(event);
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

async function findTicketCandidates(event: Event): Promise<Candidate[]> {
  const prisma = await getPrisma();
  const candidates: Candidate[] = [];

  // 1. LLM prompt text.
  const promptText = extractTextFromEvent(event);
  if (promptText) {
    const keys = extractTicketKeys(promptText);
    for (const key of keys) {
      const ticket = await prisma.ticket.findUnique({
        where: { projectId_externalId: { projectId: event.projectId, externalId: key } },
      });
      if (ticket) {
        candidates.push({
          ticketId: ticket.id,
          method: "prompt-text",
          confidence: 0.85,
          matchedValue: key,
        });
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
      const ticket = await prisma.ticket.findUnique({
        where: { projectId_externalId: { projectId: event.projectId, externalId: key } },
      });
      if (ticket) {
        candidates.push({
          ticketId: ticket.id,
          method: "git-context",
          confidence: 0.75,
          matchedValue: key,
        });
      }
    }
  }

  // 3. Event metadata.
  const metaText = JSON.stringify(event.metadata);
  const metaKeys = extractTicketKeys(metaText);
  for (const key of metaKeys) {
    const ticket = await prisma.ticket.findUnique({
      where: { projectId_externalId: { projectId: event.projectId, externalId: key } },
    });
    if (ticket) {
      candidates.push({
        ticketId: ticket.id,
        method: "metadata",
        confidence: 0.65,
        matchedValue: key,
      });
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
