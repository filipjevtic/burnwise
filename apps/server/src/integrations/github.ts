import { getPrisma } from "../db.js";
import { fetchWithTimeout } from "../lib/fetch-timeout.js";

interface GitHubMilestone {
  number: number;
  title: string;
  description: string | null;
  state: "open" | "closed";
  due_on: string | null;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
}

interface GitHubLabel {
  name: string;
}

interface GitHubIssue {
  number: number;
  title: string;
  body: string | null;
  state: string;
  state_reason: string | null;
  milestone: { number: number } | null;
  labels: GitHubLabel[];
  assignee: { login: string } | null;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  html_url: string;
}

interface GitHubConfig {
  token: string;
  owner: string;
  repo: string;
  projectId: string;
}

export async function syncGitHub(config: GitHubConfig): Promise<{
  sprints: number;
  tickets: number;
}> {
  const prisma = await getPrisma();

  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (config.token) {
    headers.Authorization = `Bearer ${config.token}`;
  }

  const baseUrl = `https://api.github.com/repos/${config.owner}/${config.repo}`;

  const milestones = await fetchAllPages<GitHubMilestone>(`${baseUrl}/milestones?state=all&per_page=100`, headers);
  let sprintCount = 0;

  for (const milestone of milestones) {
    const sprint = await prisma.sprint.upsert({
      where: {
        projectId_externalId: {
          projectId: config.projectId,
          externalId: milestone.number.toString(),
        },
      },
      update: {
        name: milestone.title,
        status: milestone.state === "open" ? "active" : "closed",
        endDate: milestone.due_on ? new Date(milestone.due_on) : undefined,
      },
      create: {
        projectId: config.projectId,
        externalId: milestone.number.toString(),
        name: milestone.title,
        status: milestone.state === "open" ? "active" : "closed",
        endDate: milestone.due_on ? new Date(milestone.due_on) : undefined,
      },
    });
    sprintCount++;

    // Sync issues assigned to this milestone.
    const issues = await fetchAllPages<GitHubIssue>(
      `${baseUrl}/issues?milestone=${milestone.number}&state=all&per_page=100`,
      headers
    );
    for (const issue of issues) {
      await syncIssue(prisma, config.projectId, sprint.id, issue);
    }
  }

  // Also sync issues without a milestone.
  const unassignedIssues = await fetchAllPages<GitHubIssue>(
    `${baseUrl}/issues?milestone=none&state=all&per_page=100`,
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
  issue: GitHubIssue
): Promise<void> {
  const labels = issue.labels.map((l) => l.name);

  await prisma.ticket.upsert({
    where: {
      projectId_externalId: {
        projectId,
        externalId: issue.number.toString(),
      },
    },
    update: {
      title: issue.title,
      description: issue.body,
      status: issue.state,
      sprintId,
      labels,
      externalUrl: issue.html_url,
      metadata: {
        stateReason: issue.state_reason,
        assignee: issue.assignee?.login,
      },
    },
    create: {
      projectId,
      sprintId,
      externalId: issue.number.toString(),
      title: issue.title,
      description: issue.body,
      status: issue.state,
      labels,
      externalUrl: issue.html_url,
      metadata: {
        stateReason: issue.state_reason,
        assignee: issue.assignee?.login,
      },
    },
  });
}

async function fetchAllPages<T>(url: string, headers: Record<string, string>): Promise<T[]> {
  const results: T[] = [];
  let nextUrl: string | null = url;

  while (nextUrl) {
    const response = await fetchWithTimeout(nextUrl, { headers });
    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
    }
    const page = (await response.json()) as T[];
    results.push(...page);

    const linkHeader = response.headers.get("link");
    nextUrl = extractNextPageUrl(linkHeader);
  }

  return results;
}

function extractNextPageUrl(linkHeader: string | null): string | null {
  if (!linkHeader) return null;
  const match = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
  return match ? match[1] : null;
}
