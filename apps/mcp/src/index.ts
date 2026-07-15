import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { config } from "./config.js";
import { emitEvent, startSession, reportFeedback } from "./events.js";
import { computeReportedUsage, isEmptyUsage, ZERO_BASELINE, type Reporting, type Baseline } from "./usage.js";
import type { Event } from "@burnwise/schema";

let currentTicketId: string | undefined = process.env.ATS_TICKET_ID || undefined;
let currentSessionId: string | undefined;
// Running baseline of cumulative usage reported so far, so report_usage can
// attribute only the delta to the current ticket (#149). Spans ticket switches
// on purpose — the agent's cumulative counter does not reset per set_ticket.
let usageBaseline: Baseline = ZERO_BASELINE;

const server = new Server(
  {
    name: "burnwise",
    version: "0.0.1",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "set_ticket",
        description: "Set the current ticket ID for this session. All token usage will be associated with this ticket.",
        inputSchema: {
          type: "object",
          properties: {
            ticketId: {
              type: "string",
              description: "Ticket ID, e.g. PROJ-123",
            },
          },
          required: ["ticketId"],
        },
      },
      {
        name: "get_ticket",
        description: "Get the current ticket ID associated with this session.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "report_usage",
        description:
          "Report LLM token usage. By default the numbers are treated as CUMULATIVE session totals: only the increase since your last report is attributed to the current ticket, so switching tickets mid-session attributes tokens correctly. Report often (e.g. each turn) and call set_ticket when you switch tasks. Pass reporting:\"incremental\" if you are instead reporting a standalone per-task chunk.",
        inputSchema: {
          type: "object",
          properties: {
            model: {
              type: "string",
              description: "Model name, e.g. claude-sonnet-4-20250514",
            },
            promptTokens: {
              type: "number",
              description: "Prompt tokens — cumulative session total by default",
            },
            completionTokens: {
              type: "number",
              description: "Completion tokens — cumulative session total by default",
            },
            totalTokens: {
              type: "number",
              description: "Total tokens — cumulative session total by default",
            },
            costUsd: {
              type: "number",
              description: "Cost in USD if known — cumulative session total by default",
            },
            reporting: {
              type: "string",
              enum: ["cumulative", "incremental"],
              description: "cumulative (default): numbers are running session totals; the delta since the last report is attributed. incremental: numbers are a standalone chunk.",
            },
            ticketId: {
              type: "string",
              description: "Override ticket ID for this usage",
            },
          },
          required: ["model", "promptTokens", "completionTokens", "totalTokens"],
        },
      },
      {
        name: "emit_session_activity",
        description: "Emit a session activity event with optional duration and ticket association.",
        inputSchema: {
          type: "object",
          properties: {
            activityType: {
              type: "string",
              enum: ["coding", "review", "planning", "debugging", "other"],
            },
            durationSeconds: {
              type: "number",
              description: "Duration of the activity in seconds",
            },
            ticketId: {
              type: "string",
              description: "Override ticket ID for this activity",
            },
          },
          required: ["activityType", "durationSeconds"],
        },
      },
      {
        name: "report_session_feedback",
        description:
          "Report a short self-assessment of the current session: how effective it was, what blocked you, what went well, and a summary of completed items. Call once near the end of a task. Optional — it helps humans plan and run retros; it does not affect token accounting.",
        inputSchema: {
          type: "object",
          properties: {
            effectiveness: {
              type: "number",
              description: "Self-rated effectiveness, 1 (poor) to 5 (excellent)",
            },
            wins: {
              type: "array",
              items: { type: "string" },
              description: "What went well / was accomplished",
            },
            blockers: {
              type: "array",
              items: { type: "string" },
              description: "Pain points, friction, or things that slowed you down",
            },
            summary: {
              type: "string",
              description: "Brief summary of completed items for this session",
            },
          },
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === "set_ticket") {
    const ticketId = (args as { ticketId: string }).ticketId;
    currentTicketId = ticketId;
    // Bind a server-side session to this ticket so all subsequent events roll
    // up to it. Best-effort: if it fails we still track the ticket locally.
    currentSessionId = (await startSession(ticketId)) ?? undefined;
    return {
      content: [
        {
          type: "text",
          text: currentSessionId
            ? `Current ticket set to ${ticketId} (session ${currentSessionId})`
            : `Current ticket set to ${ticketId}`,
        },
      ],
    };
  }

  if (name === "get_ticket") {
    return {
      content: [{ type: "text", text: currentTicketId || "No ticket set" }],
    };
  }

  if (name === "report_usage") {
    const { model, promptTokens, completionTokens, totalTokens, costUsd, reporting, ticketId } = args as {
      model: string;
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
      costUsd?: number;
      reporting?: Reporting;
      ticketId?: string;
    };

    // Attribute only the delta since the last report to the current ticket (#149).
    const { emit, nextBaseline } = computeReportedUsage(
      { promptTokens, completionTokens, totalTokens, costUsd },
      usageBaseline,
      reporting === "incremental" ? "incremental" : "cumulative"
    );
    if (reporting !== "incremental") {
      usageBaseline = nextBaseline;
    }

    // Nothing new since the last cumulative report — don't emit a 0-token event.
    if (isEmptyUsage(emit)) {
      return {
        content: [{ type: "text", text: "No new usage since the last report." }],
      };
    }

    const event: Event = {
      eventId: crypto.randomUUID(),
      eventType: "llm.response",
      timestamp: new Date().toISOString(),
      source: "cli",
      workspaceId: config.workspaceId,
      projectId: config.projectId,
      userId: config.userId,
      ticketId: ticketId || currentTicketId,
      sessionId: currentSessionId,
      metadata: {
        via: "mcp",
      },
      payload: {
        provider: "anthropic",
        model,
        promptTokens: emit.promptTokens,
        completionTokens: emit.completionTokens,
        totalTokens: emit.totalTokens,
        costUsd: emit.costUsd,
      },
    };

    await emitEvent(event);

    return {
      content: [
        {
          type: "text",
          text: `Attributed ${emit.totalTokens} tokens (${model})${emit.costUsd ? ` · $${emit.costUsd.toFixed(4)}` : ""} to ${ticketId || currentTicketId || "no ticket"}.`,
        },
      ],
    };
  }

  if (name === "emit_session_activity") {
    const { activityType, durationSeconds, ticketId } = args as {
      activityType: "coding" | "review" | "planning" | "debugging" | "other";
      durationSeconds: number;
      ticketId?: string;
    };

    const now = new Date();
    const start = new Date(now.getTime() - durationSeconds * 1000);

    const event: Event = {
      eventId: crypto.randomUUID(),
      eventType: "session.activity",
      timestamp: now.toISOString(),
      source: "cli",
      workspaceId: config.workspaceId,
      projectId: config.projectId,
      userId: config.userId,
      ticketId: ticketId || currentTicketId,
      sessionId: currentSessionId,
      metadata: {
        via: "mcp",
      },
      payload: {
        activityType,
        startTime: start.toISOString(),
        endTime: now.toISOString(),
        durationSeconds,
      },
    };

    await emitEvent(event);

    return {
      content: [{ type: "text", text: `Emitted ${activityType} activity for ${durationSeconds}s` }],
    };
  }

  if (name === "report_session_feedback") {
    if (!currentSessionId) {
      return {
        content: [{ type: "text", text: "No active session — call set_ticket first." }],
        isError: true,
      };
    }
    const { effectiveness, wins, blockers, summary } = args as {
      effectiveness?: number;
      wins?: string[];
      blockers?: string[];
      summary?: string;
    };
    const ok = await reportFeedback(currentSessionId, { effectiveness, wins, blockers, summary });
    return {
      content: [
        { type: "text", text: ok ? "Session feedback recorded." : "Could not record feedback (no usable fields or server unavailable)." },
      ],
    };
  }

  return {
    content: [{ type: "text", text: `Unknown tool: ${name}` }],
    isError: true,
  };
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Burnwise MCP server running on stdio");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
