import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../context/auth.js";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

export interface Workspace {
  id: string;
  name: string;
  showDeveloperAttribution: boolean;
}

/** Workspace-level settings (capacity-not-surveillance guardrail, #199). */
export function useWorkspace() {
  const { token } = useAuth();
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const authHeaders: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

  const fetchWorkspace = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/v1/workspace`, { headers: authHeaders });
      if (!res.ok) throw new Error(await res.text());
      setWorkspace(await res.json());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load workspace");
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const update = useCallback(async (patch: { showDeveloperAttribution: boolean }) => {
    const res = await fetch(`${API_URL}/api/v1/workspace`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...authHeaders },
      body: JSON.stringify(patch),
    });
    if (!res.ok) throw new Error(await res.text());
    setWorkspace(await res.json());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    fetchWorkspace();
  }, [fetchWorkspace]);

  return { workspace, loading, error, update, refresh: fetchWorkspace };
}
