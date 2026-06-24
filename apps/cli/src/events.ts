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
