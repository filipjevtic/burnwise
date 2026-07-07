import { useEffect, useState, useRef } from "react";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

export interface CISummary {
  projectId: string;
  runCount: number;
  totalCost: number;
  totalDurationSeconds: number;
}

export function useCISummary(projectId: string): {
  summary: CISummary | null;
  loading: boolean;
  error: string | null;
} {
  const [summary, setSummary] = useState<CISummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const reqSeq = useRef(0);

  useEffect(() => {
    const seq = ++reqSeq.current;
    setLoading(true);
    setError(null);
    fetch(`${API_URL}/api/v1/ci/summary/${projectId}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(await res.text());
        return res.json();
      })
      .then((data) => {
        if (seq === reqSeq.current) setSummary(data);
      })
      .catch((err) => {
        if (seq === reqSeq.current) setError(err.message);
      })
      .finally(() => {
        if (seq === reqSeq.current) setLoading(false);
      });
  }, [projectId]);

  return { summary, loading, error };
}
