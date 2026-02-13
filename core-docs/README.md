# WeKruit Valet — Core Documentation

> Implementation plans, architecture decisions, and sprint planning for the Valet automated job-application platform.

## Document Index

### Integration Plans

| # | Document | Description |
|---|----------|-------------|
| 1 | [AdsPower Integration](integration/01-adspower-integration.md) | Local API client, profile lifecycle, CDP URL extraction, proxy integration |
| 2 | [Stagehand v3 Integration](integration/02-stagehand-integration.md) | Primary browser automation engine — act/extract/observe + agent mode via CDP |
| 3 | [Magnitude Integration](integration/03-magnitude-integration.md) | Fallback vision-first browser agent — dual-agent architecture via CDP |
| 4 | [Engine Switching](integration/04-engine-switching.md) | SandboxController, switching protocol, fallback cascade, cross-task sharing |

### Sandbox & Infrastructure

| # | Document | Description |
|---|----------|-------------|
| 1 | [VNC Stack](sandbox/01-vnc-stack.md) | Xvfb + x11vnc + websockify + noVNC — human-in-the-loop takeover |
| 2 | [Sandbox Deployment](sandbox/02-sandbox-deployment.md) | Fly Machines, Docker builds, networking, Redis registry, scaling |

### UX & UI Design

| # | Document | Description |
|---|----------|-------------|
| 1 | [User Experience Design](ux-ui/01-user-experience-design.md) | User journeys, task progress, CAPTCHA takeover, copilot review, VNC viewer |

### Planning & Roadmap

| # | Document | Description |
|---|----------|-------------|
| 0 | [Master Plan](planning/00-master-plan.md) | Phases, sprints, critical path, risk register, architecture decisions |
| 1 | [Sprint Backlog](planning/01-sprint-backlog.md) | Prioritized task backlog with effort estimates, dependencies, acceptance criteria |

## Architecture Reference

The top-level architecture document lives at [`docs/architecture.md`](../docs/architecture.md) and covers system overview, component architecture, request flows, data model, deployment topology, security, and scaling strategy.

## How to Use These Docs

1. **Start here** — read this README for orientation
2. **Understand the big picture** — read `docs/architecture.md` and `planning/00-master-plan.md`
3. **Plan your sprint** — use `planning/01-sprint-backlog.md` to pick up tasks
4. **Deep-dive before building** — read the relevant integration/sandbox/UX doc before implementing each component
5. **Cross-reference** — docs reference each other; follow links to understand dependencies

## Key Architecture Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Workflow orchestration | Hatchet (self-hosted on Fly.io) | Durable execution, human-in-the-loop `waitFor`, DAG workflows, event triggers |
| Browser management | AdsPower | Anti-detect fingerprints, profile isolation, Local API, proxy binding |
| Primary automation | Stagehand v3 (DOM-first) | Raw CDP, agent mode, 3 primitives, MIT license, fast |
| Fallback automation | Magnitude (vision-first) | Handles complex UIs where DOM fails, plan reuse |
| Sandbox | Fly Machines (MVP: worker IS sandbox) | VNC-capable, ephemeral, `.internal` DNS, `fly-replay` routing |
| VNC stack | Xvfb + x11vnc + websockify + noVNC | Zero-install browser client, WebSocket transport |
| LLM strategy | 3-tier routing (Sonnet → GPT-4.1 mini → nano) | ~$0.045-0.12 per application |
| Frontend | React + TanStack Router + ts-rest React Query v5 | Type-safe E2E, real-time via WebSocket |
| Database | Supabase Postgres (pooler + direct) | Managed, S3 storage included |

## Monorepo Packages

```
packages/shared     — Zod schemas (source of truth), types, constants
packages/contracts  — ts-rest API contracts consuming shared schemas
packages/db         — Drizzle ORM schema, migrations, seed
packages/ui         — Radix + Tailwind component library
packages/llm        — LLM provider abstraction (Anthropic, OpenAI)
apps/api            — Fastify server (port 8000)
apps/worker         — Hatchet workflow worker + browser automation
apps/web            — React SPA (Vite, port 5173)
```
