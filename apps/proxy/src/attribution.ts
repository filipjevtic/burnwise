/**
 * Burnwise attribution headers (Helicone-style). These let a caller bind an
 * LLM request to a developer, session, and ticket without changing the request
 * body. They are read by the proxy and stripped before forwarding upstream so
 * they never leak to the LLM provider.
 *
 *   X-Burnwise-Key        personal API key (bearer secret) for ingest auth
 *   X-Burnwise-Ticket     ticket key, e.g. PROJ-123
 *   X-Burnwise-Session    session id
 *   X-Burnwise-User       user id override (usually derived from the key)
 *   X-Burnwise-Project    project id override
 *   X-Burnwise-Property-* arbitrary custom properties (stored on metadata)
 */

export const BURNWISE_PREFIX = "x-burnwise-";
export const PROPERTY_PREFIX = "x-burnwise-property-";

export interface Attribution {
  key?: string;
  ticketId?: string;
  sessionId?: string;
  userId?: string;
  projectId?: string;
  properties: Record<string, string>;
}

type HeaderMap = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  if (value === undefined) return undefined;
  return Array.isArray(value) ? value[0] : value;
}

/** Extract Burnwise attribution from request headers (case-insensitive). */
export function extractAttribution(headers: HeaderMap): Attribution {
  const lower: HeaderMap = {};
  for (const [k, v] of Object.entries(headers)) lower[k.toLowerCase()] = v;

  const properties: Record<string, string> = {};
  for (const [k, v] of Object.entries(lower)) {
    if (k.startsWith(PROPERTY_PREFIX)) {
      const name = k.slice(PROPERTY_PREFIX.length);
      const val = first(v);
      if (name && val !== undefined) properties[name] = val;
    }
  }

  return {
    key: first(lower[`${BURNWISE_PREFIX}key`]),
    ticketId: first(lower[`${BURNWISE_PREFIX}ticket`]),
    sessionId: first(lower[`${BURNWISE_PREFIX}session`]),
    userId: first(lower[`${BURNWISE_PREFIX}user`]),
    projectId: first(lower[`${BURNWISE_PREFIX}project`]),
    properties,
  };
}

/**
 * Return a copy of the headers with all Burnwise headers removed, so the
 * upstream LLM provider never sees them.
 */
export function stripBurnwiseHeaders(headers: HeaderMap): HeaderMap {
  const out: HeaderMap = {};
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase().startsWith(BURNWISE_PREFIX)) continue;
    out[k] = v;
  }
  return out;
}
