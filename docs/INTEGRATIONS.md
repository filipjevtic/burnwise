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

Point any OpenAI-compatible client at the proxy. It forwards to your upstream
provider, captures token usage, and strips the Burnwise headers before they
reach the provider.

```bash
# Configure the proxy (server-side env)
export SERVER_URL=http://localhost:3000
export UPSTREAM_URL=https://api.openai.com
export PROVIDER=openai

# Point your client at the proxy and tag the request
export OPENAI_BASE_URL=http://localhost:4000/v1
curl $OPENAI_BASE_URL/chat/completions \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -H "X-Burnwise-Key: bw_sk_..." \
  -H "X-Burnwise-Ticket: PROJ-123" \
  -d '{"model":"gpt-4o","messages":[{"role":"user","content":"hi"}]}'
```

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
- `report_usage { model, promptTokens, completionTokens, totalTokens, costUsd?, ticketId? }` — 
  report LLM token usage for the current session. Call after completing a task
  to track AI cost when the proxy can't intercept calls (e.g. Claude Code,
  Vertex AI, Bedrock).

A typical agent flow: call `set_ticket PROJ-123` at task start, work on the
task, then call `report_usage` with token counts to track AI cost. If routing
model calls through the proxy, token capture is automatic and `report_usage`
is not needed.

## VS Code extension (`apps/vscode`)

Install the extension and set the active ticket via the command palette
(**Burnwise: Set Ticket**). It binds the active ticket and emits coding activity
(time, branch, commit); route the model through the proxy to also capture
tokens. IDE activity and tokens both attribute to the same ticket.

## CI/CD cost webhooks

Send build cost/duration to Burnwise from your pipeline. Configure
`CI_WEBHOOK_SECRET` on the server and sign requests (GitHub HMAC, GitLab token,
or generic bearer). CI runs roll up into per-sprint cost and efficiency. See
[SELFHOST.md](SELFHOST.md#secrets-at-rest) for secret configuration.

## Choosing an auth method

- **Personal API key (`bw_sk_...`)** — preferred. Events bind to the real
  developer and workspace server-side, so per-developer velocity and capacity
  are accurate.
- **Shared `INGEST_API_KEY`** — fallback for CI or bootstrapping; the client
  must supply `userId`, so attribution is less precise.
