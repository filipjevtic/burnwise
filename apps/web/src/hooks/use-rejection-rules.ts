import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../context/auth.js";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

export interface RejectionRule {
  id: string;
  field: string;
  value: string;
  createdAt: string;
}

/** Manage auto-reject rules for a project's unresolved queue (#24 follow-up). */
export function useRejectionRules(projectId: string) {
  const { token } = useAuth();
  const [rules, setRules] = useState<RejectionRule[]>([]);
  const [error, setError] = useState<string | null>(null);
  const authHeaders: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

  const refresh = useCallback(async () => {
    if (!projectId) return;
    try {
      const res = await fetch(`${API_URL}/api/v1/events/rejection-rules?projectId=${projectId}`, { headers: authHeaders });
      if (!res.ok) throw new Error(await res.text());
      setRules((await res.json()).rules ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load rejection rules");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, token]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const addRule = useCallback(
    async (field: string, value: string) => {
      setError(null);
      const res = await fetch(`${API_URL}/api/v1/events/rejection-rules`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ projectId, field, value }),
      });
      if (!res.ok) {
        setError(await res.text());
        return false;
      }
      await refresh();
      return true;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [projectId, token, refresh]
  );

  const deleteRule = useCallback(
    async (id: string) => {
      const res = await fetch(`${API_URL}/api/v1/events/rejection-rules/${id}`, { method: "DELETE", headers: authHeaders });
      if (res.ok) setRules((prev) => prev.filter((r) => r.id !== id));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [token]
  );

  return { rules, error, addRule, deleteRule, refresh };
}
