import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from "crypto";
import { config } from "../config.js";

/**
 * Symmetric encryption for secrets stored at rest (e.g. integration API
 * tokens). Uses AES-256-GCM with a random IV per value.
 *
 * Encrypted values are serialized as `v1:<iv>:<authTag>:<ciphertext>` (base64
 * parts) so they are self-describing and can be detected/decrypted later.
 */

const PREFIX = "v1:";

/** Derive a stable 32-byte key from the configured secret. */
function getKey(): Buffer {
  // Prefer the dedicated encryption key; fall back to JWT secret in dev so
  // local/self-host setups without BURNWISE_ENCRYPTION_KEY keep working.
  const source = config.encryptionKey || config.jwtSecret;
  return createHash("sha256").update(source).digest();
}

/** True if the value looks like a string produced by `encryptSecret`. */
export function isEncrypted(value: string | null | undefined): boolean {
  return typeof value === "string" && value.startsWith(PREFIX);
}

/**
 * Encrypt a secret string. Returns the serialized ciphertext. Passing null /
 * undefined / empty returns the value unchanged so callers can pass optional
 * tokens through directly.
 */
export function encryptSecret(plaintext: string | null | undefined): string | null | undefined {
  if (plaintext === null || plaintext === undefined || plaintext === "") {
    return plaintext;
  }
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString("base64")}:${authTag.toString("base64")}:${ciphertext.toString("base64")}`;
}

/**
 * Decrypt a value produced by `encryptSecret`. If the value is not encrypted
 * (legacy plaintext) it is returned as-is so reads remain backward compatible.
 */
export function decryptSecret(value: string | null | undefined): string | null | undefined {
  if (value === null || value === undefined || value === "") return value;
  if (!isEncrypted(value)) return value; // legacy plaintext
  const [, ivB64, tagB64, dataB64] = value.split(":");
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error("Malformed encrypted value");
  }
  const decipher = createDecipheriv("aes-256-gcm", getKey(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}

/** Constant-time string comparison for tokens/secrets. */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}
