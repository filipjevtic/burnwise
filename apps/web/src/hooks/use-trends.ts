import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "../context/auth.js";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

export type TrendBucket = "day" | "week";

export interface TrendPoint {
  period: string;
  tokens: number;
  cost: number;
  durationSeconds: number;
  eventCount: number;
}

export function useTrends(projectId: string, sprintId: string | null, bucket: TrendBucket) {
  const { token } = useAuth();
  const [points, setPoints] = useState<TrendPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const reqSeq = useRef(0);

  const authHeaders: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

  const fetchTrends = useCallback(async () => {
    if (!projectId) return;
    const seq = ++reqSeq.current;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ projectId, bucket });
      if (sprintId) params.set("sprintId", sprintId);
      const res = await fetch(`${API_URL}/api/v1/analytics/trends?${params}`, { headers: authHeaders });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      if (seq === reqSeq.current) setPoints(data.points || []);
    } catch (err) {
      if (seq === reqSeq.current) setError(err instanceof Error ? err.message : "Failed to load trends");
    } finally {
      if (seq === reqSeq.current) setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, sprintId, bucket, token]);

  useEffect(() => {
    fetchTrends();
  }, [fetchTrends]);

  return { points, loading, error, refresh: fetchTrends };
}
