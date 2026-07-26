/**
 * PII redaction for stored prompt/response text (#27). When enabled, high-confidence
 * secrets and personal data are masked before events are persisted, so sensitive
 * content pasted into prompts isn't retained verbatim.
 *
 * All patterns are deliberately *linear* (no overlapping/nested quantifiers) so
 * they can't be a ReDoS target on hostile prompt text. This is a built-in,
 * high-confidence set rather than operator-supplied regex — enough to cover the
 * common leaks (emails, secrets, card/SSN) without over-redacting normal text.
 */

// [pattern, replacement]. Applied in order; each is global.
const PATTERNS: Array<[RegExp, string]> = [
  // Email: local part stops at '@'; domain labels exclude '.', so the repeated
  // ".label" group can't backtrack ambiguously.
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g, "[redacted-email]"],
  // US Social Security Number (fixed-width, no ambiguity).
  [/\b\d{3}-\d{2}-\d{4}\b/g, "[redacted-ssn]"],
  // Credit-card-like 16-digit groups (optionally space/dash separated).
  [/\b\d{4}[ -]?\d{4}[ -]?\d{4}[ -]?\d{1,4}\b/g, "[redacted-cc]"],
  // OpenAI-style secret keys.
  [/\bsk-[A-Za-z0-9]{16,}\b/g, "[redacted-key]"],
  // GitHub personal-access / app tokens.
  [/\bgh[pousr]_[A-Za-z0-9]{20,}\b/g, "[redacted-key]"],
  // AWS access key IDs.
  [/\bAKIA[0-9A-Z]{16}\b/g, "[redacted-key]"],
];

/** Mask high-confidence PII/secrets in a single string. Pure. */
export function redactPii(text: string): string {
  let out = text;
  for (const [pattern, replacement] of PATTERNS) {
    out = out.replace(pattern, replacement);
  }
  return out;
}

/** Recursively redact string values in arrays/objects; leaves non-strings as-is. */
function redactDeep(value: unknown): unknown {
  if (typeof value === "string") return redactPii(value);
  if (Array.isArray(value)) return value.map(redactDeep);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = redactDeep(v);
    return out;
  }
  return value;
}

/**
 * Redact the free-text fields of an event payload (prompt/response text and the
 * messages array). Structured fields (model, provider, ids, token counts) and
 * metadata are left untouched. Returns a new payload; never mutates the input.
 */
export function redactEventPayload(payload: unknown): unknown {
  if (!payload || typeof payload !== "object") return payload;
  const p = payload as Record<string, unknown>;
  const out: Record<string, unknown> = { ...p };
  if (typeof out.promptText === "string") out.promptText = redactPii(out.promptText);
  if (typeof out.responseText === "string") out.responseText = redactPii(out.responseText);
  if (Array.isArray(out.messages)) out.messages = out.messages.map(redactDeep);
  return out;
}
