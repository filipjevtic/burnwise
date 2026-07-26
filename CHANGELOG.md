# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.4.0-alpha] - 2026-07-26

First alpha. Single-node, single-workspace self-host; expect rough edges.

### Added
- Kubernetes deployment: a Helm chart (server, web, proxy, and a migration Job, all running as hardened non-root containers) plus a Terraform module that installs the chart on any cluster (#22).
- Operator pricing overrides via `BURNWISE_PRICING_JSON` / `BURNWISE_PRICING_FILE`, so you can add or correct model rates without a code change (#141).
- Configurable event retention: set `EVENT_RETENTION_DAYS` and a daily purge deletes events past the window (#27).
- PII redaction: set `PII_REDACTION=true` to mask emails, secret keys, and card/SSN numbers in stored prompt and response text before it lands in the database (#27).
- Integration UX: the connect form now pre-fills from saved config, a Test connection button checks credentials before a full sync, and GitHub Enterprise Server base URLs are supported (#70).

### Changed
- The web image calls the API on its own origin and nginx proxies `/api` to the server, so one built image works unchanged in dev, Docker Compose, and Kubernetes (#22).
- Re-syncing an integration reuses the stored token when you leave the field blank, instead of wiping it (#70).

### Fixed
- Integration syncs count and report per-item import failures instead of aborting on the first bad issue (#70).
- Full repo URLs pasted into the owner/repo fields are normalized to `owner/repo` (#70).

### Security
- The server refuses to boot in production (`NODE_ENV=production`) when `JWT_SECRET` is unset or left at the dev default, and warns on the default ingest key and a missing encryption key (#265).
- Bumped postcss to a patched release; documented a react-router advisory that does not apply to the client-side SPA.

## [0.3.0] - 2026-07-24

### Added
- OpenTelemetry (OTLP/HTTP) GenAI trace ingestion, an Anthropic Messages API proxy with automatic provider detection, and cloud-log ingestion for AWS Bedrock and GCP Vertex AI, so usage from more tools lands in one place.
- Outbound webhooks: per-project subscriptions that receive HMAC-signed event deliveries (#21).
- An OpenAPI 3 spec generated from the live route table at `/openapi.json`, with a rendered viewer at `/docs` (#21).
- Local-only mode (`LOCAL_ONLY=true`) that blocks all outbound egress and disables SSO, so nothing leaves the machine (#23).
- An immutable audit log with an admin viewer, covering association overrides, team changes, and credential/integration changes (#20).
- Manual trace resolution (endpoints and UI) and rejection rules that auto-hide recurring noise from the unresolved queue (#24).
- Analytics: a cross-project portfolio view, by-tool and by-provider effort breakdowns, an estimate-calibration report, and a sprint-commit recommendation.
- Per-project CI webhook secrets with provider pinning, and CI cost estimated from the actual runner rather than a fixed default (#183).
- Zero-context MCP usage reporting via a Claude Code hook, and delta-based token attribution for multi-task sessions.
- A configurable external trace-viewer deep link, per-session trace summaries, and a configurable Jira story-points field (#8).

### Changed
- Analytics and forecasting aggregate in PostgreSQL using denormalized metric columns and DB-side rollups, instead of loading event payloads into Node (#176).
- Documentation repositioned around cross-tool AI-delivery analytics rather than spend; prose humanized throughout.
- Refreshed the dashboard's dark, technical UI.

### Security
- Blocked SSRF through user-controlled integration URLs and added timeouts to integration fetches.
- Restricted CORS to an allow-list in production and made CI webhooks fail closed when the secret is unset in production.
- Neutralized CSV formula injection in exports and scoped ticket/session association to the event's own project.
- Closed an invite-acceptance account-takeover path (#170, #178) and hardened OAuth (CSRF state, email verification, domain allow-list, configurable redirect).
- Patched HIGH CVEs in `fast-uri` and `find-my-way`.

### Fixed
- Normalized GitLab issue states to canonical statuses, extracted text from all Jira ADF node types, made CI run events idempotent, and guarded web data hooks against stale/out-of-order responses.

## [0.2.0] - 2026-06-30

### Added
- GitLab OAuth and generic OIDC SSO support with conditional button rendering (#122)
- `GET /api/v1/auth/providers` endpoint for frontend to discover available SSO providers
- `report_usage` MCP tool for self-reported LLM token tracking (#144)
- Comprehensive Playwright E2E test suite — 28 tests covering auth, API keys, sessions, ingest, team management, invites, CSV export, and all pages (#124)
- E2E test helpers (`api.ts`, `seed.ts`) for typed API calls and data seeding
- esbuild production bundler for the server — single `dist/index.mjs` output (#137)
- `prisma.config.ts` for Prisma 7 datasource configuration

### Changed
- Upgraded Node.js from 20 to 22 LTS (#131)
- Upgraded TypeScript from 5.9 to 6.0 (#132)
- Upgraded Vite from 5.4 to 8.1 and @vitejs/plugin-react from 4.7 to 6.0 (#133)
- Upgraded React from 18 to 19 — refactored 20 forwardRef components to ref-as-prop pattern (#134)
- Upgraded Tailwind CSS from 3.4 to 4.3 — CSS-first config, automated migration (#135)
- Upgraded Prisma from 5.22 to 7.8 — driver adapter, generated client output, new config format (#136)
- Server production runtime: `node dist/index.mjs` (esbuild bundle) replaces `tsx src/index.ts`
- Server listens on `::` (dual-stack IPv4+IPv6) instead of `0.0.0.0`
- Docker actions updated to v4/v6 for Node 22 compatibility (#130)

### Fixed
- CORS config only allowed GET/HEAD/POST — added PUT/DELETE/PATCH so Settings mutations work (#125)
- SPA page refresh returning 404 in Docker nginx — added `try_files` fallback (#123)
- Docker server image crash on ARM64 — removed hardcoded x86_64 Prisma engine path (#121)
- Docker tag format error on tag pushes — fixed `sha` prefix template (#130)
- SSO buttons showing "provider not configured" error — now hidden when unconfigured (#122)
- Optimistic UI updates for API key revoke, team member remove, and role change (#125)

## [0.1.0] - 2026-06-23

### Added

- JWT-based authentication: register, login, `requireAuth` / `requireAdmin` middleware on all API routes.
- First-run setup wizard (`/setup`) — creates the workspace and initial admin account on a fresh database.
- Login page with email/password sign-in and token persistence.
- Project creation flow — dynamic project list, `CreateProjectPage` shown when no projects exist.
- `POST /api/v1/projects` to create projects; `GET /api/v1/projects` to list workspace projects.
- `POST /api/v1/admin/seed-demo` — opt-in admin endpoint to seed a full demo project with sprints, tickets, and LLM events.
- RBAC: admin-only write routes (budget, integrations, team management); member read-only access with UI enforcement.
- Auth token forwarded in all frontend API calls (`use-project-data`, `use-alerts`, `use-team`, pages).
- E2E global setup creates workspace and seeds demo data via API (no seed script in CI).
- `JWT_SECRET` and `JWT_EXPIRY` environment variables; added to `docker-compose.yml` and `.env.example`.

### Changed

- Project switcher in `AppLayout` replaced with a `<select>` dropdown populated from the API.
- Demo data is no longer seeded automatically — it is opt-in via the dashboard.
- `docker-compose.yml` server service now picks up `JWT_SECRET` and `INGEST_API_KEY` from the environment.
- All Fastify route handlers migrated to generic-typed `app.get<T>()` / `app.post<T>()` pattern for correct TypeScript inference.

### Removed

- Hardcoded `"default"` project ID from app state.
- Auto-seed step from CI workflow.

## [0.0.1] - 2026-06-23

### Added

- Initial release of Burnwise.
- Event ingestion API for LLM usage, traces, session activity, and CI/CD runs.
- Ticket association by explicit ID, prompt text, git branch, and commit message.
- Integrations with GitHub Issues, Jira, and GitLab Issues.
- Sprint dashboard with token, cost, and duration summaries.
- Forecasting and capacity planning based on historical baselines.
- Budget alerts for projects and sprints.
- Team and role management.
- CI/CD cost capture with GitHub Actions and GitLab CI webhooks.
- VS Code extension, CLI wrapper, API proxy, and MCP server collectors.
- Docker Compose setup for local development and self-hosting.