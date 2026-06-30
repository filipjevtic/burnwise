# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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