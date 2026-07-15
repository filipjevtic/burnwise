import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "../context/auth.js";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

export interface ProviderStat {
  provider: string;
  tokens: number;
  cost: number;
  durationSeconds: number;
  eventCount: number;
}

/** Per-provider (vendor) usage breakdown for a project/sprint. */
export function useProviderBreakdown(projectId: string, sprintId: string | null) {
  const { token } = useAuth();
  const [providers, setProviders] = useState<ProviderStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const reqSeq = useRef(0);

  const authHeaders: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

  const fetchProviders = useCallback(async () => {
    if (!projectId) return;
    const seq = ++reqSeq.current;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ projectId });
      if (sprintId) params.set("sprintId", sprintId);
      const res = await fetch(`${API_URL}/api/v1/analytics/by-provider?${params}`, { headers: authHeaders });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      if (seq === reqSeq.current) setProviders(data.providers || []);
    } catch (err) {
      if (seq === reqSeq.current) setError(err instanceof Error ? err.message : "Failed to load provider breakdown");
    } finally {
      if (seq === reqSeq.current) setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, sprintId, token]);

  useEffect(() => {
    fetchProviders();
  }, [fetchProviders]);

  return { providers, loading, error, refresh: fetchProviders };
}

/** Friendly label for a raw provider id. */
export function providerLabel(provider: string): string {
  switch (provider) {
    case "anthropic":
      return "Anthropic";
    case "openai":
      return "OpenAI";
    case "bedrock":
      return "AWS Bedrock";
    case "vertex":
      return "GCP Vertex";
    case "google":
      return "Google";
    case "azure":
      return "Azure OpenAI";
    case "unknown":
      return "Unattributed";
    default:
      return provider;
  }
}
