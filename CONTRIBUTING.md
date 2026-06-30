# Contributing to Burnwise

Thank you for your interest in contributing! This document outlines how to get started and what we expect from contributions.

## Development setup

1. **Prerequisites**: Node.js 22+, Docker, and Docker Compose.
2. **Install dependencies**:
   ```bash
   npm install
   ```
3. **Start Postgres and set up the database**:
   ```bash
   docker compose up -d postgres
   npm run build --workspace=packages/schema --workspace=packages/pricing
   DATABASE_URL=postgresql://ats:ats@localhost:5432/ats \
     npm run db:migrate --workspace=apps/server
   ```
4. **Run the apps**:
   ```bash
   npm run dev --workspace=apps/server
   npm run dev --workspace=apps/proxy
   npm run dev --workspace=apps/web
   ```

## Workflow

1. Fork the repository and create a branch from `master`.
2. Name your branch descriptively: `feature/...`, `bugfix/...`, or `docs/...`.
3. Make your changes with clear, focused commits.
4. Run checks before pushing:
   ```bash
   npm run typecheck --workspaces
   npm run build --workspaces
   npm run test --workspace=packages/schema
   npm run e2e --workspace=apps/web
   ```
5. Open a pull request with a clear description and link to any related issues.

## Commit messages

Use conventional commits:

- `feat: ...`
- `fix: ...`
- `docs: ...`
- `chore: ...`
- `refactor: ...`
- `test: ...`

## Code style

- TypeScript is used everywhere.
- Follow the existing code style in each app.
- Run formatting and linting when available.

## Questions?

Open a [GitHub Discussion](https://github.com/filipjevtic/burnwise/discussions) or an issue.