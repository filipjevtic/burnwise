# User Stories

<p align="center">
  <img src="../assets/logo-icon.png" alt="Burnwise" width="120">
</p>

Burnwise sits beside your issue tracker (Jira / GitHub / GitLab) and your LLM
providers. It consumes agent telemetry (proxy, IDE, MCP, CLI, CI) and emits a
planning signal back to the team: **how much AI-assisted effort actually went
into each ticket, and what that means for the next sprint.**

Burnwise is **cross-tool and vendor-neutral by design**: the goal is one pane
across every AI coding tool (today: OpenAI-compatible agents via proxy, Claude
Code via MCP, any command via CLI; on the roadmap: direct Anthropic, Bedrock,
Vertex, Cursor/Copilot/Windsurf). And it is **planning support, not
surveillance**: per-developer views serve capacity planning and estimate
calibration, never a productivity leaderboard; default to team/aggregate framing.

## Personas

| Persona | Goal |
|---------|------|
| **Developer** | Tie AI agent work to the ticket they are working, with no extra ceremony. |
| **Team Lead** | See per-developer and per-team throughput across projects. |
| **PM / EM** | Calibrate estimates from real effort and plan the next sprint with confidence. |
| **Admin** | Self-host confidently with SSO, per-developer keys, and isolated data. |

## End-to-end loops

### Loop A: Developer ties agent work to a ticket (primary)

> As a developer, when I start work on `PROJ-123` I run `ats start PROJ-123`
> (or set it in my IDE/MCP, or just branch `PROJ-123-*`). Every LLM call through
> the proxy, IDE activity, and CLI-wrapped command for the rest of that session
> is attributed to `PROJ-123` and to me, with correct tokens, cost, and duration.

Resolution precedence is uniform across every tool: **explicit active-session /
header ticket > git branch convention (`[A-Z]+-\d+`) > prompt / metadata
extraction.** Whatever signal exists, the strongest wins, so a mixed-tool
developer never has to think about it.

### Loop B: PM reviews ticket / sprint feedback

> As a PM, I open a sprint and see, per ticket, the **story points vs actual**
> tokens / cost / agent-time, who worked it, and the trace of agent activity \u2014
> so I can calibrate estimates and spot runaway cost.

This is the headline: **estimate accuracy**. The Velocity view shows committed
vs completed points with variance flags; the Efficiency view shows AI effort per
completed point over time; sessions drill down to a trace timeline.

### Loop C: Team Lead monitors teams across projects

> As a team lead, I see per-developer and per-team rollups (cost, tokens, active
> tickets, trend over time) across multiple projects and sprints, with budget
> alerts.

### Loop D: Admin self-hosts confidently

> As an admin, I deploy with one command, configure SSO (e.g. Google for admins,
> GitHub for devs), issue per-developer ingest keys, and trust that project data
> is isolated and secrets are encrypted at rest.

## Developer day-in-the-life

1. **One-time setup.** Log in, generate a **personal API key** (Settings \u2192 API
   Keys), and export it once (`ATS_API_KEY=bw_sk_...`).
2. **Start a task.** `ats start PROJ-123` writes a local session with the ticket
   and a session id. Alternatively set it in the IDE, let the agent call MCP
   `set_ticket`, or just work on a `PROJ-123-*` branch.
3. **Work, any tool path:**
   - **Claude Code / MCP** \u2014 the agent calls `set_ticket PROJ-123`; LLM calls
     routed through the Burnwise proxy are stamped with the session/ticket.
   - **Cursor / Copilot / IDE** \u2014 the extension binds the ticket and emits
     coding activity; the model is routed via the proxy for token capture.
   - **API / SDK direct** \u2014 point the SDK `base_url` at the proxy and pass
     `X-Burnwise-Key` + `X-Burnwise-Ticket` headers.
4. **Stop / switch.** `ats stop` (or starting another ticket) finalizes the
   session with totals.

**Outcome:** every token, trace span, coding minute, and CI run produced while
working `PROJ-123` is attributed to the ticket **and** the developer \u2014
regardless of which tool was used.

## PM day-in-the-life

- **Estimate accuracy.** Open the **Velocity** view: committed vs completed
  story points per sprint, completion rate, a rolling average, and per-sprint
  variance flags.
- **Efficiency trend.** The **Efficiency per point** view shows cost / tokens /
  minutes per completed story point over time \u2014 are we getting cheaper and
  faster per point?
- **Next-sprint capacity.** The **Forecast** page surfaces a velocity-based
  capacity recommendation (median \u00b1 band, anomaly-aware) plus token/cost/time
  budgets per target story points.
- **Trace drill-down.** Click into sessions to see the agent timeline (LLM
  generations, tool calls, coding activity, CI runs) behind the numbers.
- **Monitoring & alerts.** Budget alerts at project / sprint / workspace level
  surface runaway cost (secondary but available).

**Outcome:** the PM gets real feedback on tickets worked (estimate vs actual,
plus the trace behind it) and a live picture of team throughput across the
portfolio.
