import { getPrisma } from "../db.js";

interface JiraConfig {
  baseUrl: string;
  token: string;
  email: string;
  projectKey: string;
  projectId: string;
  /** Custom field id holding story points; instances vary. (#8) */
  storyPointsField?: string | null;
}

/**
 * Common default story-points custom field id. Used only when the project's
 * integration config doesn't specify one — different Jira instances assign
 * different ids, so this is a best-effort fallback, not a guarantee. (#8)
 */
export const DEFAULT_STORY_POINTS_FIELD = "customfield_10016";

/** Resolve a valid custom-field id from config, or the default. (#8) */
export function resolveStoryPointsField(configured?: string | null): string {
  const trimmed = configured?.trim();
  return trimmed ? trimmed : DEFAULT_STORY_POINTS_FIELD;
}

/** Read a numeric story-points value from an issue's fields, or null. (#8) */
export function extractStoryPoints(fields: Record<string, unknown>, fieldId: string): number | null {
  const value = fields[fieldId];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

interface JiraBoard {
  id: number;
  name: string;
  type: string;
  location?: { displayName: string };
}

interface JiraSprint {
  id: number;
  name: string;
  state: "future" | "active" | "closed";
  startDate?: string;
  endDate?: string;
  goal?: string;
}

interface JiraIssue {
  id: string;
  key: string;
  fields: {
    summary: string;
    description?: string | { type: string; content?: unknown[] };
    status: { name: string };
    issuetype: { name: string };
    assignee?: { displayName: string };
    labels?: string[];
    customfield_10016?: number; // story points (common custom field id)
    [key: string]: unknown;
  };
}

interface JiraSearchResponse {
  issues: JiraIssue[];
  total: number;
}

export async function syncJira(config: JiraConfig): Promise<{ sprints: number; tickets: number }> {
  const prisma = await getPrisma();
  const baseUrl = config.baseUrl.replace(/\/$/, "");
  const headers = buildHeaders(config.email, config.token);
  const storyPointsField = resolveStoryPointsField(config.storyPointsField);

  // Find a Scrum or Kanban board associated with the project.
  const board = await findBoard(baseUrl, headers, config.projectKey);

  let sprintCount = 0;
  const sprintExternalIdToInternalId: Record<string, string> = {};

  if (board) {
    const sprints = await fetchSprints(baseUrl, headers, board.id);
    for (const sprint of sprints) {
      const upserted = await prisma.sprint.upsert({
        where: {
          projectId_externalId: {
            projectId: config.projectId,
            externalId: sprint.id.toString(),
          },
        },
        update: {
          name: sprint.name,
          status: sprint.state,
          startDate: sprint.startDate ? new Date(sprint.startDate) : undefined,
          endDate: sprint.endDate ? new Date(sprint.endDate) : undefined,
          goal: sprint.goal,
        },
        create: {
          projectId: config.projectId,
          externalId: sprint.id.toString(),
          name: sprint.name,
          status: sprint.state,
          startDate: sprint.startDate ? new Date(sprint.startDate) : undefined,
          endDate: sprint.endDate ? new Date(sprint.endDate) : undefined,
          goal: sprint.goal,
        },
      });
      sprintExternalIdToInternalId[sprint.id.toString()] = upserted.id;
      sprintCount++;
    }

    // Fetch issues per sprint and assign them.
    for (const sprint of sprints) {
      const issues = await fetchSprintIssues(baseUrl, headers, sprint.id);
      const sprintId = sprintExternalIdToInternalId[sprint.id.toString()];
      for (const issue of issues) {
        await syncIssue(prisma, config.projectId, sprintId, issue, baseUrl, storyPointsField);
      }
    }
  }

  // Also sync all project issues that may not be on a sprint board.
  const allIssues = await searchIssues(baseUrl, headers, config.projectKey, storyPointsField);
  for (const issue of allIssues) {
    await syncIssue(prisma, config.projectId, null, issue, baseUrl, storyPointsField);
  }

  const tickets = await prisma.ticket.count({
    where: { projectId: config.projectId },
  });

  return { sprints: sprintCount, tickets };
}

function buildHeaders(email: string, token: string): Record<string, string> {
  const credentials = Buffer.from(`${email}:${token}`).toString("base64");
  return {
    Authorization: `Basic ${credentials}`,
    Accept: "application/json",
    "Content-Type": "application/json",
  };
}

async function findBoard(
  baseUrl: string,
  headers: Record<string, string>,
  projectKey: string
): Promise<JiraBoard | null> {
  const url = `${baseUrl}/rest/agile/1.0/board?projectKeyOrId=${encodeURIComponent(projectKey)}&maxResults=100`;
  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`Jira board API error: ${response.status} ${response.statusText}`);
  }
  const data = (await response.json()) as { values: JiraBoard[] };
  // Prefer scrum boards, then kanban.
  return (
    data.values.find((b) => b.type === "scrum") ||
    data.values.find((b) => b.type === "kanban") ||
    data.values[0] ||
    null
  );
}

async function fetchSprints(
  baseUrl: string,
  headers: Record<string, string>,
  boardId: number
): Promise<JiraSprint[]> {
  const url = `${baseUrl}/rest/agile/1.0/board/${boardId}/sprint?maxResults=100`;
  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`Jira sprint API error: ${response.status} ${response.statusText}`);
  }
  const data = (await response.json()) as { values: JiraSprint[] };
  return data.values;
}

async function fetchSprintIssues(
  baseUrl: string,
  headers: Record<string, string>,
  sprintId: number
): Promise<JiraIssue[]> {
  const url = `${baseUrl}/rest/agile/1.0/sprint/${sprintId}/issue?maxResults=100`;
  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`Jira sprint issue API error: ${response.status} ${response.statusText}`);
  }
  const data = (await response.json()) as { issues: JiraIssue[] };
  return data.issues;
}

async function searchIssues(
  baseUrl: string,
  headers: Record<string, string>,
  projectKey: string,
  storyPointsField: string
): Promise<JiraIssue[]> {
  const url = `${baseUrl}/rest/api/2/search`;
  const body = {
    jql: `project = ${projectKey} ORDER BY created DESC`,
    maxResults: 100,
    fields: [
      "summary",
      "description",
      "status",
      "issuetype",
      "assignee",
      "labels",
      storyPointsField,
    ],
  };

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`Jira search API error: ${response.status} ${response.statusText}`);
  }
  const data = (await response.json()) as JiraSearchResponse;
  return data.issues;
}

async function syncIssue(
  prisma: Awaited<ReturnType<typeof getPrisma>>,
  projectId: string,
  sprintId: string | null,
  issue: JiraIssue,
  baseUrl: string,
  storyPointsField: string
): Promise<void> {
  const description = extractDescription(issue.fields.description);
  const storyPoints = extractStoryPoints(issue.fields, storyPointsField);
  const labels = issue.fields.labels || [];
  const status = issue.fields.status?.name || "Unknown";
  const issueType = issue.fields.issuetype?.name || "Task";
  const externalUrl = `${baseUrl}/browse/${issue.key}`;

  await prisma.ticket.upsert({
    where: {
      projectId_externalId: {
        projectId,
        externalId: issue.key,
      },
    },
    update: {
      title: issue.fields.summary,
      description,
      status,
      sprintId,
      labels,
      storyPoints,
      externalUrl,
      metadata: {
        issueType,
        assignee: issue.fields.assignee?.displayName,
      },
    },
    create: {
      projectId,
      sprintId,
      externalId: issue.key,
      title: issue.fields.summary,
      description,
      status,
      labels,
      storyPoints,
      externalUrl,
      metadata: {
        issueType,
        assignee: issue.fields.assignee?.displayName,
      },
    },
  });
}

function extractDescription(description: JiraIssue["fields"]["description"]): string | null {
  if (!description) return null;
  if (typeof description === "string") return description;
  // Atlassian Document Format (ADF) - simple text extraction.
  return extractAdfText(description);
}

function extractAdfText(node: unknown): string | null {
  if (!node || typeof node !== "object") return null;
  const obj = node as Record<string, unknown>;
  if (obj.type === "text") {
    return (obj.text as string) || "";
  }
  if (Array.isArray(obj.content)) {
    return obj.content.map(extractAdfText).filter(Boolean).join("\n");
  }
  return null;
}
