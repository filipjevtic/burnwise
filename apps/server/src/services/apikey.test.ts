import { describe, it } from "node:test";
import assert from "node:assert";
import {
  generateKeyMaterial,
  fastHash,
  maskSecret,
  PUBLIC_PREFIX,
  SECRET_PREFIX,
} from "./apikey.js";

describe("generateKeyMaterial", () => {
  it("produces correctly prefixed public and secret keys", () => {
    const m = generateKeyMaterial();
    assert.ok(m.publicKey.startsWith(PUBLIC_PREFIX));
    assert.ok(m.secret.startsWith(SECRET_PREFIX));
  });

  it("derives fastHashedSecretKey as sha256 of the secret", () => {
    const m = generateKeyMaterial();
    assert.strictEqual(m.fastHashedSecretKey, fastHash(m.secret));
  });

  it("produces unique keys each call", () => {
    const a = generateKeyMaterial();
    const b = generateKeyMaterial();
    assert.notStrictEqual(a.publicKey, b.publicKey);
    assert.notStrictEqual(a.secret, b.secret);
    assert.notStrictEqual(a.fastHashedSecretKey, b.fastHashedSecretKey);
  });

  it("masks the display secret keeping the last 4 chars", () => {
    const m = generateKeyMaterial();
    const last4 = m.secret.slice(-4);
    assert.strictEqual(m.displaySecretKey, `${SECRET_PREFIX}...${last4}`);
    assert.ok(!m.displaySecretKey.includes(m.secret.slice(SECRET_PREFIX.length, -4)));
  });
});

describe("fastHash", () => {
  it("is deterministic", () => {
    assert.strictEqual(fastHash("bw_sk_abc"), fastHash("bw_sk_abc"));
  });
  it("differs for different inputs", () => {
    assert.notStrictEqual(fastHash("bw_sk_abc"), fastHash("bw_sk_xyz"));
  });
});

describe("maskSecret", () => {
  it("hides the body of the secret", () => {
    const masked = maskSecret("bw_sk_1234567890abcd");
    assert.strictEqual(masked, "bw_sk_...abcd");
  });
});
