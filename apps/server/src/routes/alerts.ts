import type { FastifyInstance, FastifyPluginOptions, FastifyRequest, FastifyReply } from "fastify";
import { getPrisma } from "../db.js";
import { getProjectAlerts, getSprintAlerts } from "../services/alerts.js";
import { requireAuth, type AuthPayload } from "../middleware/auth.js";
import { assertProjectInWorkspace, assertSprintInWorkspace } from "../middleware/scope.js";

export async function registerAlertRoutes(
  app: FastifyInstance,
  _opts: FastifyPluginOptions
) {
  const prisma = await getPrisma();

  app.get<{ Params: { projectId: string } }>("/project/:projectId", { preHandler: requireAuth }, async (request, reply) => {
    const { workspaceId } = (request as FastifyRequest & { user: AuthPayload }).user;
    if (!(await assertProjectInWorkspace(prisma, reply, request.params.projectId, workspaceId))) return;
    const alerts = await getProjectAlerts(prisma, request.params.projectId);
    return { alerts };
  });

  app.get<{ Params: { sprintId: string } }>("/sprint/:sprintId", { preHandler: requireAuth }, async (request, reply) => {
    const { workspaceId } = (request as FastifyRequest & { user: AuthPayload }).user;
    if (!(await assertSprintInWorkspace(prisma, reply, request.params.sprintId, workspaceId))) return;
    const alerts = await getSprintAlerts(prisma, request.params.sprintId);
    return { alerts };
  });
}
