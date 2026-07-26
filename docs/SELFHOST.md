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

## Option 3: Kubernetes (Helm)

A Helm chart is provided in [`charts/burnwise`](../charts/burnwise). It deploys
the server, web UI, and API proxy, and runs migrations as a pre-install/upgrade
Job. Bring your own PostgreSQL (set `secrets.databaseUrl`).

```bash
helm install burnwise ./charts/burnwise \
  --set secrets.databaseUrl="postgresql://user:pass@pg:5432/ats" \
  --set secrets.jwtSecret="$(openssl rand -hex 32)" \
  --set config.appUrl="https://burnwise.example.com" \
  --set config.serverPublicUrl="https://burnwise.example.com" \
  --set ingress.enabled=true --set ingress.host="burnwise.example.com"
```

The web pod serves the UI and proxies `/api` to the server (same-origin), so one
ingress host is enough. See [charts/burnwise/README.md](../charts/burnwise/README.md)
for all values.

A [Terraform module](../terraform) wraps this chart (via the `helm` provider) for
IaC-driven installs on any cluster — see [terraform/README.md](../terraform/README.md).

## Local-only mode

Run the full stack on your own machine with a hard guarantee that **no data
leaves it** (#23). Burnwise never phones home — it only talks to the
integrations and webhooks you configure — so "local-only" is about enforcing
that guarantee. Set `LOCAL_ONLY=true`:

```bash
LOCAL_ONLY=true docker compose up
```

With it on:

- All outbound egress is blocked — issue-tracker sync (Jira/GitHub/GitLab) and
  outbound webhook delivery both fail closed.
- SSO is disabled (no identity is sent to an external IdP); sign in with
  email/password.

Everything else — dashboard, ingest, the CLI/proxy/MCP collectors pointed at
`http://localhost:3000` — works normally. Data lives in the Postgres that Docker
Compose starts locally; there is no separate cloud service. (There is no SQLite
option: the stack bundles Postgres, so a single `docker compose up` already
needs no external database.)

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

## Data retention

To enforce a rolling retention window, set `EVENT_RETENTION_DAYS` (#27). A daily
in-process sweep deletes raw events older than that many days:

```bash
EVENT_RETENTION_DAYS=90   # keep 90 days of events; 0 or unset = keep forever
```

The purge runs at startup and every 24h, so no external cron is needed. Only the
raw `Event` rows are removed; derived tickets/sprints and the aggregates stored
on each event are unaffected beyond the deleted rows. For very large tables,
prefer an external batched delete so a single sweep doesn't hold a long
transaction.

## PII redaction

To avoid retaining sensitive content pasted into prompts, set `PII_REDACTION=true`
(#27). At ingest, high-confidence secrets and personal data are masked in stored
prompt/response text (and message content):

```bash
PII_REDACTION=true   # default false (prompts stored verbatim)
```

Redacted patterns: email addresses, US SSNs, credit-card numbers, and common
secret keys (OpenAI `sk-…`, GitHub `ghp_…`/`gho_…`, AWS `AKIA…`). Only free-text
fields are touched; token counts, model, provider, and metadata are preserved.
Redaction happens before storage, so it also applies to outbound webhook payloads.

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
