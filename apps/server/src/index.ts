import Fastify from "fastify";
import cors from "@fastify/cors";
import { config } from "./config.js";
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
import { registerAdminRoutes } from "./routes/admin.js";
import { registerOAuthRoutes } from "./routes/oauth.js";

const app = Fastify({
  logger: true,
});

await app.register(cors, { origin: true });

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
await app.register(registerAdminRoutes, { prefix: "/api/v1/admin" });
await app.register(registerOAuthRoutes, { prefix: "/api/v1/auth/oauth" });

try {
  await app.listen({ port: config.port, host: "0.0.0.0" });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
