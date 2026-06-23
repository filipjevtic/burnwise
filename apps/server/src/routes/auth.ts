import type { FastifyInstance, FastifyPluginOptions, FastifyRequest, FastifyReply } from "fastify";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { getPrisma } from "../db.js";
import { config } from "../config.js";
import { requireAuth, type AuthPayload } from "../middleware/auth.js";

function signToken(payload: AuthPayload): string {
  return jwt.sign(payload, config.jwtSecret, { expiresIn: config.jwtExpiry } as jwt.SignOptions);
}

export async function registerAuthRoutes(
  app: FastifyInstance,
  _opts: FastifyPluginOptions
) {
  const prisma = await getPrisma();

  app.get("/setup-required", async (_request: FastifyRequest, reply: FastifyReply) => {
    const workspace = await prisma.workspace.findFirst();
    if (!workspace || !workspace.setupComplete) {
      return reply.send({ setupRequired: true });
    }
    return reply.send({ setupRequired: false });
  });

  app.post(
    "/setup",
    async (
      request: FastifyRequest<{ Body: { email: string; password: string; displayName?: string; workspaceName?: string } }>,
      reply: FastifyReply
    ) => {
      const existing = await prisma.workspace.findFirst({ where: { setupComplete: true } });
      if (existing) {
        return reply.status(400).send({ error: "Setup already complete" });
      }

      const { email, password, displayName, workspaceName } = request.body;
      if (!email || !password) {
        return reply.status(400).send({ error: "email and password are required" });
      }
      if (password.length < 8) {
        return reply.status(400).send({ error: "password must be at least 8 characters" });
      }

      const passwordHash = await bcrypt.hash(password, 12);

      const workspace = await prisma.workspace.upsert({
        where: { slug: "default" },
        update: { setupComplete: true, name: workspaceName || "My Workspace" },
        create: {
          slug: "default",
          name: workspaceName || "My Workspace",
          setupComplete: true,
        },
      });

      const user = await prisma.user.upsert({
        where: { workspaceId_email: { workspaceId: workspace.id, email } },
        update: { passwordHash, role: "admin", displayName: displayName || email },
        create: {
          workspaceId: workspace.id,
          email,
          displayName: displayName || email,
          passwordHash,
          role: "admin",
        },
      });

      const token = signToken({ userId: user.id, email: user.email, role: user.role, workspaceId: workspace.id });
      return reply.send({ token, user: { id: user.id, email: user.email, displayName: user.displayName, role: user.role } });
    }
  );

  app.post(
    "/login",
    async (
      request: FastifyRequest<{ Body: { email: string; password: string } }>,
      reply: FastifyReply
    ) => {
      const { email, password } = request.body;
      if (!email || !password) {
        return reply.status(400).send({ error: "email and password are required" });
      }

      const workspace = await prisma.workspace.findFirst({ where: { setupComplete: true } });
      if (!workspace) {
        return reply.status(400).send({ error: "Setup not complete" });
      }

      const user = await prisma.user.findUnique({
        where: { workspaceId_email: { workspaceId: workspace.id, email } },
      });

      if (!user || !user.passwordHash) {
        return reply.status(401).send({ error: "Invalid credentials" });
      }

      const valid = await bcrypt.compare(password, user.passwordHash);
      if (!valid) {
        return reply.status(401).send({ error: "Invalid credentials" });
      }

      const token = signToken({ userId: user.id, email: user.email, role: user.role, workspaceId: workspace.id });
      return reply.send({ token, user: { id: user.id, email: user.email, displayName: user.displayName, role: user.role } });
    }
  );

  app.get(
    "/me",
    { preHandler: requireAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { userId } = (request as FastifyRequest & { user: AuthPayload }).user;
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) return reply.status(404).send({ error: "User not found" });
      return reply.send({ id: user.id, email: user.email, displayName: user.displayName, role: user.role });
    }
  );
}
