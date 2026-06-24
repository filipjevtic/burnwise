import { createHash, randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import type { PrismaClient } from "@prisma/client";

/**
 * API key service. Keys follow the Langfuse/Sentry model:
 *  - a public key (identifier, stored in clear) used for display/lookup
 *  - a secret key shown to the user exactly once
 *  - two hashes of the secret: a fast sha256 hash for O(1) lookup and a slow
 *    bcrypt hash for constant-time secure verification
 *  - a masked `displaySecretKey` for the UI
 *
 * Collectors authenticate by sending the secret as a bearer token.
 */

export const PUBLIC_PREFIX = "bw_pk_";
export const SECRET_PREFIX = "bw_sk_";

export interface GeneratedKeyMaterial {
  publicKey: string;
  secret: string;
  fastHashedSecretKey: string;
  displaySecretKey: string;
}

/** sha256 hex of the secret — used as a fast, indexable lookup key. */
export function fastHash(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

/** Mask a secret for display, keeping the prefix and last 4 chars. */
export function maskSecret(secret: string): string {
  const tail = secret.slice(-4);
  return `${SECRET_PREFIX}...${tail}`;
}

/** Generate fresh key material (no hashing-for-storage of the bcrypt part). */
export function generateKeyMaterial(): GeneratedKeyMaterial {
  const publicKey = PUBLIC_PREFIX + randomBytes(12).toString("hex");
  const secret = SECRET_PREFIX + randomBytes(24).toString("hex");
  return {
    publicKey,
    secret,
    fastHashedSecretKey: fastHash(secret),
    displaySecretKey: maskSecret(secret),
  };
}

export interface CreateApiKeyInput {
  workspaceId: string;
  userId: string;
  projectId?: string | null;
  scope?: "workspace" | "project";
  note?: string;
  rateLimitWindow?: number;
  rateLimitCount?: number;
  expiresAt?: Date | null;
}

export interface CreatedApiKey {
  id: string;
  publicKey: string;
  /** The secret — returned only once, at creation. */
  secret: string;
  displaySecretKey: string;
  scope: string;
  note: string | null;
  createdAt: Date;
}

/** Create and persist a new API key, returning the one-time secret. */
export async function createApiKey(
  prisma: PrismaClient,
  input: CreateApiKeyInput
): Promise<CreatedApiKey> {
  const material = generateKeyMaterial();
  const hashedSecretKey = await bcrypt.hash(material.secret, 12);
  const record = await prisma.apiKey.create({
    data: {
      publicKey: material.publicKey,
      hashedSecretKey,
      fastHashedSecretKey: material.fastHashedSecretKey,
      displaySecretKey: material.displaySecretKey,
      note: input.note ?? null,
      scope: input.scope ?? (input.projectId ? "project" : "workspace"),
      workspaceId: input.workspaceId,
      projectId: input.projectId ?? null,
      userId: input.userId,
      rateLimitWindow: input.rateLimitWindow ?? null,
      rateLimitCount: input.rateLimitCount ?? null,
      expiresAt: input.expiresAt ?? null,
    },
  });
  return {
    id: record.id,
    publicKey: record.publicKey,
    secret: material.secret,
    displaySecretKey: record.displaySecretKey,
    scope: record.scope,
    note: record.note,
    createdAt: record.createdAt,
  };
}

export interface VerifiedApiKey {
  id: string;
  workspaceId: string;
  userId: string;
  projectId: string | null;
  scope: string;
}

/**
 * Verify a secret bearer token. Returns the resolved key context or null if the
 * key is unknown, revoked, inactive, or expired.
 */
export async function verifyApiKey(
  prisma: PrismaClient,
  secret: string
): Promise<VerifiedApiKey | null> {
  if (!secret || !secret.startsWith(SECRET_PREFIX)) return null;
  const record = await prisma.apiKey.findUnique({
    where: { fastHashedSecretKey: fastHash(secret) },
  });
  if (!record) return null;
  if (!record.isActive || record.revokedAt) return null;
  if (record.expiresAt && record.expiresAt.getTime() < Date.now()) return null;

  const valid = await bcrypt.compare(secret, record.hashedSecretKey);
  if (!valid) return null;

  // Best-effort last-used tracking; don't block the request on it.
  void prisma.apiKey
    .update({ where: { id: record.id }, data: { lastUsedAt: new Date() } })
    .catch(() => {});

  return {
    id: record.id,
    workspaceId: record.workspaceId,
    userId: record.userId,
    projectId: record.projectId,
    scope: record.scope,
  };
}
