import Fastify from "fastify";
import { Readable, Transform } from "node:stream";
import { config } from "./config.js";
import { forwardRequest } from "./upstream.js";
import { emitLlmEvents } from "./events.js";
import { extractAttribution, stripBurnwiseHeaders } from "./attribution.js";
import { detectProvider } from "./providers.js";

const app = Fastify({
  logger: true,
  bodyLimit: 10 * 1024 * 1024, // 10MB
});

// Cap how much of a streamed response we buffer for usage parsing. Usage totals
// live at the end of both OpenAI and Anthropic SSE streams, so we keep the whole
// body; this guards only against a pathologically large response.
const STREAM_CAPTURE_LIMIT = 25 * 1024 * 1024;

// Response headers we must not copy back verbatim — they describe the upstream
// framing, which Node re-derives for the connection to the client.
const HOP_BY_HOP = new Set(["content-encoding", "transfer-encoding", "content-length"]);

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

  // Detect the wire format so a single proxy can front both OpenAI and Anthropic.
  const provider = detectProvider(
    { path: request.url, headers: request.headers, body: requestBody },
    config.provider
  );

  // Read Burnwise attribution and strip it so it never reaches the provider.
  const attribution = extractAttribution(request.headers);
  const upstreamHeaders = stripBurnwiseHeaders(request.headers);

  let result;
  try {
    result = await forwardRequest({
      method: request.method,
      path: request.url,
      headers: upstreamHeaders as Record<string, string>,
      body: requestBody,
    });
  } catch (err) {
    app.log.error({ err }, "Failed to forward request to upstream");
    reply.status(502);
    return reply.send({ error: "Bad gateway", message: err instanceof Error ? err.message : "Unknown error" });
  }

  reply.status(result.statusCode);
  for (const [key, value] of Object.entries(result.headers)) {
    if (value !== undefined && !HOP_BY_HOP.has(key.toLowerCase())) {
      void reply.header(key, value);
    }
  }

  // Best-effort event emission; never fail the request if it errors.
  const emit = (responseBody: string) => {
    emitLlmEvents({
      requestId,
      provider,
      requestBody,
      responseBody,
      latencyMs: Date.now() - requestStart,
      attribution,
    }).catch((err) => app.log.warn({ err }, "Failed to emit LLM events"));
  };

  const contentType = (result.headers["content-type"] || "").toLowerCase();
  const isStream = contentType.includes("text/event-stream") && result.response.body !== null;

  if (isStream) {
    // Stream the SSE response straight back to the client while teeing it into a
    // buffer so we can parse usage once the stream completes.
    let captured = "";
    const tee = new Transform({
      transform(chunk, _enc, cb) {
        if (captured.length < STREAM_CAPTURE_LIMIT) captured += chunk.toString("utf8");
        cb(null, chunk);
      },
    });
    const source = Readable.fromWeb(result.response.body as import("node:stream/web").ReadableStream);
    source.on("end", () => emit(captured));
    source.on("error", (err) => app.log.warn({ err }, "Upstream stream error"));
    return reply.send(source.pipe(tee));
  }

  const responseBody = await result.response.text();
  emit(responseBody);
  return reply.send(responseBody);
});

try {
  await app.listen({ port: config.port, host: "0.0.0.0" });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
