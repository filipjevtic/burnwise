# Integrations

<p align="center">
  <img src="../assets/logo-icon.png" alt="Burnwise" width="120">
</p>

Copy-paste setup for binding AI agent work to tickets. Every path resolves the
ticket by the same precedence: **explicit ticket > git branch (`[A-Z]+-\d+`) >
prompt / metadata extraction.**

## Prerequisites

1. Complete the first-run setup wizard and create a project.
2. Generate a **personal API key** in **Settings → API Keys**. Copy the secret
   (`bw_sk_...`) once — it is not shown again.
3. Note your **project id** (visible in the dashboard URL / project selector).

Common environment variables used by the CLI, MCP, and IDE collectors:

```bash
export ATS_SERVER_URL=http://localhost:3000   # Burnwise server
export ATS_API_KEY=bw_sk_...                  # personal API key (preferred)
export ATS_PROJECT_ID=...                     # your project id
# Optional fallback if you have no personal key (shared, less precise):
# export ATS_INGEST_API_KEY=dev-key
```

## CLI (`apps/cli`)

Wrap any command so its wall-clock time and git context are attributed to the
active ticket and you.

```bash
# Start a session bound to a ticket (stored locally until you stop/switch)
ats start PROJ-123

# Run your agent or any command, attributed to the session
ats -- claude code "refactor the login flow"
ats --activity-type debugging -- npm test

# Inspect or end the session
ats status
ats stop
```

Useful flags and env:

- `ats start <TICKET> [--project <id>]` — begin a session.
- `--ticket-id <id>` — override the ticket for a single run.
- `--activity-type <coding|review|planning|debugging|other>` — default `other`.
- `ATS_TICKET_ID` — default ticket if no session is active.

## API proxy (`apps/proxy`)

Point any OpenAI-compatible **or** Anthropic client at the proxy. It forwards to
your upstream provider, captures token usage (including streamed `stream: true`
responses), and strips the Burnwise headers before they reach the provider.

The proxy speaks both wire formats and auto-detects which one a request uses —
from the path (`/v1/chat/completions` vs `/v1/messages`), the model name, or the
auth header — so a single proxy can front OpenAI, Anthropic, and any
OpenAI-compatible tool (Cursor, Aider, Continue, Cody). `PROVIDER` is the
fallback used only when detection is ambiguous.

### OpenAI-compatible clients (Cursor, Aider, Continue, …)

```bash
# Configure the proxy (server-side env)
export SERVER_URL=http://localhost:3000
export UPSTREAM_URL=https://api.openai.com
export PROVIDER=openai   # fallback when auto-detection is ambiguous

# Point your client at the proxy and tag the request
export OPENAI_BASE_URL=http://localhost:4000/v1
curl $OPENAI_BASE_URL/chat/completions \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -H "X-Burnwise-Key: bw_sk_..." \
  -H "X-Burnwise-Ticket: PROJ-123" \
  -d '{"model":"gpt-4o","messages":[{"role":"user","content":"hi"}]}'
```

### Anthropic clients (Claude Code, Claude SDK, Cody/Continue on Anthropic)

Set `UPSTREAM_URL` to the Anthropic API and point the client's base URL at the
proxy. Claude Code honours `ANTHROPIC_BASE_URL`:

```bash
# Configure the proxy (server-side env)
export UPSTREAM_URL=https://api.anthropic.com
export PROVIDER=anthropic   # fallback; /v1/messages is auto-detected anyway

# Route Claude Code through the proxy
export ANTHROPIC_BASE_URL=http://localhost:4000

# …or call the Messages API directly
curl http://localhost:4000/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "X-Burnwise-Key: bw_sk_..." \
  -H "X-Burnwise-Ticket: PROJ-123" \
  -d '{"model":"claude-opus-4-8","max_tokens":256,"messages":[{"role":"user","content":"hi"}]}'
```

Streamed responses are piped straight back to the client (no buffering); usage
and cost are captured once the stream completes. Anthropic prompt tokens include
cache read/creation tokens so totals reflect everything the request consumed.

Attribution headers (all optional except the key for auth):

| Header | Purpose |
|--------|---------|
| `X-Burnwise-Key` | Personal API key (`bw_sk_...`) for ingest auth |
| `X-Burnwise-Ticket` | Ticket key, e.g. `PROJ-123` |
| `X-Burnwise-Session` | Session id to group related requests |
| `X-Burnwise-User` | User id override (usually derived from the key) |
| `X-Burnwise-Project` | Project id override |
| `X-Burnwise-Property-*` | Arbitrary custom properties stored on metadata |

Headers are case-insensitive and are stripped before forwarding upstream, so
they never leak to your LLM provider.

## MCP server (`apps/mcp`) — Claude Code & MCP clients

Register the Burnwise MCP server with your client (Claude Code, etc.). It
exposes tools to bind the active ticket and emit activity.

```json
{
  "mcpServers": {
    "burnwise": {
      "command": "npx",
      "args": ["tsx", "apps/mcp/src/index.ts"],
      "env": {
        "ATS_SERVER_URL": "http://localhost:3000",
        "ATS_API_KEY": "bw_sk_...",
        "ATS_PROJECT_ID": "your-project-id"
      }
    }
  }
}
```

Tools:

- `set_ticket { ticketId }` — bind the current ticket and open a server-side
  session; all subsequent activity rolls up to it.
- `get_ticket` — return the current ticket.
- `emit_session_activity { activityType, durationSeconds, ticketId? }` — record
  agent activity.
- `report_usage { model, promptTokens, completionTokens, totalTokens, costUsd?, reporting?, ticketId? }` —
  report LLM token usage to track AI cost when the proxy can't intercept calls
  (e.g. Claude Code, Vertex AI, Bedrock). Numbers are treated as **cumulative
  session totals** by default: only the increase since your last report is
  attributed to the current ticket. Pass `reporting: "incremental"` if you are
  instead reporting a standalone per-task chunk.

A typical agent flow: call `set_ticket PROJ-123` at task start, report usage as
you work (each call attributes the new tokens since the last one), then
`set_ticket PROJ-456` when you switch tasks — subsequent usage rolls up to the
new ticket automatically. If routing model calls through the proxy, token
capture is automatic and `report_usage` is not needed.

> **Multi-task attribution (#149):** because `report_usage` attributes only the
> **delta** since your last cumulative report, switching tickets mid-session
> attributes tokens correctly — the tokens used before a `set_ticket` switch stay
> with the previous ticket. (Previously all reported tokens landed on the last
> ticket; report often for the sharpest per-ticket breakdown.)

### Zero-context reporting via a Claude Code hook (recommended)

The MCP tools sit in the agent's context all session and each `report_usage`
call spends round-trip tokens — reporting usage shouldn't itself cost meaningful
AI usage (#209). The **hook** reports usage **out of band**: Claude Code runs it
on the `Stop` event, it reads the session transcript and posts token usage to the
ingest API directly, so reporting consumes **zero model context**. Build the MCP
package (`npm run build --workspace=apps/mcp`), then add to your Claude Code
settings:

```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          { "type": "command", "command": "node /path/to/burnwise/apps/mcp/dist/hook-cli.js" }
        ]
      }
    ]
  },
  "env": {
    "ATS_SERVER_URL": "http://localhost:3000",
    "ATS_API_KEY": "bw_sk_...",
    "ATS_PROJECT_ID": "your-project-id"
  }
}
```

The hook is silent and non-blocking (it never disrupts the agent), delta-tracks
per session so repeated fires don't double-count, and resolves the ticket from
`$BURNWISE_TICKET`, a `.burnwise-ticket` file in the repo, or the git branch
(`[A-Z]+-\d+`). Cost is backfilled server-side from the price table. With the
hook enabled you don't need `report_usage`; keep the MCP server for `set_ticket`
and feedback, or omit it entirely.

## VS Code extension (`apps/vscode`)

Install the extension and set the active ticket via the command palette
(**Burnwise: Set Ticket**). It binds the active ticket and emits coding activity
(time, branch, commit); route the model through the proxy to also capture
tokens. IDE activity and tokens both attribute to the same ticket.

## OpenTelemetry traces (OTLP/HTTP)

Point any OpenTelemetry exporter that emits GenAI spans (OpenLLMetry/Traceloop,
the OpenAI/Anthropic OTel instrumentations, Vercel AI SDK telemetry, etc.) at
Burnwise — no vendor-specific SDK required.

```
# OTLP/HTTP traces endpoint
OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=https://<your-burnwise>/api/v1/otel/v1/traces
OTEL_EXPORTER_OTLP_TRACES_HEADERS=Authorization=Bearer bw_sk_...   # project-scoped key
```

Spans carrying GenAI semantic-convention attributes (`gen_ai.system` /
`gen_ai.provider.name`, `gen_ai.request.model` / `gen_ai.response.model`,
`gen_ai.usage.input_tokens` / `output_tokens`) become `llm.response` events and
flow into the by-tool, by-provider, and cost analytics (source: `otel`); other
spans are stored as `trace.span` events. Cost is backfilled from the central
price table when the span doesn't carry one.

A **project-scoped** API key is required (OTLP payloads carry no Burnwise
identity — the key supplies workspace/project/user). To attribute a trace to a
ticket or session, set a `burnwise.ticket` (issue key) and/or
`burnwise.session_id` span attribute; ticket keys found anywhere in span
attributes are also matched automatically.

## Cloud-hosted LLMs (AWS Bedrock, GCP Vertex AI)

LLM calls made directly to Bedrock or Vertex can't be routed through the proxy,
but both clouds log every invocation — with token counts — to their native log
systems. Forward those logs to the cloud-log ingest endpoint and each recognized
record becomes an `llm.response` event, flowing into the same by-provider /
by-tool / cost analytics as proxied traffic.

```
# Cloud-log ingest endpoint (project-scoped API key required)
POST https://<your-burnwise>/api/v1/cloud/logs
Authorization: Bearer bw_sk_...
Content-Type: application/json

{ "entries": [ <raw log record>, ... ] }
```

The mapper recognizes three record shapes automatically:

- **AWS Bedrock** model-invocation logs — `{ modelId, input.inputTokenCount,
  output.outputTokenCount }`. Enable *model invocation logging* on Bedrock
  (CloudWatch or S3) and forward records via a subscription filter / Lambda.
- **GCP Vertex AI** Cloud Logging entries — model from `resource.labels.model_id`,
  usage from `jsonPayload.usageMetadata` (Gemini) or `jsonPayload.usage` (Claude
  on Vertex). Create a log sink filtered to `aiplatform.googleapis.com` that
  POSTs to the endpoint (e.g. Pub/Sub → Cloud Function).
- **Pre-normalized** — `{ provider, model, promptTokens, completionTokens,
  timestamp }` for a custom exporter that already parsed the log.

Records that aren't recognized, or that carry no token counts, are **skipped**
(reported in the response `{ accepted, rejected, skipped }`) rather than
rejecting the batch, so a mixed log export ingests cleanly. Ingestion is
idempotent by event id, so re-delivery is safe. Cost is backfilled from the
provider-aware price table (Bedrock/Vertex rates), so no cost field is required.

A **project-scoped** API key is required (log records carry no Burnwise identity
— the key supplies workspace/project/user). To attribute usage to a ticket or
session, add a `burnwise.ticket` and/or `burnwise.session_id` label: on Bedrock
via `InvokeModel` `requestMetadata`, on Vertex via the log entry `labels`.

## CI/CD cost webhooks

Send build cost/duration to Burnwise from your pipeline. Sign requests with
GitHub HMAC (`X-Hub-Signature-256`), a GitLab token (`X-Gitlab-Token`), or a
generic bearer (`Authorization: Bearer` / `X-Burnwise-Webhook-Token`). CI runs
roll up into per-sprint cost and efficiency. GitHub cost is estimated by the
actual runner OS (Linux/Windows/macOS) from the payload; generic payloads may
set `runner`.

**Per-project secrets (recommended, #183).** Rather than one global secret for
every project, give each project its own — a leak then can't forge events into
another project. Project admins set it via the API (a Settings UI is planned):

```bash
# Set the secret and pin the provider (verification is then restricted to it).
curl -X PUT $ATS_SERVER_URL/api/v1/ci/config/<projectId> \
  -H "Authorization: Bearer <admin-jwt>" -H 'Content-Type: application/json' \
  -d '{"secret":"<random-secret>","provider":"github"}'

# Inspect (never returns the secret); clear with {"secret":null,"provider":null}.
curl $ATS_SERVER_URL/api/v1/ci/config/<projectId> -H "Authorization: Bearer <admin-jwt>"
```

The secret is encrypted at rest. Pinning a `provider` means only that method is
accepted, so a caller can't downgrade to a weaker one by sending a different
header. The global `CI_WEBHOOK_SECRET` remains a fallback for projects without
their own; when neither is set, webhooks are rejected in production and skipped
(with a warning) in development. See
[SELFHOST.md](SELFHOST.md#secrets-at-rest) for secret configuration.

## Choosing an auth method

- **Personal API key (`bw_sk_...`)** — preferred. Events bind to the real
  developer and workspace server-side, so per-developer velocity and capacity
  are accurate.
- **Shared `INGEST_API_KEY`** — fallback for CI or bootstrapping; the client
  must supply `userId`, so attribution is less precise.
