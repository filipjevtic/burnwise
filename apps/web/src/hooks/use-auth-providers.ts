import { useEffect, useState } from "react";
import type { AuthProviders } from "../components/auth/SSOButtons.js";

import { API_URL } from "../lib/api-url.js";

export function useAuthProviders() {
  const [providers, setProviders] = useState<AuthProviders | null>(null);

  useEffect(() => {
    fetch(`${API_URL}/api/v1/auth/providers`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => { if (data) setProviders(data); })
      .catch(() => {});
  }, []);

  return providers;
}
