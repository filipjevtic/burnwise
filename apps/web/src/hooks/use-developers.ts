import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../context/auth.js";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

export interface DeveloperStat {
  userId: string;
  name: string;
  email: string | null;
  tokens: number;
  cost: number;
  durationSeconds: number;
  eventCount: number;
  sessionCount: number;
  ticketCount: number;
}

export function useDevelopers(projectId: string, sprintId: string | null) {
  const { token } = useAuth();
  const [developers, setDevelopers] = useState<DeveloperStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const authHeaders: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

  const fetchDevelopers = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ projectId });
      if (sprintId) params.set("sprintId", sprintId);
      const res = await fetch(`${API_URL}/api/v1/analytics/developers?${params}`, { headers: authHeaders });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setDevelopers(data.developers || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load developer analytics");
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, sprintId, token]);

  useEffect(() => {
    fetchDevelopers();
  }, [fetchDevelopers]);

  return { developers, loading, error, refresh: fetchDevelopers };
}
