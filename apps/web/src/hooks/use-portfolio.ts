import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "../context/auth.js";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

export interface PortfolioProject {
  projectId: string;
  name: string;
  sprintCount: number;
  avgCompletedPoints: number;
  estimateAccuracy: number;
  recommendedPoints: number;
  capacityConfidence: "low" | "medium" | "high";
  completedPoints: number;
  tokens: number;
  cost: number;
  durationSeconds: number;
  tokensPerPoint: number;
  costPerPoint: number;
}

export interface PortfolioTotals {
  projectCount: number;
  completedPoints: number;
  tokens: number;
  cost: number;
  durationSeconds: number;
  tokensPerPoint: number;
  costPerPoint: number;
}

const EMPTY: PortfolioTotals = {
  projectCount: 0,
  completedPoints: 0,
  tokens: 0,
  cost: 0,
  durationSeconds: 0,
  tokensPerPoint: 0,
  costPerPoint: 0,
};

/** Workspace-wide portfolio rollup: velocity + effort across all projects. */
export function usePortfolio() {
  const { token } = useAuth();
  const [projects, setProjects] = useState<PortfolioProject[]>([]);
  const [totals, setTotals] = useState<PortfolioTotals>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const reqSeq = useRef(0);

  const authHeaders: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

  const fetchData = useCallback(async () => {
    const seq = ++reqSeq.current;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/v1/analytics/portfolio`, { headers: authHeaders });
      if (!res.ok) throw new Error(await res.text());
      const body = await res.json();
      if (seq === reqSeq.current) {
        setProjects(body.projects || []);
        setTotals(body.totals || EMPTY);
      }
    } catch (err) {
      if (seq === reqSeq.current) setError(err instanceof Error ? err.message : "Failed to load portfolio");
    } finally {
      if (seq === reqSeq.current) setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { projects, totals, loading, error, refresh: fetchData };
}
