# Burnwise Helm chart

Deploys the Burnwise server, web UI, and (optionally) the API proxy to Kubernetes,
plus a pre-install/upgrade Job that runs database migrations.

## Prerequisites

- A reachable PostgreSQL. This chart does **not** bundle a database — set
  `secrets.databaseUrl` (or `secrets.existingSecret` with a `DATABASE_URL` key).
  For a quick trial: `helm install pg oci://registry-1.docker.io/bitnamicharts/postgresql`.

## Install

```bash
helm install burnwise ./charts/burnwise \
  --set secrets.databaseUrl="postgresql://user:pass@pg:5432/ats" \
  --set secrets.jwtSecret="$(openssl rand -hex 32)" \
  --set config.appUrl="https://burnwise.example.com" \
  --set config.serverPublicUrl="https://burnwise.example.com" \
  --set ingress.enabled=true \
  --set ingress.host="burnwise.example.com"
```

The web pod serves the UI and proxies `/api` to the server (same-origin), so a
single ingress host is enough. The migrate Job runs `prisma migrate deploy`
before the app rolls out.

## Configuration

| Key | Default | Notes |
|-----|---------|-------|
| `image.registry` / `image.repository` | `ghcr.io` / `filipjevtic/burnwise` | Images: `<registry>/<repository>/{server,web,proxy,migrate}` |
| `image.tag` | chart `appVersion` | Override to pin a version |
| `secrets.databaseUrl` | `""` | **Required** unless `existingSecret` set |
| `secrets.jwtSecret` | `""` | **Required** in production |
| `secrets.existingSecret` | `""` | Use a Secret you manage (keys: `DATABASE_URL`, `JWT_SECRET`, `INGEST_API_KEY`, `BURNWISE_ENCRYPTION_KEY`, OAuth/OIDC…) |
| `config.*` | see `values.yaml` | Non-secret env (rate limits, SSO domains, local-only, pricing overrides…) |
| `migrations.enabled` | `true` | Runs the migrate Job on install/upgrade |
| `proxy.enabled` | `true` | The OpenAI/Anthropic-compatible API proxy |
| `ingress.enabled` | `false` | Single host → web (which proxies `/api`) |

See [values.yaml](values.yaml) for the full list.
