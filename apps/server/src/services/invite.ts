import { randomBytes } from "node:crypto";
import { getPrisma } from "../db.js";
import type { TeamRole } from "./team.js";

const INVITE_TTL_HOURS = 72;

/** Bearer credential granting workspace/project membership — must be a CSPRNG secret. */
function generateInviteToken(): string {
  return randomBytes(32).toString("base64url");
}

export interface InviteInfo {
  id: string;
  token: string;
  projectId: string;
  projectName: string;
  workspaceId: string;
  workspaceName: string;
  role: string;
  email: string | null;
  expiresAt: Date;
  acceptedAt: Date | null;
}

export async function createInvite(input: {
  projectId: string;
  workspaceId: string;
  createdById: string;
  role: TeamRole;
  email?: string;
}): Promise<InviteInfo> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prisma = await getPrisma() as any;

  const expiresAt = new Date(Date.now() + INVITE_TTL_HOURS * 60 * 60 * 1000);

  const invite = await prisma.invite.create({
    data: {
      token: generateInviteToken(),
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      createdById: input.createdById,
      role: input.role,
      email: input.email ?? null,
      expiresAt,
    },
    include: { project: true, workspace: true },
  });

  return {
    id: invite.id,
    token: invite.token,
    projectId: invite.projectId,
    projectName: invite.project.name,
    workspaceId: invite.workspaceId,
    workspaceName: invite.workspace.name,
    role: invite.role,
    email: invite.email,
    expiresAt: invite.expiresAt,
    acceptedAt: invite.acceptedAt,
  };
}

export async function getInvite(token: string): Promise<InviteInfo | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prisma = await getPrisma() as any;

  const invite = await prisma.invite.findUnique({
    where: { token },
    include: { project: true, workspace: true },
  });

  if (!invite) return null;

  return {
    id: invite.id,
    token: invite.token,
    projectId: invite.projectId,
    projectName: invite.project.name,
    workspaceId: invite.workspaceId,
    workspaceName: invite.workspace.name,
    role: invite.role,
    email: invite.email,
    expiresAt: invite.expiresAt,
    acceptedAt: invite.acceptedAt,
  };
}

export async function acceptInvite(input: {
  token: string;
  email: string;
  displayName?: string;
  passwordHash?: string;
}): Promise<{ userId: string; role: string; workspaceId: string }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prisma = await getPrisma() as any;

  // Everything runs in one transaction so the invite can't be redeemed twice
  // and a partial failure can't orphan a user or membership.
  return await prisma.$transaction(async (tx: typeof prisma) => {
    const invite = await tx.invite.findUnique({
      where: { token: input.token },
    });

    if (!invite) throw new Error("Invite not found");
    if (invite.acceptedAt) throw new Error("Invite already used");
    if (invite.expiresAt < new Date()) throw new Error("Invite has expired");
    if (invite.email && invite.email.toLowerCase() !== input.email.toLowerCase()) {
      throw new Error("This invite is for a different email address");
    }

    // Account-takeover guard: this endpoint is unauthenticated, so it must never
    // touch a pre-existing account. If one already exists for this email, refuse
    // — the person should sign in, and an admin can add them via the team API.
    // (Previously the upsert overwrote an existing user's password hash and
    // minted a session for them.)
    const existing = await tx.user.findUnique({
      where: { workspaceId_email: { workspaceId: invite.workspaceId, email: input.email } },
    });
    if (existing) {
      throw new Error("An account with this email already exists. Sign in to accept the invite.");
    }

    // Atomically claim the invite; if another request already claimed it, abort.
    const claimed = await tx.invite.updateMany({
      where: { token: input.token, acceptedAt: null },
      data: { acceptedAt: new Date() },
    });
    if (claimed.count === 0) throw new Error("Invite already used");

    const user = await tx.user.create({
      data: {
        workspaceId: invite.workspaceId,
        email: input.email,
        displayName: input.displayName ?? input.email,
        passwordHash: input.passwordHash ?? null,
        role: "member",
      },
    });

    await tx.teamMember.create({
      data: { projectId: invite.projectId, userId: user.id, role: invite.role },
    });

    return { userId: user.id, role: user.role, workspaceId: invite.workspaceId };
  });
}
