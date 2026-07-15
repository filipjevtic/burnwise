import type { FastifyInstance, FastifyPluginOptions, FastifyRequest, FastifyReply } from "fastify";
import { getPrisma } from "../db.js";
import { requireAuth, type AuthPayload } from "../middleware/auth.js";
import { assertProjectInWorkspace } from "../middleware/scope.js";
import { rollupEvents, aggregateByDeveloper, aggregateBySource } from "../services/rollup.js";
import { bucketEvents, type Bucket } from "../services/trends.js";
import { toCsv, type CsvColumn } from "../services/csv.js";
import { detectHighOutliers } from "../services/anomaly.js";
import { computeVelocity } from "../services/velocity.js";
import { computeEfficiency } from "../services/efficiency.js";
import { parsePagination, buildPaginationMeta } from "../lib/pagination.js";

/**
 * Dashboard-facing analytics. These endpoints are JWT-authenticated (browser)
 * and workspace-scoped, distinct from the API-key collector endpoints under
 * /api/v1/sessions.
 */
export async function registerAnalyticsRoutes(
  app: FastifyInstance,
  _opts: FastifyPluginOptions
) {
  const prisma = await getPrisma();

  // List sessions for a project with per-session usage rollups.
  app.get<{
    Querystring: { projectId?: string; sprintId?: string; status?: string; limit?: string; offset?: string };
  }>("/sessions", { preHandler: requireAuth }, async (request, reply) => {
    const { workspaceId } = (request as FastifyRequest & { user: AuthPayload }).user;
    const { projectId, sprintId, status } = request.query;
    if (!projectId) {
      return reply.status(400).send({ error: "projectId is required" });
    }
    if (!(await assertProjectInWorkspace(prisma, reply, projectId, workspaceId))) return;

    const pagination = parsePagination(request.query, { defaultLimit: 50, maxLimit: 200 });
    const where = {
      projectId,
      ...(status ? { status } : {}),
      ...(sprintId ? { ticket: { sprintId } } : {}),
    };

    const [sessions, total] = await Promise.all([
      prisma.session.findMany({
        where,
        orderBy: { startedAt: "desc" },
        skip: pagination.offset,
        take: pagination.limit,
        include: {
          user: { select: { id: true, email: true, displayName: true } },
          ticket: { select: { id: true, externalId: true, title: true } },
          events: { select: { eventType: true, payload: true } },
        },
      }),
      prisma.session.count({ where }),
    ]);

    const rollups = sessions.map((s) => rollupEvents(s.events));
    // Flag sessions whose token usage is a statistical high outlier across the
    // returned set, so unusually expensive sessions surface in the UI.
    const tokenOutliers = detectHighOutliers(rollups.map((r) => r.tokens));

    return {
      sessions: sessions.map((s, i) => {
        const rollup = rollups[i];
        return {
          id: s.id,
          status: s.status,
          source: s.source,
          branch: s.branch,
          ticketKey: s.ticketKey,
          startedAt: s.startedAt,
          endedAt: s.endedAt,
          user: s.user
            ? { id: s.user.id, name: s.user.displayName || s.user.email, email: s.user.email }
            : null,
          ticket: s.ticket
            ? { id: s.ticket.id, externalId: s.ticket.externalId, title: s.ticket.title }
            : null,
          tokens: rollup.tokens,
          cost: rollup.cost,
          durationSeconds: rollup.durationSeconds,
          eventCount: rollup.eventCount,
          tokenAnomaly: tokenOutliers[i],
        };
      }),
      pagination: buildPaginationMeta(pagination, total),
    };
  });

  // Time-bucketed usage trends for a project (tokens/cost/duration over time).
  app.get<{
    Querystring: { projectId?: string; sprintId?: string; bucket?: string };
  }>("/trends", { preHandler: requireAuth }, async (request, reply) => {
    const { workspaceId } = (request as FastifyRequest & { user: AuthPayload }).user;
    const { projectId, sprintId } = request.query;
    if (!projectId) {
      return reply.status(400).send({ error: "projectId is required" });
    }
    if (!(await assertProjectInWorkspace(prisma, reply, projectId, workspaceId))) return;

    const bucket: Bucket = request.query.bucket === "week" ? "week" : "day";

    const events = await prisma.event.findMany({
      where: {
        projectId,
        ...(sprintId ? { ticket: { sprintId } } : {}),
      },
      select: { timestamp: true, eventType: true, payload: true },
      orderBy: { timestamp: "asc" },
    });

    return { bucket, points: bucketEvents(events, bucket) };
  });

  // Per-developer usage rollups for a project (optionally a sprint).
  app.get<{
    Querystring: { projectId?: string; sprintId?: string };
  }>("/developers", { preHandler: requireAuth }, async (request, reply) => {
    const { workspaceId } = (request as FastifyRequest & { user: AuthPayload }).user;
    const { projectId, sprintId } = request.query;
    if (!projectId) {
      return reply.status(400).send({ error: "projectId is required" });
    }
    if (!(await assertProjectInWorkspace(prisma, reply, projectId, workspaceId))) return;

    const events = await prisma.event.findMany({
      where: {
        projectId,
        ...(sprintId ? { ticket: { sprintId } } : {}),
      },
      select: { userId: true, eventType: true, payload: true, sessionId: true, ticketId: true },
    });

    const aggregates = aggregateByDeveloper(events);

    const users = await prisma.user.findMany({
      where: { id: { in: aggregates.map((a) => a.userId) } },
      select: { id: true, email: true, displayName: true },
    });
    const userMap = new Map(users.map((u) => [u.id, u]));

    const developers = aggregates.map((agg) => {
      const u = userMap.get(agg.userId);
      return {
        userId: agg.userId,
        name: u ? u.displayName || u.email : agg.userId,
        email: u?.email ?? null,
        tokens: agg.tokens,
        cost: agg.cost,
        durationSeconds: agg.durationSeconds,
        eventCount: agg.eventCount,
        sessionCount: agg.sessionCount,
        ticketCount: agg.ticketCount,
      };
    });

    return { developers };
  });

  // Per-tool (collection source) usage rollups for a project (optionally a
  // sprint) — the cross-tool breakdown: proxy (Cursor/Aider/…), cli (Claude
  // Code via MCP / CLI wrapper), ide-plugin, ci, browser.
  app.get<{
    Querystring: { projectId?: string; sprintId?: string };
  }>("/by-source", { preHandler: requireAuth }, async (request, reply) => {
    const { workspaceId } = (request as FastifyRequest & { user: AuthPayload }).user;
    const { projectId, sprintId } = request.query;
    if (!projectId) {
      return reply.status(400).send({ error: "projectId is required" });
    }
    if (!(await assertProjectInWorkspace(prisma, reply, projectId, workspaceId))) return;

    const events = await prisma.event.findMany({
      where: {
        projectId,
        ...(sprintId ? { ticket: { sprintId } } : {}),
      },
      select: { source: true, eventType: true, payload: true, sessionId: true },
    });

    return { sources: aggregateBySource(events) };
  });

  // Sprint velocity: committed vs completed story points, completion rate, and
  // a rolling average per sprint. The core sprint-planning signal.
  app.get<{
    Querystring: { projectId?: string; window?: string };
  }>("/velocity", { preHandler: requireAuth }, async (request, reply) => {
    const { workspaceId } = (request as FastifyRequest & { user: AuthPayload }).user;
    const { projectId } = request.query;
    if (!projectId) {
      return reply.status(400).send({ error: "projectId is required" });
    }
    if (!(await assertProjectInWorkspace(prisma, reply, projectId, workspaceId))) return;

    const window = Math.min(Math.max(Number(request.query.window) || 3, 1), 12);

    const sprints = await prisma.sprint.findMany({
      where: { projectId },
      orderBy: [{ startDate: "asc" }, { createdAt: "asc" }],
      include: {
        tickets: { select: { status: true, storyPoints: true } },
      },
    });

    return computeVelocity(
      sprints.map((s) => ({
        id: s.id,
        name: s.name,
        startDate: s.startDate,
        endDate: s.endDate,
        status: s.status,
        tickets: s.tickets,
      })),
      window
    );
  });

  // Sprint efficiency: AI effort (cost/tokens/duration) per completed story
  // point per sprint — the "are we getting cheaper/faster per point" trend.
  app.get<{
    Querystring: { projectId?: string };
  }>("/efficiency", { preHandler: requireAuth }, async (request, reply) => {
    const { workspaceId } = (request as FastifyRequest & { user: AuthPayload }).user;
    const { projectId } = request.query;
    if (!projectId) {
      return reply.status(400).send({ error: "projectId is required" });
    }
    if (!(await assertProjectInWorkspace(prisma, reply, projectId, workspaceId))) return;

    const sprints = await prisma.sprint.findMany({
      where: { projectId },
      orderBy: [{ startDate: "asc" }, { createdAt: "asc" }],
      include: {
        tickets: {
          select: {
            status: true,
            storyPoints: true,
            events: { select: { eventType: true, payload: true } },
          },
        },
      },
    });

    return computeEfficiency(
      sprints.map((s) => ({
        id: s.id,
        name: s.name,
        startDate: s.startDate,
        endDate: s.endDate,
        status: s.status,
        tickets: s.tickets,
      }))
    );
  });

  // Session detail with its events and a rollup.
  app.get<{ Params: { id: string } }>("/sessions/:id", { preHandler: requireAuth }, async (request, reply) => {
    const { workspaceId } = (request as FastifyRequest & { user: AuthPayload }).user;
    const session = await prisma.session.findUnique({
      where: { id: request.params.id },
      include: {
        user: { select: { id: true, email: true, displayName: true } },
        ticket: { select: { id: true, externalId: true, title: true } },
        events: {
          orderBy: { timestamp: "asc" },
          select: { id: true, eventType: true, source: true, timestamp: true, payload: true },
        },
      },
    });

    if (!session || session.workspaceId !== workspaceId) {
      return reply.status(404).send({ error: "Session not found" });
    }

    const rollup = rollupEvents(session.events);
    return {
      session: {
        id: session.id,
        status: session.status,
        source: session.source,
        branch: session.branch,
        ticketKey: session.ticketKey,
        startedAt: session.startedAt,
        endedAt: session.endedAt,
        user: session.user
          ? { id: session.user.id, name: session.user.displayName || session.user.email, email: session.user.email }
          : null,
        ticket: session.ticket
          ? { id: session.ticket.id, externalId: session.ticket.externalId, title: session.ticket.title }
          : null,
      },
      summary: {
        totalTokens: rollup.tokens,
        totalCost: rollup.cost,
        totalDurationSeconds: rollup.durationSeconds,
        eventCount: rollup.eventCount,
      },
      events: session.events,
    };
  });

  // CSV export of session rollups.
  app.get<{
    Querystring: { projectId?: string; sprintId?: string };
  }>("/export/sessions", { preHandler: requireAuth }, async (request, reply) => {
    const { workspaceId } = (request as FastifyRequest & { user: AuthPayload }).user;
    const { projectId, sprintId } = request.query;
    if (!projectId) return reply.status(400).send({ error: "projectId is required" });
    if (!(await assertProjectInWorkspace(prisma, reply, projectId, workspaceId))) return;

    const sessions = await prisma.session.findMany({
      where: { projectId, ...(sprintId ? { ticket: { sprintId } } : {}) },
      orderBy: { startedAt: "desc" },
      include: {
        user: { select: { email: true, displayName: true } },
        ticket: { select: { externalId: true } },
        events: { select: { eventType: true, payload: true } },
      },
    });

    const rows = sessions.map((s) => {
      const r = rollupEvents(s.events);
      return {
        developer: s.user ? s.user.displayName || s.user.email : "",
        ticket: s.ticket?.externalId || s.ticketKey || "",
        source: s.source,
        status: s.status,
        branch: s.branch || "",
        startedAt: s.startedAt.toISOString(),
        endedAt: s.endedAt ? s.endedAt.toISOString() : "",
        tokens: r.tokens,
        cost: r.cost,
        durationSeconds: r.durationSeconds,
        events: r.eventCount,
      };
    });

    const columns: CsvColumn<(typeof rows)[number]>[] = [
      { header: "Developer", value: (r) => r.developer },
      { header: "Ticket", value: (r) => r.ticket },
      { header: "Source", value: (r) => r.source },
      { header: "Status", value: (r) => r.status },
      { header: "Branch", value: (r) => r.branch },
      { header: "Started", value: (r) => r.startedAt },
      { header: "Ended", value: (r) => r.endedAt },
      { header: "Tokens", value: (r) => r.tokens },
      { header: "Cost (USD)", value: (r) => r.cost },
      { header: "Duration (s)", value: (r) => r.durationSeconds },
      { header: "Events", value: (r) => r.events },
    ];

    return sendCsv(reply, "sessions.csv", toCsv(rows, columns));
  });

  // CSV export of per-developer rollups.
  app.get<{
    Querystring: { projectId?: string; sprintId?: string };
  }>("/export/developers", { preHandler: requireAuth }, async (request, reply) => {
    const { workspaceId } = (request as FastifyRequest & { user: AuthPayload }).user;
    const { projectId, sprintId } = request.query;
    if (!projectId) return reply.status(400).send({ error: "projectId is required" });
    if (!(await assertProjectInWorkspace(prisma, reply, projectId, workspaceId))) return;

    const events = await prisma.event.findMany({
      where: { projectId, ...(sprintId ? { ticket: { sprintId } } : {}) },
      select: { userId: true, eventType: true, payload: true, sessionId: true, ticketId: true },
    });
    const aggregates = aggregateByDeveloper(events);
    const users = await prisma.user.findMany({
      where: { id: { in: aggregates.map((a) => a.userId) } },
      select: { id: true, email: true, displayName: true },
    });
    const userMap = new Map(users.map((u) => [u.id, u]));

    const rows = aggregates.map((a) => {
      const u = userMap.get(a.userId);
      return {
        developer: u ? u.displayName || u.email : a.userId,
        email: u?.email ?? "",
        tokens: a.tokens,
        cost: a.cost,
        durationSeconds: a.durationSeconds,
        events: a.eventCount,
        sessions: a.sessionCount,
        tickets: a.ticketCount,
      };
    });

    const columns: CsvColumn<(typeof rows)[number]>[] = [
      { header: "Developer", value: (r) => r.developer },
      { header: "Email", value: (r) => r.email },
      { header: "Tokens", value: (r) => r.tokens },
      { header: "Cost (USD)", value: (r) => r.cost },
      { header: "Duration (s)", value: (r) => r.durationSeconds },
      { header: "Events", value: (r) => r.events },
      { header: "Sessions", value: (r) => r.sessions },
      { header: "Tickets", value: (r) => r.tickets },
    ];

    return sendCsv(reply, "developers.csv", toCsv(rows, columns));
  });
}

function sendCsv(reply: FastifyReply, filename: string, csv: string) {
  return reply
    .header("Content-Type", "text/csv; charset=utf-8")
    .header("Content-Disposition", `attachment; filename="${filename}"`)
    .send(csv);
}
