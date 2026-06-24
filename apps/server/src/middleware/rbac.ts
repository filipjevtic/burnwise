import type { FastifyRequest, FastifyReply } from "fastify";
import type { PrismaClient } from "@prisma/client";
import type { AuthPayload } from "./auth.js";
import { assertProjectInWorkspace } from "./scope.js";
import { effectiveProjectRole, roleSatisfies, type ProjectRole } from "../lib/roles.js";

export interface ProjectAccess {
  projectId: string;
  /** The caller's effective role on the project (after admin bypass). */
  role: ProjectRole;
}

/**
 * Assert that the authenticated caller has at least `minRole` on `projectId`.
 *
 * Must run after `requireAuth` (the request must carry a `user`). It first
 * enforces workspace tenancy (404/403 via `assertProjectInWorkspace`), then
 * resolves the caller's effective role:
 *   - workspace admins/owners bypass membership (treated as project owner);
 *   - other users use their `TeamMember` role, defaulting to viewer.
 *
 * On success returns the resolved access. On failure it sends the appropriate
 * error response (401/403/404) and returns null — callers should `return`
 * immediately when null is returned.
 */
export async function requireProjectRole(
  prisma: PrismaClient,
  request: FastifyRequest,
  reply: FastifyReply,
  projectId: string,
  minRole: ProjectRole
): Promise<ProjectAccess | null> {
  const user = (request as FastifyRequest & { user?: AuthPayload }).user;
  if (!user) {
    reply.status(401).send({ error: "Unauthorized" });
    return null;
  }

  const project = await assertProjectInWorkspace(prisma, reply, projectId, user.workspaceId);
  if (!project) return null;

  let membershipRole: string | null = null;
  // Skip the membership lookup for workspace superusers — they bypass it.
  if (user.role?.toLowerCase() !== "admin" && user.role?.toLowerCase() !== "owner") {
    const membership = await prisma.teamMember.findUnique({
      where: { projectId_userId: { projectId, userId: user.userId } },
      select: { role: true },
    });
    membershipRole = membership?.role ?? null;
  }

  const role = effectiveProjectRole(user.role, membershipRole);
  if (!roleSatisfies(role, minRole)) {
    reply.status(403).send({ error: `Forbidden: requires project role '${minRole}' or higher` });
    return null;
  }

  return { projectId, role };
}
