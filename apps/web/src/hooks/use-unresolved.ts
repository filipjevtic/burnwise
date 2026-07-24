import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "../context/auth.js";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

export interface UnresolvedEvent {
  eventId: string;
  eventType: string;
  timestamp: string;
  source: string;
  sessionId: string | null;
  payload: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  associationMethod: string | null;
}

export function useUnresolved(projectId: string) {
  const { token } = useAuth();
  const [events, setEvents] = useState<UnresolvedEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const reqSeq = useRef(0);

  const authHeaders: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

  const fetchUnresolved = useCallback(async () => {
    if (!projectId) return;
    const seq = ++reqSeq.current;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ projectId, limit: "100" });
      const res = await fetch(`${API_URL}/api/v1/events/unresolved?${params}`, { headers: authHeaders });
      if (!res.ok) throw new Error(await res.text());
      const body = await res.json();
      if (seq === reqSeq.current) {
        setEvents(body.events ?? []);
        setTotal(body.pagination?.total ?? 0);
      }
    } catch (err) {
      if (seq === reqSeq.current) setError(err instanceof Error ? err.message : "Failed to load unresolved events");
    } finally {
      if (seq === reqSeq.current) setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, token]);

  useEffect(() => {
    fetchUnresolved();
  }, [fetchUnresolved]);

  const act = useCallback(
    async (path: string, body: Record<string, unknown>) => {
      const res = await fetch(`${API_URL}/api/v1/events/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());
      // Optimistically drop the event from the queue; keep counts in sync.
      const eventId = path.split("/")[0];
      setEvents((prev) => prev.filter((e) => e.eventId !== eventId));
      setTotal((n) => Math.max(0, n - 1));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [token]
  );

  const resolve = useCallback((eventId: string, ticketId: string) => act(`${eventId}/resolve`, { ticketId }), [act]);
  const reject = useCallback((eventId: string, reason?: string) => act(`${eventId}/reject`, { reason }), [act]);

  return { events, total, loading, error, refresh: fetchUnresolved, resolve, reject };
}
