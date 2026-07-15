import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "../context/auth.js";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

export interface SessionUser {
  id: string;
  name: string;
  email: string;
}

export interface SessionTicket {
  id: string;
  externalId: string;
  title: string;
}

export interface SessionListItem {
  id: string;
  status: string;
  source: string;
  branch: string | null;
  ticketKey: string | null;
  startedAt: string;
  endedAt: string | null;
  user: SessionUser | null;
  ticket: SessionTicket | null;
  tokens: number;
  cost: number;
  durationSeconds: number;
  eventCount: number;
  tokenAnomaly?: boolean;
}

export interface SessionEvent {
  id: string;
  eventType: string;
  source: string;
  timestamp: string;
  payload: unknown;
}

export interface SessionFeedback {
  effectiveness?: number;
  wins?: string[];
  blockers?: string[];
  summary?: string;
}

export interface SessionDetail {
  session: {
    id: string;
    status: string;
    source: string;
    branch: string | null;
    ticketKey: string | null;
    startedAt: string;
    endedAt: string | null;
    user: SessionUser | null;
    ticket: SessionTicket | null;
    feedback: SessionFeedback | null;
  };
  summary: {
    totalTokens: number;
    totalCost: number;
    totalDurationSeconds: number;
    eventCount: number;
  };
  events: SessionEvent[];
}

export function useSessions(projectId: string, sprintId: string | null) {
  const { token } = useAuth();
  const [sessions, setSessions] = useState<SessionListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const reqSeq = useRef(0);

  const authHeaders: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

  const fetchSessions = useCallback(async () => {
    if (!projectId) return;
    const seq = ++reqSeq.current;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ projectId });
      if (sprintId) params.set("sprintId", sprintId);
      const res = await fetch(`${API_URL}/api/v1/analytics/sessions?${params}`, { headers: authHeaders });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      if (seq === reqSeq.current) setSessions(data.sessions || []);
    } catch (err) {
      if (seq === reqSeq.current) setError(err instanceof Error ? err.message : "Failed to load sessions");
    } finally {
      if (seq === reqSeq.current) setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, sprintId, token]);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  return { sessions, loading, error, refresh: fetchSessions };
}

export function useSessionDetail(sessionId: string | null) {
  const { token } = useAuth();
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reqSeq = useRef(0);

  useEffect(() => {
    if (!sessionId) {
      setDetail(null);
      return;
    }
    const seq = ++reqSeq.current;
    const authHeaders: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
    setLoading(true);
    setError(null);
    fetch(`${API_URL}/api/v1/analytics/sessions/${sessionId}`, { headers: authHeaders })
      .then(async (res) => {
        if (!res.ok) throw new Error(await res.text());
        return res.json();
      })
      .then((data) => {
        if (seq === reqSeq.current) setDetail(data);
      })
      .catch((err) => {
        if (seq === reqSeq.current) setError(err instanceof Error ? err.message : "Failed to load session");
      })
      .finally(() => {
        if (seq === reqSeq.current) setLoading(false);
      });
  }, [sessionId, token]);

  return { detail, loading, error };
}
