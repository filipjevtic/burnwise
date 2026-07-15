import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "../context/auth.js";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

export interface ToolStat {
  source: string;
  tokens: number;
  cost: number;
  durationSeconds: number;
  eventCount: number;
  sessionCount: number;
}

/** Per-tool (collection source) usage breakdown for a project/sprint. */
export function useToolBreakdown(projectId: string, sprintId: string | null) {
  const { token } = useAuth();
  const [tools, setTools] = useState<ToolStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const reqSeq = useRef(0);

  const authHeaders: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

  const fetchTools = useCallback(async () => {
    if (!projectId) return;
    const seq = ++reqSeq.current;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ projectId });
      if (sprintId) params.set("sprintId", sprintId);
      const res = await fetch(`${API_URL}/api/v1/analytics/by-source?${params}`, { headers: authHeaders });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      if (seq === reqSeq.current) setTools(data.sources || []);
    } catch (err) {
      if (seq === reqSeq.current) setError(err instanceof Error ? err.message : "Failed to load tool breakdown");
    } finally {
      if (seq === reqSeq.current) setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, sprintId, token]);

  useEffect(() => {
    fetchTools();
  }, [fetchTools]);

  return { tools, loading, error, refresh: fetchTools };
}

/** Friendly label + short hint for a raw event source. */
export function toolLabel(source: string): { name: string; hint: string } {
  switch (source) {
    case "proxy":
      return { name: "Proxy", hint: "Cursor, Aider, OpenAI-compatible agents" };
    case "cli":
      return { name: "CLI / Claude Code", hint: "CLI wrapper & MCP" };
    case "ide-plugin":
      return { name: "IDE plugin", hint: "VS Code / JetBrains" };
    case "ci":
      return { name: "CI/CD", hint: "Pipeline runs" };
    case "browser":
      return { name: "Browser", hint: "Web collectors" };
    default:
      return { name: source === "unknown" ? "Unattributed" : source, hint: "" };
  }
}
