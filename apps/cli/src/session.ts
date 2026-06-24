import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { config } from "./config.js";

/**
 * Local active-session state, stored per working directory at
 * `.burnwise/session.json`. This lets `ats -- <cmd>` and other collectors
 * stamp the active session/ticket without re-specifying it each time.
 */

export interface LocalSession {
  sessionId: string;
  ticketKey?: string;
  projectId?: string;
  startedAt: string;
}

const DIR = ".burnwise";
const FILE = "session.json";

function sessionPath(cwd = process.cwd()): string {
  return join(cwd, DIR, FILE);
}

export function readLocalSession(cwd = process.cwd()): LocalSession | null {
  const path = sessionPath(cwd);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as LocalSession;
  } catch {
    return null;
  }
}

export function writeLocalSession(session: LocalSession, cwd = process.cwd()): void {
  const dir = join(cwd, DIR);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(sessionPath(cwd), JSON.stringify(session, null, 2));
}

export function clearLocalSession(cwd = process.cwd()): void {
  const path = sessionPath(cwd);
  if (existsSync(path)) rmSync(path);
}

interface ServerSession {
  id: string;
  ticketKey: string | null;
  projectId: string;
}

/** Start a session on the server and persist it locally. */
export async function startSession(opts: {
  ticketKey?: string;
  projectId?: string;
  branch?: string;
}): Promise<LocalSession> {
  const res = await fetch(`${config.serverUrl}/api/v1/sessions/start`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      ticketKey: opts.ticketKey,
      projectId: opts.projectId || config.projectId,
      source: "cli",
      branch: opts.branch,
    }),
  });
  if (!res.ok) {
    throw new Error(`Failed to start session: ${res.status} ${await res.text()}`);
  }
  const server = (await res.json()) as ServerSession;
  const local: LocalSession = {
    sessionId: server.id,
    ticketKey: server.ticketKey ?? opts.ticketKey,
    projectId: server.projectId,
    startedAt: new Date().toISOString(),
  };
  writeLocalSession(local);
  return local;
}

/** End the active local session on the server and clear local state. */
export async function stopSession(): Promise<boolean> {
  const local = readLocalSession();
  if (!local) return false;
  try {
    await fetch(`${config.serverUrl}/api/v1/sessions/${local.sessionId}/end`, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.apiKey}` },
    });
  } finally {
    clearLocalSession();
  }
  return true;
}
