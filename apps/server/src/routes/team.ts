import type { FastifyInstance, FastifyPluginOptions } from "fastify";
import { listTeamMembers, addTeamMember, removeTeamMember, updateTeamMember, type TeamRole } from "../services/team.js";
import { requireAuth } from "../middleware/auth.js";
import { requireProjectRole } from "../middleware/rbac.js";
import { getPrisma } from "../db.js";

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
      return { member };
    } catch (err) {
      return reply.status(500).send({ error: err instanceof Error ? err.message : "Failed to add member" });
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
      return { success: true };
    } catch (err) {
      return reply.status(500).send({ error: err instanceof Error ? err.message : "Failed to update member" });
    }
  });

  app.delete<{ Params: { projectId: string; userId: string } }>("/:projectId/:userId", { preHandler: requireAuth }, async (request, reply) => {
    const { projectId, userId } = request.params;
    if (!(await requireProjectRole(prisma, request, reply, projectId, "admin"))) return;
    try {
      await removeTeamMember(projectId, userId);
      return { success: true };
    } catch (err) {
      return reply.status(500).send({ error: err instanceof Error ? err.message : "Failed to remove member" });
    }
  });
}
