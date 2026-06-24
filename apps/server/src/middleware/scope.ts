import type { FastifyReply } from "fastify";
import type { PrismaClient } from "@prisma/client";

/**
 * Resolve a project and assert it belongs to the caller's workspace.
 *
 * Returns the project on success. On failure it sends the appropriate error
 * response (404 if missing, 403 if it belongs to another workspace) and
 * returns null — callers should `return` immediately when null is returned.
 *
 * This is the single guard used by every project-scoped route to prevent
 * cross-tenant data access.
 */
export async function assertProjectInWorkspace(
  prisma: PrismaClient,
  reply: FastifyReply,
  projectId: string,
  workspaceId: string
): Promise<{ id: string; workspaceId: string } | null> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, workspaceId: true },
  });
  if (!project) {
    reply.status(404).send({ error: "Project not found" });
    return null;
  }
  if (project.workspaceId !== workspaceId) {
    reply.status(403).send({ error: "Forbidden: project not in your workspace" });
    return null;
  }
  return project;
}

/**
 * Resolve a sprint, then assert its project belongs to the caller's workspace.
 */
export async function assertSprintInWorkspace(
  prisma: PrismaClient,
  reply: FastifyReply,
  sprintId: string,
  workspaceId: string
): Promise<{ id: string; projectId: string } | null> {
  const sprint = await prisma.sprint.findUnique({
    where: { id: sprintId },
    select: { id: true, projectId: true, project: { select: { workspaceId: true } } },
  });
  if (!sprint) {
    reply.status(404).send({ error: "Sprint not found" });
    return null;
  }
  if (sprint.project.workspaceId !== workspaceId) {
    reply.status(403).send({ error: "Forbidden: sprint not in your workspace" });
    return null;
  }
  return { id: sprint.id, projectId: sprint.projectId };
}

/**
 * Resolve a ticket, then assert its project belongs to the caller's workspace.
 */
export async function assertTicketInWorkspace(
  prisma: PrismaClient,
  reply: FastifyReply,
  ticketId: string,
  workspaceId: string
): Promise<{ id: string; projectId: string } | null> {
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: { id: true, projectId: true, project: { select: { workspaceId: true } } },
  });
  if (!ticket) {
    reply.status(404).send({ error: "Ticket not found" });
    return null;
  }
  if (ticket.project.workspaceId !== workspaceId) {
    reply.status(403).send({ error: "Forbidden: ticket not in your workspace" });
    return null;
  }
  return { id: ticket.id, projectId: ticket.projectId };
}
