import { describe, it } from "node:test";
import assert from "node:assert";
import { encryptSecret, decryptSecret, isEncrypted, safeEqual } from "./crypto.js";

describe("encryptSecret / decryptSecret", () => {
  it("round-trips a secret", () => {
    const plain = "ghp_supersecrettoken12345";
    const enc = encryptSecret(plain);
    assert.ok(enc && enc !== plain);
    assert.ok(isEncrypted(enc));
    assert.strictEqual(decryptSecret(enc), plain);
  });

  it("produces a different ciphertext each time (random IV)", () => {
    const a = encryptSecret("same-value");
    const b = encryptSecret("same-value");
    assert.notStrictEqual(a, b);
    assert.strictEqual(decryptSecret(a), decryptSecret(b));
  });

  it("passes through null/undefined/empty unchanged", () => {
    assert.strictEqual(encryptSecret(null), null);
    assert.strictEqual(encryptSecret(undefined), undefined);
    assert.strictEqual(encryptSecret(""), "");
    assert.strictEqual(decryptSecret(null), null);
  });

  it("treats legacy plaintext as-is on decrypt", () => {
    assert.strictEqual(decryptSecret("legacy-plaintext-token"), "legacy-plaintext-token");
    assert.strictEqual(isEncrypted("legacy-plaintext-token"), false);
  });

  it("throws on a tampered/malformed encrypted value", () => {
    const enc = encryptSecret("value")!;
    const tampered = enc.slice(0, -4) + "AAAA";
    assert.throws(() => decryptSecret(tampered));
  });
});

describe("safeEqual", () => {
  it("returns true for equal strings", () => {
    assert.strictEqual(safeEqual("token-abc", "token-abc"), true);
  });
  it("returns false for different strings", () => {
    assert.strictEqual(safeEqual("token-abc", "token-xyz"), false);
  });
  it("returns false for different lengths", () => {
    assert.strictEqual(safeEqual("short", "longer-token"), false);
  });
});
