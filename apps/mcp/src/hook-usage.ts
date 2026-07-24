/**
 * Pure helpers for the out-of-band usage hook (#209).
 *
 * Reporting AI usage should not itself cost the agent's context/token budget.
 * The MCP tools sit in context all session (tool-definition bloat) and each call
 * spends round-trip tokens. A Claude Code hook, by contrast, runs out of band:
 * it reads the session transcript and posts usage to the ingest API directly, so
 * reporting consumes zero model context.
 *
 * This module holds the context-free, unit-testable core: summing transcript
 * usage per model, computing the delta since the last report, and resolving a
 * ticket key. The I/O (stdin, files, fetch) lives in hook-cli.ts.
 */

export interface ModelUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

function num(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/**
 * Sum token usage per model from a Claude Code transcript (JSONL text). Each
 * assistant turn carries `message.usage`; prompt tokens include cache read/
 * creation so totals reflect everything the request consumed. Malformed or
 * non-assistant lines are skipped. Returns cumulative session totals per model.
 */
export function parseTranscriptUsage(jsonl: string): Map<string, ModelUsage> {
  const out = new Map<string, ModelUsage>();
  for (const line of jsonl.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let obj: Record<string, unknown>;
    try {
      obj = JSON.parse(trimmed) as Record<string, unknown>;
    } catch {
      continue;
    }
    if (obj.type !== "assistant") continue;
    const message = obj.message as Record<string, unknown> | undefined;
    const usage = message?.usage as Record<string, unknown> | undefined;
    if (!usage) continue;

    const model = typeof message?.model === "string" ? (message.model as string) : "unknown";
    const prompt =
      num(usage.input_tokens) + num(usage.cache_read_input_tokens) + num(usage.cache_creation_input_tokens);
    const completion = num(usage.output_tokens);

    const cur = out.get(model) ?? { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
    cur.promptTokens += prompt;
    cur.completionTokens += completion;
    cur.totalTokens += prompt + completion;
    out.set(model, cur);
  }
  return out;
}

export type Baseline = Record<string, ModelUsage>;

/**
 * Given cumulative per-model usage and the baseline saved from the last report,
 * return only the positive deltas to emit plus the new baseline. Delta tracking
 * makes the hook idempotent across repeated fires (e.g. every Stop): re-running
 * with no new turns emits nothing.
 */
export function computeUsageDeltas(
  current: Map<string, ModelUsage>,
  baseline: Baseline
): { deltas: Map<string, ModelUsage>; nextBaseline: Baseline } {
  const deltas = new Map<string, ModelUsage>();
  const nextBaseline: Baseline = { ...baseline };

  for (const [model, cur] of current) {
    const base = baseline[model] ?? { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
    const delta: ModelUsage = {
      promptTokens: Math.max(0, cur.promptTokens - base.promptTokens),
      completionTokens: Math.max(0, cur.completionTokens - base.completionTokens),
      totalTokens: Math.max(0, cur.totalTokens - base.totalTokens),
    };
    if (delta.totalTokens > 0) deltas.set(model, delta);
    nextBaseline[model] = cur;
  }

  return { deltas, nextBaseline };
}

const TICKET_PATTERN = /[A-Z][A-Z0-9]+-\d+/;

/**
 * Resolve a ticket key, most explicit first: an env override, then a
 * `.burnwise-ticket` file's contents, then the current git branch name (e.g.
 * `feature/PROJ-123-x` -> `PROJ-123`). Returns undefined when nothing matches.
 */
export function resolveTicket(opts: { envTicket?: string; fileTicket?: string; branch?: string }): string | undefined {
  const explicit = clean(opts.envTicket) ?? clean(opts.fileTicket);
  if (explicit) return explicit;
  if (opts.branch) {
    const match = opts.branch.match(TICKET_PATTERN);
    if (match) return match[0];
  }
  return undefined;
}

function clean(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/** Parse a branch name out of the contents of a `.git/HEAD` file. */
export function branchFromGitHead(headContents: string): string | undefined {
  const match = headContents.trim().match(/^ref:\s*refs\/heads\/(.+)$/);
  return match ? match[1] : undefined;
}
