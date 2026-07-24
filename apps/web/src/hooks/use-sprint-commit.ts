import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "../context/auth.js";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

export interface CommitTicket {
  id: string;
  externalId: string | null;
  title: string | null;
  storyPoints: number;
}

export interface DeferredTicket extends CommitTicket {
  reason: "over-capacity" | "unestimated";
}

export interface SprintCommit {
  targetPoints: number;
  low: number;
  high: number;
  confidence: "low" | "medium" | "high";
  committedPoints: number;
  selected: CommitTicket[];
  deferred: DeferredTicket[];
}

const EMPTY: SprintCommit = {
  targetPoints: 0,
  low: 0,
  high: 0,
  confidence: "low",
  committedPoints: 0,
  selected: [],
  deferred: [],
};

export function useSprintCommit(projectId: string, window = 3) {
  const { token } = useAuth();
  const [data, setData] = useState<SprintCommit>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const reqSeq = useRef(0);

  const authHeaders: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

  const fetchCommit = useCallback(async () => {
    if (!projectId) return;
    const seq = ++reqSeq.current;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ projectId, window: String(window) });
      const res = await fetch(`${API_URL}/api/v1/analytics/sprint-commit?${params}`, { headers: authHeaders });
      if (!res.ok) throw new Error(await res.text());
      const body = await res.json();
      if (seq === reqSeq.current) setData({ ...EMPTY, ...body });
    } catch (err) {
      if (seq === reqSeq.current) setError(err instanceof Error ? err.message : "Failed to load sprint-commit recommendation");
    } finally {
      if (seq === reqSeq.current) setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, window, token]);

  useEffect(() => {
    fetchCommit();
  }, [fetchCommit]);

  return { data, loading, error, refresh: fetchCommit };
}
