import { useEffect, useState, useCallback } from "react";
import { useAuth } from "../context/auth.js";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

export interface SprintSummary {
  sprint: {
    id: string;
    name: string;
    startDate: string;
    endDate: string;
    status: string;
  };
  summary: {
    totalTokens: number;
    totalCost: number;
    totalDurationSeconds: number;
    ticketCount: number;
    eventCount: number;
  };
  tickets: Array<{
    ticketId: string;
    externalId: string;
    title: string;
    tokens: number;
    cost: number;
    durationSeconds: number;
    events: number;
  }>;
}

export interface Forecast {
  projectId: string;
  historical: {
    completedTickets: number;
    totalStoryPoints: number;
    totalTokens: number;
    totalCost: number;
    totalDurationSeconds: number;
    tokensPerStoryPoint: number;
    costPerStoryPoint: number;
    durationSecondsPerStoryPoint: number;
  };
  developers: Array<{
    userId: string;
    name?: string;
    email?: string | null;
    tokens: number;
    cost: number;
    durationSeconds: number;
    eventCount: number;
    sessionCount: number;
    ticketCount: number;
  }>;
  recommendation: {
    recommendedStoryPoints?: number;
    recommendedTokenBudget?: number;
    recommendedCostBudget?: number;
    recommendedDurationSeconds?: number;
    confidence: "low" | "medium" | "high";
  };
  budget: {
    tokenBudget?: number;
    costBudget?: number;
    tokenUsagePercent?: number;
    costUsagePercent?: number;
  } | null;
}

export function useProjectData(projectId: string) {
  const { token } = useAuth();
  const authHeader: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

  const [sprints, setSprints] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedSprint, setSelectedSprint] = useState<string | null>(null);
  const [summary, setSummary] = useState<SprintSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);

  const [forecast, setForecast] = useState<Forecast | null>(null);
  const [forecastTarget, setForecastTarget] = useState<string>("15");
  const [forecastLoading, setForecastLoading] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [sprintsRefreshKey, setSprintsRefreshKey] = useState(0);

  // Re-fetch sprints/tickets on demand, e.g. after an issue-tracker sync
  // imports new data so the dashboard updates without a full page reload.
  const refetchSprints = useCallback(() => setSprintsRefreshKey((n) => n + 1), []);

  useEffect(() => {
    if (!projectId) return;
    setError(null);
    fetch(`${API_URL}/api/v1/sprints/project/${projectId}`, { headers: authHeader })
      .then(async (res) => {
        if (!res.ok) throw new Error(await res.text());
        return res.json();
      })
      .then((data) => {
        setSprints(data.sprints || []);
        if (data.sprints?.[0]) {
          setSelectedSprint(data.sprints[0].id);
        } else {
          setSelectedSprint(null);
          setSummary(null);
        }
      })
      .catch((err) => setError(err.message));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, token, sprintsRefreshKey]);

  useEffect(() => {
    if (!selectedSprint) return;
    setSummaryLoading(true);
    setError(null);
    fetch(`${API_URL}/api/v1/sprints/summary/${selectedSprint}`, { headers: authHeader })
      .then(async (res) => {
        if (!res.ok) throw new Error(await res.text());
        return res.json();
      })
      .then((data) => setSummary(data))
      .catch((err) => setError(err.message))
      .finally(() => setSummaryLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSprint, token]);

  const refreshForecast = useCallback(async (target: string) => {
    if (!projectId) return;
    setForecastLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/v1/forecast/project/${projectId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader },
        body: JSON.stringify({ targetStoryPoints: Number(target) || 0 }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setForecast(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Forecast failed");
    } finally {
      setForecastLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, token]);

  useEffect(() => {
    refreshForecast(forecastTarget);
  }, [projectId, forecastTarget]);

  return {
    sprints,
    selectedSprint,
    setSelectedSprint,
    summary,
    summaryLoading,
    forecast,
    forecastTarget,
    setForecastTarget,
    forecastLoading,
    refreshForecast,
    error,
    setError,
    syncMessage,
    setSyncMessage,
    refetchSprints,
  };
}
