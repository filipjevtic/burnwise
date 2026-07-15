import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "../context/auth.js";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

export type Consistency = "consistent" | "moderate" | "noisy";

export interface CalibrationBucket {
  storyPoints: number;
  ticketCount: number;
  avgTokens: number;
  medianTokens: number;
  avgCost: number;
  avgDurationSeconds: number;
  tokensCv: number;
  consistency: Consistency;
}

export interface CalibrationInversion {
  lowerPoints: number;
  higherPoints: number;
  lowerAvgTokens: number;
  higherAvgTokens: number;
}

export interface CalibrationData {
  buckets: CalibrationBucket[];
  inversions: CalibrationInversion[];
  sampleSize: number;
}

const EMPTY: CalibrationData = { buckets: [], inversions: [], sampleSize: 0 };

/** Estimate-calibration report: effort per story-point value, for a project. */
export function useCalibration(projectId: string) {
  const { token } = useAuth();
  const [data, setData] = useState<CalibrationData>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const reqSeq = useRef(0);

  const authHeaders: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

  const fetchData = useCallback(async () => {
    if (!projectId) return;
    const seq = ++reqSeq.current;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/v1/analytics/calibration?projectId=${projectId}`, { headers: authHeaders });
      if (!res.ok) throw new Error(await res.text());
      const body = await res.json();
      if (seq === reqSeq.current) setData({ buckets: body.buckets || [], inversions: body.inversions || [], sampleSize: body.sampleSize || 0 });
    } catch (err) {
      if (seq === reqSeq.current) setError(err instanceof Error ? err.message : "Failed to load calibration");
    } finally {
      if (seq === reqSeq.current) setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, token]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, error, refresh: fetchData };
}
