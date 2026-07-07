export const config = {
  port: Number(process.env.PORT || "3000"),
  databaseUrl: process.env.DATABASE_URL || "postgresql://ats:ats@localhost:5432/ats",
  nodeEnv: process.env.NODE_ENV || "development",
  ingestApiKey: process.env.INGEST_API_KEY || "dev-key",
  jwtSecret: process.env.JWT_SECRET || "dev-jwt-secret-change-in-production",
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
