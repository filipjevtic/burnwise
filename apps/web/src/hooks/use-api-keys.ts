import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../context/auth.js";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

export interface ApiKey {
  id: string;
  publicKey: string;
  displaySecretKey: string;
  note: string | null;
  scope: string;
  projectId: string | null;
  isActive: boolean;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

export interface CreatedApiKey extends ApiKey {
  /** The full secret, returned exactly once at creation time. */
  secret: string;
}

interface CreateKeyInput {
  note?: string;
  scope?: "workspace" | "project";
  projectId?: string;
}

interface UseApiKeysResult {
  keys: ApiKey[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
  createKey: (input: CreateKeyInput) => Promise<CreatedApiKey>;
  revokeKey: (id: string) => Promise<void>;
}

export function useApiKeys(): UseApiKeysResult {
  const { token } = useAuth();
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const authHeaders: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

  const fetchKeys = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/v1/keys`, { headers: authHeaders });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setKeys(data.keys || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load API keys");
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    fetchKeys();
  }, [fetchKeys, refreshKey]);

  async function createKey(input: CreateKeyInput): Promise<CreatedApiKey> {
    const res = await fetch(`${API_URL}/api/v1/keys`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders },
      body: JSON.stringify(input),
    });
    if (!res.ok) throw new Error(await res.text());
    const created = (await res.json()) as CreatedApiKey;
    setRefreshKey((n) => n + 1);
    return created;
  }

  async function revokeKey(id: string) {
    const res = await fetch(`${API_URL}/api/v1/keys/${id}`, {
      method: "DELETE",
      headers: authHeaders,
    });
    if (!res.ok) throw new Error(await res.text());
    setRefreshKey((n) => n + 1);
  }

  return {
    keys,
    loading,
    error,
    refresh: () => setRefreshKey((n) => n + 1),
    createKey,
    revokeKey,
  };
}
