# Self-Hosting Guide

<p align="center">
  <img src="../assets/logo-icon.png" alt="Burnwise" width="120">
</p>

This document explains how to run Burnwise on your own infrastructure.

## Prerequisites

- Docker and Docker Compose, or a PostgreSQL 15+ database
- Node.js 20+ (for local development only)

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

On first visit, the **setup wizard** will appear. Enter your workspace name, email, and password to create the admin account. The database starts empty — use the **"Explore with demo data"** button after login to load sample sprints, tickets, and LLM events.

## Option 2: External PostgreSQL

Set `DATABASE_URL` to your PostgreSQL instance:

```bash
export DATABASE_URL=postgresql://user:pass@your-db-host:5432/ats
export JWT_SECRET=your-random-secret
npm run db:push --workspace=apps/server
npm run start --workspace=apps/server
```

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
- Store issue tracker tokens securely (they are saved in the database)
- The first user to complete the setup wizard becomes the workspace admin

## Backups

Back up the PostgreSQL database regularly. The `Event` table will grow over time, so plan a retention policy.

## Updates

```bash
git pull
docker compose build --no-cache
docker compose up -d
npm run db:migrate --workspace=apps/server
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
- Or use the "Explore with demo data" button on the empty project screen

**Proxy returns 401 on ingest**
- Verify `INGEST_API_KEY` on the proxy matches `INGEST_API_KEY` on the server
