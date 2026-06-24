export const config = {
  port: Number(process.env.PORT || "3000"),
  databaseUrl: process.env.DATABASE_URL || "postgresql://ats:ats@localhost:5432/ats",
  nodeEnv: process.env.NODE_ENV || "development",
  ingestApiKey: process.env.INGEST_API_KEY || "dev-key",
  jwtSecret: process.env.JWT_SECRET || "dev-jwt-secret-change-in-production",
  jwtExpiry: process.env.JWT_EXPIRY || "7d",
  appUrl: process.env.APP_URL || "http://localhost:5173",
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
  },
};
