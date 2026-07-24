import type { FastifyInstance, FastifyPluginOptions, FastifyRequest } from "fastify";
import { listTeamMembers, addTeamMember, removeTeamMember, updateTeamMember, type TeamRole } from "../services/team.js";
import { requireAuth, type AuthPayload } from "../middleware/auth.js";
import { requireProjectRole } from "../middleware/rbac.js";
import { getPrisma } from "../db.js";
import { recordAudit } from "../services/audit.js";

export async function registerTeamRoutes(
  app: FastifyInstance,
  _opts: FastifyPluginOptions
) {
  const prisma = await getPrisma();

  // Listing the team is read access (viewer+); this also enforces tenancy.
  app.get<{ Params: { projectId: string } }>("/:projectId", { preHandler: requireAuth }, async (request, reply) => {
    const { projectId } = request.params;
    if (!(await requireProjectRole(prisma, request, reply, projectId, "viewer"))) return;
    try {
      const members = await listTeamMembers(projectId);
      return { members };
    } catch (err) {
      return reply.status(500).send({ error: err instanceof Error ? err.message : "Failed to list members" });
    }
  });

  // Managing members requires project admin (workspace admins bypass).
  app.post<{ Params: { projectId: string }; Body: { email: string; displayName?: string; role: TeamRole } }>("/:projectId", { preHandler: requireAuth }, async (request, reply) => {
    const { projectId } = request.params;
    if (!(await requireProjectRole(prisma, request, reply, projectId, "admin"))) return;
    const { email, displayName, role } = request.body;

    if (!email || !role) {
      return reply.status(400).send({ error: "email and role are required" });
    }

    try {
      const member = await addTeamMember({ projectId, email, displayName, role });
      const actor = (request as FastifyRequest & { user: AuthPayload }).user;
      await recordAudit(prisma, {
        workspaceId: actor.workspaceId,
        actorUserId: actor.userId,
        action: "team.member_add",
        targetType: "user",
        targetId: member.userId,
        metadata: { projectId, email, role },
      });
      return { member };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to add member";
      if (msg === "Invalid role") return reply.status(400).send({ error: msg });
      return reply.status(500).send({ error: msg });
    }
  });

  app.put<{ Params: { projectId: string; userId: string }; Body: { role: TeamRole } }>("/:projectId/:userId", { preHandler: requireAuth }, async (request, reply) => {
    const { projectId, userId } = request.params;
    if (!(await requireProjectRole(prisma, request, reply, projectId, "admin"))) return;
    const { role } = request.body;

    if (!role) {
      return reply.status(400).send({ error: "role is required" });
    }

    try {
      await updateTeamMember(projectId, userId, role);
      const actor = (request as FastifyRequest & { user: AuthPayload }).user;
      await recordAudit(prisma, {
        workspaceId: actor.workspaceId,
        actorUserId: actor.userId,
        action: "team.role_change",
        targetType: "user",
        targetId: userId,
        metadata: { projectId, role },
      });
      return { success: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to update member";
      if (msg === "Invalid role") return reply.status(400).send({ error: msg });
      if (msg === "Member not found") return reply.status(404).send({ error: msg });
      return reply.status(500).send({ error: msg });
    }
  });

  app.delete<{ Params: { projectId: string; userId: string } }>("/:projectId/:userId", { preHandler: requireAuth }, async (request, reply) => {
    const { projectId, userId } = request.params;
    if (!(await requireProjectRole(prisma, request, reply, projectId, "admin"))) return;
    try {
      await removeTeamMember(projectId, userId);
      const actor = (request as FastifyRequest & { user: AuthPayload }).user;
      await recordAudit(prisma, {
        workspaceId: actor.workspaceId,
        actorUserId: actor.userId,
        action: "team.member_remove",
        targetType: "user",
        targetId: userId,
        metadata: { projectId },
      });
      return { success: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to remove member";
      if (msg === "Member not found") return reply.status(404).send({ error: msg });
      return reply.status(500).send({ error: msg });
    }
  });
}
