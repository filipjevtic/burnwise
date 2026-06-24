import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { config } from "./config.js";
import { emitEvent, startSession } from "./events.js";
import type { Event } from "@burnwise/schema";

let currentTicketId: string | undefined = process.env.ATS_TICKET_ID || undefined;
let currentSessionId: string | undefined;

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
