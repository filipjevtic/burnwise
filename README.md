<p align="center">
  <img src="assets/logo-full.png" alt="Burnwise" width="320">
</p>

# Burnwise

[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)
[![GitHub](https://img.shields.io/badge/GitHub-filipjevtic%2Fburnwise-blue?logo=github)](https://github.com/filipjevtic/burnwise)
[![PR Checks](https://github.com/filipjevtic/burnwise/actions/workflows/pr-checks.yml/badge.svg)](https://github.com/filipjevtic/burnwise/actions/workflows/pr-checks.yml)
[![CodeQL](https://github.com/filipjevtic/burnwise/actions/workflows/codeql.yml/badge.svg)](https://github.com/filipjevtic/burnwise/actions/workflows/codeql.yml)
[![Security](https://github.com/filipjevtic/burnwise/actions/workflows/security.yml/badge.svg)](https://github.com/filipjevtic/burnwise/actions/workflows/security.yml)

**Vendor-neutral engineering intelligence for AI-assisted delivery.** AI coding agents make individual developers faster, but sprint planning is still a guessing game built on pre-AI baselines. Burnwise is a self-hosted, open-source analytics layer that attributes AI-assisted effort — tokens, traces, and coding time — across your **tickets, projects, and developers** in Jira / GitHub / GitLab, so PMs and EMs can calibrate estimates and plan sprints on *actual* effort instead of guesswork. It's tool- and vendor-neutral by design: see the whole picture across Claude Code, Cursor, and any OpenAI-compatible agent in one place. Token and cost budgets come along for the ride — but the headline is **delivery, not spend**.

> A 3-point ticket used to mean two days of work. With an AI agent it might mean two hours and 100k tokens. Burnwise connects those two data points.

## What Burnwise does

- [x] **Measure velocity** — committed vs completed story points, completion rate (estimate accuracy), and a rolling average per sprint.
- [x] **Track efficiency** — AI effort (cost, tokens, agent time) per completed story point, trended over sprints.
- [x] **Recommend sprint capacity** — an anomaly-aware, velocity-based estimate of how many points to commit next sprint.
- [x] **Attribute work to tickets** — explicit ticket ID, session headers, git branch, prompt text, or commit message.
- [x] **Drill into sessions & traces** — per-developer agent sessions with token/cost/time rollups and a timeline.
- [x] **Sync issue trackers** — GitHub Issues, Jira, and GitLab Issues become sprints and tickets.
- [x] **Track budgets and alerts** for tokens, cost, and CI spend per project and sprint.
- [x] **Manage teams and roles** with personal API keys, workspace scoping, and encrypted secrets.
- [x] **SSO with GitHub, Google, GitLab, and any OIDC provider** — or use email/password. Buttons appear only when configured.
- [x] **First-run setup wizard** — no seed data; create your workspace and admin account on first visit.
- [x] **Self-host in one command** with Docker Compose.

## Works with your AI tools

| Tool | Integration | Token tracking |
|------|-------------|----------------|
| **Claude Code** | API proxy (`ANTHROPIC_BASE_URL`) or MCP server | Automatic (proxy) / self-reported (MCP) |
| **Cursor** | API proxy (`OPENAI_BASE_URL`) | Automatic |
| **Aider** | API proxy (`OPENAI_BASE_URL`) | Automatic |
| **Continue.dev** | API proxy (configurable base URL) | Automatic |
| **Cody (Sourcegraph)** | API proxy (configurable base URL) | Automatic |
| **Anthropic API (direct)** | Anthropic-format proxy (`/v1/messages`) | Automatic |
| **OpenAI SDK / custom agents** | API proxy + `X-Burnwise-*` headers | Automatic |
| **Any CLI tool** | CLI wrapper (`ats -- <command>`) | Session activity |

The proxy speaks both the OpenAI (`/v1/chat/completions`) and Anthropic
(`/v1/messages`) wire formats — including streamed responses — and auto-detects
which one each request uses, so one proxy fronts every OpenAI- or
Anthropic-compatible tool.

**Coming soon:**

| Tool | Planned integration |
|------|---------------------|
| **GitHub Copilot** | VS Code extension telemetry |
| **Windsurf / Devin** | VS Code extension telemetry |
| **AWS Bedrock** | Cloud billing integration |
| **GCP Vertex AI** | Cloud Logging integration |

See [docs/INTEGRATIONS.md](docs/INTEGRATIONS.md) for copy-paste setup instructions.

## Quick start

### Docker Compose (recommended)

```bash
# 1. Clone the repo
git clone https://github.com/filipjevtic/burnwise.git
cd burnwise

# 2. Set required environment variables
cp .env.example .env
# Edit .env — at minimum set JWT_SECRET to a random string

# 3. Start everything
docker compose up -d
```

Open http://localhost:8080. On first visit the **setup wizard** walks you through creating your workspace and admin account, then connect an issue tracker on the **Integrations** page to import sprints and tickets.

### Local development

```bash
# Install dependencies
npm install

# Start Postgres
docker compose up -d postgres

# Build shared packages (server and proxy depend on these)
npm run build --workspace=packages/schema --workspace=packages/pricing

# Apply database migrations (server config defaults cover everything
# else, but Prisma CLI needs DATABASE_URL set explicitly)
DATABASE_URL=postgresql://ats:ats@localhost:5432/ats \
  npm run db:migrate --workspace=apps/server

# Start the server, proxy, and web dashboard in separate terminals
npm run dev --workspace=apps/server
npm run dev --workspace=apps/proxy
npm run dev --workspace=apps/web
```

Dashboard: http://localhost:5173 · API: http://localhost:3000 · Proxy: http://localhost:4000

For production deployment, see [docs/SELFHOST.md](docs/SELFHOST.md).

## Connect your AI workflow

After setup, generate a personal API key in **Settings → API Keys** (`bw_sk_...`) and bind your agent work to a ticket. Whatever tool you use, the strongest available signal wins (explicit ticket > git branch > prompt text). See [docs/INTEGRATIONS.md](docs/INTEGRATIONS.md) for copy-paste setup.

```bash
# MCP — Claude Code calls set_ticket and report_usage automatically
# Add to your Claude Code MCP config:
# { "command": "npx", "args": ["tsx", "apps/mcp/src/index.ts"],
#   "env": { "ATS_API_KEY": "bw_sk_...", "ATS_PROJECT_ID": "..." } }
```

```bash
# CLI — start a session bound to a ticket, then run your agent
export ATS_API_KEY=bw_sk_...        # personal key from Settings → API Keys
export ATS_PROJECT_ID=...           # your project id
ats start PROJ-123
ats -- claude code "refactor the login flow"
ats stop
```

```bash
# Proxy — point any OpenAI-compatible client at Burnwise and tag the ticket
export OPENAI_BASE_URL=http://localhost:4000/v1
curl $OPENAI_BASE_URL/chat/completions \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -H "X-Burnwise-Key: bw_sk_..." \
  -H "X-Burnwise-Ticket: PROJ-123" \
  -d '{"model":"gpt-4o","messages":[{"role":"user","content":"hi"}]}'
```

## Architecture

Burnwise is a monorepo of focused apps and packages.

```mermaid
flowchart TB
    subgraph Collectors
        A[IDE plugins]
        B[API proxy]
        C[CLI]
        D[CI/CD webhooks]
        Z[MCP server]
    end

    subgraph Server["apps/server Fastify API"]
        E[Events /ingest]
        F[Association service]
        G[Integrations GitHub/Jira/GitLab]
        H[Forecast]
        I[Alerts]
        J[Team]
        K[CI/CD]
        L[Auth JWT]
    end

    subgraph Frontend["apps/web React Dashboard"]
        M[Dashboard]
        N[Velocity & Efficiency]
        O[Sessions & Traces]
        P[Forecast & Capacity]
        Q[Integrations / Settings]
    end

    subgraph Data
        R[(PostgreSQL)]
    end

    A --> E
    B --> E
    C --> E
    D --> K
    Z --> E
    E --> F
    F --> R
    G --> R
    H --> R
    I --> R
    J --> R
    K --> R
    L --> R
    R --> N
    R --> O
    R --> P
    R --> Q
```

For detailed diagrams and data model, see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Tech stack

Node.js 22 · TypeScript 6 · Fastify 5 · Prisma 7 · PostgreSQL · React 19 · Vite 8 · Tailwind CSS 4 · Playwright

## Repository layout

| Path | Purpose |
|------|---------|
| `apps/web` | React dashboard (Vite + Tailwind + shadcn/ui) |
| `apps/server` | Fastify REST API, Prisma ORM, JWT auth, integrations |
| `apps/proxy` | OpenAI- and Anthropic-format API proxy that emits events |
| `apps/cli` | Wrap commands and emit `session.activity` events |
| `apps/vscode` | VS Code extension collector |
| `apps/mcp` | MCP server for Claude Code and other MCP clients |
| `packages/schema` | Zod event schemas shared across apps |
| `packages/pricing` | LLM pricing table shared by server and proxy |
| `docs/` | Architecture, self-hosting, user stories, and integration docs |
| `docker-compose.yml` | One-command local stack |

## Documentation

| Doc | Contents |
|-----|----------|
| [docs/USER_STORIES.md](docs/USER_STORIES.md) | Personas and the end-to-end loops Burnwise serves |
| [docs/INTEGRATIONS.md](docs/INTEGRATIONS.md) | Copy-paste setup for CLI, proxy, MCP, and IDE collectors |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Diagrams, data model, and event flow |
| [docs/SELFHOST.md](docs/SELFHOST.md) | Production deployment, SSO, API keys, and secrets |

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `JWT_SECRET` | ✅ | Secret used to sign auth tokens — use a long random string in production |
| `JWT_EXPIRY` | | Token lifetime (default: `7d`) |
| `INGEST_API_KEY` | ✅ | Shared fallback ingest key. Prefer per-developer personal keys (`bw_sk_...`) from Settings → API Keys so events bind to the real user |
| `BURNWISE_ENCRYPTION_KEY` | | 32-byte hex key to encrypt secrets at rest (integration tokens, API-key secrets). Derived from `JWT_SECRET` if unset — set explicitly in production |
| `CI_WEBHOOK_SECRET` | | Shared secret to verify inbound CI webhooks (GitHub HMAC / GitLab token / generic bearer). Verification is skipped with a warning if unset |
| `PORT` | | Server port (default: `3000`) |
| `VITE_API_URL` | | URL the browser uses to reach the server (default: `http://localhost:3000`) |

See `.env.example` for the full list including proxy and collector variables.

## Development

```bash
# Type-check everything
npm run typecheck --workspaces

# Lint everything
npm run lint

# Build everything
npm run build --workspaces

# Run unit tests (schema, server, proxy, cli)
npm run test --workspace=packages/schema
npm run test --workspace=apps/server

# Run E2E tests (29 tests — auth, sessions, ingest, settings, exports, and more)
npm run e2e --workspace=apps/web

# Run E2E in UI mode
npm run e2e:ui --workspace=apps/web
```

### First run (local dev)

After `npm run dev` starts the server and web app, open http://localhost:5173. The **setup wizard** prompts you to create a workspace name and admin account. No seed data is loaded — connect an issue tracker on the **Integrations** page to import real sprints and tickets, then bind agent work to a ticket (see [Connect your AI workflow](#connect-your-ai-workflow)).

## Contributing

We welcome contributions. See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## Security

To report a security vulnerability, please see [SECURITY.md](SECURITY.md).

## License

Apache 2.0 — see [LICENSE](LICENSE).