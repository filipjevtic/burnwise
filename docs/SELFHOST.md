# Self-Hosting Guide

<p align="center">
  <img src="../assets/logo-icon.png" alt="Burnwise" width="120">
</p>

This document explains how to run Burnwise on your own infrastructure.

## Prerequisites

- Docker and Docker Compose, or a PostgreSQL 15+ database
- Node.js 22+ (for local development only)

## Option 1: Docker Compose (recommended)

```bash
# Copy and edit environment variables
cp .env.example .env
# At minimum, change JWT_SECRET to a long random string:
#   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Start everything
docker compose up -d

# Open the dashboard
open http://localhost:8080
```

On first visit, the **setup wizard** will appear. Enter your workspace name, email, and password to create the admin account. The database starts empty. Connect an issue tracker on the **Integrations** page to import real sprints and tickets, then bind agent work to a ticket (see [INTEGRATIONS.md](INTEGRATIONS.md)).

## Option 2: External PostgreSQL

Set `DATABASE_URL` to your PostgreSQL instance:

```bash
export DATABASE_URL=postgresql://user:pass@your-db-host:5432/ats
export JWT_SECRET=your-random-secret
npm run db:migrate:deploy --workspace=apps/server
npm run start --workspace=apps/server
```

## SSO / OAuth

Burnwise supports GitHub, Google, and GitLab OAuth plus generic OIDC out of the box. All are optional; email/password always works. SSO buttons appear on the login page only when a provider is configured.

### GitHub OAuth

1. Go to **GitHub → Settings → Developer settings → OAuth Apps → New OAuth App**.
2. Set **Authorization callback URL** to `https://your-domain/api/v1/auth/oauth/github/callback`.
3. Copy the **Client ID** and **Client Secret** into your `.env`:
   ```
   GITHUB_CLIENT_ID=...
   GITHUB_CLIENT_SECRET=...
   APP_URL=https://your-domain
   ```

### Google OAuth

1. Go to **Google Cloud Console → APIs & Services → Credentials → Create OAuth 2.0 Client ID**.
2. Set **Authorised redirect URI** to `https://your-domain/api/v1/auth/oauth/google/callback`.
3. Copy the **Client ID** and **Client Secret** into your `.env`:
   ```
   GOOGLE_CLIENT_ID=...
   GOOGLE_CLIENT_SECRET=...
   APP_URL=https://your-domain
   ```

### GitLab OAuth

1. Go to **GitLab → User Settings → Applications** (or the admin area for self-hosted GitLab).
2. Set **Redirect URI** to `https://your-domain/api/v1/auth/oauth/gitlab/callback`.
3. Select the **read_user** scope.
4. Copy the **Application ID** and **Secret** into your `.env`:
   ```
   GITLAB_CLIENT_ID=...
   GITLAB_CLIENT_SECRET=...
   # For self-hosted GitLab:
   # GITLAB_BASE_URL=https://gitlab.example.com
   ```

### Generic OIDC

Connect any OIDC-compliant identity provider (Keycloak, Authentik, Okta, Azure AD / Entra ID, etc.):

1. Create a client/application in your IdP with the redirect URI `https://your-domain/api/v1/auth/oauth/oidc/callback`.
2. Set the required environment variables:
   ```
   OIDC_ISSUER_URL=https://keycloak.example.com/realms/burnwise
   OIDC_CLIENT_ID=burnwise
   OIDC_CLIENT_SECRET=...
   OIDC_DISPLAY_NAME=Keycloak          # label shown on the login button
   OIDC_SCOPE=openid email profile     # default; adjust if your IdP requires different scopes
   ```

The server fetches the OIDC discovery document (`/.well-known/openid-configuration`) from the issuer URL at startup to resolve authorization, token, and userinfo endpoints automatically.

SSO users are automatically created on first sign-in with the `member` role. Promote them to admin via **Settings → Team** after they sign in.

You can mix providers: for example, let developers sign in with **GitLab** while admins use **Google** and the security team uses **Keycloak via OIDC**: all are enabled independently and email/password remains available as a fallback.

## API keys for collectors

Collectors (proxy, CLI, MCP, IDE) authenticate to the ingest API. There are two options:

- **Personal API keys (recommended).** Each developer generates a key in **Settings → API Keys** (`bw_pk_...` public + `bw_sk_...` secret). The secret is shown once; store it as `ATS_API_KEY` / `X-Burnwise-Key`. Events authenticated with a personal key bind to the **real developer and workspace** server-side, so per-developer velocity and capacity are accurate. Keys can be revoked, rotated, and given per-key rate limits and expiry.
- **Shared ingest key (fallback).** `INGEST_API_KEY` is a single shared key suitable for CI or bootstrapping. Events carry whatever `userId` the client sends, so prefer personal keys for developer attribution.

## Secrets at rest

- **`BURNWISE_ENCRYPTION_KEY`**: a 32-byte hex value used to encrypt sensitive data at rest (issue-tracker API tokens, API-key secrets) with AES-GCM. If unset, the server derives a key from `JWT_SECRET` (acceptable for dev). **Set this explicitly in production**, and note that rotating it invalidates previously encrypted secrets.
  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```
- **`CI_WEBHOOK_SECRET`**: shared secret used to verify inbound CI webhooks (GitHub HMAC, GitLab token, or generic bearer). In production (`NODE_ENV=production`) the CI webhook endpoint **rejects all requests until this is set** (fail closed), so an unauthenticated caller cannot inject `ci.run` events. Outside production, verification is skipped with a logged warning for local development.

### Rate limiting

The server applies an in-memory, per-IP rate limit to every route. Health checks are exempt. Tune via environment variables (all optional):

- **`RATE_LIMIT_DISABLED`**: set to `true` to turn limiting off (e.g. when you rate-limit at your gateway). Default: enabled.
- **`RATE_LIMIT_MAX`**: global requests allowed per window. Default: `300`.
- **`RATE_LIMIT_WINDOW`**: the window, e.g. `1 minute`, `15 seconds`. Default: `1 minute`.
- **`RATE_LIMIT_AUTH_MAX`**: tighter limit for `/api/v1/auth/login` and `/api/v1/auth/setup` to slow credential stuffing. Default: `10`.
- **`RATE_LIMIT_INGEST_MAX`**: higher ceiling for `/api/v1/events/ingest` (high-volume collector traffic). Default: `600`.

The limiter is per-instance. For multi-instance deployments, front it with a shared store (e.g. Redis) or rely on your load balancer/gateway.

## Tenancy & roles

Burnwise is **single-workspace-per-install** by default. Every data query is
scoped to the `workspaceId` carried in the caller's JWT, enforced by tenancy
guards on all project/sprint/ticket/event/session routes, so cross-workspace
access is not possible.

- **Workspace roles** (`User.role`): a workspace `admin`/`owner` has implicit
  full access to every project in the workspace.
- **Project roles** (`TeamMember.role`): `viewer < member < admin < owner`.
  Reads require `viewer+`, writing project data requires `member+`, and managing
  a project (team, settings, integrations, invites) requires `admin+`. Workspace
  admins bypass project membership; ordinary workspace members default to
  `viewer` so existing dashboards keep working.
- **`MULTI_WORKSPACE_ENABLED`**: leave `false` (default). It is a forward-looking
  flag; the additional-workspace creation path is not yet implemented, and the
  data model is already workspace-scoped so enabling it later is config-only.

## Reverse proxy / HTTPS

Put the web dashboard and server behind Nginx, Caddy, or Traefik. Set the following:

- `VITE_API_URL` to the public server URL
- `SERVER_URL` (for the proxy) to the public server URL
- Ensure CORS is configured if server and web are on different origins

## Security checklist

- **Set `JWT_SECRET`** to a cryptographically random string (at least 32 bytes). Tokens are invalid if this changes.
- Change `INGEST_API_KEY` from the default `dev-key`
- Use a strong PostgreSQL password
- Run the server behind HTTPS in production
- Restrict network access to the proxy (it forwards to your LLM provider)
- Set `BURNWISE_ENCRYPTION_KEY` so issue-tracker tokens and API-key secrets are encrypted at rest
- Set `CI_WEBHOOK_SECRET` to verify inbound CI webhooks
- Tune `RATE_LIMIT_*` (especially `RATE_LIMIT_AUTH_MAX`) for your traffic, or disable and enforce limits at your gateway
- Issue per-developer personal API keys instead of sharing `INGEST_API_KEY`
- The first user to complete the setup wizard becomes the workspace admin

## Backups

Back up the PostgreSQL database regularly. The `Event` table will grow over time, so plan a retention policy.

## Updates

```bash
git pull
docker compose build --no-cache
docker compose up -d

# If running outside Docker, apply any new migrations:
DATABASE_URL=postgresql://user:pass@localhost:5432/ats \
  npm run db:migrate:deploy --workspace=apps/server
```

## Troubleshooting

**Server fails to connect to Postgres**
- Verify `DATABASE_URL` points to the correct host
- If using Docker Compose, ensure the `postgres` service is healthy

**Proxy returns 401**
- Verify `INGEST_API_KEY` matches the server's `INGEST_API_KEY`

**Setup wizard does not appear**
- The workspace already has a user. Go to `/login` to sign in, or clear the database and restart.

**No tickets appear in the dashboard**
- Sync from GitHub, Jira, or GitLab using the Integrations page in the dashboard
- Ensure the synced sprints contain tickets with story points so velocity and forecast have data

**No velocity / capacity data**
- Velocity needs sprints whose tickets have story points and a terminal status (done/closed/completed/resolved)
- Capacity recommendations need at least one completed sprint of story points

**Proxy returns 401 on ingest**
- Verify `INGEST_API_KEY` on the proxy matches `INGEST_API_KEY` on the server
