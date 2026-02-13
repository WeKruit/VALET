# Claude Code Agent Team Prompt: WeKruit Valet

> **VALET** — **V**erified. **A**utonomous. **L**ightning. **E**ffortless. **T**rusted.
> *Verified Automation. Limitless Execution. Trust.*

## Prerequisites

1. Enable agent teams in Claude Code `settings.json`:
```json
{
  "env": {
    "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"
  }
}
```
2. Research docs ready in `research/` (11 files) and `product-research/` (13 files + design system HTML)

## Run Command
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

Every teammate MUST read their assigned docs before writing any code.

### Critical Docs (ALL teammates read these)
- `product-research/14_final_engineering_plan.md` -- Sprint tickets, execution plan, .env template (Section 8.2)
- `product-research/11_integration_architecture.md` -- THE architecture decision (full TypeScript, monorepo structure Section 8)
- `product-research/03_complete_prd.md` -- PRD: API spec (Section 5), data model (Section 6), features (Section 4)

### Role-Specific Docs
- **Infra**: `product-research/11_integration_architecture.md` Section 8 (monorepo), Section 9 (Docker)
- **Backend**: `research/09_task_orchestration_research.md`, `product-research/11_integration_architecture.md` Section 6 (API contract)
- **Frontend**: `product-research/12_frontend_implementation_plan.md`, `product-research/wekruit-design-system.html`, `product-research/05_autopilot_ux_onboarding.md`
- **Automation**: `product-research/10_stagehand_orchestration_research.md`, `research/07_browser_interaction_research.md`
- **Quality/DevOps**: `product-research/13_testing_strategy.md`
- **Security/Legal**: `product-research/06_autopilot_privacy_legal.md`, `research/10_safety_legal_architecture.md`

### Supporting Research (skim as needed)
- `research/00_executive_summary.md` -- Project overview and cost model
- `research/01_platform_analysis.md` -- Platform breakdown (LinkedIn, Greenhouse, Lever, Workday)
- `research/08_llm_model_comparison.md` -- Model benchmarks and routing strategy
- `product-research/07_opensource_frontend_backend_research.md` -- OSS to integrate (shadcn-admin, Tremor, Novu, react-vnc)
- `product-research/08_competitor_autopilot_ux_research.md` -- Competitor UX patterns

---

## Decided Tech Stack (Full TypeScript -- FINAL)

### Core
- **Monorepo**: Turborepo + pnpm workspaces
- **API**: Fastify 5.x + TypeBox validation + @fastify/swagger (OpenAPI auto-gen)
- **ORM**: Drizzle ORM + drizzle-kit migrations
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

### Frontend
- **Framework**: Vite + React 18 + TypeScript
- **Base**: shadcn-admin (pre-built dashboard shell with sidebar, header, user menu)
- **Design System**: WeKruit tokens (--wk-* CSS custom properties) bridged to Tailwind
- **Fonts**: Halant (serif, display headings) + Geist (sans-serif, body text) via Google Fonts
- **Charts**: Tremor
- **State**: Zustand + immer
- **Forms**: React Hook Form + Zod
- **Notifications**: Novu (self-hosted, deferred to Phase 2)

### LLM Strategy (3-tier routing via custom TypeScript router)
- Primary (complex): Claude Sonnet 4.5 ($3/$15) -- form analysis, answer generation, screenshots
- Secondary (routine): GPT-4.1 mini ($0.40/$1.60) -- field mapping, error recovery
- Budget (trivial): GPT-4.1 nano ($0.10/$0.40) -- confirmations, navigation
- Token budget: hard cap per application (configurable, default $0.10/app)
- Caching: form analysis results cached by URL+hash, 7-day TTL

### Infrastructure
- Proxy: IPRoyal residential (24h sticky sessions) -- interface only in Sprint 0-1
- Container: Docker Compose (dev), cloud TBD (prod)
- Monitoring: Hatchet UI (free) + Sentry (error tracking, Phase 2) + pino JSON logs
- Testing: Vitest (unit) + Playwright Test (e2e) + Testing Library (components)

---

## CRITICAL: Scope Boundaries for Sprint 0-1

### IN SCOPE (build these)
1. Turborepo monorepo with all packages wired up
2. Drizzle schema + migrations + seed data
3. Fastify API with all CRUD endpoints, JWT auth, WebSocket, rate limiting
4. Hatchet workflow stubs with durable event pattern (mock implementations)
5. React dashboard: auth, onboarding, apply page, task progress, settings
6. CI/CD pipeline (GitHub Actions), Docker Compose, dev scripts
7. Structured logging (pino), error handling middleware
8. Full test infrastructure: Vitest, Playwright config, mock ATS pages, fixtures

### OUT OF SCOPE (DO NOT build these in Sprint 0-1)
1. Stagehand / Magnitude browser automation integration -- interfaces and mocks ONLY
2. AdsPower CDP connection -- interface and mock ONLY
3. noVNC live session -- react-vnc component stub ONLY
4. IPRoyal proxy rotation -- interface and mock ONLY
5. Novu notification service -- defer to Phase 2
6. AdminJS or custom admin panel -- use Drizzle Studio for DB inspection
7. PDF parsing optimization -- use pdf-parse + mammoth as-is, flag if insufficient
8. Production deployment (K8s, Terraform, cloud provider) -- local Docker Compose only

---

## Monorepo Structure (MUST match this exactly)

This is the CANONICAL structure from Doc 11 Section 8. All teammates MUST use this.

```
wekruit-valet/
├── turbo.json
├── pnpm-workspace.yaml
├── package.json                    # Root: scripts, devDependencies
├── .env.example                    # All env vars documented
├── .gitignore
├── .github/
│   └── workflows/
│       ├── ci.yml                  # Lint → typecheck → test → build
│       └── preview.yml             # Preview deploy on PR
├── docker/
│   └── docker-compose.yml          # PostgreSQL, Redis, Hatchet, MinIO
├── packages/
│   ├── shared/                     # @valet/shared
│   │   └── src/
│   │       ├── schemas/            # Zod schemas (derived from Drizzle)
│   │       ├── types/              # TypeScript types
│   │       │   ├── api.ts          # Request/response types
│   │       │   ├── ws.ts           # WebSocket message types
│   │       │   └── automation.ts   # Browser automation interfaces
│   │       ├── constants/          # Enums, platform list, status codes
│   │       └── env.ts              # Zod-validated env loader
│   ├── db/                         # @valet/db
│   │   └── src/
│   │       ├── schema/             # Drizzle table definitions
│   │       ├── migrations/         # SQL migration files
│   │       ├── seed.ts             # Dev seed data
│   │       └── index.ts            # DB client export
│   ├── ui/                         # @valet/ui
│   │   └── src/
│   │       └── components/         # shadcn/ui components themed with WeKruit tokens
│   └── llm/                        # @valet/llm
│       └── src/
│           ├── router.ts           # 3-tier model router
│           ├── providers/          # Anthropic, OpenAI, Google adapters
│           ├── cache.ts            # Form analysis cache (Redis-backed)
│           └── budget.ts           # Token budget enforcement
├── apps/
│   ├── web/                        # React dashboard (Vite)
│   │   ├── src/
│   │   │   ├── components/
│   │   │   ├── pages/
│   │   │   ├── stores/             # Zustand stores
│   │   │   ├── hooks/
│   │   │   ├── lib/
│   │   │   └── styles/
│   │   │       └── globals.css     # WeKruit CSS tokens + Tailwind imports
│   │   ├── public/
│   │   ├── index.html
│   │   ├── vite.config.ts
│   │   └── tailwind.config.ts      # Extends with --wk-* tokens
│   ├── api/                        # Fastify backend
│   │   ├── src/
│   │   │   ├── routes/
│   │   │   ├── middleware/
│   │   │   │   ├── auth.ts         # JWT validation
│   │   │   │   ├── errorHandler.ts # Global error handler
│   │   │   │   ├── rateLimit.ts    # Per-user, per-platform limits
│   │   │   │   └── logger.ts       # pino request logging
│   │   │   ├── websocket/
│   │   │   │   └── handler.ts      # WS event dispatcher
│   │   │   ├── plugins/
│   │   │   │   └── swagger.ts      # @fastify/swagger OpenAPI
│   │   │   └── server.ts
│   │   └── tests/
│   │       └── helpers/
│   │           ├── client.ts       # Authenticated test client
│   │           └── db.ts           # DB reset utilities
│   └── worker/                     # Hatchet worker
│       ├── src/
│       │   ├── workflows/          # Hatchet workflow definitions
│       │   ├── adapters/           # Platform adapters (mock in Sprint 0-1)
│       │   │   ├── linkedin.mock.ts
│       │   │   ├── greenhouse.mock.ts
│       │   │   └── base.ts         # IPlatformAdapter interface
│       │   └── index.ts
│       └── tests/
├── tests/                          # Cross-cutting test infrastructure
│   ├── e2e/                        # Playwright E2E tests
│   ├── fixtures/                   # Shared test factories
│   │   ├── users.ts
│   │   ├── tasks.ts
│   │   └── resumes.ts
│   └── mock-ats/                   # Static HTML mock pages
│       ├── linkedin-easy-apply.html
│       └── greenhouse-form.html
├── scripts/
│   ├── setup-dev.sh                # One-command dev setup
│   └── health-check.sh             # Verify all services running
├── research/                       # 11 research files (read-only)
└── product-research/               # 13 product files + design system (read-only)
```

---

## Team Structure (6 Teammates)

### Teammate 1: "infra-engineer" -- Monorepo, Database, Shared Packages

**Sprint Tickets:** S0-02 (Drizzle schema), parts of S0-01 (monorepo setup)

**Deliverables:**
- Initialize Turborepo + pnpm workspaces with the EXACT structure above
- Root configs: `turbo.json`, `pnpm-workspace.yaml`, root `package.json`, root `tsconfig.json`
- ESLint flat config (`eslint.config.mjs`), Prettier config, shared TypeScript base config
- `packages/db/`:
  - Drizzle schema in `src/schema/*.ts`: users, tasks, task_events, browser_profiles, proxy_bindings, application_results, resumes, qa_bank_entries, consent_records
  - All tables include `userId` for RLS enforcement at query level
  - Generate initial migration via `drizzle-kit generate`
  - Seed script `src/seed.ts`: 2 test users (alice@test.com, bob@test.com), 5 tasks per user (various statuses), 1 resume per user, sample Q&A entries
  - Export DB client and typed query helpers from `src/index.ts`
  - Command: `pnpm --filter @valet/db db:seed`
- `packages/shared/`:
  - `src/schemas/`: Zod schemas derived from Drizzle tables (shared validation between API + frontend)
  - `src/types/api.ts`: Request/response TypeScript types for all API endpoints
  - `src/types/ws.ts`: WebSocket message types:
    ```typescript
    type WSMessage =
      | { type: 'state_change'; taskId: string; from: TaskStatus; to: TaskStatus; timestamp: string }
      | { type: 'progress'; taskId: string; step: string; pct: number; message: string }
      | { type: 'field_review'; taskId: string; fields: FieldReview[] }
      | { type: 'human_needed'; taskId: string; reason: string; vncUrl?: string }
      | { type: 'completed'; taskId: string; result: ApplicationResult }
      | { type: 'error'; taskId: string; code: string; message: string }
    ```
  - `src/constants/`: Enums (TaskStatus, Platform, ApplicationMode, LLMProvider), platform list, error codes
  - `src/env.ts`: Zod schema validating ALL environment variables at startup. Apps import and call `validateEnv()` on boot. Fail-fast if missing required vars.
- `docker/docker-compose.yml`:
  - PostgreSQL 16 (port 5432, persistent volume, health check)
  - Redis 7 (port 6379)
  - Hatchet Engine (`ghcr.io/hatchet-dev/hatchet/hatchet-lite:latest`, port 8888, uses same Postgres)
  - MinIO (port 9000/9001, buckets: resumes, screenshots, artifacts)
  - All services on shared Docker network `valet-network`
  - Volume mounts for data persistence
- `.env.example`: Document ALL required env vars (see Doc 14 Section 8.2):
  ```
  DATABASE_URL=postgresql://valet:valet@localhost:5432/valet
  REDIS_URL=redis://localhost:6379
  JWT_SECRET=<random-64-char-hex>
  JWT_REFRESH_SECRET=<random-64-char-hex>
  GOOGLE_CLIENT_ID=<from-google-console>
  GOOGLE_CLIENT_SECRET=<from-google-console>
  HATCHET_CLIENT_TOKEN=<from-hatchet-dashboard>
  ANTHROPIC_API_KEY=<your-key>
  OPENAI_API_KEY=<your-key>
  S3_ENDPOINT=http://localhost:9000
  S3_ACCESS_KEY=minioadmin
  S3_SECRET_KEY=minioadmin
  S3_REGION=us-east-1
  SENTRY_DSN=<optional>
  ```
- Tests: Schema validation tests, migration test, seed test, env validation test

**Output:** Root monorepo config, `packages/shared/`, `packages/db/`, `docker/`, `.env.example`

---

### Teammate 2: "backend-engineer" -- Fastify API, Hatchet Workflows, WebSocket

**Sprint Tickets:** S0-03, S0-05, S0-06, S0-11, S1-02, S1-03, S1-05, S1-06, S1-11

**Deliverables:**
- `apps/api/`:
  - Fastify 5.x application (`src/server.ts`):
    - Import and call `validateEnv()` from `@valet/shared` on startup
    - Register plugins: `@fastify/cors`, `@fastify/jwt`, `@fastify/swagger`, `@fastify/rate-limit`, `@fastify/websocket`
    - pino logger configured (JSON, request IDs, user IDs in context)
  - Auth routes (`src/routes/auth.ts`):
    - `POST /api/v1/auth/google` -- Exchange Google auth code for JWT + refresh token
    - `POST /api/v1/auth/refresh` -- Refresh expired JWT
    - JWT: RS256, 15min access, 7d refresh. jose library.
  - Task routes (`src/routes/tasks.ts`):
    - `POST /api/v1/tasks` -- Submit new application (URL + preferences) → triggers Hatchet workflow
    - `GET /api/v1/tasks/:id` -- Get task status + events (RLS: user can only see own tasks, return 404 not 403)
    - `GET /api/v1/tasks` -- List user's tasks with pagination (cursor-based)
    - `POST /api/v1/tasks/:id/captcha-solved` -- Signal CAPTCHA solved → Hatchet durable event
    - `DELETE /api/v1/tasks/:id` -- Cancel/kill task (< 2 second response, sends cancel to Hatchet)
    - `GET /api/v1/tasks/:id/events` -- Paginated audit trail
  - Resume routes (`src/routes/resumes.ts`):
    - `POST /api/v1/resumes/upload` -- Multipart upload (max 10MB), store in MinIO, parse with pdf-parse/mammoth
    - `GET /api/v1/resumes/:id` -- Get parsed resume data
  - Q&A Bank routes (`src/routes/qa-bank.ts`):
    - Full CRUD: `GET/POST/PUT/DELETE /api/v1/qa-bank`
    - Bulk import endpoint
  - User routes (`src/routes/users.ts`):
    - `GET /api/v1/users/me` -- Get profile
    - `PUT /api/v1/users/me` -- Update profile + preferences
    - `GET /api/v1/users/me/stats` -- Application stats (total, success rate, by platform)
  - Consent routes (`src/routes/consent.ts`):
    - `POST /api/v1/consent` -- Record consent (Copilot, Autopilot activation, per-session)
    - `GET /api/v1/consent/status` -- Check current consent state
  - Health route:
    - `GET /api/v1/health` -- Returns 200 + DB/Redis/Hatchet connectivity status
  - Middleware:
    - `src/middleware/auth.ts`: JWT validation on all `/api/v1/*` except `/auth/*` and `/health`
    - `src/middleware/errorHandler.ts`: Global error handler → `{ error: { code: "ERROR_CODE", message: "...", details?: {} } }`. HTTP codes: 400/401/403/404/429/500.
    - `src/middleware/rateLimit.ts`: Per-user (100 req/min), per-platform rate limiting (LinkedIn: 20 apps/day, 3-min gaps)
    - `src/middleware/logger.ts`: pino request logging (method, path, user, status, latency)
  - WebSocket (`src/websocket/handler.ts`):
    - Connection: `wss://host/api/v1/ws?token={jwt}` -- validate JWT on connect
    - Subscribe to Redis Pub/Sub channel `tasks:{userId}`
    - Forward WSMessage types (from `@valet/shared/types/ws.ts`) to connected clients
    - Heartbeat every 30s, auto-disconnect on 3 missed heartbeats
  - OpenAPI: `@fastify/swagger` + `@fastify/swagger-ui` at `GET /api/docs`
- `apps/worker/` (Hatchet workflow stubs):
  - `src/workflows/jobApplication.ts`:
    - Hatchet workflow with tasks: StartBrowser → AnalyzeForm → FillFields → UploadResume → CheckCAPTCHA → Submit → Verify
    - Use `ctx.waitForEvent('captcha_solved', { timeout: '30m' })` for durable CAPTCHA pause
    - Use `ctx.log()` for structured step logging
    - Each task publishes progress via Redis Pub/Sub → WebSocket
    - **MOCK IMPLEMENTATIONS**: All browser actions return simulated success/failure. No real browser interaction.
  - `src/workflows/resumeParse.ts`: Async resume parsing workflow (pdf-parse + mammoth)
  - Event logging service: `src/services/eventLogger.ts` -- records every state transition, field fill, LLM decision to `task_events` table
- Tests: Route tests (all endpoints), auth tests (JWT validation, refresh, RLS), WebSocket connection test, Hatchet workflow test (mock)

**Output:** `apps/api/`, `apps/worker/`

---

### Teammate 3: "frontend-engineer" -- React Dashboard

**Sprint Tickets:** S0-01, S0-04, S0-07, S1-01, S1-04, S1-07, S1-08

**Deliverables:**
- `apps/web/`:
  - Fork/integrate shadcn-admin as base (sidebar, header, user menu, responsive layout)
  - Design system integration (`src/styles/globals.css`):
    - Import Tailwind base/components/utilities
    - Define all `--wk-*` CSS custom properties from `wekruit-design-system.html` in `:root`
    - Dark mode: `[data-theme="dark"]` overrides
    - Import Google Fonts: Halant (display) + Geist (body)
  - `tailwind.config.ts`: Extend theme to map `--wk-*` tokens to Tailwind utilities:
    ```
    bg-wk-surface-page, text-wk-text-primary, text-wk-accent-amber, etc.
    font-display (Halant), font-body (Geist)
    ```
  - Pages:
    - `/auth/login` -- Google OAuth login button, WeKruit branding
    - `/onboarding` -- 3-step flow: (1) Resume upload + parse preview, (2) Q&A bank quick setup, (3) Mode selection (Copilot default, Autopilot locked with "3 apps to unlock" badge)
    - `/dashboard` -- Main view: active tasks list, recent applications, stats cards (Tremor), Copilot/Autopilot mode indicator
    - `/apply` -- URL input → platform auto-detect (show platform icon) → job preview → start application button
    - `/tasks/:id` -- Task detail: vertical step timeline, per-field confidence scores, screenshots, noVNC viewer stub (react-vnc placeholder), kill switch button
    - `/history` -- Application list with filters (status, platform, date range), search, pagination
    - `/settings/profile` -- User profile editor
    - `/settings/answers` -- Q&A bank manager (RJSF-powered dynamic forms)
    - `/settings/preferences` -- Notification prefs, daily limits, mode settings, takeover timeout
  - Zustand stores (src/stores/):
    - `authStore.ts`: user, token, isLoggedIn, login(), logout(), refreshToken()
    - `taskStore.ts`: tasks[], currentTask, updateTaskStatus(id, status), addTaskEvent(id, event)
    - `themeStore.ts`: isDark, toggle()
    - `onboardingStore.ts`: step, resumeData, qaEntries, selectedMode
  - WebSocket client hook (`src/hooks/useTaskWebSocket.ts`):
    - Connect with JWT token, auto-reconnect with exponential backoff
    - Parse WSMessage types from `@valet/shared/types/ws.ts`
    - Dispatch to taskStore on incoming messages
  - Legal disclaimer modal (S0-07): Copilot consent on first use, Autopilot consent with typed confirmation
  - noVNC viewer stub: `src/components/VncViewerModal.tsx` -- react-vnc wrapper, displays when task needs human intervention. Stub shows placeholder in Sprint 0-1.
- `packages/ui/`:
  - Extract and customize shadcn/ui components with WeKruit tokens:
    - Button (primary espresso, secondary outline, ghost, CTA amber)
    - Card, Input, Select, Dialog, Toast, Badge, Tabs
    - Export from `@valet/ui` for reuse across apps
- Tests: Component tests (Vitest + Testing Library) for auth flow, onboarding steps, task list, apply page. Dark mode toggle test.

**Output:** `apps/web/`, `packages/ui/`

---

### Teammate 4: "automation-engineer" -- Browser Automation Interfaces + LLM Router

**Sprint Tickets:** S0-08, S0-09, S0-10, S1-09, S1-10

**Deliverables:**
- `packages/shared/src/types/automation.ts`:
  - TypeScript interfaces (NOT implementations) for the full automation core:
    ```typescript
    interface IAdsPowerClient {
      createProfile(config: ProfileConfig): Promise<string>  // returns profileId
      startBrowser(profileId: string): Promise<{ cdpUrl: string; debugPort: number }>
      stopBrowser(profileId: string): Promise<void>
      listActive(): Promise<ActiveProfile[]>
      getProfileStatus(profileId: string): Promise<ProfileStatus>
    }

    interface IBrowserAgent {
      navigate(url: string): Promise<void>
      fillField(selector: string, value: string): Promise<FieldResult>
      clickElement(selector: string): Promise<void>
      uploadFile(selector: string, filePath: string): Promise<void>
      extractData(instruction: string, schema: ZodSchema): Promise<unknown>
      takeScreenshot(): Promise<Buffer>
      getCurrentUrl(): Promise<string>
    }

    interface IFormAnalyzer {
      analyzeForm(pageContext: PageContext): Promise<FormAnalysis>
      mapFields(analysis: FormAnalysis, userData: UserData): Promise<FieldMapping[]>
      generateAnswer(question: string, context: AnswerContext): Promise<GeneratedAnswer>
      scoreConfidence(mapping: FieldMapping): number
    }

    interface ICaptchaDetector {
      detect(page: PageContext): Promise<CaptchaResult | null>
      classify(result: CaptchaResult): CaptchaType  // recaptcha_v2, v3, hcaptcha, turnstile
    }

    interface IProxyManager {
      getProxy(profileId: string): Promise<ProxyConfig>
      rotateIP(profileId: string): Promise<ProxyConfig>
      healthCheck(proxy: ProxyConfig): Promise<boolean>
      bindToProfile(proxy: ProxyConfig, profileId: string): Promise<void>
    }

    interface IPlatformAdapter {
      platform: Platform
      detectPlatform(url: string): boolean
      getFormFlow(url: string): Promise<FormFlow>
      fillForm(agent: IBrowserAgent, flow: FormFlow, data: UserData): Promise<FormResult>
      submitApplication(agent: IBrowserAgent): Promise<SubmissionResult>
      verifySubmission(agent: IBrowserAgent): Promise<VerificationResult>
    }
    ```
  - Verification types: OperationResult, StepVerification, FormVerification, ConfidenceScore
  - Stagehand-compatible types: ObserveResult, ActResult, ExtractResult (for future integration)
- Mock implementations (`packages/shared/src/automation/mocks/`):
  - `MockAdsPowerClient`: Returns fake CDP URLs, simulates profile lifecycle
  - `MockBrowserAgent`: Returns preset responses for navigate/fill/click/extract
  - `MockFormAnalyzer`: Returns hardcoded form analysis for LinkedIn Easy Apply
  - `MockCaptchaDetector`: Randomly triggers CAPTCHA 10% of the time
  - `MockProxyManager`: Returns static proxy config
  - `MockLinkedInAdapter`: Simulates 4-page Easy Apply flow (contact info → resume → screening Qs → review)
  - `MockGreenhouseAdapter`: Simulates single-page form
- `packages/llm/`:
  - `src/router.ts`: 3-tier model routing
    - Rule-based classifier: task_type + complexity_score → model selection
    - Complex tasks (form analysis, answer generation, screenshots) → Claude Sonnet 4.5
    - Routine tasks (field mapping, error classification) → GPT-4.1 mini
    - Trivial tasks (confirmations, navigation checks) → GPT-4.1 nano
    - Fallback chain: primary fails → secondary → budget → error
  - `src/providers/`: Anthropic, OpenAI, Google adapter classes (unified interface)
  - `src/budget.ts`: Token budget enforcement
    - Hard cap per application (configurable, default $0.10)
    - Per-user daily cap (configurable)
    - Track usage in Redis (key: `llm:usage:{userId}:{date}`)
    - When budget exceeded: degrade to cheaper model, then reject with clear error
  - `src/cache.ts`: Form analysis caching
    - Cache key: `form:{sha256(url + formStructureHash)}`
    - Store in Redis with 7-day TTL
    - Cache invalidation on analysis failure (selector self-healing)
  - `src/prompts/`: Prompt templates stored as TypeScript template literals
    - `formAnalysis.ts`, `fieldMapping.ts`, `answerGeneration.ts`, `captchaClassification.ts`
    - Version tracked in git (prompt changes = PRs with review)
- Tests: Interface contract tests, mock adapter behavior tests, LLM router routing tests, budget enforcement tests, cache hit/miss tests

**Output:** `packages/shared/src/types/automation.ts`, `packages/shared/src/automation/mocks/`, `packages/llm/`

---

### Teammate 5: "quality-engineer" -- Testing, CI/CD, DevOps, Security

**Sprint Tickets:** S0-12, S0-13 (security parts), parts of S1-12

**Deliverables:**
- Test infrastructure:
  - Root `vitest.config.ts`: Configured for monorepo, test file pattern `**/*.test.{ts,tsx}`
  - Per-package vitest configs where needed
  - Coverage targets: 80% lines, 70% branches on changed files (CI gate)
  - `tests/fixtures/`: Factory functions for User, Task, Resume, Application, QAEntry
    - Builder pattern: `UserFactory.create({ email: 'test@test.com' })`
  - `tests/mock-ats/`: Static HTML mock pages
    - `linkedin-easy-apply.html`: Multi-page modal with contact, resume, screening question fields
    - `greenhouse-form.html`: Single-page application form
    - Include realistic CSS/JS to simulate DOM structure
  - `apps/api/tests/helpers/`:
    - `client.ts`: Authenticated test client (injects JWT, configures base URL)
    - `db.ts`: DB reset utilities (truncate between tests, apply seed)
- CI/CD pipeline (`.github/workflows/`):
  - `ci.yml` (runs on push to any branch + PR to main):
    - Step 1: Checkout + pnpm install (with Turborepo cache)
    - Step 2: Lint (ESLint + Prettier check) -- BLOCKS on failure
    - Step 3: Type check (tsc --noEmit) -- BLOCKS on failure
    - Step 4: Unit tests (Vitest, all workspaces) -- BLOCKS on failure
    - Step 5: Build all apps (vite build, tsc)
    - Step 6: Security scan (npm audit, check for secrets in bundle via grep)
    - Target: < 10 minutes total
    - GitHub Secrets required (document in workflow comments):
      ```
      DATABASE_URL (test DB), JWT_SECRET, TURBO_TOKEN (optional), TURBO_TEAM (optional)
      ```
  - `preview.yml` (runs on PR):
    - Deploy to ephemeral preview environment (Vercel/Netlify for frontend)
    - Comment PR with preview URL
  - NO production deployment workflow yet (Phase 2)
- DevOps scripts:
  - `scripts/setup-dev.sh`:
    ```bash
    # One-command dev setup
    pnpm install
    docker compose -f docker/docker-compose.yml up -d
    pnpm --filter @valet/db db:migrate
    pnpm --filter @valet/db db:seed
    echo "Ready! Run: pnpm dev"
    ```
  - `scripts/health-check.sh`: Verify PostgreSQL, Redis, Hatchet, MinIO are healthy
- Security tests:
  - Auth bypass: access task without JWT → 401, access other user's task → 404
  - Rate limiting: exceed 100 req/min → 429
  - Input sanitization: SQL injection in URL field → rejected, XSS in Q&A answer → sanitized, path traversal in resume upload → blocked
  - Secrets in bundle: `grep` for API keys in `apps/web/dist/` → 0 matches
  - SSRF: private IP in job URL → rejected (169.254.x.x, 10.x.x.x, 127.x.x.x)
- Dockerfiles (multi-stage builds):
  - `apps/api/Dockerfile`: Build → slim Node.js 20 runtime
  - `apps/worker/Dockerfile`: Build → Node.js 20 + Playwright deps (for future browser automation)
  - `apps/web/Dockerfile`: Build → Nginx serving static files
- Logging setup:
  - Configure pino as default logger for all apps
  - Log format: JSON with `timestamp`, `level`, `service`, `requestId`, `userId`, `message`
  - Log levels: DEBUG (dev), INFO (staging), WARN (prod default)
  - All apps log to stdout (Docker captures, future: ship to log aggregator)

**Output:** `tests/`, `.github/workflows/`, `scripts/`, Dockerfiles, pino config

---

### Teammate 6: "security-engineer" -- Security Hardening, Legal Compliance, Production Readiness

**Sprint Tickets:** S0-13 (legal research), S1-12 (Privacy/ToS), security hardening

**Deliverables:**
- Security headers and hardening:
  - Fastify plugin (`apps/api/src/plugins/security.ts`):
    - `@fastify/helmet` with CSP configuration
    - `X-Frame-Options: DENY`
    - `X-Content-Type-Options: nosniff`
    - `Strict-Transport-Security` (HSTS) header
    - `Referrer-Policy: strict-origin-when-cross-origin`
  - CORS configuration: whitelist frontend origin only
  - Cookie security: `httpOnly`, `secure`, `sameSite: strict` for refresh tokens
- Legal compliance documents:
  - `apps/web/src/content/legal/`:
    - `terms-of-service.md` -- Draft ToS covering: user-initiated automation, account responsibility, rate limits, data handling
    - `privacy-policy.md` -- Draft Privacy Policy: data collected, LLM provider data sharing, retention periods, GDPR rights
    - `consent-text.ts` -- Typed consent strings for Copilot activation, Autopilot activation (typed confirmation), per-session auth
  - Consent schema and flow:
    - 5-layer progressive consent model (from Doc 06):
      1. Account creation consent
      2. Copilot mode consent (first use)
      3. Autopilot activation consent (typed "I AGREE TO AUTOPILOT" confirmation)
      4. Per-session authentication
      5. Sensitive field handling consent
    - Consent records stored in `consent_records` table with version, timestamp, IP
- Data retention configuration:
  - Document retention policy in code (`packages/shared/src/constants/retention.ts`):
    ```typescript
    export const RETENTION = {
      SCREENSHOTS: 30,      // days
      TASK_EVENTS: 90,      // days
      COMPLETED_TASKS: 365, // days
      DELETED_ACCOUNT: 30,  // days before hard delete
    }
    ```
  - GDPR deletion handler: `apps/api/src/routes/gdpr.ts`
    - `DELETE /api/v1/users/me` -- Soft delete (anonymize PII, retain aggregated stats)
    - `GET /api/v1/users/me/export` -- Data export (JSON, all user data)
    - Cleanup job (future cron): purge expired screenshots, task events, soft-deleted accounts
- Production readiness checklist (`docs/production-checklist.md`):
  - [ ] Cloud provider selected (AWS/GCP/Azure -- DECISION NEEDED)
  - [ ] DNS + domain configured
  - [ ] SSL/TLS certificates (Let's Encrypt or cloud ACM)
  - [ ] Database backups automated (daily, 30-day retention)
  - [ ] Secrets in vault (AWS Secrets Manager or similar -- Phase 2)
  - [ ] Sentry DSN configured
  - [ ] Rate limiting tuned for production traffic
  - [ ] Feature flags ready (kill switch per platform)
  - [ ] DPA signed with Anthropic + OpenAI (for GDPR processor compliance)
  - [ ] Legal counsel review of ToS + Privacy Policy
- Security audit documentation (`docs/security-architecture.md`):
  - OWASP Top 10 coverage map (what's addressed, what's deferred)
  - Authentication flow diagram (Google OAuth → JWT → refresh cycle)
  - Data encryption summary (TLS in transit, AES-256 at rest via S3 SSE)
  - PII inventory: what PII we store, where, how long, who accesses
  - Incident response template (Phase 2: full runbook)
- Tests: Helmet header verification, CORS validation, consent flow tests, GDPR deletion test, cookie security test

**Output:** `apps/api/src/plugins/security.ts`, `apps/web/src/content/legal/`, `packages/shared/src/constants/retention.ts`, `apps/api/src/routes/gdpr.ts`, `docs/`

---

## DO NOT Rules (ALL teammates must follow)

1. **DO NOT implement Stagehand or Magnitude** in Sprint 0-1. Interfaces and mocks ONLY. No npm install of @browserbasehq/stagehand.
2. **DO NOT use Python or FastAPI.** Full TypeScript stack confirmed. If you see FastAPI/SQLAlchemy/pytest in older docs (03, 09, 10), IGNORE -- see Doc 11 for TypeScript equivalents.
3. **DO NOT test against real job platforms** (LinkedIn, Greenhouse, etc.). All automation tests use mock ATS pages in `tests/mock-ats/`. Legal risk + flaky CI.
4. **DO NOT use BullMQ for workflow orchestration.** Hatchet is the primary orchestrator. BullMQ is secondary only (email, cleanup jobs).
5. **DO NOT build an admin panel.** Use `pnpm --filter @valet/db drizzle-kit studio` for DB inspection during development.
6. **DO NOT commit secrets** (.env, API keys, JWT secrets). Only `.env.example` with placeholder values.
7. **DO NOT spend >8 hours on PDF parsing quality.** Use pdf-parse + mammoth as-is. If insufficient, flag it -- Python microservice escape hatch planned for Phase 2.
8. **DO NOT create files outside the monorepo structure** defined above. No `src/core/`, no `src/api/`, no top-level `packages/@valet/` (use `packages/shared/`, `packages/db/`, etc.).
9. **DO NOT add Novu, AdminJS, or other Phase 2 dependencies** in Sprint 0-1.
10. **DO NOT generate random image URLs or placeholder images.** Use text placeholders or SVG icons only.

---

## Coordination Rules

### Execution Order
1. **Teammate 1 starts first** (Day 1): Monorepo, DB schema, shared types, Docker Compose, .env.example
2. **Teammates 2, 3, 4 start after Teammate 1** delivers base structure (Day 1-2)
3. **Teammate 5 works in parallel** with everyone from Day 1
4. **Teammate 6 works in parallel** with everyone from Day 1

### Type Generation Order (prevents file conflicts)
1. Teammate 1: `packages/shared/src/schemas/` (Zod from Drizzle) + `src/types/ws.ts` + `src/constants/`
2. Teammate 4: `packages/shared/src/types/automation.ts` (parallel, separate file)
3. Teammate 2: `packages/shared/src/types/api.ts` (after seeing 1 + 4's types)

### Database Schema Workflow
1. Teammate 1 owns `packages/db/` -- ALL schema changes go through Teammate 1
2. Teammate 2 NEVER edits schema directly -- request changes from Teammate 1
3. Migration workflow: edit schema → `drizzle-kit generate` → commit schema + migration

### File Ownership (prevents merge conflicts)
| Directory | Owner | Others may read, NOT write |
|-----------|-------|--------------------------|
| `packages/shared/src/schemas/`, `types/ws.ts`, `constants/` | Teammate 1 | All |
| `packages/shared/src/types/automation.ts`, `automation/mocks/` | Teammate 4 | All |
| `packages/shared/src/types/api.ts` | Teammate 2 | All |
| `packages/db/` | Teammate 1 | Teammate 2 (read) |
| `packages/ui/` | Teammate 3 | All |
| `packages/llm/` | Teammate 4 | All |
| `apps/api/` | Teammate 2 | Teammate 5 (tests), Teammate 6 (security plugin) |
| `apps/web/` | Teammate 3 | Teammate 6 (legal content) |
| `apps/worker/` | Teammate 2 + 4 | (coordinate on workflows vs adapters) |
| `tests/`, `.github/`, `scripts/`, Dockerfiles | Teammate 5 | All |
| `docs/` | Teammate 6 | All |

### Code Standards
- TypeScript strict mode, no `any` types
- ESLint flat config + Prettier (format on save)
- All exports typed, all functions documented with JSDoc for public APIs
- Vitest for all tests, `*.test.ts` / `*.test.tsx` naming
- Use `@valet/shared` types everywhere -- never duplicate type definitions

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
- Package descriptions (what each package does)
- API documentation link (`/api/docs`)
- Environment variables reference
- Development workflow (branch → PR → CI → merge)
- Design system notes (WeKruit tokens, fonts, dark mode)
```

---

## Expected Deliverables per Teammate

| Teammate | Packages | Key Files | Est. Effort |
|----------|----------|-----------|-------------|
| 1. infra-engineer | `packages/shared/`, `packages/db/`, `docker/` | Schema, types, Docker Compose, .env | 8-10 SP |
| 2. backend-engineer | `apps/api/`, `apps/worker/` | Routes, middleware, Hatchet workflows, WS | 15-20 SP |
| 3. frontend-engineer | `apps/web/`, `packages/ui/` | Pages, stores, components, design system | 15-20 SP |
| 4. automation-engineer | `packages/shared/src/automation/`, `packages/llm/` | Interfaces, mocks, LLM router, budget | 10-12 SP |
| 5. quality-engineer | `tests/`, `.github/`, `scripts/`, Dockerfiles | CI/CD, test infra, security tests, logging | 8-10 SP |
| 6. security-engineer | `apps/api/src/plugins/`, `docs/`, legal content | Security headers, legal docs, GDPR, checklist | 6-8 SP |

## Tips
- Use `--dangerously-skip-permissions` for teammates to freely create files
- Monitor teammates: `Shift+Up/Down` to select, type to message
- Toggle task list: `Ctrl+T`
- Delegate mode (lead doesn't code): `Shift+Tab`
- Estimated tokens: ~600K-1.2M across all teammates
- Estimated time: 45-90 minutes
- If a teammate finishes early, they can help write tests for other packages
