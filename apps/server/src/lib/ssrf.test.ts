import { test } from "node:test";
import assert from "node:assert/strict";
import { assertSafeIntegrationUrl, sameOrigin, SsrfError } from "./ssrf.js";

async function rejects(url: string): Promise<boolean> {
  try {
    await assertSafeIntegrationUrl(url);
    return false;
  } catch (err) {
    return err instanceof SsrfError;
  }
}

test("assertSafeIntegrationUrl", async (t) => {
  await t.test("rejects non-http(s) schemes", async () => {
    assert.equal(await rejects("file:///etc/passwd"), true);
    assert.equal(await rejects("gopher://example.com"), true);
    assert.equal(await rejects("ftp://example.com"), true);
  });

  await t.test("rejects invalid URLs", async () => {
    assert.equal(await rejects("not a url"), true);
  });

  await t.test("rejects loopback IP literals", async () => {
    assert.equal(await rejects("http://127.0.0.1/x"), true);
    assert.equal(await rejects("http://127.1.2.3/x"), true);
  });

  await t.test("rejects the cloud metadata (link-local) address", async () => {
    assert.equal(await rejects("http://169.254.169.254/latest/meta-data/"), true);
  });

  await t.test("rejects IPv6 loopback and link-local", async () => {
    assert.equal(await rejects("http://[::1]/x"), true);
    assert.equal(await rejects("http://[fe80::1]/x"), true);
  });

  await t.test("rejects IPv4-mapped IPv6 loopback", async () => {
    assert.equal(await rejects("http://[::ffff:127.0.0.1]/x"), true);
  });

  await t.test("rejects private ranges by default", async () => {
    assert.equal(await rejects("http://10.0.0.5/x"), true);
    assert.equal(await rejects("http://172.16.0.1/x"), true);
    assert.equal(await rejects("http://192.168.1.1/x"), true);
  });

  await t.test("allows a public IP literal", async () => {
    // 8.8.8.8 is a public address; guard should not throw.
    await assert.doesNotReject(() => assertSafeIntegrationUrl("https://8.8.8.8/x"));
  });
});

test("sameOrigin", async (t) => {
  await t.test("true for same protocol+host+port", () => {
    assert.equal(sameOrigin("https://gitlab.com/api/v4/x?page=2", "https://gitlab.com/api/v4/y"), true);
  });

  await t.test("false for different host", () => {
    assert.equal(sameOrigin("https://evil.com/x", "https://gitlab.com/y"), false);
  });

  await t.test("false for different scheme or port", () => {
    assert.equal(sameOrigin("http://gitlab.com/x", "https://gitlab.com/y"), false);
    assert.equal(sameOrigin("https://gitlab.com:8443/x", "https://gitlab.com/y"), false);
  });

  await t.test("false for malformed candidate", () => {
    assert.equal(sameOrigin("garbage", "https://gitlab.com/y"), false);
  });
});
