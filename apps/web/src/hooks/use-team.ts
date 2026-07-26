import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../context/auth.js";

import { API_URL } from "../lib/api-url.js";

export type TeamRole = "owner" | "admin" | "member" | "viewer";

export interface TeamMember {
  id: string;
  userId: string;
  email: string;
  displayName: string | null;
  role: TeamRole;
  createdAt: string;
}

interface UseTeamResult {
  members: TeamMember[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
  addMember: (input: { email: string; displayName?: string; role: TeamRole }) => Promise<void>;
  updateMember: (userId: string, role: TeamRole) => Promise<void>;
  removeMember: (userId: string) => Promise<void>;
}

export function useTeam(projectId: string): UseTeamResult {
  const { token } = useAuth();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const authHeaders: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

  const fetchMembers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/v1/team/${projectId}`, {
        headers: authHeaders,
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setMembers(data.members || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load team members");
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, token]);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers, refreshKey]);

  async function addMember(input: { email: string; displayName?: string; role: TeamRole }) {
    const res = await fetch(`${API_URL}/api/v1/team/${projectId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders },
      body: JSON.stringify(input),
    });
    if (!res.ok) throw new Error(await res.text());
    setRefreshKey((n) => n + 1);
  }

  async function updateMember(userId: string, role: TeamRole) {
    const res = await fetch(`${API_URL}/api/v1/team/${projectId}/${userId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...authHeaders },
      body: JSON.stringify({ role }),
    });
    if (!res.ok) throw new Error(await res.text());
    setMembers((prev) =>
      prev.map((m) => (m.userId === userId ? { ...m, role } : m))
    );
    setRefreshKey((n) => n + 1);
  }

  async function removeMember(userId: string) {
    const res = await fetch(`${API_URL}/api/v1/team/${projectId}/${userId}`, {
      method: "DELETE",
      headers: authHeaders,
    });
    if (!res.ok) throw new Error(await res.text());
    setMembers((prev) => prev.filter((m) => m.userId !== userId));
    setRefreshKey((n) => n + 1);
  }

  return {
    members,
    loading,
    error,
    refresh: () => setRefreshKey((n) => n + 1),
    addMember,
    updateMember,
    removeMember,
  };
}
