import type { FastifyRequest, FastifyReply } from "fastify";
import jwt from "jsonwebtoken";
import { config } from "../config.js";

export interface AuthPayload {
  userId: string;
  email: string;
  role: string;
  workspaceId: string;
}

export async function requireAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const header = request.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return reply.status(401).send({ error: "Unauthorized" });
  }
  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, config.jwtSecret) as AuthPayload;
    (request as FastifyRequest & { user: AuthPayload }).user = payload;
  } catch {
    return reply.status(401).send({ error: "Invalid or expired token" });
  }
}

export async function requireAdmin(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  await requireAuth(request, reply);
  const user = (request as FastifyRequest & { user?: AuthPayload }).user;
  if (!user) return;
  if (user.role !== "admin") {
    return reply.status(403).send({ error: "Forbidden: admin only" });
  }
}
