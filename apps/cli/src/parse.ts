export interface ParsedCliArgs {
  subcommand?: "start" | "stop" | "status";
  ticketId?: string;
  projectId?: string;
  activityType: "coding" | "review" | "planning" | "debugging" | "other";
  command?: string;
  args: string[];
  error?: string;
}

export function parseArgs(argv: string[]): ParsedCliArgs {
  const result: ParsedCliArgs = {
    activityType: "other",
    args: [],
  };

  // Subcommands: `ats start <TICKET> [--project <id>]`, `ats stop`, `ats status`.
  if (argv[0] === "start" || argv[0] === "stop" || argv[0] === "status") {
    result.subcommand = argv[0];
    for (let i = 1; i < argv.length; i++) {
      const arg = argv[i];
      if (arg === "--project") {
        result.projectId = argv[++i];
      } else if (!arg.startsWith("--") && !result.ticketId) {
        result.ticketId = arg;
      }
    }
    return result;
  }

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--") {
      result.args.push(...argv.slice(i + 1));
      break;
    }
    if (arg === "--ticket-id") {
      result.ticketId = argv[++i];
      continue;
    }
    if (arg === "--activity-type") {
      const next = argv[++i];
      if (["coding", "review", "planning", "debugging", "other"].includes(next)) {
        result.activityType = next as ParsedCliArgs["activityType"];
      } else {
        return { ...result, error: `Invalid activity type: ${next}` };
      }
      continue;
    }
    return { ...result, error: `Unknown option: ${arg}` };
  }

  if (result.args.length === 0) {
    return { ...result, error: "No command provided. Use '--' to separate ats options from the command." };
  }

  return result;
}
