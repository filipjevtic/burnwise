export const config = {
  serverUrl: process.env.ATS_SERVER_URL || "http://localhost:3000",
  ingestApiKey: process.env.ATS_INGEST_API_KEY || "dev-key",
  // Personal API key (bw_sk_...), preferred for ingest + session auth.
  apiKey: process.env.ATS_API_KEY || process.env.ATS_INGEST_API_KEY || "dev-key",
  workspaceId: process.env.ATS_WORKSPACE_ID || "default",
  projectId: process.env.ATS_PROJECT_ID || "default",
  userId: process.env.ATS_USER_ID || "default",
};
