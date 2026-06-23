export const config = {
  port: Number(process.env.PORT || "3000"),
  databaseUrl: process.env.DATABASE_URL || "postgresql://ats:ats@localhost:5432/ats",
  nodeEnv: process.env.NODE_ENV || "development",
  ingestApiKey: process.env.INGEST_API_KEY || "dev-key",
  jwtSecret: process.env.JWT_SECRET || "dev-jwt-secret-change-in-production",
  jwtExpiry: process.env.JWT_EXPIRY || "7d",
};
