# Claude Code Agent Team Prompt: WeKruit Valet

> **VALET** — **V**erified. **A**utonomous. **L**ightning. **E**ffortless. **T**rusted.
> _Verified Automation. Limitless Execution. Trust._

**Version:** 2.0
**Date:** 2026-02-12
**Status:** Ready for Agent Team Execution

---

## Quick Start

### Prerequisites

1. Enable agent teams in Claude Code `settings.json`:

```json
{
  "env": {
    "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"
  }
}
```

2. All context lives in `product-research/` (16 docs + design system HTML). No external docs needed.

### Run Command

```bash
claude --teammate-mode in-process
```

Then paste the full prompt block below.

---

## THE PROMPT

```
I'm building WeKruit Valet -- a dual-mode AI job application system.

VALET = Verified. Autonomous. Lightning. Effortless. Trusted.
Tagline: "Verified Automation. Limitless Execution. Trust."

Users paste a job URL; the system navigates to the posting, fills forms using LLM-powered analysis, answers screening questions, uploads documents, and submits -- all inside anti-detect browsers (AdsPower) with residential proxies (IPRoyal).

Two modes:
- **Copilot Mode** (default): AI fills, user reviews and approves every submission
- **Autopilot Mode** (earned after 3 successful Copilot runs): AI fills AND submits within user-defined parameters, subject to 9 mandatory quality gates

MVP targets LinkedIn Easy Apply. Greenhouse, Lever, Workday follow in later phases.

---

## Context: Required Reading

Every teammate MUST read their assigned docs before writing any code. All docs live in `product-research/`.

### Document Authority (when conflicts exist, higher number wins)
1. `16_code_architecture_guide.md` -- **HIGHEST authority** for code patterns, DTOs, folder structure, naming
2. `15_deployment_sre_plan.md` -- Deployment, CI/CD, SRE, monitoring
3. `14_final_engineering_plan.md` -- Sprint tickets, execution plan, .env template
4. `11_integration_architecture.md` -- TypeScript stack decision rationale, Hatchet choice
5. `03_complete_prd.md` -- Features (Section 4), API spec (Section 5), data model (Section 6)

### Critical Docs (ALL teammates read these)
- `16_code_architecture_guide.md` -- Monorepo structure, DTOs, ts-rest contracts, feature-based modules, DI, error handling, naming conventions
- `15_deployment_sre_plan.md` -- Hetzner + Coolify deployment, CI/CD pipeline, SRE runbook
- `14_final_engineering_plan.md` -- Sprint tickets, scope, .env template
- `03_complete_prd.md` -- PRD: features (Section 4), API spec (Section 5), data model (Section 6)

### Role-Specific Docs
- **Infra**: `11_integration_architecture.md` Sections 8-9 (monorepo rationale, Docker)
- **Backend**: `11_integration_architecture.md` Section 6 (API contract), `16_code_architecture_guide.md` Sections 3-4 (ts-rest, feature modules)
- **Frontend**: `12_frontend_implementation_plan.md`, `wekruit-design-system.html`, `05_autopilot_ux_onboarding.md`, `16_code_architecture_guide.md` Section 5 (frontend architecture)
- **Automation**: `10_stagehand_orchestration_research.md`, `16_code_architecture_guide.md` Section 8 (WebSocket types)
- **Quality/DevOps**: `13_testing_strategy.md`, `15_deployment_sre_plan.md` (full CI/CD YAML, SRE runbook)
- **Security/Legal**: `06_autopilot_privacy_legal.md`

### CONFLICT RESOLUTION
Some older docs reference patterns that have been superseded:
- Doc 14 mentions "TypeBox" → **Use Zod + ts-rest instead** (see doc 16 Section 3)
- Doc 14 mentions "AdminJS" → **DO NOT use AdminJS** (use Drizzle Studio)
- Doc 14 mentions "Zustand" for all state → **React Query for server state, Zustand for client UI only** (see doc 16 Section 5)
- Doc 11 has flat `routes/` folder → **Use feature-based `modules/` instead** (see doc 16 Section 4)
- Doc 14 mentions "Zod + TypeBox" validation → **Zod only, via ts-rest contracts** (see doc 16 Section 3)
- Any mention of Python, FastAPI, SQLAlchemy, pytest → **IGNORE.** Full TypeScript stack.

---

## Decided Tech Stack (Full TypeScript -- FINAL)

### Core
- **Monorepo**: Turborepo + pnpm workspaces
- **API Contracts**: ts-rest (end-to-end type safety between Fastify + React)
- **API**: Fastify 5.x + ts-rest server + @fastify/swagger (OpenAPI auto-gen)
- **Validation**: Zod (single source of truth for all DTOs)
- **ORM**: Drizzle ORM + drizzle-kit migrations
- **DI Framework**: @fastify/awilix (dependency injection for services + repositories)
- **Database**: PostgreSQL 16 (shared with Hatchet)
- **Cache/Pub-Sub**: Redis 7 (WebSocket relay, rate limiting, BullMQ secondary queue)
- **Orchestrator**: Hatchet TypeScript SDK (durable pause/resume for CAPTCHA, built-in rate limiting)
- **Browser Automation**: Stagehand (TypeScript, primary) → Magnitude (fallback) → Human takeover -- ALL DEFERRED from Sprint 0-1
- **Anti-Detect**: AdsPower Local API (port 50325) -- interface only in Sprint 0-1
- **Human Takeover**: noVNC via react-vnc wrapper -- interface only in Sprint 0-1
- **Auth**: Google OAuth 2.0 + JWT RS256 (jose library), 15min access / 7d refresh tokens
- **Real-time**: WebSocket (native Fastify) + Redis Pub/Sub relay
- **Logging**: pino (structured JSON to stdout)
- **Error Tracking**: Sentry (deferred setup, but error handler middleware ready)
- **Error Handling**: AppError class hierarchy (see doc 16 Section 4)

### Frontend
- **Framework**: Vite + React 18 + TypeScript
- **Base**: shadcn-admin (pre-built dashboard shell with sidebar, header, user menu)
- **Design System**: WeKruit tokens (--wk-* CSS custom properties) bridged to Tailwind
- **Fonts**: Halant (serif, display headings) + Geist (sans-serif, body text) via Google Fonts
- **Charts**: Tremor
- **Server State**: React Query (via ts-rest `initQueryClient`) -- ALL server data
- **Client State**: Zustand -- sidebar open/closed, modals, theme toggle ONLY
- **URL State**: nuqs (URL search params for page, tab, filters)
- **Forms**: React Hook Form + Zod
- **Notifications**: Novu (self-hosted, deferred to Phase 2)

### LLM Strategy (3-tier routing via custom TypeScript router)
- Primary (complex): Claude Sonnet 4.5 ($3/$15) -- form analysis, answer generation, screenshots
- Secondary (routine): GPT-4.1 mini ($0.40/$1.60) -- field mapping, error recovery
- Budget (trivial): GPT-4.1 nano ($0.10/$0.40) -- confirmations, navigation
- Token budget: hard cap per application (configurable, default $0.10/app)
- Caching: form analysis results cached by URL+hash, 7-day TTL

### Infrastructure & Deployment (see doc 15 for full details)
- **Hosting**: Hetzner VPS + Coolify (self-hosted PaaS)
- **CDN/DNS**: Cloudflare (free tier)
- **Object Storage**: Cloudflare R2 (S3-compatible, $0 egress)
- **Managed DB (prod)**: Neon Postgres (staging: self-hosted on VPS)
- **Monitoring**: Better Stack (uptime) + Sentry (errors) + Grafana Cloud (logs)
- **CI/CD**: GitHub Actions → Coolify auto-deploy (see doc 15 Section 3 for full YAML)
- **Proxy**: IPRoyal residential (24h sticky sessions) -- interface only in Sprint 0-1
- **Container (dev)**: Docker Compose (PostgreSQL, Redis, Hatchet, MinIO)
- **Testing**: Vitest (unit) + Playwright Test (e2e) + Testing Library (components)

---

## CRITICAL: Scope Boundaries for Sprint 0-1

### IN SCOPE (build these)
1. Turborepo monorepo with all packages wired up (including `packages/contracts/`)
2. Drizzle schema + migrations + seed data
3. Fastify API with ts-rest contracts, feature-based modules, DI, JWT auth, WebSocket, rate limiting
4. Hatchet workflow stubs with durable event pattern (mock implementations)
5. React dashboard: auth, onboarding, apply page, task progress, settings (using React Query via ts-rest)
6. CI/CD pipeline (GitHub Actions -- see doc 15 Section 3), Docker Compose, dev scripts
7. Structured logging (pino), error handling middleware (AppError classes)
8. Full test infrastructure: Vitest, Playwright config, mock ATS pages, fixtures

### OUT OF SCOPE (DO NOT build these in Sprint 0-1)
1. Stagehand / Magnitude browser automation integration -- interfaces and mocks ONLY
2. AdsPower CDP connection -- interface and mock ONLY
3. noVNC live session -- react-vnc component stub ONLY
4. IPRoyal proxy rotation -- interface and mock ONLY
5. Novu notification service -- defer to Phase 2
6. AdminJS or custom admin panel -- use Drizzle Studio for DB inspection
7. PDF parsing optimization -- use pdf-parse + mammoth as-is, flag if insufficient
8. Production deployment (Hetzner/Coolify) -- local Docker Compose only. Doc 15 is the plan for later.

---

## Monorepo Structure (MUST match this exactly)

This is the CANONICAL structure from Doc 16 Section 1. All teammates MUST use this.

```

wekruit-valet/
├── turbo.json
├── pnpm-workspace.yaml
├── package.json # Root: scripts, devDependencies
├── .env.example # All env vars documented
├── .gitignore
├── .github/
│ └── workflows/
│ └── ci.yml # Lint → typecheck → test → build (see doc 15 Section 3)
├── docker/
│ └── docker-compose.yml # PostgreSQL, Redis, Hatchet, MinIO
├── packages/
│ ├── contracts/ # @valet/contracts -- ts-rest API contracts (THE source of truth)
│ │ └── src/
│ │ ├── index.ts # Combined apiContract export
│ │ ├── tasks.ts # taskContract
│ │ ├── auth.ts # authContract
│ │ ├── resumes.ts # resumeContract
│ │ ├── qa-bank.ts # qaBankContract
│ │ ├── users.ts # userContract
│ │ └── consent.ts # consentContract
│ ├── shared/ # @valet/shared -- Zod schemas, errors, constants, env
│ │ └── src/
│ │ ├── schemas/ # Zod DTOs (request/response schemas)
│ │ │ ├── task.schema.ts
│ │ │ ├── user.schema.ts
│ │ │ ├── resume.schema.ts
│ │ │ ├── qa-bank.schema.ts
│ │ │ ├── consent.schema.ts
│ │ │ └── index.ts
│ │ ├── types/
│ │ │ ├── ws.ts # WebSocket message types (Zod discriminated union)
│ │ │ └── automation.ts # Browser automation interfaces
│ │ ├── errors/
│ │ │ └── index.ts # Error code constants
│ │ ├── constants/
│ │ │ └── index.ts # Enums, platform list, status codes, retention policy
│ │ └── env.ts # Zod-validated env loader (validateEnv())
│ ├── db/ # @valet/db
│ │ └── src/
│ │ ├── schema/ # Drizzle table definitions (kebab-case files)
│ │ │ ├── users.ts
│ │ │ ├── tasks.ts
│ │ │ ├── task-events.ts
│ │ │ ├── resumes.ts
│ │ │ ├── qa-bank.ts
│ │ │ ├── consent-records.ts
│ │ │ ├── browser-profiles.ts
│ │ │ ├── relations.ts
│ │ │ └── index.ts
│ │ ├── migrations/ # Auto-generated by drizzle-kit
│ │ ├── client.ts # createDatabase() factory
│ │ ├── seed.ts # Dev seed data
│ │ ├── drizzle.config.ts
│ │ └── index.ts # Public exports
│ ├── ui/ # @valet/ui
│ │ └── src/
│ │ └── components/ # shadcn/ui components themed with WeKruit tokens
│ └── llm/ # @valet/llm
│ └── src/
│ ├── router.ts # 3-tier model router
│ ├── providers/ # Anthropic, OpenAI adapters
│ ├── cache.ts # Form analysis cache (Redis-backed)
│ └── budget.ts # Token budget enforcement
├── apps/
│ ├── web/ # React dashboard (Vite)
│ │ ├── src/
│ │ │ ├── features/ # Feature-based grouping (see doc 16 Section 5)
│ │ │ │ ├── auth/
│ │ │ │ │ ├── components/
│ │ │ │ │ └── hooks/
│ │ │ │ ├── dashboard/
│ │ │ │ │ ├── components/
│ │ │ │ │ └── pages/
│ │ │ │ ├── tasks/
│ │ │ │ │ ├── components/
│ │ │ │ │ ├── hooks/
│ │ │ │ │ └── pages/
│ │ │ │ ├── apply/
│ │ │ │ ├── onboarding/
│ │ │ │ └── settings/
│ │ │ ├── components/ # Truly shared layout components
│ │ │ │ ├── layout/
│ │ │ │ └── common/
│ │ │ ├── stores/ # Zustand (CLIENT state only: sidebar, modals, theme)
│ │ │ │ ├── ui.store.ts
│ │ │ │ └── realtime.store.ts
│ │ │ ├── lib/
│ │ │ │ ├── api-client.ts # ts-rest React Query client (see doc 16 Section 3)
│ │ │ │ └── utils.ts
│ │ │ ├── styles/
│ │ │ │ └── globals.css # WeKruit CSS tokens + Tailwind imports
│ │ │ └── main.tsx
│ │ ├── index.html
│ │ ├── vite.config.ts
│ │ └── tailwind.config.ts # Extends with --wk-\* tokens
│ ├── api/ # Fastify backend (feature-based modules)
│ │ ├── src/
│ │ │ ├── modules/ # Feature-based (see doc 16 Section 4)
│ │ │ │ ├── auth/
│ │ │ │ │ ├── auth.routes.ts # ts-rest router handler
│ │ │ │ │ └── auth.service.ts
│ │ │ │ ├── tasks/
│ │ │ │ │ ├── task.routes.ts # ts-rest router handler
│ │ │ │ │ ├── task.service.ts
│ │ │ │ │ ├── task.repository.ts # Drizzle queries
│ │ │ │ │ └── task.errors.ts
│ │ │ │ ├── resumes/
│ │ │ │ │ ├── resume.routes.ts
│ │ │ │ │ ├── resume.service.ts
│ │ │ │ │ └── resume.repository.ts
│ │ │ │ ├── qa-bank/
│ │ │ │ │ ├── qa-bank.routes.ts
│ │ │ │ │ ├── qa-bank.service.ts
│ │ │ │ │ └── qa-bank.repository.ts
│ │ │ │ ├── users/
│ │ │ │ │ ├── user.routes.ts
│ │ │ │ │ ├── user.service.ts
│ │ │ │ │ └── user.repository.ts
│ │ │ │ └── consent/
│ │ │ │ ├── consent.routes.ts
│ │ │ │ └── consent.service.ts
│ │ │ ├── common/
│ │ │ │ ├── errors.ts # AppError base class (see doc 16 Section 4)
│ │ │ │ └── middleware/
│ │ │ │ ├── auth.ts # JWT validation
│ │ │ │ ├── error-handler.ts # Global error handler
│ │ │ │ ├── rate-limit.ts # Per-user, per-platform
│ │ │ │ └── request-logger.ts # pino request logging
│ │ │ ├── plugins/
│ │ │ │ ├── container.ts # @fastify/awilix DI setup (see doc 16 Section 4)
│ │ │ │ ├── database.ts # DB connection plugin
│ │ │ │ ├── swagger.ts # @fastify/swagger OpenAPI
│ │ │ │ └── security.ts # @fastify/helmet, CORS, CSP
│ │ │ ├── websocket/
│ │ │ │ └── handler.ts # WS event dispatcher (Redis Pub/Sub)
│ │ │ ├── app.ts # Fastify app factory
│ │ │ └── server.ts # Entry point
│ │ └── tests/
│ │ └── helpers/
│ │ ├── client.ts # Authenticated test client
│ │ └── db.ts # DB reset utilities
│ └── worker/ # Hatchet worker
│ ├── src/
│ │ ├── workflows/ # Hatchet workflow definitions
│ │ ├── adapters/ # Platform adapters (mock in Sprint 0-1)
│ │ │ ├── linkedin.mock.ts
│ │ │ ├── greenhouse.mock.ts
│ │ │ └── base.ts # IPlatformAdapter interface
│ │ └── index.ts
│ └── tests/
├── tests/ # Cross-cutting test infrastructure
│ ├── e2e/ # Playwright E2E tests
│ ├── fixtures/ # Shared test factories
│ │ ├── users.ts
│ │ ├── tasks.ts
│ │ └── resumes.ts
│ └── mock-ats/ # Static HTML mock pages
│ ├── linkedin-easy-apply.html
│ └── greenhouse-form.html
├── scripts/
│ ├── setup-dev.sh # One-command dev setup
│ └── health-check.sh # Verify all services running
└── product-research/ # 16 docs + design system (read-only context)

```

### Dependency DAG (strict, no cycles)

```

contracts ──→ shared (schemas only)
db ──→ (standalone)
llm ──→ shared
ui ──→ shared

api ──→ contracts, db, shared, llm
web ──→ contracts, shared, ui
worker ──→ contracts, db, shared, llm

````

Enforce with `eslint-plugin-import/no-cycle` in CI.

### Package Exports (subpath exports, NOT barrel files)

```json
// packages/shared/package.json
{
  "name": "@valet/shared",
  "exports": {
    "./schemas": "./src/schemas/index.ts",
    "./constants": "./src/constants/index.ts",
    "./errors": "./src/errors/index.ts",
    "./types": "./src/types/index.ts"
  }
}
````

Import: `import { createTaskRequest } from "@valet/shared/schemas"` — proper tree-shaking.

---

## Team Structure (6 Teammates)

### Teammate 1: "infra-engineer" -- Monorepo, Database, Shared Packages, Contracts

**Sprint Tickets:** S0-02 (Drizzle schema), parts of S0-01 (monorepo setup)

**Deliverables:**

- Initialize Turborepo + pnpm workspaces with the EXACT structure above
- Root configs: `turbo.json`, `pnpm-workspace.yaml`, root `package.json`, root `tsconfig.json`
- ESLint flat config (`eslint.config.mjs`), Prettier config, shared TypeScript base config
- `packages/contracts/`:
  - ts-rest contract definitions for ALL API routes (see doc 16 Section 3 for pattern)
  - Each domain gets its own contract file: `tasks.ts`, `auth.ts`, `resumes.ts`, `qa-bank.ts`, `users.ts`, `consent.ts`
  - Combined `apiContract` export from `index.ts`
  - Import Zod schemas from `@valet/shared/schemas`
- `packages/db/`:
  - Drizzle schema in `src/schema/*.ts`: users, tasks, task-events, browser-profiles, proxy-bindings, application-results, resumes, qa-bank, consent-records
  - All tables include `userId` for RLS enforcement at query level
  - `src/relations.ts` for Drizzle relation definitions
  - Generate initial migration via `drizzle-kit generate`
  - Seed script `src/seed.ts`: 2 test users (alice@test.com, bob@test.com), 5 tasks per user (various statuses), 1 resume per user, sample Q&A entries
  - `src/client.ts`: `createDatabase()` factory function
  - Command: `pnpm --filter @valet/db db:seed`
- `packages/shared/`:
  - `src/schemas/`: Zod schemas as single source of truth for ALL DTOs (see doc 16 Section 2 for pattern):
    - `task.schema.ts`: createTaskRequest, taskListQuery, taskResponse, taskListResponse + inferred types
    - `user.schema.ts`, `resume.schema.ts`, `qa-bank.schema.ts`, `consent.schema.ts`
  - `src/types/ws.ts`: WebSocket message types as Zod discriminated union (see doc 16 Section 8):
    ```typescript
    export const wsMessageSchema = z.discriminatedUnion("type", [
      z.object({
        type: z.literal("state_change"),
        taskId: z.string().uuid(),
        from: z.string(),
        to: z.string(),
        timestamp: z.string().datetime(),
      }),
      z.object({
        type: z.literal("progress"),
        taskId: z.string().uuid(),
        step: z.string(),
        pct: z.number(),
        message: z.string(),
      }),
      z.object({
        type: z.literal("field_review"),
        taskId: z.string().uuid(),
        fields: z.array(
          z.object({
            name: z.string(),
            value: z.string(),
            confidence: z.number(),
            source: z.enum(["resume", "qa_bank", "llm_generated"]),
          }),
        ),
      }),
      z.object({
        type: z.literal("human_needed"),
        taskId: z.string().uuid(),
        reason: z.string(),
        vncUrl: z.string().url().optional(),
      }),
      z.object({
        type: z.literal("completed"),
        taskId: z.string().uuid(),
        confirmationId: z.string().optional(),
        screenshotUrl: z.string().url().optional(),
      }),
      z.object({
        type: z.literal("error"),
        taskId: z.string().uuid(),
        code: z.string(),
        message: z.string(),
        recoverable: z.boolean(),
      }),
    ]);
    export type WSMessage = z.infer<typeof wsMessageSchema>;
    ```
  - `src/constants/`: Enums, platform list, error codes, retention policy constants
  - `src/errors/`: Error code constants
  - `src/env.ts`: Zod schema validating ALL environment variables at startup (see doc 16 Section 9). Apps import and call `validateEnv()` on boot.
- `docker/docker-compose.yml`:
  - PostgreSQL 16 (port 5432, persistent volume, health check)
  - Redis 7 (port 6379)
  - Hatchet Engine (`ghcr.io/hatchet-dev/hatchet/hatchet-lite:latest`, port 8888, uses same Postgres)
  - MinIO (port 9000/9001, buckets: resumes, screenshots, artifacts)
  - All services on shared Docker network `valet-network`
- `.env.example`: Document ALL required env vars (see doc 16 Section 9 for Zod schema)
- Tests: Schema validation tests, migration test, seed test, env validation test, contract type tests

**Output:** Root monorepo config, `packages/contracts/`, `packages/shared/`, `packages/db/`, `docker/`, `.env.example`

---

### Teammate 2: "backend-engineer" -- Fastify API (Feature Modules + DI), Hatchet Workflows, WebSocket

**Sprint Tickets:** S0-03, S0-05, S0-06, S0-11, S1-02, S1-03, S1-05, S1-06, S1-11

**IMPORTANT: Follow the feature-based module pattern from doc 16 Section 4. Use ts-rest for all route definitions. Use @fastify/awilix for DI.**

**Deliverables:**

- `apps/api/`:
  - Fastify 5.x application (`src/app.ts` + `src/server.ts`):
    - Import and call `validateEnv()` from `@valet/shared` on startup
    - Register plugins: `@fastify/cors`, `@fastify/helmet`, `@fastify/swagger`, `@fastify/rate-limit`, `@fastify/websocket`, `@fastify/awilix`
    - pino logger configured (JSON, request IDs, user IDs in context)
  - DI setup (`src/plugins/container.ts`) -- see doc 16 Section 4:
    ```typescript
    diContainer.register({
      db: asFunction(() => fastify.db, { lifetime: Lifetime.SINGLETON }),
      taskRepo: asClass(TaskRepository, { lifetime: Lifetime.SINGLETON }),
      taskService: asClass(TaskService, { lifetime: Lifetime.SINGLETON }),
      // ...all repos + services
    });
    ```
  - Feature modules (`src/modules/`) -- each module has routes + service + repository:
    - `auth/`: auth.routes.ts (ts-rest handler for authContract), auth.service.ts (Google OAuth, JWT RS256, jose library)
    - `tasks/`: task.routes.ts (ts-rest handler for taskContract), task.service.ts, task.repository.ts (Drizzle queries), task.errors.ts
    - `resumes/`: resume.routes.ts, resume.service.ts (upload, parse with pdf-parse/mammoth), resume.repository.ts
    - `qa-bank/`: qa-bank.routes.ts, qa-bank.service.ts, qa-bank.repository.ts
    - `users/`: user.routes.ts, user.service.ts, user.repository.ts
    - `consent/`: consent.routes.ts, consent.service.ts
  - Each route handler accesses services via DI: `const { taskService } = request.diScope.cradle;`
  - Common middleware (`src/common/middleware/`):
    - `auth.ts`: JWT validation on all `/api/v1/*` except `/auth/*` and `/health`
    - `error-handler.ts`: Global error handler using AppError classes (see doc 16 Section 4)
    - `rate-limit.ts`: Per-user (100 req/min), per-platform (LinkedIn: 20 apps/day, 3-min gaps)
    - `request-logger.ts`: pino structured logging
  - WebSocket (`src/websocket/handler.ts`):
    - Connection: `wss://host/api/v1/ws?token={jwt}` -- validate JWT on connect
    - Subscribe to Redis Pub/Sub channel `tasks:{userId}`
    - Forward typed WSMessage (from `@valet/shared/types`) to clients
    - Heartbeat every 30s, auto-disconnect on 3 missed heartbeats
  - Health route: `GET /api/v1/health` -- Returns 200 + DB/Redis/Hatchet connectivity status
  - OpenAPI: `@fastify/swagger` + `@fastify/swagger-ui` at `GET /api/docs`
- `apps/worker/` (Hatchet workflow stubs):
  - `src/workflows/job-application.ts`:
    - Hatchet workflow with tasks: StartBrowser → AnalyzeForm → FillFields → UploadResume → CheckCAPTCHA → Submit → Verify
    - Use `ctx.waitForEvent('captcha_solved', { timeout: '30m' })` for durable CAPTCHA pause
    - Each task publishes progress via Redis Pub/Sub → WebSocket
    - **MOCK IMPLEMENTATIONS**: All browser actions return simulated success/failure
  - `src/workflows/resume-parse.ts`: Async resume parsing workflow
  - `src/services/event-logger.ts`: records every state transition to `task_events` table
- Tests: Route tests (all endpoints), auth tests (JWT, refresh, RLS), WebSocket test, workflow test (mock)

**Output:** `apps/api/`, `apps/worker/`

---

### Teammate 3: "frontend-engineer" -- React Dashboard (Feature-Based + ts-rest React Query)

**Sprint Tickets:** S0-01, S0-04, S0-07, S1-01, S1-04, S1-07, S1-08

**IMPORTANT: Follow the feature-based frontend architecture from doc 16 Section 5. Use React Query via ts-rest for ALL server state. Zustand for client UI state ONLY.**

**Deliverables:**

- `apps/web/`:
  - Fork/integrate shadcn-admin as base (sidebar, header, user menu, responsive layout)
  - API client setup (`src/lib/api-client.ts`) -- see doc 16 Section 3:
    ```typescript
    import { initQueryClient } from "@ts-rest/react-query";
    import { apiContract } from "@valet/contracts";
    export const api = initQueryClient(apiContract, {
      baseUrl: import.meta.env.VITE_API_URL,
      baseHeaders: {},
    });
    // Usage: api.tasks.list.useQuery(["tasks"], { query: { page: 1 } })
    ```
  - Design system integration (`src/styles/globals.css`):
    - Import Tailwind base/components/utilities
    - Define all `--wk-*` CSS custom properties from `wekruit-design-system.html` in `:root`
    - Dark mode: `[data-theme="dark"]` overrides
    - Import Google Fonts: Halant (display) + Geist (body)
  - `tailwind.config.ts`: Extend theme to map `--wk-*` tokens to Tailwind utilities
  - Feature-based pages (`src/features/`) -- see doc 16 Section 5:
    - `auth/`: login-page.tsx (Google OAuth button, WeKruit branding)
    - `onboarding/`: 3-step flow (resume upload → Q&A setup → mode selection)
    - `dashboard/`: stats-cards.tsx (Tremor), active-tasks.tsx, recent-applications.tsx
    - `apply/`: URL input → platform auto-detect → job preview → start button
    - `tasks/`: task-list.tsx, task-detail.tsx, task-progress.tsx, VNC viewer stub
    - `settings/`: profile, answers (Q&A bank manager), preferences
  - Zustand stores (`src/stores/`) -- CLIENT state only:
    - `ui.store.ts`: sidebar open, modals, theme toggle
    - `realtime.store.ts`: WebSocket connection state, notification queue
  - WebSocket client hook (`src/features/tasks/hooks/use-task-websocket.ts`):
    - Connect with JWT token, auto-reconnect with exponential backoff
    - Parse WSMessage types from `@valet/shared/types`
    - On incoming message → invalidate relevant React Query cache
  - Legal disclaimer modal: Copilot consent on first use, Autopilot consent with typed confirmation
  - noVNC viewer stub: react-vnc wrapper, placeholder in Sprint 0-1
- `packages/ui/`:
  - shadcn/ui components themed with WeKruit tokens:
    - Button (primary espresso, secondary outline, ghost, CTA amber)
    - Card, Input, Select, Dialog, Toast, Badge, Tabs
    - Export from `@valet/ui`
- Tests: Component tests (Vitest + Testing Library) for auth flow, onboarding, task list, apply page. Dark mode toggle test.

**Output:** `apps/web/`, `packages/ui/`

---

### Teammate 4: "automation-engineer" -- Browser Automation Interfaces + LLM Router

**Sprint Tickets:** S0-08, S0-09, S0-10, S1-09, S1-10

**Deliverables:**

- `packages/shared/src/types/automation.ts`:
  - TypeScript interfaces (NOT implementations) for the full automation core:
    - IAdsPowerClient: createProfile, startBrowser, stopBrowser, listActive, getProfileStatus
    - IBrowserAgent: navigate, fillField, clickElement, uploadFile, extractData, takeScreenshot, getCurrentUrl
    - IFormAnalyzer: analyzeForm, mapFields, generateAnswer, scoreConfidence
    - ICaptchaDetector: detect, classify
    - IProxyManager: getProxy, rotateIP, healthCheck, bindToProfile
    - IPlatformAdapter: platform, detectPlatform, getFormFlow, fillForm, submitApplication, verifySubmission
  - Verification types: OperationResult, StepVerification, FormVerification, ConfidenceScore
  - Stagehand-compatible types: ObserveResult, ActResult, ExtractResult (for future integration)
- Mock implementations (`apps/worker/src/adapters/`):
  - `linkedin.mock.ts`: Simulates 4-page Easy Apply flow
  - `greenhouse.mock.ts`: Simulates single-page form
  - Mock implementations for AdsPowerClient, BrowserAgent, FormAnalyzer, CaptchaDetector (10% random trigger), ProxyManager
- `packages/llm/`:
  - `src/router.ts`: 3-tier model routing
    - Rule-based classifier: task_type + complexity_score → model selection
    - Fallback chain: primary fails → secondary → budget → error
  - `src/providers/`: Anthropic, OpenAI adapter classes (unified interface)
  - `src/budget.ts`: Token budget enforcement (per-app + per-user daily cap, Redis-tracked)
  - `src/cache.ts`: Form analysis caching (Redis, 7-day TTL, SHA256 key)
  - `src/prompts/`: Prompt templates as TypeScript template literals
- Tests: Interface contract tests, mock adapter tests, LLM router routing tests, budget enforcement tests

**Output:** `packages/shared/src/types/automation.ts`, `apps/worker/src/adapters/`, `packages/llm/`

---

### Teammate 5: "quality-engineer" -- Testing, CI/CD, DevOps

**Sprint Tickets:** S0-12, parts of S0-13, S1-12

**IMPORTANT: Use the CI/CD pipeline from doc 15 Section 3 as the baseline. Adapt for local Docker Compose dev.**

**Deliverables:**

- Test infrastructure:
  - Root `vitest.config.ts`: Configured for monorepo
  - Coverage targets: 80% lines, 70% branches on changed files (CI gate)
  - `tests/fixtures/`: Factory functions (builder pattern): `UserFactory.create({ email: 'test@test.com' })`
  - `tests/mock-ats/`: Static HTML mock pages (LinkedIn Easy Apply, Greenhouse form)
  - `apps/api/tests/helpers/`: Authenticated test client, DB reset utilities
- CI/CD pipeline (`.github/workflows/ci.yml`) -- base on doc 15 Section 3:
  - Checkout + pnpm install (with Turborepo cache)
  - Lint (ESLint + Prettier check)
  - Type check (tsc --noEmit)
  - Unit tests (Vitest, all workspaces)
  - Build all apps
  - Security scan (npm audit, check for secrets in frontend bundle)
  - Target: < 10 minutes total
- DevOps scripts:
  - `scripts/setup-dev.sh`: One-command dev setup (pnpm install → docker up → migrate → seed)
  - `scripts/health-check.sh`: Verify PostgreSQL, Redis, Hatchet, MinIO are healthy
- Security tests:
  - Auth bypass (no JWT → 401, other user's task → 404)
  - Rate limiting (exceed 100 req/min → 429)
  - Input sanitization (SQL injection, XSS, path traversal)
  - Secrets in bundle check
  - SSRF (private IP in job URL → rejected)
- Dockerfiles (multi-stage builds):
  - `apps/api/Dockerfile`: Build → slim Node.js 20 runtime
  - `apps/worker/Dockerfile`: Build → Node.js 20 + browser deps
  - `apps/web/Dockerfile`: Build → Nginx serving static files
- Logging config: pino as default logger for all apps (JSON format, request IDs, user IDs)

**Output:** `tests/`, `.github/workflows/`, `scripts/`, Dockerfiles, pino config

---

### Teammate 6: "security-engineer" -- Security Hardening, Legal Compliance

**Sprint Tickets:** S0-13 (legal), S1-12 (Privacy/ToS), security hardening

**Deliverables:**

- Security headers and hardening:
  - `apps/api/src/plugins/security.ts`: @fastify/helmet with CSP, X-Frame-Options, HSTS, Referrer-Policy
  - CORS: whitelist frontend origin only
  - Cookie security: `httpOnly`, `secure`, `sameSite: strict` for refresh tokens
- Legal compliance documents:
  - `apps/web/src/content/legal/`: terms-of-service.md, privacy-policy.md, consent-text.ts
  - 5-layer progressive consent model (from doc 06)
  - Consent records stored in `consent_records` table with version, timestamp, IP
- Data retention configuration:
  - `packages/shared/src/constants/retention.ts`: SCREENSHOTS (30d), TASK_EVENTS (90d), COMPLETED_TASKS (365d), DELETED_ACCOUNT (30d)
  - `apps/api/src/modules/gdpr/`: GDPR deletion handler (soft delete, data export)
- Production readiness checklist (`docs/production-checklist.md`) -- aligned with doc 15 Section 5
- Security audit documentation (`docs/security-architecture.md`): OWASP Top 10 coverage, auth flow diagram, PII inventory
- Tests: Helmet header tests, CORS validation, consent flow tests, GDPR deletion test, cookie security test

**Output:** `apps/api/src/plugins/security.ts`, `apps/web/src/content/legal/`, `packages/shared/src/constants/retention.ts`, `apps/api/src/modules/gdpr/`, `docs/`

---

## DO NOT Rules (ALL teammates must follow)

1. **DO NOT implement Stagehand or Magnitude** in Sprint 0-1. Interfaces and mocks ONLY. No npm install of @browserbasehq/stagehand.
2. **DO NOT use Python or FastAPI.** Full TypeScript stack confirmed. If you see FastAPI/SQLAlchemy/pytest in older docs, IGNORE.
3. **DO NOT test against real job platforms** (LinkedIn, Greenhouse). All automation tests use mock ATS pages in `tests/mock-ats/`.
4. **DO NOT use BullMQ for workflow orchestration.** Hatchet is the primary orchestrator. BullMQ is secondary only (email, cleanup).
5. **DO NOT build an admin panel.** Use `drizzle-kit studio` for DB inspection during development.
6. **DO NOT commit secrets** (.env, API keys, JWT secrets). Only `.env.example` with placeholder values.
7. **DO NOT spend >8 hours on PDF parsing quality.** Use pdf-parse + mammoth as-is.
8. **DO NOT create files outside the monorepo structure** defined above. No `src/core/`, no `src/api/`, no flat `routes/` folder in `apps/api/`.
9. **DO NOT add Novu, AdminJS, or other Phase 2 dependencies** in Sprint 0-1.
10. **DO NOT use TypeBox** for validation. Zod is the single source of truth, consumed via ts-rest contracts.
11. **DO NOT put server state in Zustand.** React Query (via ts-rest) handles ALL server data. Zustand is for client UI state only.
12. **DO NOT create barrel index.ts files** in packages. Use subpath exports in package.json instead (except top-level package export).

---

## Naming Conventions (ALL teammates must follow)

| What             | Convention           | Example                              |
| ---------------- | -------------------- | ------------------------------------ |
| Files            | kebab-case           | `task-list.tsx`, `user.service.ts`   |
| Directories      | kebab-case           | `qa-bank/`, `mock-ats/`              |
| React components | PascalCase (in code) | `export function TaskList()`         |
| Functions        | camelCase            | `createTask()`, `useTaskWebSocket()` |
| Types/Interfaces | PascalCase           | `type CreateTaskRequest`             |
| Constants        | UPPER_SNAKE_CASE     | `MAX_UPLOAD_SIZE`, `TASK_STATUS`     |
| Zod schemas      | camelCase            | `createTaskRequest`, `taskListQuery` |
| DB columns       | snake_case           | `created_at`, `user_id`              |
| Package names    | @valet/kebab-case    | `@valet/shared`, `@valet/contracts`  |

---

## Coordination Rules

### Execution Order

1. **Teammate 1 starts first** (Day 1): Monorepo, DB schema, shared types, contracts, Docker Compose, .env.example
2. **Teammates 2, 3, 4 start after Teammate 1** delivers base structure (Day 1-2)
3. **Teammate 5 works in parallel** with everyone from Day 1
4. **Teammate 6 works in parallel** with everyone from Day 1

### Type Generation Order (prevents file conflicts)

1. Teammate 1: `packages/shared/src/schemas/` (Zod DTOs) + `src/types/ws.ts` + `src/constants/` + `packages/contracts/` (ts-rest)
2. Teammate 4: `packages/shared/src/types/automation.ts` (parallel, separate file)
3. Teammate 2: Consumes contracts from Teammate 1 in route handlers (no new type files)

### File Ownership (prevents merge conflicts)

| Directory                                                              | Owner          | Others may read, NOT write                                    |
| ---------------------------------------------------------------------- | -------------- | ------------------------------------------------------------- |
| `packages/contracts/`                                                  | Teammate 1     | All (Teammate 2 + 3 consume)                                  |
| `packages/shared/src/schemas/`, `types/ws.ts`, `constants/`, `errors/` | Teammate 1     | All                                                           |
| `packages/shared/src/types/automation.ts`                              | Teammate 4     | All                                                           |
| `packages/db/`                                                         | Teammate 1     | Teammate 2 (read)                                             |
| `packages/ui/`                                                         | Teammate 3     | All                                                           |
| `packages/llm/`                                                        | Teammate 4     | All                                                           |
| `apps/api/`                                                            | Teammate 2     | Teammate 5 (tests), Teammate 6 (security plugin, gdpr module) |
| `apps/web/`                                                            | Teammate 3     | Teammate 6 (legal content)                                    |
| `apps/worker/`                                                         | Teammate 2 + 4 | (coordinate on workflows vs adapters)                         |
| `tests/`, `.github/`, `scripts/`, Dockerfiles                          | Teammate 5     | All                                                           |
| `docs/`                                                                | Teammate 6     | All                                                           |

### Code Standards

- TypeScript strict mode, no `any` types
- ESLint flat config + Prettier (format on save)
- All exports typed, all functions documented with JSDoc for public APIs
- Vitest for all tests, `*.test.ts` / `*.test.tsx` naming
- Use `@valet/shared` and `@valet/contracts` types everywhere -- never duplicate type definitions
- Feature-based modules in both API and frontend (see doc 16 Sections 4-5)
- AppError classes for all error handling (see doc 16 Section 4)
- DI via @fastify/awilix for all services and repositories (see doc 16 Section 4)

### Communication

- If you need a type/schema from another teammate's package, MESSAGE them -- don't create it yourself
- If you discover a missing interface, add it to your deliverables list and notify the team lead
- If blocked, flag immediately -- don't wait

---

## After All Teammates Finish

Team lead creates `README.md` with:

- Project name and tagline (WeKruit Valet -- Verified Automation. Limitless Execution. Trust.)
- Quick start guide (one command: `./scripts/setup-dev.sh && pnpm dev`)
- Architecture overview diagram
- Package descriptions (what each package does, including `packages/contracts/`)
- API documentation link (`/api/docs`)
- Environment variables reference
- Development workflow (branch → PR → CI → merge)
- Design system notes (WeKruit tokens, fonts, dark mode)
- Deployment notes (see doc 15 for production deployment plan)

```

---

## Expected Deliverables per Teammate

| Teammate | Packages | Key Files | Est. Effort |
|----------|----------|-----------|-------------|
| 1. infra-engineer | `packages/contracts/`, `packages/shared/`, `packages/db/`, `docker/` | Contracts, schemas, types, Docker Compose, .env | 10-12 SP |
| 2. backend-engineer | `apps/api/`, `apps/worker/` | Feature modules, DI, ts-rest routes, Hatchet workflows, WS | 15-20 SP |
| 3. frontend-engineer | `apps/web/`, `packages/ui/` | Feature pages, ts-rest React Query, stores, components, design system | 15-20 SP |
| 4. automation-engineer | `packages/shared/src/types/automation.ts`, `apps/worker/src/adapters/`, `packages/llm/` | Interfaces, mocks, LLM router, budget | 10-12 SP |
| 5. quality-engineer | `tests/`, `.github/`, `scripts/`, Dockerfiles | CI/CD (from doc 15), test infra, security tests, logging | 8-10 SP |
| 6. security-engineer | `apps/api/src/plugins/`, `apps/api/src/modules/gdpr/`, `docs/`, legal content | Security headers, legal docs, GDPR, checklist | 6-8 SP |

## Tips
- Use `--dangerously-skip-permissions` for teammates to freely create files
- Monitor teammates: `Shift+Up/Down` to select, type to message
- Toggle task list: `Ctrl+T`
- Delegate mode (lead doesn't code): `Shift+Tab`
- Estimated tokens: ~600K-1.2M across all teammates
- Estimated time: 45-90 minutes
- If a teammate finishes early, they can help write tests for other packages
```
