import type { FastifyInstance } from "fastify";
import swagger from "@fastify/swagger";

/** Derive a tag from an API route URL: /api/v1/<group>/... -> "<group>". */
function tagForUrl(url: string): string {
  const m = url.match(/^\/api\/v1\/([^/]+)/);
  if (m) return m[1];
  if (url.startsWith("/health")) return "health";
  return "misc";
}

// Minimal docs page that renders /openapi.json with Swagger UI loaded from a CDN.
// We don't bundle Swagger UI's static assets: the server ships as a single
// esbuild bundle with no node_modules (see apps/server/Dockerfile), so a
// file-serving UI plugin can't find its assets at runtime. Air-gapped installs
// can point any OpenAPI viewer at /openapi.json instead.
const DOCS_HTML = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Burnwise API</title>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui.css" />
  </head>
  <body>
    <div id="app"></div>
    <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
    <script>
      window.onload = () => SwaggerUIBundle({ url: "/openapi.json", dom_id: "#app" });
    </script>
  </body>
</html>`;

/**
 * Publish an OpenAPI 3 spec generated from the live Fastify route table (#21):
 * raw JSON at /openapi.json and a rendered viewer at /docs. Tags are derived
 * from each route's URL prefix in one place (the `transform` hook), so new
 * routes appear automatically with no per-route annotation. We attach only doc
 * metadata here — never validation/serialization schemas — so enabling the spec
 * changes no runtime behavior.
 *
 * Must be registered before the route plugins so their routes are captured.
 */
export async function registerOpenApi(app: FastifyInstance, publicUrl: string): Promise<void> {
  await app.register(swagger, {
    openapi: {
      info: {
        title: "Burnwise API",
        description:
          "Vendor-neutral engineering intelligence for AI-assisted delivery. " +
          "This spec is generated from the live route table. Most dashboard/admin " +
          "endpoints require a session JWT (`bearerAuth`); ingest endpoints accept a " +
          "personal API key or the shared ingest key (`apiKey`).",
        version: "1.0.0",
      },
      servers: [{ url: publicUrl }],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: "http",
            scheme: "bearer",
            bearerFormat: "JWT",
            description: "Session JWT from POST /api/v1/auth/login.",
          },
          apiKey: {
            type: "http",
            scheme: "bearer",
            description: "Personal API key (bw_sk_...) or the shared INGEST_API_KEY for ingest endpoints.",
          },
        },
      },
    },
    // Group each route under a tag derived from its URL prefix. Returns the
    // schema unchanged apart from that doc-only tag, so no runtime behavior
    // changes.
    transform: ({ schema, url }) => {
      const s = { ...(schema ?? {}) } as Record<string, unknown>;
      if (url.startsWith("/api/") || url.startsWith("/health")) {
        if (!s.tags) s.tags = [tagForUrl(url)];
      }
      return { schema: s as typeof schema, url };
    },
  });

  // Raw spec, generated from the route table on request.
  app.get("/openapi.json", { schema: { hide: true } }, async () => app.swagger());

  // Human-viewable API reference.
  app.get("/docs", { schema: { hide: true } }, async (_request, reply) => {
    return reply.type("text/html").send(DOCS_HTML);
  });
}
