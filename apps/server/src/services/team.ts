import { getPrisma } from "../db.js";

export type TeamRole = "owner" | "admin" | "member" | "viewer";

const VALID_ROLES: TeamRole[] = ["owner", "admin", "member", "viewer"];

interface AddMemberInput {
  projectId: string;
  email: string;
  displayName?: string;
  role: TeamRole;
}

export interface TeamMemberWithUser {
  id: string;
  userId: string;
  email: string;
  displayName: string | null;
  role: TeamRole;
  createdAt: Date;
}

export async function listTeamMembers(projectId: string): Promise<TeamMemberWithUser[]> {
  const prisma = await getPrisma();
  const members = await prisma.teamMember.findMany({
    where: { projectId },
    include: { user: true },
    orderBy: { createdAt: "asc" },
  });

  return members.map((m) => ({
    id: m.id,
    userId: m.userId,
    email: m.user.email,
    displayName: m.user.displayName,
    role: m.role as TeamRole,
    createdAt: m.createdAt,
  }));
}

export async function addTeamMember(input: AddMemberInput): Promise<TeamMemberWithUser> {
  const prisma = await getPrisma();
  const role = assertValidRole(input.role);

  const project = await prisma.project.findUnique({
    where: { id: input.projectId },
  });
  if (!project) {
    throw new Error("Project not found");
  }

  // Find or create user in the workspace.
  const user = await prisma.user.upsert({
    where: {
      workspaceId_email: {
        workspaceId: project.workspaceId,
        email: input.email,
      },
    },
    update: {
      displayName: input.displayName,
    },
    create: {
      workspaceId: project.workspaceId,
      email: input.email,
      displayName: input.displayName,
    },
  });

  const membership = await prisma.teamMember.upsert({
    where: {
      projectId_userId: {
        projectId: input.projectId,
        userId: user.id,
      },
    },
    update: {
      role,
    },
    create: {
      projectId: input.projectId,
      userId: user.id,
      role,
    },
  });

  return {
    id: membership.id,
    userId: user.id,
    email: user.email,
    displayName: user.displayName,
    role: membership.role as TeamRole,
    createdAt: membership.createdAt,
  };
}

export async function removeTeamMember(projectId: string, userId: string): Promise<void> {
  const prisma = await getPrisma();
  const result = await prisma.teamMember.deleteMany({
    where: { projectId, userId },
  });
  if (result.count === 0) {
    throw new Error("Member not found");
  }
}

export async function updateTeamMember(
  projectId: string,
  userId: string,
  role: TeamRole
): Promise<void> {
  const prisma = await getPrisma();
  const result = await prisma.teamMember.updateMany({
    where: { projectId, userId },
    data: { role: assertValidRole(role) },
  });
  if (result.count === 0) {
    throw new Error("Member not found");
  }
}

/**
 * Validate a role against the allowed set (case-insensitive). Throws
 * "Invalid role" on an unrecognized value rather than silently downgrading to
 * member, so callers can surface a 400.
 */
function assertValidRole(role: string): TeamRole {
  const normalized = role.toLowerCase() as TeamRole;
  if (!VALID_ROLES.includes(normalized)) {
    throw new Error("Invalid role");
  }
  return normalized;
}
