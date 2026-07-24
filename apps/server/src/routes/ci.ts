import type { FastifyInstance, FastifyPluginOptions, FastifyRequest, FastifyReply } from "fastify";
import { randomUUID } from "crypto";
import { getPrisma } from "../db.js";
import { config } from "../config.js";
import { extractTicketKeys } from "../services/association.js";
import { requireAuth, type AuthPayload } from "../middleware/auth.js";
import { assertProjectInWorkspace } from "../middleware/scope.js";
import { requireProjectRole } from "../middleware/rbac.js";
import { verifyCiWebhook, type CiProvider } from "../lib/webhook.js";
import { encryptSecret, decryptSecret } from "../lib/crypto.js";
import { estimateCiCost } from "../services/ci-cost.js";

const CI_PROVIDERS: CiProvider[] = ["github", "gitlab", "generic"];

interface GitHubActionsWorkflowRun {
  action: string;
  workflow_run?: {
    id: number;
    name: string;
    head_branch: string;
    head_sha: string;
    run_started_at?: string;
    updated_at?: string;
    conclusion: string | null;
    status: string;
    run_attempt?: number;
    // Runner labels, when the sender enriches the workflow_run payload with them.
    labels?: string[];
    runner_name?: string;
  };
  // The workflow_job webhook carries the real runner labels per job; honor them
  // when present so cost reflects the actual runner (#16).
  workflow_job?: {
    labels?: string[];
    runner_name?: string;
  };
  repository?: {
    full_name: string;
  };
}

interface GitLabPipelineWebhook {
  object_kind: "pipeline";
  project?: {
    path_with_namespace: string;
  };
  object_attributes?: {
    id: number;
    ref: string;
    sha: string;
    status: string;
    duration: number | null;
    created_at?: string;
    finished_at?: string;
  };
}

interface GenericCIPayload {
  provider: "github" | "gitlab" | "generic";
  pipelineName: string;
  runId: string;
  status: "success" | "failure" | "cancelled" | "running";
  branch?: string;
  commitSha?: string;
  durationSeconds?: number;
  costUsd?: number;
  startedAt?: string;
  // Runner label, e.g. "ubuntu-latest" / "windows-latest" / "macos-14". Drives
  // per-minute cost; callers of the generic payload may set it (#16).
  runner?: string;
}

export async function registerCIRoutes(
  app: FastifyInstance,
  _opts: FastifyPluginOptions
) {
  const prisma = await getPrisma();

  app.post("/webhook/:projectId", {
    // Public endpoint (authenticated by the webhook secret, not a session) —
    // rate-limit it like the other ingest routes so it can't be flooded.
    config: { rateLimit: { max: config.rateLimit.ingestMax, timeWindow: config.rateLimit.timeWindow } },
  }, async (
    request: FastifyRequest<{
      Params: { projectId: string };
      Body: GitHubActionsWorkflowRun | GitLabPipelineWebhook | GenericCIPayload;
    }>,
    reply: FastifyReply
  ) => {
    const { projectId } = request.params;

    // Load the project first so verification uses its own secret + pinned
    // provider (#183): a per-project secret means a leak can't forge events into
    // other projects, and pinning stops header-choice downgrade.
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) {
      return reply.status(404).send({ error: "Project not found" });
    }

    const verification = verifyCiWebhook(request as FastifyRequest & { rawBody?: string }, {
      secret: decryptSecret(project.ciWebhookSecret),
      provider: (project.ciProvider as CiProvider | null) ?? undefined,
    });
    if (!verification.ok) {
      return reply.status(401).send({ error: verification.reason || "Unauthorized webhook" });
    }
    if (verification.skipped) {
      request.log.warn(
        "CI webhook accepted without verification — configure a per-project secret (or CI_WEBHOOK_SECRET) to enable signature checks"
      );
    }

    let payload: GenericCIPayload | null = null;
    const body = request.body;

    if (isGitHubActionsWorkflowRun(body)) {
      payload = normalizeGitHubActions(body, project.workspaceId);
    } else if (isGitLabPipelineWebhook(body)) {
      payload = normalizeGitLabPipeline(body, project.workspaceId);
    } else if (isGenericCIPayload(body)) {
      payload = body;
    }

    if (!payload) {
      return reply.status(400).send({ error: "Unsupported CI webhook payload" });
    }

    const eventId = randomUUID();
    const ticketKeys = extractTicketKeys(
      [payload.branch, payload.commitSha, payload.pipelineName].filter(Boolean).join(" ")
    );

    // Resolve external ticket keys (e.g. DEMO-101) to internal ticket ids.
    let ticketId: string | null = null;
    if (ticketKeys.length > 0) {
      const ticket = await prisma.ticket.findUnique({
        where: {
          projectId_externalId: {
            projectId,
            externalId: ticketKeys[0],
          },
        },
      });
      if (ticket) {
        ticketId = ticket.id;
      }
    }

    const status = normalizeCiStatus(payload.status);
    const costUsd = payload.costUsd ?? estimateCiCost(payload.provider, payload.durationSeconds, payload.runner);

    // Idempotency (#6): CI providers retry webhooks on timeouts, so the same run
    // (provider + runId) can arrive more than once. If we've already recorded
    // this run for this project, return the existing event instead of creating a
    // duplicate. Only dedupe when a runId is present — generic payloads without
    // one can't be reliably distinguished.
    if (payload.runId) {
      const existing = await prisma.event.findFirst({
        where: {
          projectId,
          eventType: "ci.run",
          payload: { path: ["runId"], equals: payload.runId },
          metadata: { path: ["provider"], equals: payload.provider },
        },
        select: { eventId: true, ticketId: true },
      });
      if (existing) {
        return reply.status(200).send({
          success: true,
          eventId: existing.eventId,
          ticketId: existing.ticketId,
          duplicate: true,
        });
      }
    }

    // Ensure a CI system user exists for the workspace so the event userId FK is valid.
    const ciUser = await prisma.user.upsert({
      where: {
        workspaceId_email: {
          workspaceId: project.workspaceId,
          email: "ci@system",
        },
      },
      update: {},
      create: {
        workspaceId: project.workspaceId,
        email: "ci@system",
        displayName: "CI/CD",
      },
    });

    await prisma.event.create({
      data: {
        eventId,
        eventType: "ci.run",
        timestamp: payload.startedAt ? new Date(payload.startedAt) : new Date(),
        source: "ci",
        workspaceId: project.workspaceId,
        projectId,
        userId: ciUser.id,
        ticketId,
        payload: {
          pipelineName: payload.pipelineName,
          runId: payload.runId,
          status,
          durationSeconds: payload.durationSeconds,
          costUsd,
          triggerBranch: payload.branch,
          triggerCommitSha: payload.commitSha,
        },
        metadata: {
          provider: payload.provider,
          runner: payload.runner,
          associationMethod: ticketId ? "ticket-key-extraction" : "none",
          ticketKeys,
        },
      },
    });

    return {
      success: true,
      eventId,
      ticketId,
      costUsd,
      durationSeconds: payload.durationSeconds,
    };
  });

  app.get<{ Params: { projectId: string } }>("/summary/:projectId", { preHandler: requireAuth }, async (
    request,
    reply
  ) => {
    const { workspaceId } = (request as FastifyRequest & { user: AuthPayload }).user;
    if (!(await assertProjectInWorkspace(prisma, reply, request.params.projectId, workspaceId))) return;

    // Aggregate in the DB (#176). Cost/count use the denormalized costUsd column;
    // CI run duration lives only in payload (it isn't the session-activity metric
    // the durationSeconds column tracks), so sum it via a guarded JSON cast.
    const projectId = request.params.projectId;
    const [agg, durationRows] = await Promise.all([
      prisma.event.aggregate({
        where: { projectId, eventType: "ci.run" },
        _sum: { costUsd: true },
        _count: { _all: true },
      }),
      prisma.$queryRawUnsafe<{ duration: number }[]>(
        `SELECT COALESCE(SUM((payload->>'durationSeconds')::numeric), 0)::float AS duration` +
          ` FROM "Event" WHERE "projectId" = $1 AND "eventType" = 'ci.run'` +
          ` AND payload->>'durationSeconds' ~ '^-?[0-9]+(\\.[0-9]+)?$'`,
        projectId
      ),
    ]);

    return {
      projectId,
      runCount: agg._count._all,
      totalCost: agg._sum.costUsd ?? 0,
      totalDurationSeconds: durationRows[0]?.duration ?? 0,
    };
  });

  // Read the CI webhook config for a project (never returns the secret itself),
  // so the UI can show whether a secret is set and which provider is pinned.
  app.get<{ Params: { projectId: string } }>("/config/:projectId", { preHandler: requireAuth }, async (request, reply) => {
    const { projectId } = request.params;
    if (!(await requireProjectRole(prisma, request, reply, projectId, "admin"))) return;
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { ciWebhookSecret: true, ciProvider: true },
    });
    if (!project) return reply.status(404).send({ error: "Project not found" });
    return { configured: Boolean(project.ciWebhookSecret), provider: project.ciProvider ?? null };
  });

  // Set / rotate / clear a project's CI webhook secret and pinned provider (#183).
  // Project admin only. The secret is encrypted at rest and never returned.
  app.put<{
    Params: { projectId: string };
    Body: { secret?: string | null; provider?: string | null };
  }>("/config/:projectId", { preHandler: requireAuth }, async (request, reply) => {
    const { projectId } = request.params;
    if (!(await requireProjectRole(prisma, request, reply, projectId, "admin"))) return;

    const { secret, provider } = request.body ?? {};
    if (provider != null && provider !== "" && !CI_PROVIDERS.includes(provider as CiProvider)) {
      return reply.status(400).send({ error: `provider must be one of: ${CI_PROVIDERS.join(", ")}` });
    }

    const data: { ciWebhookSecret?: string | null; ciProvider?: string | null } = {};
    // Only touch the secret when the field is present: omit = leave unchanged,
    // null/"" = clear, string = set (encrypted).
    if (secret !== undefined) {
      data.ciWebhookSecret = secret ? (encryptSecret(secret) ?? null) : null;
    }
    if (provider !== undefined) {
      data.ciProvider = provider ? provider : null;
    }

    const updated = await prisma.project.update({
      where: { id: projectId },
      data,
      select: { ciWebhookSecret: true, ciProvider: true },
    });
    return { configured: Boolean(updated.ciWebhookSecret), provider: updated.ciProvider ?? null };
  });
}

function isGitHubActionsWorkflowRun(body: unknown): body is GitHubActionsWorkflowRun {
  return typeof body === "object" && body !== null && "workflow_run" in body;
}

function isGitLabPipelineWebhook(body: unknown): body is GitLabPipelineWebhook {
  return typeof body === "object" && body !== null && "object_kind" in body && (body as GitLabPipelineWebhook).object_kind === "pipeline";
}

function isGenericCIPayload(body: unknown): body is GenericCIPayload {
  const b = body as GenericCIPayload;
  return (
    typeof b === "object" &&
    b !== null &&
    typeof b.pipelineName === "string" &&
    typeof b.runId === "string" &&
    typeof b.status === "string"
  );
}

function normalizeGitHubActions(body: GitHubActionsWorkflowRun, _workspaceId: string): GenericCIPayload {
  const run = body.workflow_run;
  if (!run) {
    throw new Error("Missing workflow_run in GitHub Actions payload");
  }

  const durationSeconds = run.run_started_at && run.updated_at
    ? Math.round((new Date(run.updated_at).getTime() - new Date(run.run_started_at).getTime()) / 1000)
    : undefined;

  // Prefer the workflow_job labels (the real runner), then any labels enriched
  // onto workflow_run, then runner_name. Absent for plain workflow_run events,
  // in which case cost falls back to the Linux rate.
  const runner =
    body.workflow_job?.labels?.[0] ??
    run.labels?.[0] ??
    body.workflow_job?.runner_name ??
    run.runner_name;

  return {
    provider: "github",
    pipelineName: run.name,
    runId: run.id.toString(),
    status: normalizeConclusion(run.conclusion || run.status),
    branch: run.head_branch,
    commitSha: run.head_sha,
    durationSeconds,
    startedAt: run.run_started_at,
    runner,
  };
}

function normalizeGitLabPipeline(body: GitLabPipelineWebhook, _workspaceId: string): GenericCIPayload {
  const attrs = body.object_attributes;
  if (!attrs) {
    throw new Error("Missing object_attributes in GitLab pipeline payload");
  }

  return {
    provider: "gitlab",
    pipelineName: `pipeline-${attrs.id}`,
    runId: attrs.id.toString(),
    status: normalizeGitLabStatus(attrs.status),
    branch: attrs.ref,
    commitSha: attrs.sha,
    durationSeconds: attrs.duration ?? undefined,
    startedAt: attrs.created_at,
  };
}

function normalizeConclusion(conclusion: string): GenericCIPayload["status"] {
  switch (conclusion?.toLowerCase()) {
    case "success":
    case "completed":
      return "success";
    case "failure":
    case "failed":
      return "failure";
    case "cancelled":
    case "canceled":
      return "cancelled";
    default:
      return "running";
  }
}

function normalizeGitLabStatus(status: string): GenericCIPayload["status"] {
  switch (status?.toLowerCase()) {
    case "success":
      return "success";
    case "failed":
      return "failure";
    case "canceled":
    case "cancelled":
      return "cancelled";
    default:
      return "running";
  }
}

function normalizeCiStatus(status: string): GenericCIPayload["status"] {
  const lower = status.toLowerCase();
  if (["success", "failure", "cancelled", "running"].includes(lower)) {
    return lower as GenericCIPayload["status"];
  }
  return "running";
}

