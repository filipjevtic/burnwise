import type { FastifyInstance, FastifyPluginOptions, FastifyRequest, FastifyReply } from "fastify";
import { getPrisma } from "../db.js";
import { requireAuth, requireAdmin, type AuthPayload } from "../middleware/auth.js";
import { requireProjectRole } from "../middleware/rbac.js";
import { assertSprintInWorkspace } from "../middleware/scope.js";

interface BudgetBody {
  tokenBudget?: number;
  costBudget?: number;
  tokenBudgetAlertThreshold?: number;
  costBudgetAlertThreshold?: number;
}

/**
 * Validate + normalize budget input. Absent fields are omitted (partial update);
 * `null` clears a field. Returns an error string for invalid values so the route
 * can respond 400 instead of surfacing a Prisma 500 or storing nonsense.
 */
function validateBudget(body: BudgetBody): { data: BudgetBody } | { error: string } {
  const data: BudgetBody = {};

  const checkNumber = (
    key: keyof BudgetBody,
    { integer, min, max }: { integer?: boolean; min: number; max: number }
  ): string | null => {
    const value = body[key];
    if (value === undefined) return null;
    if (value === null) { data[key] = null as unknown as number; return null; }
    if (typeof value !== "number" || Number.isNaN(value)) return `${key} must be a number`;
    if (integer && !Number.isInteger(value)) return `${key} must be an integer`;
    if (value < min || value > max) return `${key} must be between ${min} and ${max}`;
    data[key] = value;
    return null;
  };

  const errors = [
    checkNumber("tokenBudget", { integer: true, min: 0, max: Number.MAX_SAFE_INTEGER }),
    checkNumber("costBudget", { min: 0, max: Number.MAX_SAFE_INTEGER }),
    checkNumber("tokenBudgetAlertThreshold", { integer: true, min: 0, max: 100 }),
    checkNumber("costBudgetAlertThreshold", { integer: true, min: 0, max: 100 }),
  ].filter(Boolean);

  if (errors.length > 0) return { error: errors[0] as string };
  return { data };
}

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
      select: { id: true, name: true, slug: true, createdAt: true, tokenBudget: true, costBudget: true, tokenBudgetAlertThreshold: true, costBudgetAlertThreshold: true },
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

  // Editing project budgets/settings requires project admin (workspace admins
  // bypass).
  app.put<{ Params: { projectId: string }; Body: { tokenBudget?: number; costBudget?: number; tokenBudgetAlertThreshold?: number; costBudgetAlertThreshold?: number } }>("/:projectId", { preHandler: requireAuth }, async (request, reply) => {
    if (!(await requireProjectRole(prisma, request, reply, request.params.projectId, "admin"))) return;
    const validated = validateBudget(request.body);
    if ("error" in validated) return reply.status(400).send({ error: validated.error });
    const project = await prisma.project.update({
      where: { id: request.params.projectId },
      data: validated.data,
    });
    return project;
  });

  // Editing sprint budgets requires project admin on the sprint's project.
  app.put<{ Params: { sprintId: string }; Body: { tokenBudget?: number; costBudget?: number; tokenBudgetAlertThreshold?: number; costBudgetAlertThreshold?: number } }>("/sprint/:sprintId", { preHandler: requireAuth }, async (request, reply) => {
    const { workspaceId } = (request as FastifyRequest & { user: AuthPayload }).user;
    const resolved = await assertSprintInWorkspace(prisma, reply, request.params.sprintId, workspaceId);
    if (!resolved) return;
    if (!(await requireProjectRole(prisma, request, reply, resolved.projectId, "admin"))) return;
    const validated = validateBudget(request.body);
    if ("error" in validated) return reply.status(400).send({ error: validated.error });
    const sprint = await prisma.sprint.update({
      where: { id: request.params.sprintId },
      data: validated.data,
    });
    return sprint;
  });
}
