import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "../context/auth.js";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

export interface AuditEntry {
  id: string;
  actorUserId: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export function useAudit(enabled: boolean) {
  const { token } = useAuth();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const reqSeq = useRef(0);

  const fetchAudit = useCallback(async () => {
    if (!enabled || !token) return;
    const seq = ++reqSeq.current;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/v1/audit?limit=100`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(await res.text());
      const body = await res.json();
      if (seq === reqSeq.current) {
        setEntries(body.entries ?? []);
        setTotal(body.pagination?.total ?? 0);
      }
    } catch (err) {
      if (seq === reqSeq.current) setError(err instanceof Error ? err.message : "Failed to load audit log");
    } finally {
      if (seq === reqSeq.current) setLoading(false);
    }
  }, [enabled, token]);

  useEffect(() => {
    fetchAudit();
  }, [fetchAudit]);

  return { entries, total, loading, error, refresh: fetchAudit };
}
