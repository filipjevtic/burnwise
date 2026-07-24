# Burnwise Architecture

<p align="center">
  <img src="../assets/logo-icon.png" alt="Burnwise" width="120">
</p>

This document describes the high-level architecture of the platform.

## System Overview

```mermaid
flowchart TB
    subgraph Collectors["Collectors"]
        A[IDE plugins]
        B[API proxy]
        C[CLI]
        D[CI/CD webhooks]
    end

    subgraph Server["apps/server Fastify API"]
        E[Events /ingest]
        F[Association service]
        G[Integrations GitHub/Jira/GitLab]
        H[Forecast]
        I[Alerts]
        J[Team]
        K[CI/CD]
    end

    subgraph Frontend["apps/web React Dashboard"]
        L[Dashboard]
        M[Velocity & Efficiency]
        N[Sessions & Traces]
        O[Forecast & Capacity]
        P2[Integrations & Settings]
    end

    subgraph Data["Data"]
        P[(PostgreSQL)]
        Q[Prisma ORM]
    end

    A -->|usage events| E
    B -->|LLM events| E
    C -->|session activity| E
    D -->|ci.run| K
    E -->|validate| F
    F -->|link to ticket| P
    G -->|sync sprints/tickets| P
    H -->|read history| P
    I -->|read usage| P
    J -->|read/write| P
    K -->|persist| P
    P -->|query| L
    P -->|query| M
    P -->|query| N
    P -->|query| O
    L -->|REST| Server
    M -->|REST| Server
    N -->|REST| Server
    O -->|REST| Server
```

## Data Model

```mermaid
erDiagram
    Workspace ||--o{ Project : has
    Workspace ||--o{ User : has
    Workspace ||--o{ ApiKey : has
    Workspace ||--o{ Session : has
    Project ||--o{ Ticket : has
    Project ||--o{ Sprint : has
    Project ||--o{ Event : has
    Project ||--o{ Session : has
    Project ||--o{ TeamMember : has
    Project ||--o| IssueTrackerConfig : has
    Sprint ||--o{ Ticket : contains
    User ||--o{ Event : emits
    User ||--o{ Session : owns
    User ||--o{ ApiKey : owns
    User ||--o{ TeamMember : belongs
    Ticket ||--o{ Event : linked
    Ticket ||--o{ Session : worked
    Session ||--o{ Event : groups
    TeamMember }o--|| User : member
```

## Event Flow

1. A developer starts a **session** bound to a ticket (CLI `ats start`, MCP `set_ticket`, IDE, or git branch).
2. Collectors emit events (IDE, proxy, CLI, CI), authenticated with a personal **API key** (`bw_sk_...`) so the real user and workspace are resolved server-side.
3. The ingestion API validates the batch schema.
4. The association service links each event to a ticket by precedence: explicit session/header ticket > git branch convention > prompt/metadata extraction.
5. Events are persisted in PostgreSQL, grouped under their session.
6. The dashboard derives velocity (committed vs completed points), efficiency (effort per completed point), session/trace rollups, and a velocity-based capacity recommendation, all from the shared event-rollup math.

## Sprint-planning analytics

All analytics share one event-rollup helper so ticket, sprint, session, and developer summaries stay consistent:

- **Velocity**: committed vs completed story points, completion rate (estimate accuracy), and a trailing rolling average per sprint.
- **Efficiency**: cost / tokens / agent-time per completed story point, trended across sprints.
- **Capacity recommendation**: an anomaly-aware estimate (median ± 1 stddev of clean completed-points history) for the next sprint.

## Integration Flow

```mermaid
sequenceDiagram
    participant UI as Dashboard
    participant API as Server
    participant GH as GitHub API
    participant JI as Jira API
    participant GL as GitLab API
    participant DB as PostgreSQL

    UI->>API: POST /integrations/github/:id
    API->>GH: fetch milestones & issues
    GH-->>API: milestones + issues
    API->>DB: upsert sprints & tickets

    UI->>API: POST /integrations/jira/:id
    API->>JI: board -> sprints -> issues
    JI-->>API: issues
    API->>DB: upsert sprints & tickets

    UI->>API: POST /integrations/gitlab/:id
    API->>GL: milestones & issues
    GL-->>API: issues
    API->>DB: upsert sprints & tickets
```

## Components

| Component | Location | Responsibility |
|-----------|----------|----------------|
| Web dashboard | `apps/web` | React UI, Tailwind + shadcn/ui |
| Server API | `apps/server` | Fastify REST API, Prisma, integrations |
| Proxy | `apps/proxy` | Forward LLM calls, emit events |
| CLI | `apps/cli` | Wrap commands, emit session activity |
| VS Code extension | `apps/vscode` | IDE collector |
| MCP server | `apps/mcp` | Ticket binding + activity for Claude Code / MCP clients |
| Schema | `packages/schema` | Zod event schemas |
| Pricing | `packages/pricing` | LLM cost lookup table |

## Deployment

```mermaid
flowchart LR
    subgraph Host
        Nginx
        Web[Web static files]
        Server[Fastify server]
        Proxy[API proxy]
        Postgres[(PostgreSQL)]
    end
    Client[Browser] -->|HTTPS| Nginx
    Nginx -->|/| Web
    Nginx -->|/api| Server
    Server -->|read/write| Postgres
    IDE -->|HTTP| Proxy
    Proxy -->|forward| LLMProvider
    Proxy -->|events| Server
```

See [SELFHOST.md](SELFHOST.md) for detailed deployment instructions.
