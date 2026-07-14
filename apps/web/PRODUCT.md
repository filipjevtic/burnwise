# Burnwise — Product & Design Intent

> impeccable `init` deliverable. The "why" behind `DESIGN.md`. Read both before
> touching UI. Baseline this replaces scored **18/40 Nielsen · 9/20 audit** — see
> `.impeccable/critique/` and `.impeccable/baseline/` for the before-state.

## What this is

Burnwise is a **vendor-neutral engineering-intelligence platform** — it attributes
AI-assisted effort (tokens, traces, coding time) across **tickets, projects, and
developers**, so PMs and EMs can calibrate estimates and plan sprints on real
data. Velocity, efficiency, and capacity are the headline; **cost/budgets are a
supporting feature**, not the pitch. The dashboard is a **data tool for
engineering leads and developers**, not a marketing site. Register: **product**,
not brand.

**Cross-tool by design (vision + honest scope).** The goal is one pane across
every AI coding tool. *Today* that means OpenAI-compatible agents via the proxy
(Cursor, Aider, etc.), Claude Code via MCP, and any command via the CLI — plus
Jira/GitHub/GitLab. *On the roadmap:* direct Anthropic, AWS Bedrock, GCP Vertex,
and Cursor/Copilot/Windsurf telemetry. Don't imply coverage that doesn't ship yet.

**Guardrail — planning, not surveillance.** Per-developer views exist for
*capacity planning and estimate calibration*, never as a productivity leaderboard.
Default to aggregate/team framing; individual breakdowns are a means, not the
headline. This is both an ethics stance and a go-to-market one (eng orgs reject
surveillance metrics).

## Register: product

The bar is Linear / Vercel / Grafana / Datadog — dense, calm, legible interfaces
engineers keep open all day. That means:

- **Earned familiarity over novelty.** A table looks like a table. Conventions
  are features.
- **Restrained color.** One accent, used only for primary action, current
  selection, focus, and live state. Everything else is a neutral ramp. Color is
  meaning, never decoration.
- **Data density is a virtue.** Tight rows, tabular figures, monospace for
  IDs/metrics, hierarchy via space + weight.
- **Motion conveys state, not personality.** 150–250ms, ease-out, no page-load
  choreography, always a `prefers-reduced-motion` path.
- **Dark-first.** Dark is the primary design target; light is a first-class peer
  held to the same contrast standard.

## Brand

The Burnwise mark is a **flame** (orange) rising from **stacked bricks** (steel
blue) — building, measured burn. The palette derives from the mark:

- **Flame orange** is the single accent (`oklch ~0.70 0.175 47`) — the "burn."
  Reserved for the primary action, the selected item, focus, and live
  indicators. If orange is everywhere, it means nothing.
- Neutrals tint a hair toward cool blue (the brick) so surfaces cohere with the
  mark without reading as "tinted."

## Anti-references — what the baseline got wrong (measured, not guessed)

The pre-rehaul UI was unmodified shadcn defaults. The Phase 0 audit quantified it:

- Stock slate palette (**29** default HSL values); no brand presence beyond the
  favicon.
- `text-muted-foreground` on nearly everything (**85** uses / 20 files) → no
  hierarchy, washed out.
- The same `lg:grid-cols-5` StatCard grid templated across pages (**3×**).
- **10** identical `border-dashed` gray-icon-in-gray-box empty states.
- **Zero** custom typography (system stack), no monospace for data.
- Flat dark mode: app bg, sidebar, and cards all the same near-black — no surface
  elevation; depth faked with `shadow-xs`.
- `accent` token identical to `secondary`; only `destructive` semantic token;
  focus ring a near-invisible gray-on-gray (WCAG fail).

Every one of those is a thing to *not* do again. The detector guards literal
value-level anti-patterns; taste + this doc guard the structural ones it misses.
