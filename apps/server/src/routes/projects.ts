import type { FastifyInstance, FastifyPluginOptions, FastifyRequest, FastifyReply } from "fastify";
import { getPrisma } from "../db.js";
import { requireAuth, requireAdmin, type AuthPayload } from "../middleware/auth.js";
import { assertProjectInWorkspace, assertSprintInWorkspace } from "../middleware/scope.js";

export async function registerProjectRoutes(
  app: FastifyInstance,
  _opts: FastifyPluginOptions
) {
  const prisma = await getPrisma();

  app.get("/", { preHandler: requireAuth }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { workspaceId } = (request as FastifyRequest & { user: AuthPayload }).user;
    const projects = await prisma.project.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, slug: true, createdAt: true },
    });
    return reply.send({ projects });
  });

  app.post<{ Body: { name: string; slug?: string } }>(
    "/",
    { preHandler: requireAdmin },
    async (request, reply) => {
      const { workspaceId, userId } = (request as FastifyRequest & { user: AuthPayload }).user;
      const { name, slug } = request.body;
      if (!name) return reply.status(400).send({ error: "name is required" });
      const derivedSlug = (slug || name)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");
      const existing = await prisma.project.findUnique({
        where: { workspaceId_slug: { workspaceId, slug: derivedSlug } },
      });
      if (existing) return reply.status(409).send({ error: "A project with that name already exists" });
      const project = await prisma.project.create({
        data: { workspaceId, name, slug: derivedSlug },
      });
      await prisma.teamMember.create({
        data: { projectId: project.id, userId, role: "admin" },
      });
      return reply.status(201).send(project);
    }
  );

  app.put<{ Params: { projectId: string }; Body: { tokenBudget?: number; costBudget?: number; tokenBudgetAlertThreshold?: number; costBudgetAlertThreshold?: number } }>("/:projectId", { preHandler: requireAdmin }, async (request, reply) => {
    const { workspaceId } = (request as FastifyRequest & { user: AuthPayload }).user;
    if (!(await assertProjectInWorkspace(prisma, reply, request.params.projectId, workspaceId))) return;
    const project = await prisma.project.update({
      where: { id: request.params.projectId },
      data: {
        tokenBudget: request.body.tokenBudget,
        costBudget: request.body.costBudget,
        tokenBudgetAlertThreshold: request.body.tokenBudgetAlertThreshold,
        costBudgetAlertThreshold: request.body.costBudgetAlertThreshold,
      },
    });
    return project;
  });

  app.put<{ Params: { sprintId: string }; Body: { tokenBudget?: number; costBudget?: number; tokenBudgetAlertThreshold?: number; costBudgetAlertThreshold?: number } }>("/sprint/:sprintId", { preHandler: requireAdmin }, async (request, reply) => {
    const { workspaceId } = (request as FastifyRequest & { user: AuthPayload }).user;
    if (!(await assertSprintInWorkspace(prisma, reply, request.params.sprintId, workspaceId))) return;
    const sprint = await prisma.sprint.update({
      where: { id: request.params.sprintId },
      data: {
        tokenBudget: request.body.tokenBudget,
        costBudget: request.body.costBudget,
        tokenBudgetAlertThreshold: request.body.tokenBudgetAlertThreshold,
        costBudgetAlertThreshold: request.body.costBudgetAlertThreshold,
      },
    });
    return sprint;
  });
}
