import { config } from "./config.js";
import type { Event } from "@burnwise/schema";

export async function emitEvent(event: Event): Promise<void> {
  const response = await fetch(`${config.serverUrl}/api/v1/events/ingest`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({ events: [event] }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to emit event: ${response.status} ${text}`);
  }
}

/**
 * Start a server-side session bound to a ticket. Returns the session id, or
 * null if the server is unreachable / the key lacks a project (best-effort).
 */
export async function startSession(ticketKey: string): Promise<string | null> {
  try {
    const res = await fetch(`${config.serverUrl}/api/v1/sessions/start`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({ ticketKey, projectId: config.projectId, source: "mcp" }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { id: string };
    return data.id;
  } catch {
    return null;
  }
}
