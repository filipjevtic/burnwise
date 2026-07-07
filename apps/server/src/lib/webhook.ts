import { createHmac } from "crypto";
import type { FastifyRequest } from "fastify";
import { config } from "../config.js";
import { safeEqual } from "./crypto.js";

/**
 * Verify an inbound CI webhook against the configured shared secret.
 *
 * Supports the three providers the CI route accepts:
 *  - GitHub  : `X-Hub-Signature-256: sha256=<hmac>` over the raw body.
 *  - GitLab  : `X-Gitlab-Token: <secret>` (constant-time compare).
 *  - generic : `Authorization: Bearer <secret>` or `X-Burnwise-Webhook-Token`.
 *
 * When `CI_WEBHOOK_SECRET` is not configured:
 *  - in production the webhook is rejected (fail closed) so an unauthenticated
 *    caller cannot inject `ci.run` events;
 *  - outside production verification is skipped with `{ ok: true, skipped: true }`
 *    so local/dev self-host keeps working (the caller logs a warning).
 */
export function verifyCiWebhook(
  request: FastifyRequest & { rawBody?: string }
): { ok: boolean; skipped: boolean; reason?: string } {
  const secret = config.ciWebhookSecret;
  if (!secret) {
    if (config.nodeEnv === "production") {
      return { ok: false, skipped: false, reason: "CI webhook secret not configured" };
    }
    return { ok: true, skipped: true };
  }

  const headers = request.headers;

  // GitHub HMAC signature over the raw request body.
  const ghSig = headers["x-hub-signature-256"];
  if (typeof ghSig === "string") {
    const raw = request.rawBody ?? JSON.stringify(request.body ?? {});
    const expected = "sha256=" + createHmac("sha256", secret).update(raw).digest("hex");
    return ghSig.length === expected.length && safeEqual(ghSig, expected)
      ? { ok: true, skipped: false }
      : { ok: false, skipped: false, reason: "Invalid GitHub signature" };
  }

  // GitLab shared token.
  const glToken = headers["x-gitlab-token"];
  if (typeof glToken === "string") {
    return safeEqual(glToken, secret)
      ? { ok: true, skipped: false }
      : { ok: false, skipped: false, reason: "Invalid GitLab token" };
  }

  // Generic bearer token or explicit header.
  const auth = headers["authorization"];
  const bearer = typeof auth === "string" && auth.startsWith("Bearer ") ? auth.slice(7) : null;
  const generic = (headers["x-burnwise-webhook-token"] as string | undefined) ?? bearer;
  if (typeof generic === "string") {
    return safeEqual(generic, secret)
      ? { ok: true, skipped: false }
      : { ok: false, skipped: false, reason: "Invalid webhook token" };
  }

  return { ok: false, skipped: false, reason: "Missing webhook signature/token" };
}
