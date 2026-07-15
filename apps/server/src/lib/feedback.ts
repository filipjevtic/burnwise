/**
 * Agent session self-feedback (#208): a small, structured self-report an agent
 * can attach to a session — how effective the run felt, what blocked it, what
 * went well, and a summary of completed items. Qualitative signal that
 * complements the quantitative usage numbers and feeds retros / calibration.
 *
 * `normalizeSessionFeedback` is a pure validator/sanitizer: it coerces untrusted
 * input into a bounded shape (or null if nothing usable), so the route can store
 * it as-is without a Prisma 500 or unbounded blobs.
 */

export interface SessionFeedback {
  /** Self-rated effectiveness, 1 (poor) – 5 (excellent). */
  effectiveness?: number;
  wins?: string[];
  blockers?: string[];
  summary?: string;
}

const MAX_ITEMS = 20;
const MAX_ITEM_LEN = 500;
const MAX_SUMMARY_LEN = 2000;

function cleanList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value
    .filter((v): v is string => typeof v === "string")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, MAX_ITEMS)
    .map((s) => (s.length > MAX_ITEM_LEN ? s.slice(0, MAX_ITEM_LEN) : s));
  return items.length > 0 ? items : undefined;
}

export function normalizeSessionFeedback(input: unknown): SessionFeedback | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as Record<string, unknown>;
  const out: SessionFeedback = {};

  if (typeof raw.effectiveness === "number" && Number.isFinite(raw.effectiveness)) {
    out.effectiveness = Math.min(5, Math.max(1, Math.round(raw.effectiveness)));
  }

  const wins = cleanList(raw.wins);
  if (wins) out.wins = wins;

  const blockers = cleanList(raw.blockers);
  if (blockers) out.blockers = blockers;

  if (typeof raw.summary === "string") {
    const summary = raw.summary.trim().slice(0, MAX_SUMMARY_LEN);
    if (summary) out.summary = summary;
  }

  return Object.keys(out).length > 0 ? out : null;
}
