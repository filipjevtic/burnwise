import Fastify from "fastify";
import { config } from "./config.js";
import { forwardRequest } from "./upstream.js";
import { emitLlmEvents } from "./events.js";
import { extractAttribution, stripBurnwiseHeaders } from "./attribution.js";

const app = Fastify({
  logger: true,
  bodyLimit: 10 * 1024 * 1024, // 10MB
});

app.addContentTypeParser("application/json", { parseAs: "string" }, (req, body, done) => {
  try {
    const json = typeof body === "string" ? JSON.parse(body) : body;
    done(null, json);
  } catch (err) {
    done(err as Error, undefined);
  }
});

app.all("/*", async (request, reply) => {
  const requestBody = request.body;
  const requestId = crypto.randomUUID();
  const requestStart = Date.now();

  // Read Burnwise attribution and strip it so it never reaches the provider.
  const attribution = extractAttribution(request.headers);
  const upstreamHeaders = stripBurnwiseHeaders(request.headers);

  let responseBody = "";
  let statusCode = 502;
  let headers: Record<string, string | undefined> = {};

  try {
    const result = await forwardRequest({
      method: request.method,
      path: request.url,
      headers: upstreamHeaders as Record<string, string>,
      body: requestBody,
    });
    responseBody = result.responseBody;
    statusCode = result.statusCode;
    headers = result.headers;
  } catch (err) {
    app.log.error({ err }, "Failed to forward request to upstream");
    reply.status(502);
    return reply.send({ error: "Bad gateway", message: err instanceof Error ? err.message : "Unknown error" });
  }

  const latencyMs = Date.now() - requestStart;

  // Best-effort event emission; do not fail the request if it errors.
  try {
    await emitLlmEvents({
      requestId,
      requestBody,
      responseBody,
      latencyMs,
      attribution,
    });
  } catch (err) {
    app.log.warn({ err }, "Failed to emit LLM events");
  }

  reply.status(statusCode);
  for (const [key, value] of Object.entries(headers)) {
    if (value !== undefined && !["content-encoding", "transfer-encoding", "content-length"].includes(key.toLowerCase())) {
      void reply.header(key, value);
    }
  }
  return reply.send(responseBody);
});

try {
  await app.listen({ port: config.port, host: "0.0.0.0" });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
