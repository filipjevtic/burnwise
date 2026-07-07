import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "../context/auth.js";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

export interface SprintVelocity {
  sprintId: string;
  name: string;
  startDate: string | null;
  endDate: string | null;
  status: string;
  committedPoints: number;
  completedPoints: number;
  completionRate: number;
  committedTickets: number;
  completedTickets: number;
  rollingAveragePoints: number;
}

export interface CapacityRecommendation {
  recommendedPoints: number;
  mean: number;
  median: number;
  low: number;
  high: number;
  sampleSize: number;
  confidence: "low" | "medium" | "high";
}

export interface VelocitySummary {
  sprints: SprintVelocity[];
  averageCompletedPoints: number;
  averageCompletionRate: number;
  latestRollingAveragePoints: number;
  capacity: CapacityRecommendation;
}

const EMPTY_CAPACITY: CapacityRecommendation = {
  recommendedPoints: 0,
  mean: 0,
  median: 0,
  low: 0,
  high: 0,
  sampleSize: 0,
  confidence: "low",
};

const EMPTY: VelocitySummary = {
  sprints: [],
  averageCompletedPoints: 0,
  averageCompletionRate: 0,
  latestRollingAveragePoints: 0,
  capacity: EMPTY_CAPACITY,
};

export function useVelocity(projectId: string, window = 3) {
  const { token } = useAuth();
  const [data, setData] = useState<VelocitySummary>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const reqSeq = useRef(0);

  const authHeaders: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

  const fetchVelocity = useCallback(async () => {
    if (!projectId) return;
    const seq = ++reqSeq.current;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ projectId, window: String(window) });
      const res = await fetch(`${API_URL}/api/v1/analytics/velocity?${params}`, { headers: authHeaders });
      if (!res.ok) throw new Error(await res.text());
      const body = await res.json();
      if (seq === reqSeq.current) setData({ ...EMPTY, ...body });
    } catch (err) {
      if (seq === reqSeq.current) setError(err instanceof Error ? err.message : "Failed to load velocity");
    } finally {
      if (seq === reqSeq.current) setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, window, token]);

  useEffect(() => {
    fetchVelocity();
  }, [fetchVelocity]);

  return { data, loading, error, refresh: fetchVelocity };
}
