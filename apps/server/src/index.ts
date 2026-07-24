import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { config } from "./config.js";
import { registerOpenApi } from "./openapi.js";
import { registerEventRoutes } from "./routes/events.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerTicketRoutes } from "./routes/tickets.js";
import { registerSprintRoutes } from "./routes/sprints.js";
import { registerIntegrationRoutes } from "./routes/integrations.js";
import { registerForecastRoutes } from "./routes/forecast.js";
import { registerProjectRoutes } from "./routes/projects.js";
import { registerAlertRoutes } from "./routes/alerts.js";
import { registerTeamRoutes } from "./routes/team.js";
import { registerCIRoutes } from "./routes/ci.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerOAuthRoutes } from "./routes/oauth.js";
import { registerInviteRoutes } from "./routes/invites.js";
import { registerKeyRoutes } from "./routes/keys.js";
import { registerSessionRoutes } from "./routes/sessions.js";
import { registerAnalyticsRoutes } from "./routes/analytics.js";
import { registerWorkspaceRoutes } from "./routes/workspace.js";
import { registerOtelRoutes } from "./routes/otel.js";
import { registerCloudRoutes } from "./routes/cloud.js";
import { registerAuditRoutes } from "./routes/audit.js";
import { registerWebhookRoutes } from "./routes/webhooks.js";

const app = Fastify({
  logger: true,
});

// Parse JSON while retaining the raw body string on the request, so webhook
// routes can verify HMAC signatures computed over the exact bytes received.
app.addContentTypeParser(
  "application/json",
  { parseAs: "string" },
  (req, body, done) => {
    (req as { rawBody?: string }).rawBody = typeof body === "string" ? body : body.toString();
    try {
      done(null, body === "" ? undefined : JSON.parse(body as string));
    } catch (err) {
      done(err as Error, undefined);
    }
  }
);

// In production, restrict CORS to an explicit allow-list (defaults to the
// dashboard APP_URL); in dev, reflect any origin for convenience. Non-browser
// callers send no Origin header and are unaffected.
const corsOrigin =
  config.nodeEnv === "production"
    ? config.corsAllowedOrigins.length > 0
      ? config.corsAllowedOrigins
      : [config.appUrl]
    : true;
await app.register(cors, { origin: corsOrigin, methods: ["GET", "HEAD", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"] });

// Global per-IP rate limit. Routes can tighten/loosen this via their
// `config.rateLimit` option (see auth and events). Health checks are exempt so
// liveness/readiness probes are never throttled.
if (config.rateLimit.enabled) {
  await app.register(rateLimit, {
    global: true,
    max: config.rateLimit.max,
    timeWindow: config.rateLimit.timeWindow,
    allowList: (req) => req.url.startsWith("/health"),
  });
}

// Publish the OpenAPI spec (/openapi.json) and Swagger UI (/docs) generated from
// the route table below. Registered before routes so every route is captured.
await registerOpenApi(app, config.serverPublicUrl);

await app.register(registerHealthRoutes, { prefix: "/health" });
await app.register(registerEventRoutes, { prefix: "/api/v1/events" });
await app.register(registerTicketRoutes, { prefix: "/api/v1/tickets" });
await app.register(registerSprintRoutes, { prefix: "/api/v1/sprints" });
await app.register(registerIntegrationRoutes, { prefix: "/api/v1/integrations" });
await app.register(registerForecastRoutes, { prefix: "/api/v1/forecast" });
await app.register(registerProjectRoutes, { prefix: "/api/v1/projects" });
await app.register(registerAlertRoutes, { prefix: "/api/v1/alerts" });
await app.register(registerTeamRoutes, { prefix: "/api/v1/team" });
await app.register(registerCIRoutes, { prefix: "/api/v1/ci" });
await app.register(registerAuthRoutes, { prefix: "/api/v1/auth" });
await app.register(registerOAuthRoutes, { prefix: "/api/v1/auth/oauth" });
await app.register(registerInviteRoutes, { prefix: "/api/v1/invites" });
await app.register(registerKeyRoutes, { prefix: "/api/v1/keys" });
await app.register(registerSessionRoutes, { prefix: "/api/v1/sessions" });
await app.register(registerAnalyticsRoutes, { prefix: "/api/v1/analytics" });
await app.register(registerWorkspaceRoutes, { prefix: "/api/v1/workspace" });
await app.register(registerOtelRoutes, { prefix: "/api/v1/otel" });
await app.register(registerCloudRoutes, { prefix: "/api/v1/cloud" });
await app.register(registerAuditRoutes, { prefix: "/api/v1/audit" });
await app.register(registerWebhookRoutes, { prefix: "/api/v1/webhooks" });

try {
  await app.listen({ port: config.port, host: "::" });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
