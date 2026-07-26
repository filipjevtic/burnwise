import { useEffect, useState, useCallback } from "react";
import { useAuth } from "../context/auth.js";

import { API_URL } from "../lib/api-url.js";

export interface Project {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
}

export function useProjects() {
  const { token } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProjects = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/v1/projects`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setProjects(data.projects || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load projects");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const createProject = useCallback(async (name: string): Promise<Project> => {
    const res = await fetch(`${API_URL}/api/v1/projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Failed to create project");
    }
    const project = await res.json();
    setProjects((prev) => [...prev, project]);
    return project;
  }, [token]);

  return { projects, loading, error, createProject, refetch: fetchProjects };
}
