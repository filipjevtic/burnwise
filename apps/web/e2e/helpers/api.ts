const API_URL = "http://localhost:3000";
const E2E_EMAIL = "e2e@test.com";
const E2E_PASSWORD = "e2epassword";

async function json<T>(res: Response): Promise<T> {
  if (res.status === 429) {
    await new Promise((r) => setTimeout(r, 2000));
    throw new Error("Rate limited — retry");
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${res.statusText}: ${text}`);
  }
  return res.json() as Promise<T>;
}

async function withRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i === retries - 1) throw err;
      await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
    }
  }
  throw new Error("unreachable");
}

export async function getToken(): Promise<string> {
  return withRetry(async () => {
    const res = await fetch(`${API_URL}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: E2E_EMAIL, password: E2E_PASSWORD }),
    });
    const { token } = await json<{ token: string }>(res);
    return token;
  });
}

export async function createApiKey(
  token: string,
  opts?: { note?: string; scope?: string; projectId?: string }
): Promise<{ id: string; publicKey: string; secretKey: string }> {
  const res = await fetch(`${API_URL}/api/v1/keys`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(opts ?? {}),
  });
  const body = await json<{ id: string; publicKey: string; secret: string }>(res);
  return { id: body.id, publicKey: body.publicKey, secretKey: body.secret };
}

export async function ingestEvents(
  apiKey: string,
  events: Array<Record<string, unknown>>
): Promise<{ accepted: number; rejected: number }> {
  const res = await fetch(`${API_URL}/api/v1/events/ingest`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ events }),
  });
  return json<{ accepted: number; rejected: number }>(res);
}

export async function startSession(
  apiKey: string,
  opts: { projectId: string; ticketKey?: string; source?: string; branch?: string }
): Promise<Record<string, unknown>> {
  const res = await fetch(`${API_URL}/api/v1/sessions/start`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(opts),
  });
  return json<Record<string, unknown>>(res);
}

export async function endSession(
  apiKey: string,
  sessionId: string
): Promise<Record<string, unknown>> {
  const res = await fetch(`${API_URL}/api/v1/sessions/${sessionId}/end`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  return json<Record<string, unknown>>(res);
}

export async function createProject(
  token: string,
  name: string
): Promise<{ id: string; name: string; slug: string }> {
  const res = await fetch(`${API_URL}/api/v1/projects`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ name }),
  });
  return json<{ id: string; name: string; slug: string }>(res);
}

export async function getProviders(): Promise<{
  github: boolean;
  google: boolean;
  gitlab: boolean;
  oidc: { enabled: boolean; name: string };
}> {
  const res = await fetch(`${API_URL}/api/v1/auth/providers`);
  return json<{
    github: boolean;
    google: boolean;
    gitlab: boolean;
    oidc: { enabled: boolean; name: string };
  }>(res);
}

export async function createInvite(
  token: string,
  projectId: string,
  opts?: { role?: string; email?: string }
): Promise<{ token: string; link: string }> {
  const res = await fetch(`${API_URL}/api/v1/invites`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ projectId, ...opts }),
  });
  const body = await json<{ invite: { token: string }; link: string }>(res);
  return { token: body.invite.token, link: body.link };
}

export async function listProjects(
  token: string
): Promise<Array<{ id: string; name: string; slug: string }>> {
  const res = await fetch(`${API_URL}/api/v1/projects`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const { projects } = await json<{
    projects: Array<{ id: string; name: string; slug: string }>;
  }>(res);
  return projects;
}
