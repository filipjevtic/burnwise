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
