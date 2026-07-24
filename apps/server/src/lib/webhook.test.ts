import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import type { FastifyRequest } from "fastify";
import { config } from "../config.js";
import { verifyCiWebhook } from "./webhook.js";

function req(headers: Record<string, string>, rawBody = "{}"): FastifyRequest & { rawBody?: string } {
  return { headers, rawBody, body: JSON.parse(rawBody) } as unknown as FastifyRequest & { rawBody?: string };
}

function withConfig(secret: string, nodeEnv: string, fn: () => void) {
  const prevSecret = config.ciWebhookSecret;
  const prevEnv = config.nodeEnv;
  config.ciWebhookSecret = secret;
  config.nodeEnv = nodeEnv;
  try {
    fn();
  } finally {
    config.ciWebhookSecret = prevSecret;
    config.nodeEnv = prevEnv;
  }
}

test("verifyCiWebhook", async (t) => {
  await t.test("no secret in development → skipped (fail open)", () => {
    withConfig("", "development", () => {
      const r = verifyCiWebhook(req({}));
      assert.deepEqual(r, { ok: true, skipped: true });
    });
  });

  await t.test("no secret in production → rejected (fail closed)", () => {
    withConfig("", "production", () => {
      const r = verifyCiWebhook(req({}));
      assert.equal(r.ok, false);
      assert.equal(r.skipped, false);
    });
  });

  await t.test("valid GitHub HMAC → ok", () => {
    withConfig("s3cret", "production", () => {
      const raw = JSON.stringify({ hello: "world" });
      const sig = "sha256=" + createHmac("sha256", "s3cret").update(raw).digest("hex");
      const r = verifyCiWebhook(req({ "x-hub-signature-256": sig }, raw));
      assert.equal(r.ok, true);
    });
  });

  await t.test("invalid GitHub HMAC → rejected", () => {
    withConfig("s3cret", "production", () => {
      const raw = JSON.stringify({ hello: "world" });
      const r = verifyCiWebhook(req({ "x-hub-signature-256": "sha256=deadbeef" }, raw));
      assert.equal(r.ok, false);
    });
  });

  await t.test("valid GitLab token → ok; wrong token → rejected", () => {
    withConfig("s3cret", "production", () => {
      assert.equal(verifyCiWebhook(req({ "x-gitlab-token": "s3cret" })).ok, true);
      assert.equal(verifyCiWebhook(req({ "x-gitlab-token": "nope" })).ok, false);
    });
  });

  await t.test("generic bearer token → ok", () => {
    withConfig("s3cret", "production", () => {
      assert.equal(verifyCiWebhook(req({ authorization: "Bearer s3cret" })).ok, true);
    });
  });

  await t.test("secret set but no signature/token → rejected", () => {
    withConfig("s3cret", "production", () => {
      assert.equal(verifyCiWebhook(req({})).ok, false);
    });
  });

  await t.test("per-project secret overrides the global secret (#183)", () => {
    withConfig("global-secret", "production", () => {
      // The project's own token verifies; the global one no longer does.
      assert.equal(verifyCiWebhook(req({ "x-gitlab-token": "proj-secret" }), { secret: "proj-secret" }).ok, true);
      assert.equal(verifyCiWebhook(req({ "x-gitlab-token": "global-secret" }), { secret: "proj-secret" }).ok, false);
    });
  });

  await t.test("per-project secret works even when no global secret is set", () => {
    withConfig("", "production", () => {
      assert.equal(verifyCiWebhook(req({ "x-gitlab-token": "proj" }), { secret: "proj" }).ok, true);
      // Still fail-closed when neither is configured.
      assert.equal(verifyCiWebhook(req({ "x-gitlab-token": "x" }), { secret: "" }).ok, false);
    });
  });

  await t.test("pinned provider rejects a different (weaker) method (#183)", () => {
    withConfig("", "production", () => {
      // Project pinned to github: a valid gitlab token must NOT be accepted.
      assert.equal(
        verifyCiWebhook(req({ "x-gitlab-token": "proj" }), { secret: "proj", provider: "github" }).ok,
        false
      );
      // And the correct github signature IS accepted under the pin.
      const raw = JSON.stringify({ a: 1 });
      const sig = "sha256=" + createHmac("sha256", "proj").update(raw).digest("hex");
      assert.equal(
        verifyCiWebhook(req({ "x-hub-signature-256": sig }, raw), { secret: "proj", provider: "github" }).ok,
        true
      );
    });
  });

  await t.test("pinned gitlab ignores a github header and requires its token", () => {
    withConfig("", "production", () => {
      assert.equal(
        verifyCiWebhook(req({ "x-hub-signature-256": "sha256=whatever" }), { secret: "proj", provider: "gitlab" }).ok,
        false
      );
      assert.equal(
        verifyCiWebhook(req({ "x-gitlab-token": "proj" }), { secret: "proj", provider: "gitlab" }).ok,
        true
      );
    });
  });
});
