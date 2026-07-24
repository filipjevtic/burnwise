import { createHmac } from "crypto";
import type { FastifyRequest } from "fastify";
import { config } from "../config.js";
import { safeEqual } from "./crypto.js";

export type CiProvider = "github" | "gitlab" | "generic";

export interface CiWebhookOptions {
  /** Per-project secret (already decrypted). Falls back to the global secret. */
  secret?: string | null;
  /**
   * Provider the project has declared. When set, verification is pinned to that
   * method — the caller can't downgrade to a weaker one by sending a different
   * header (#183). When unset, any supported method is accepted.
   */
  provider?: CiProvider | null;
}

type Result = { ok: boolean; skipped: boolean; reason?: string };

/**
 * Verify an inbound CI webhook.
 *
 * Secret resolution: the per-project `opts.secret` (each project has its own, so
 * knowing one project's secret can't forge events into another — #183) falls
 * back to the global `CI_WEBHOOK_SECRET` for backward compatibility.
 *
 * Supported methods:
 *  - GitHub  : `X-Hub-Signature-256: sha256=<hmac>` over the raw body.
 *  - GitLab  : `X-Gitlab-Token: <secret>` (constant-time compare).
 *  - generic : `Authorization: Bearer <secret>` or `X-Burnwise-Webhook-Token`.
 *
 * When a project pins `opts.provider`, only that method is accepted; otherwise
 * whichever supported header is present is used.
 *
 * When no secret is configured (neither per-project nor global):
 *  - production rejects (fail closed) so events can't be injected unauthenticated;
 *  - outside production verification is skipped `{ ok: true, skipped: true }` so
 *    local/dev self-host keeps working (the caller logs a warning).
 */
export function verifyCiWebhook(
  request: FastifyRequest & { rawBody?: string },
  opts: CiWebhookOptions = {}
): Result {
  const secret = opts.secret && opts.secret.length > 0 ? opts.secret : config.ciWebhookSecret;
  if (!secret) {
    if (config.nodeEnv === "production") {
      return { ok: false, skipped: false, reason: "CI webhook secret not configured" };
    }
    return { ok: true, skipped: true };
  }

  const provider = opts.provider ?? null;
  if (provider === "github") return checkGitHub(request, secret) ?? missing("GitHub signature");
  if (provider === "gitlab") return checkGitLab(request, secret) ?? missing("GitLab token");
  if (provider === "generic") return checkGeneric(request, secret) ?? missing("webhook token");

  // No pinned provider: accept whichever supported header is present.
  return (
    checkGitHub(request, secret) ??
    checkGitLab(request, secret) ??
    checkGeneric(request, secret) ??
    missing("webhook signature/token")
  );
}

function missing(what: string): Result {
  return { ok: false, skipped: false, reason: `Missing ${what}` };
}

/** Returns a definitive result when the relevant header is present, else null. */
function checkGitHub(request: FastifyRequest & { rawBody?: string }, secret: string): Result | null {
  const ghSig = request.headers["x-hub-signature-256"];
  if (typeof ghSig !== "string") return null;
  const raw = request.rawBody ?? JSON.stringify(request.body ?? {});
  const expected = "sha256=" + createHmac("sha256", secret).update(raw).digest("hex");
  return ghSig.length === expected.length && safeEqual(ghSig, expected)
    ? { ok: true, skipped: false }
    : { ok: false, skipped: false, reason: "Invalid GitHub signature" };
}

function checkGitLab(request: FastifyRequest, secret: string): Result | null {
  const glToken = request.headers["x-gitlab-token"];
  if (typeof glToken !== "string") return null;
  return safeEqual(glToken, secret)
    ? { ok: true, skipped: false }
    : { ok: false, skipped: false, reason: "Invalid GitLab token" };
}

function checkGeneric(request: FastifyRequest, secret: string): Result | null {
  const auth = request.headers["authorization"];
  const bearer = typeof auth === "string" && auth.startsWith("Bearer ") ? auth.slice(7) : null;
  const generic = (request.headers["x-burnwise-webhook-token"] as string | undefined) ?? bearer;
  if (typeof generic !== "string") return null;
  return safeEqual(generic, secret)
    ? { ok: true, skipped: false }
    : { ok: false, skipped: false, reason: "Invalid webhook token" };
}
