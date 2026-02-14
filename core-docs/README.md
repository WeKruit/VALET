# WeKruit Valet — Core Documentation

> Architecture, integration references, and implementation plan for the Valet automated job-application platform.

## How to Read These Docs

1. **Start here** — read this README for orientation
2. **Understand the system** — read `08-comprehensive-integration-plan.md` for the full picture
3. **Deep-dive** — read the specific reference doc for the component you're building
4. **Design** — hand `03-designer-brief.md` to the designer for UX/UI work

## Architecture Documents

Read in this order for full understanding:

| # | Document | What It Covers | When to Read |
|---|----------|----------------|--------------|
| 08 | [Integration Plan](architecture/08-comprehensive-integration-plan.md) | System architecture, Hatchet workflow DAG, data flows, implementation phases, DB/API changes, cost model | **Read first** — the master plan |
| 01 | [Shared Interfaces](architecture/01-shared-interfaces.md) | TypeScript interfaces (IBrowserEngine, ISandboxController, IEngineOrchestrator, etc.), DI registration, implementation mapping | Before writing any new code |
| 02 | [Workflow State Machine](architecture/02-workflow-state-machine.md) | Application lifecycle states, tier-specific paths, engine switching sub-states, Hatchet task mapping, Mermaid diagrams | Before touching worker workflows |
| 03 | [Designer Brief](architecture/03-designer-brief.md) | User personas, journeys per tier, screen inventory (19 web + 7 extension), wireframes, interactions, upgrade prompts | Hand to designer |
| 04 | [Browser Engines Reference](architecture/04-browser-engines-reference.md) | Stagehand v3 + Magnitude: full API surface, CDP connection, error handling, switching protocol, performance data | Before implementing engine wrappers |
| 05 | [Infrastructure Providers Reference](architecture/05-infrastructure-providers-reference.md) | AdsPower Local API + Browserbase Sessions API: endpoints, TypeScript types, session lifecycle, HITL, proxy integration | Before implementing sandbox providers |
| 06 | [Hatchet Workflow Reference](architecture/06-hatchet-workflow-reference.md) | Hatchet v1 SDK: DAGs, durable tasks, sticky workers, events, concurrency, retry policies, 5 workflow patterns | Before modifying Hatchet workflows |
| 07 | [Chrome Extension Reference](architecture/07-chrome-extension-reference.md) | MV3 architecture, content script form filling, React input tricks, Shadow DOM, WXT build, CWS publishing | Before building the extension |
| 09 | [Deployment & Sandbox Guide](architecture/09-deployment-guide.md) | Fly.io services, Docker builds, Hatchet deployment, CI/CD pipeline, multi-tier sandbox provisioning, VNC stack, EC2 setup, networking, scaling | Before deploying or modifying infrastructure |
| 10 | [Engine Usage Patterns](architecture/10-engine-usage-patterns.md) | SandboxController implementation, form analysis, end-to-end platform examples (Greenhouse/Workday/LinkedIn), engine switching, error recovery, HITL, cost optimization | Before implementing automation workflows |
| 11 | [Local Tier Companion App](architecture/11-local-tier-companion-app.md) | **BACKLOG** — Chrome Extension + Native Messaging + companion app technical challenges, packaging, code signing | When ready to implement Local tier |

## Implementation Phases (from doc 08)

| Phase | What | Key Deliverable |
|-------|------|-----------------|
| 1 | Core interfaces + Browserbase Tier 2 | Server-side automation works end-to-end on Greenhouse/Lever |
| 2 | Engine switching + Magnitude | Fallback cascade handles Workday/complex UIs |
| 3 | AdsPower + EC2 Premium tier | Dedicated anti-detect browsers for Premium users |
| 4 | Chrome Extension free tier | MV3 extension with autofill on ATS pages |
| 5 | Quality gates + batch processing | Pro tier autonomous submission + batch queue |

## Product Tiers

| Tier | Name | Delivery | Sandbox | Engines |
|------|------|----------|---------|---------|
| Free | Valet Assist | Chrome Extension | User's browser | DOM manipulation (no Stagehand) |
| Local ($9-12/mo) | Valet Desktop | Extension + Companion App | User's machine (local Chrome) | Stagehand v3 + Magnitude |
| Starter ($19/mo) | Valet Copilot | Extension + Server | Browserbase | Stagehand v3 |
| Pro ($39/mo) | Valet Autopilot | Extension + Server | Browserbase | Stagehand v3 |
| Premium ($79-99/mo) | Valet Premium | Extension + Server | EC2 + AdsPower | Stagehand v3 + Magnitude |

## Key Architecture Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Workflow orchestration | Hatchet v1 (self-hosted on Fly.io) | Durable execution, waitFor events, DAG workflows, sticky workers |
| Primary automation | Stagehand v3 (DOM-first) | act/extract/observe + agent mode, caching, MIT license |
| Fallback automation | Magnitude (vision-first) | Handles Shadow DOM, canvas, complex UIs where DOM fails |
| Premium browser mgmt | AdsPower on EC2 | Anti-detect fingerprints, profile isolation, Local API |
| Standard browser infra | Browserbase | Native Stagehand integration, Live View HITL, Contexts API |
| Free tier | Chrome Extension (MV3) | Zero server cost, instant value, conversion funnel |
| LLM strategy | 3-tier routing (Sonnet / GPT-4.1 mini / nano) | ~$0.02-0.10 per application |
| Frontend | React + TanStack Router + ts-rest React Query v5 | Type-safe E2E, real-time via WebSocket |
| Database | Supabase Postgres (pooler + direct) | Managed, S3 storage included |

## Monorepo Packages

```
packages/shared     - Zod schemas (source of truth), types, constants
packages/contracts  - ts-rest API contract definitions
packages/db         - Drizzle ORM schema, migrations, seed
packages/ui         - Radix + Tailwind component library
packages/llm        - LLM provider abstraction (Anthropic, OpenAI)
apps/api            - Fastify API server (port 8000)
apps/worker         - Hatchet workflow worker + browser automation
apps/web            - React SPA (Vite + TanStack Router, port 5173)
apps/agent          - Node.js companion app (Native Messaging host) [Phase 4]
apps/extension      - Chrome Extension MV3 (WXT + React) [Phase 4-5]
```

## Archived Docs

Earlier planning docs that have been superseded by the architecture documents above are in `_archive/`. These contain historical context but should NOT be used for implementation — use the `architecture/` docs instead.
