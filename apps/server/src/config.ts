// Insecure development defaults. Referenced by both the config below and the
// production guard (validateConfig) so the two can't drift.
export const DEFAULT_JWT_SECRET = "dev-jwt-secret-change-in-production";
export const DEFAULT_INGEST_API_KEY = "dev-key";

export const config = {
  port: Number(process.env.PORT || "3000"),
  databaseUrl: process.env.DATABASE_URL || "postgresql://ats:ats@localhost:5432/ats",
  nodeEnv: process.env.NODE_ENV || "development",
  ingestApiKey: process.env.INGEST_API_KEY || DEFAULT_INGEST_API_KEY,
  jwtSecret: process.env.JWT_SECRET || DEFAULT_JWT_SECRET,
  jwtExpiry: process.env.JWT_EXPIRY || "7d",
  appUrl: process.env.APP_URL || "http://localhost:5173",
  // Public URL of THIS server, used to build OAuth redirect URIs that must match
  // what the IdP has registered. Defaults to localhost for dev; set to the public
  // domain in production (e.g. https://burnwise.example.com).
  serverPublicUrl: process.env.SERVER_PUBLIC_URL || `http://localhost:${Number(process.env.PORT || "3000")}`,
  // Comma-separated list of email domains allowed to sign in / auto-provision via
  // SSO (e.g. "example.com,corp.example.com"). Empty = allow any domain.
  ssoAllowedDomains: (process.env.SSO_ALLOWED_DOMAINS || "")
    .split(",")
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean),
  // Allow issue-tracker integration URLs (Jira/GitLab baseUrl) to resolve to
  // private IP ranges. Loopback and link-local (cloud metadata) are always
  // blocked. Enable only for self-hosted trackers on an internal network.
  integrationAllowPrivateHosts: process.env.INTEGRATION_ALLOW_PRIVATE_HOSTS === "true",
  // Local-only mode (#23): a guarantee that no data leaves the machine. When
  // true, all outbound egress is blocked (issue-tracker sync and outbound
  // webhook delivery — every fetchWithTimeout call) and SSO is disabled, so a
  // developer can run the full stack (via docker compose) with nothing sent
  // anywhere.
  localOnly: process.env.LOCAL_ONLY === "true",
  // PII redaction (#27). When true, high-confidence secrets/personal data
  // (emails, API keys, card/SSN numbers) are masked in stored prompt/response
  // text at ingest. Off by default (prompts stored verbatim).
  piiRedaction: process.env.PII_REDACTION === "true",
  // Event retention (#27). Raw events older than this many days are deleted by a
  // daily in-process purge. 0 or unset means keep forever (default) — no purge
  // runs. Set to e.g. 90 to enforce a rolling data-retention window.
  eventRetentionDays: Number(process.env.EVENT_RETENTION_DAYS || "0"),
  // Browser origins allowed by CORS in production (comma-separated). Empty
  // defaults to APP_URL. In non-production, any origin is reflected for
  // convenience. Requests without an Origin header (curl, server-to-server,
  // collectors) are always allowed since CORS is a browser-only control.
  corsAllowedOrigins: (process.env.CORS_ALLOWED_ORIGINS || "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean),
  // Key used to encrypt secrets at rest (integration tokens, etc.).
  // Should be a 32-byte value (hex or base64). Falls back to deriving from
  // JWT_SECRET in dev so local setups keep working.
  encryptionKey: process.env.BURNWISE_ENCRYPTION_KEY || "",
  // Optional shared secret for verifying inbound CI webhooks. When set,
  // webhooks must present a valid GitHub HMAC signature, GitLab token, or
  // generic bearer token. When empty, verification is skipped (dev default).
  ciWebhookSecret: process.env.CI_WEBHOOK_SECRET || "",
  // Per-IP rate limiting (in-memory). A global default protects every route;
  // auth endpoints get a tighter limit to slow credential stuffing, while the
  // ingest endpoint gets a higher ceiling for high-volume collector traffic.
  // Set RATE_LIMIT_DISABLED=true to turn limiting off (e.g. behind your own
  // gateway). For multi-instance deployments, front this with a shared store.
  rateLimit: {
    enabled: process.env.RATE_LIMIT_DISABLED !== "true",
    max: Number(process.env.RATE_LIMIT_MAX || "300"),
    timeWindow: process.env.RATE_LIMIT_WINDOW || "1 minute",
    authMax: Number(process.env.RATE_LIMIT_AUTH_MAX || "10"),
    ingestMax: Number(process.env.RATE_LIMIT_INGEST_MAX || "600"),
  },
  features: {
    // Multi-workspace (multi-tenant) onboarding. OFF by default: Burnwise is
    // single-workspace-per-install today and every query is workspace-scoped
    // from the JWT, so flipping this on later is the only change needed to host
    // multiple workspaces. The additional-workspace creation path is not yet
    // implemented, so this should remain false until that lands.
    multiWorkspace: process.env.MULTI_WORKSPACE_ENABLED === "true",
  },
  oauth: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID || "",
      clientSecret: process.env.GITHUB_CLIENT_SECRET || "",
    },
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    },
    gitlab: {
      clientId: process.env.GITLAB_CLIENT_ID || "",
      clientSecret: process.env.GITLAB_CLIENT_SECRET || "",
      baseUrl: process.env.GITLAB_BASE_URL || "https://gitlab.com",
    },
  },
  oidc: {
    issuerUrl: process.env.OIDC_ISSUER_URL || "",
    clientId: process.env.OIDC_CLIENT_ID || "",
    clientSecret: process.env.OIDC_CLIENT_SECRET || "",
    displayName: process.env.OIDC_DISPLAY_NAME || "SSO",
    scope: process.env.OIDC_SCOPE || "openid email profile",
  },
};

export interface ConfigIssues {
  fatal: string[];
  warnings: string[];
}

/**
 * Validate security-critical config for production. Booting a production install
 * with the built-in dev JWT secret would let anyone forge admin tokens, so that
 * is fatal; weaker footguns (default ingest key, unset encryption key) are
 * warnings. Pure — takes the config so it's easy to test. In non-production
 * everything is allowed so local dev stays zero-config.
 */
export function validateConfig(cfg: typeof config = config): ConfigIssues {
  const fatal: string[] = [];
  const warnings: string[] = [];
  if (cfg.nodeEnv === "production") {
    if (!cfg.jwtSecret || cfg.jwtSecret === DEFAULT_JWT_SECRET) {
      fatal.push("JWT_SECRET must be set to a strong random value in production (it is currently the insecure default — anyone could forge admin tokens).");
    }
    if (cfg.ingestApiKey === DEFAULT_INGEST_API_KEY) {
      warnings.push("INGEST_API_KEY is the default 'dev-key'; set a strong value or issue per-developer API keys.");
    }
    if (!cfg.encryptionKey) {
      warnings.push("BURNWISE_ENCRYPTION_KEY is not set; secrets are encrypted with a key derived from JWT_SECRET, so rotating JWT_SECRET will make stored secrets undecryptable. Set a dedicated 32-byte key.");
    }
  }
  return { fatal, warnings };
}
