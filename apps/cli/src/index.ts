import { runCommand } from "./run.js";
import { parseArgs } from "./parse.js";
import { startSession, stopSession, readLocalSession } from "./session.js";
import { getGitContext } from "./git.js";

function printBanner() {
  console.log(`
     )\ )         )          (
    (()/(      ( /(          )\ )           )
     /(_))  (  )\())  (     (()/(      (   (     (
    (_))_   )\((_)\   )\     /(_))  (  )\  )\ )  )\ )
    |   \  ((_) |(_) ((_)   (_))_|  )\((_) _(_/((()/( )
    | |) |/ _ \\ \ / / _ \  | |_   ((_) _ | ' \)))(_))
    |___/ \___/_\_\_\\___/  |___|  \__/__||_||_|(/__/

    Burnwise CLI — turn AI usage into sprint-planning signal
  `);
}

function printUsage() {
  printBanner();
  console.log(`
Usage:
  ats start <TICKET> [--project <id>]   Start an agent session bound to a ticket
  ats stop                              End the active session
  ats status                            Show the active session
  ats [options] -- <command> [args...]  Run a command, attributed to the session

Options:
  --ticket-id <id>      Associate this run with a ticket (overrides active session)
  --activity-type <t>   coding, review, planning, debugging, or other (default: other)

Environment:
  ATS_SERVER_URL        Ingestion server URL (default: http://localhost:3000)
  ATS_API_KEY           Personal API key (bw_sk_...), preferred for attribution
  ATS_INGEST_API_KEY    Shared ingest key (fallback)
  ATS_WORKSPACE_ID      Workspace ID (default: default)
  ATS_PROJECT_ID        Project ID (default: default)
  ATS_USER_ID           User ID (default: default)
  ATS_TICKET_ID         Default ticket ID

Examples:
  ats start PROJ-123
  ats -- claude code "refactor login"
  ats stop
`);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    printUsage();
    process.exit(0);
  }

  const parsed = parseArgs(args);

  // Session subcommands.
  if (parsed.subcommand === "start") {
    if (!parsed.ticketId) {
      console.error("Usage: ats start <TICKET> [--project <id>]");
      process.exit(1);
    }
    const branch = getGitContext().branch;
    const session = await startSession({
      ticketKey: parsed.ticketId,
      projectId: parsed.projectId,
      branch,
    });
    console.log(`Started session ${session.sessionId} for ${session.ticketKey || "(no ticket)"}`);
    process.exit(0);
  }

  if (parsed.subcommand === "stop") {
    const stopped = await stopSession();
    console.log(stopped ? "Session ended." : "No active session.");
    process.exit(0);
  }

  if (parsed.subcommand === "status") {
    const local = readLocalSession();
    if (!local) {
      console.log("No active session.");
    } else {
      console.log(`Active session ${local.sessionId} — ticket ${local.ticketKey || "(none)"} (since ${local.startedAt})`);
    }
    process.exit(0);
  }

  if (parsed.error) {
    console.error(parsed.error);
    printUsage();
    process.exit(1);
  }

  const [command, ...childArgs] = parsed.args;
  const exitCode = await runCommand({
    command,
    args: childArgs,
    activityType: parsed.activityType,
    ticketId: parsed.ticketId,
  });
  process.exit(exitCode);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
