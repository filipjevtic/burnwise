import type { FastifyInstance, FastifyPluginOptions } from "fastify";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { requireAuth, type AuthPayload } from "../middleware/auth.js";
import { requireProjectRole } from "../middleware/rbac.js";
import { createInvite, getInvite, acceptInvite } from "../services/invite.js";
import { config } from "../config.js";
import { getPrisma } from "../db.js";
import type { TeamRole } from "../services/team.js";

function signToken(payload: AuthPayload): string {
  return jwt.sign(payload, config.jwtSecret, { expiresIn: config.jwtExpiry } as jwt.SignOptions);
}

export async function registerInviteRoutes(
  app: FastifyInstance,
  _opts: FastifyPluginOptions
) {
  const prisma = await getPrisma();

  // Inviting members to a project requires project admin (workspace admins
  // bypass). The target project is read from the request body.
  app.post<{
    Body: { projectId: string; role?: TeamRole; email?: string };
  }>(
    "/",
    { preHandler: requireAuth },
    async (request, reply) => {
      const user = (request as typeof request & { user: AuthPayload }).user;
      const { projectId, role = "member", email } = request.body;

      if (!projectId) {
        return reply.status(400).send({ error: "projectId is required" });
      }
      if (!(await requireProjectRole(prisma, request, reply, projectId, "admin"))) return;

      try {
        const invite = await createInvite({
          projectId,
          workspaceId: user.workspaceId,
          createdById: user.userId,
          role,
          email,
        });

        const link = `${config.appUrl.replace(/\/$/, "")}/invite/${invite.token}`;
        return reply.status(201).send({ invite, link });
      } catch (err) {
        return reply.status(500).send({ error: err instanceof Error ? err.message : "Failed to create invite" });
      }
    }
  );

  app.get<{ Params: { token: string } }>(
    "/:token",
    async (request, reply) => {
      const invite = await getInvite(request.params.token);
      if (!invite) return reply.status(404).send({ error: "Invite not found" });
      if (invite.acceptedAt) return reply.status(410).send({ error: "Invite already used" });
      if (invite.expiresAt < new Date()) return reply.status(410).send({ error: "Invite has expired" });
      return reply.send({ invite });
    }
  );

  app.post<{
    Params: { token: string };
    Body: { email: string; displayName?: string; password?: string };
  }>(
    "/:token/accept",
    async (request, reply) => {
      const { email, displayName, password } = request.body;

      if (!email) {
        return reply.status(400).send({ error: "email is required" });
      }

      try {
        const passwordHash = password ? await bcrypt.hash(password, 12) : undefined;

        const result = await acceptInvite({
          token: request.params.token,
          email,
          displayName,
          passwordHash,
        });

        const jwtToken = signToken({
          userId: result.userId,
          email,
          role: result.role,
          workspaceId: result.workspaceId,
        });

        return reply.send({
          token: jwtToken,
          user: { id: result.userId, email, role: result.role },
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to accept invite";
        const status =
          msg === "Invite not found" ? 404
          : msg === "Invite already used" || msg === "Invite has expired" ? 410
          : msg.includes("different email") ? 400
          : msg.includes("already exists") ? 409
          : 500;
        return reply.status(status).send({ error: msg });
      }
    }
  );
}
