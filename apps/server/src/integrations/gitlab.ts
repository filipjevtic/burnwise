import { getPrisma } from "../db.js";
import { sameOrigin } from "../lib/ssrf.js";

interface GitLabConfig {
  baseUrl: string;
  token: string;
  projectPath: string;
  projectId: string;
}

interface GitLabMilestone {
  id: number;
  iid: number;
  title: string;
  description: string | null;
  state: "active" | "closed";
  due_date: string | null;
  start_date: string | null;
  created_at: string;
  updated_at: string;
  web_url: string;
}

interface GitLabIssue {
  id: number;
  iid: number;
  title: string;
  description: string | null;
  state: string;
  milestone: { title: string; id: number } | null;
  labels: string[];
  assignee: { name: string; username: string } | null;
  created_at: string;
  updated_at: string;
  web_url: string;
  weight: number | null;
}

/**
 * Map a raw GitLab issue state to a canonical ticket status (#9). GitLab only
 * exposes two issue states — `opened` and `closed` — which, stored raw, are
 * inconsistent with the rest of the app (Jira stores human-readable statuses,
 * and completion logic keys on a canonical done vocabulary in velocity.ts).
 *
 *   opened -> "in progress"  (active work; GitLab has no distinct "todo" state)
 *   closed -> "done"         (terminal; recognized by isCompleted)
 *
 * The raw state is preserved in ticket metadata for traceability. An unknown
 * state falls through lowercased rather than being dropped.
 */
export function normalizeGitLabState(state: string | null | undefined): string {
  switch ((state || "").trim().toLowerCase()) {
    case "closed":
      return "done";
    case "opened":
      return "in progress";
    default:
      return (state || "unknown").trim().toLowerCase();
  }
}

export async function syncGitLab(config: GitLabConfig): Promise<{ sprints: number; tickets: number }> {
  const prisma = await getPrisma();
  const baseUrl = config.baseUrl.replace(/\/$/, "");
  const encodedPath = encodeURIComponent(config.projectPath);
  const projectApiUrl = `${baseUrl}/api/v4/projects/${encodedPath}`;
  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  if (config.token) {
    headers["PRIVATE-TOKEN"] = config.token;
  }

  const milestones = await fetchAllPages<GitLabMilestone>(`${projectApiUrl}/milestones?per_page=100`, headers);
  let sprintCount = 0;
  const milestoneTitleToSprintId: Record<string, string> = {};

  for (const milestone of milestones) {
    const sprint = await prisma.sprint.upsert({
      where: {
        projectId_externalId: {
          projectId: config.projectId,
          externalId: milestone.id.toString(),
        },
      },
      update: {
        name: milestone.title,
        status: milestone.state === "active" ? "active" : "closed",
        endDate: milestone.due_date ? new Date(milestone.due_date) : undefined,
        startDate: milestone.start_date ? new Date(milestone.start_date) : undefined,
        goal: milestone.description,
      },
      create: {
        projectId: config.projectId,
        externalId: milestone.id.toString(),
        name: milestone.title,
        status: milestone.state === "active" ? "active" : "closed",
        endDate: milestone.due_date ? new Date(milestone.due_date) : undefined,
        startDate: milestone.start_date ? new Date(milestone.start_date) : undefined,
        goal: milestone.description,
      },
    });
    sprintCount++;
    milestoneTitleToSprintId[milestone.title] = sprint.id;
  }

  // Sync issues assigned to each milestone.
  for (const milestone of milestones) {
    const issues = await fetchAllPages<GitLabIssue>(
      `${projectApiUrl}/issues?milestone=${encodeURIComponent(milestone.title)}&state=all&per_page=100`,
      headers
    );
    const sprintId = milestoneTitleToSprintId[milestone.title];
    for (const issue of issues) {
      await syncIssue(prisma, config.projectId, sprintId, issue);
    }
  }

  // Also sync issues without a milestone.
  const unassignedIssues = await fetchAllPages<GitLabIssue>(
    `${projectApiUrl}/issues?milestone=No+Milestone&state=all&per_page=100`,
    headers
  );
  for (const issue of unassignedIssues) {
    await syncIssue(prisma, config.projectId, null, issue);
  }

  const tickets = await prisma.ticket.count({
    where: { projectId: config.projectId },
  });

  return { sprints: sprintCount, tickets };
}

async function syncIssue(
  prisma: Awaited<ReturnType<typeof getPrisma>>,
  projectId: string,
  sprintId: string | null,
  issue: GitLabIssue
): Promise<void> {
  const labels = issue.labels || [];
  const status = normalizeGitLabState(issue.state);
  const metadata = {
    assignee: issue.assignee?.name || issue.assignee?.username,
    // Keep the raw GitLab state so the normalization is auditable/reversible.
    gitlabState: issue.state,
  };

  await prisma.ticket.upsert({
    where: {
      projectId_externalId: {
        projectId,
        externalId: issue.iid.toString(),
      },
    },
    update: {
      title: issue.title,
      description: issue.description,
      status,
      sprintId,
      labels,
      storyPoints: issue.weight,
      externalUrl: issue.web_url,
      metadata,
    },
    create: {
      projectId,
      sprintId,
      externalId: issue.iid.toString(),
      title: issue.title,
      description: issue.description,
      status,
      labels,
      storyPoints: issue.weight,
      externalUrl: issue.web_url,
      metadata,
    },
  });
}

async function fetchAllPages<T>(url: string, headers: Record<string, string>): Promise<T[]> {
  const results: T[] = [];
  let nextUrl: string | null = url;

  while (nextUrl) {
    const response = await fetch(nextUrl, { headers });
    if (!response.ok) {
      throw new Error(`GitLab API error: ${response.status} ${response.statusText}`);
    }
    const page = (await response.json()) as T[];
    results.push(...page);

    const linkHeader = response.headers.get("link");
    const candidate = extractNextPageUrl(linkHeader);
    // Pin pagination to the configured host: a malicious/compromised response
    // could otherwise redirect the next fetch (with our token) to an internal
    // target via the Link header.
    nextUrl = candidate && sameOrigin(candidate, url) ? candidate : null;
  }

  return results;
}

function extractNextPageUrl(linkHeader: string | null): string | null {
  if (!linkHeader) return null;
  const match = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
  return match ? match[1] : null;
}
