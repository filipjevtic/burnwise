/**
 * Claude Code hook entry point for zero-context usage reporting (#209).
 *
 * Wire it into Claude Code's Stop hook (see docs/INTEGRATIONS.md). On each fire
 * it reads the hook payload from stdin, sums the session transcript's token
 * usage per model, computes the delta since its last run (per-session state
 * file), and posts the new usage to the Burnwise ingest API — all out of band,
 * so the agent's context is never touched.
 *
 * It is deliberately silent and non-fatal: any error (unreachable server, no
 * key, malformed input) exits 0 without disrupting the agent. Config comes from
 * the same ATS_* env vars the MCP server and CLI use.
 */

import { readFileSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { config } from "./config.js";
import {
  parseTranscriptUsage,
  computeUsageDeltas,
  resolveTicket,
  branchFromGitHead,
  type Baseline,
} from "./hook-usage.js";

interface HookPayload {
  session_id?: string;
  transcript_path?: string;
  cwd?: string;
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

function stateDir(): string {
  return process.env.BURNWISE_HOOK_STATE_DIR || join(homedir(), ".burnwise", "hook-state");
}

function loadBaseline(sessionId: string): Baseline {
  try {
    return JSON.parse(readFileSync(join(stateDir(), `${sessionId}.json`), "utf8")) as Baseline;
  } catch {
    return {};
  }
}

function saveBaseline(sessionId: string, baseline: Baseline): void {
  try {
    const dir = stateDir();
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `${sessionId}.json`), JSON.stringify(baseline));
  } catch {
    // Best-effort: if state can't be persisted we simply re-report next time.
  }
}

/** Find the ticket from env, a .burnwise-ticket file, or the git branch at cwd. */
function findTicket(cwd: string | undefined): string | undefined {
  const dir = cwd || process.cwd();
  let fileTicket: string | undefined;
  try {
    fileTicket = readFileSync(join(dir, ".burnwise-ticket"), "utf8");
  } catch {
    /* none */
  }
  let branch: string | undefined;
  try {
    branch = branchFromGitHead(readFileSync(join(dir, ".git", "HEAD"), "utf8"));
  } catch {
    /* not a git repo / detached */
  }
  return resolveTicket({
    envTicket: process.env.BURNWISE_TICKET || process.env.ATS_TICKET_ID,
    fileTicket,
    branch,
  });
}

async function main(): Promise<void> {
  const raw = await readStdin();
  let payload: HookPayload = {};
  try {
    payload = JSON.parse(raw) as HookPayload;
  } catch {
    return; // No usable hook payload.
  }

  const sessionId = payload.session_id;
  const transcriptPath = payload.transcript_path;
  if (!sessionId || !transcriptPath || !existsSync(transcriptPath)) return;

  const usage = parseTranscriptUsage(readFileSync(transcriptPath, "utf8"));
  if (usage.size === 0) return;

  const { deltas, nextBaseline } = computeUsageDeltas(usage, loadBaseline(sessionId));
  if (deltas.size === 0) return; // Nothing new since the last fire.

  const ticketId = findTicket(payload.cwd);
  const now = new Date().toISOString();

  // One llm.response event per model that saw new usage. Cost is left unset and
  // backfilled from the provider-aware price table by the ingest path.
  const events = [...deltas.entries()].map(([model, u]) => ({
    eventId: crypto.randomUUID(),
    eventType: "llm.response" as const,
    timestamp: now,
    source: "cli" as const,
    workspaceId: config.workspaceId,
    projectId: config.projectId,
    userId: config.userId,
    ticketId,
    metadata: { via: "claude-code-hook", sessionId },
    payload: {
      provider: "anthropic",
      model,
      promptTokens: u.promptTokens,
      completionTokens: u.completionTokens,
      totalTokens: u.totalTokens,
    },
  }));

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(`${config.serverUrl}/api/v1/events/ingest`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify({ events }),
      signal: controller.signal,
    });
    // Only advance the baseline once the server has accepted the usage, so a
    // failed post is retried (not silently dropped) on the next fire.
    if (res.ok) saveBaseline(sessionId, nextBaseline);
  } catch {
    // Network error / timeout: leave the baseline so we retry next fire.
  } finally {
    clearTimeout(timeout);
  }
}

// Never let a hook error disrupt the agent.
main().catch(() => {}).finally(() => process.exit(0));
