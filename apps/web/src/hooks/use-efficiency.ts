import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "../context/auth.js";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

export interface SprintEfficiency {
  sprintId: string;
  name: string;
  startDate: string | null;
  endDate: string | null;
  status: string;
  completedPoints: number;
  tokens: number;
  cost: number;
  durationSeconds: number;
  costPerPoint: number;
  tokensPerPoint: number;
  durationSecondsPerPoint: number;
}

export interface EfficiencySummary {
  sprints: SprintEfficiency[];
  averageCostPerPoint: number;
  averageTokensPerPoint: number;
  averageDurationSecondsPerPoint: number;
}

const EMPTY: EfficiencySummary = {
  sprints: [],
  averageCostPerPoint: 0,
  averageTokensPerPoint: 0,
  averageDurationSecondsPerPoint: 0,
};

export function useEfficiency(projectId: string) {
  const { token } = useAuth();
  const [data, setData] = useState<EfficiencySummary>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const reqSeq = useRef(0);

  const authHeaders: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

  const fetchEfficiency = useCallback(async () => {
    if (!projectId) return;
    const seq = ++reqSeq.current;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ projectId });
      const res = await fetch(`${API_URL}/api/v1/analytics/efficiency?${params}`, { headers: authHeaders });
      if (!res.ok) throw new Error(await res.text());
      const body = await res.json();
      if (seq === reqSeq.current) setData({ ...EMPTY, ...body });
    } catch (err) {
      if (seq === reqSeq.current) setError(err instanceof Error ? err.message : "Failed to load efficiency");
    } finally {
      if (seq === reqSeq.current) setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, token]);

  useEffect(() => {
    fetchEfficiency();
  }, [fetchEfficiency]);

  return { data, loading, error, refresh: fetchEfficiency };
}
