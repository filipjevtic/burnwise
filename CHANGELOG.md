# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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