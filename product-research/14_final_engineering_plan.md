# WeKruit Valet -- Final Consolidated Engineering Plan

> **VALET** — **V**erified. **A**utonomous. **L**ightning. **E**ffortless. **T**rusted.

**Version:** 2.2
**Date:** 2026-02-12
**Status:** FINAL -- Ready for Sprint Execution
**Owner:** Technical PM
**Audience:** All engineering, legal, and design contributors
**Supersedes:** All previous scattered planning. This is the single source of truth.

> **Architecture Decision Record:** Full TypeScript stack confirmed 2026-02-11. See `11_integration_architecture.md` for detailed rationale. This document supersedes all Python/FastAPI references in earlier documents.

---

## 1. Project Overview

### What We Are Building

WeKruit Valet is a dual-mode AI job application system. Users paste a job URL; the system navigates to the posting, fills forms using LLM-powered analysis, answers screening questions from a Q&A bank, uploads documents, and submits -- all inside an anti-detect browser (AdsPower) with residential proxies (IPRoyal).

**Copilot Mode** (default): AI fills, user reviews every field and approves every submission.
**Autopilot Mode** (earned after 3 successful Copilot runs): AI fills AND submits within user-defined parameters, subject to 9 mandatory quality gates.

The MVP targets LinkedIn Easy Apply. Greenhouse, Lever, and Workday follow in later phases.

### Important Scope Note for This Plan

The scraping/automation CORE (Stagehand, Magnitude, AdsPower CDP integration, LinkedIn form filling) is **deferred from immediate implementation**. We design clean interfaces and mock contracts but do not implement Stagehand or Magnitude integration in Sprint 0-1. Stagehand will be used for viewing progress and lightweight browser interactions. The focus of the first 5 weeks is:

1. Frontend dashboard (shadcn-admin + WeKruit design system)
2. Backend API (Fastify + PostgreSQL + Drizzle ORM + Hatchet orchestration setup)
3. Orchestration scaffolding with Hatchet TypeScript SDK (hello world, workflow stubs)
4. Testing infrastructure and CI/CD
5. Integration interfaces (typed contracts for Core track to plug into later)

### Final Tech Stack (No Ambiguity)

| Layer | Technology | Notes |
|-------|-----------|-------|
| **Language** | TypeScript (end-to-end) | Single language eliminates type duplication, enables shared packages |
| **Runtime** | Node.js 20+ | All backend services run on Node.js |
| **Monorepo** | Turborepo + pnpm workspaces | Fast builds, workspace dependencies, pipeline caching |
| **Frontend Framework** | React 18 + TypeScript + Vite | Forked from shadcn-admin |
| **UI Components** | shadcn/ui + Radix UI | Copy-paste model, full ownership |
| **Charts/Analytics** | Tremor | Drop-in, Tailwind-native |
| **Styling** | Tailwind CSS 3 | WeKruit design tokens (espresso theme, Halant + Geist fonts, warm earthy tones) |
| **Server State** | React Query (via ts-rest `initQueryClient`) | All server data; see doc 16 Section 5 |
| **Client State** | Zustand | UI-only: sidebar, modals, theme toggle |
| **Forms** | React Hook Form + Zod + react-jsonschema-form | Q&A bank rendered from JSON Schema |
| **Toasts** | Sonner | Transient UI notifications |
| **Notifications** | Novu (self-hosted) + @novu/react | Multi-channel: in-app, email, push |
| **noVNC Viewer** | react-vnc | CAPTCHA handling UI |
| **Backend Framework** | Fastify 5.x | Built-in JSON Schema validation; WebSocket support; plugin architecture |
| **API Contracts** | ts-rest | End-to-end type-safe contracts between Fastify + React; see doc 16 Section 3 |
| **Validation** | Zod (single source of truth) | Runtime validation + type inference; consumed by ts-rest contracts |
| **DI Framework** | @fastify/awilix | Service + repository injection; see doc 16 Section 4 |
| **ORM** | Drizzle ORM | TypeScript-native; SQL-like query builder; schema-as-code; push/pull migrations via drizzle-kit |
| **Database** | PostgreSQL 16 | Shared with Hatchet; JSONB for flexible data |
| **Cache/Pub-Sub** | Redis 7+ | WebSocket relay, BullMQ queues, rate limiting, Stagehand selector cache |
| **Orchestration** | Hatchet (self-hosted, TypeScript SDK) | Durable workflows, pause/resume, built-in dashboard |
| **Secondary Queue** | BullMQ | Lightweight background jobs (email, screenshot cleanup, cache warming) |
| **DB Inspection** | Drizzle Studio | `drizzle-kit studio` for dev; no admin panel in Sprint 0-1 |
| **Auth** | Google OAuth 2.0 + JWT (RS256) | httpOnly cookies |
| **Object Storage** | MinIO (dev) / S3 (prod) | Encrypted resume storage |
| **LLM Router** | Custom TypeScript router (Anthropic SDK + OpenAI SDK) | Claude Sonnet 4.5 / GPT-4.1 mini / GPT-4.1 nano |
| **Anti-Detect Browser** | AdsPower (Local API) | CDP WebSocket for automation |
| **Proxy** | IPRoyal residential (sticky sessions) | Per-profile binding |
| **Browser Automation** | Stagehand (primary) + Magnitude (fallback) | DEFERRED -- interfaces only in Sprint 0-1 |
| **Resume Parsing** | pdf-parse + mammoth | Python microservice fallback if quality insufficient (benchmark in Week 2) |
| **Email Templates** | React Email | Transactional + digest emails |
| **Billing** | Stripe + use-stripe-subscription | Phase 5+ |
| **CI/CD** | GitHub Actions | Lint (ESLint + Prettier), type-check (tsc), test (Vitest) on PR; deploy on merge |
| **Linting** | ESLint + @typescript-eslint + Prettier | Unified across all workspaces |
| **Type Checking** | tsc (strict mode) | Built-in TypeScript compiler |
| **Unit Testing** | Vitest | Fast, Vite-native test runner |
| **E2E Testing** | Playwright Test | Phase 3+ |
| **Monitoring** | Better Stack (uptime) + Sentry (errors) + Grafana Cloud (logs) | See doc 15 for full SRE plan |
| **Deployment (prod)** | Hetzner VPS + Coolify + Cloudflare | See doc 15 for cost breakdown + CI/CD |
| **Containerization** | Docker Compose (dev) | Infrastructure services only; apps run on host via `pnpm dev` |

### Team Composition

| Role | Person | Tracks Owned | Sprint 0-1 Focus |
|------|--------|-------------|------------------|
| **Full-Stack Lead** | TBD | Frontend + Backend | shadcn-admin fork, WeKruit design system, OAuth, APIs |
| **Backend Engineer** | TBD | Backend + Infrastructure | Fastify scaffold, Hatchet TS SDK setup, Drizzle schema, Docker Compose, CI |
| **Core Engineer** | TBD | Core + Infrastructure | AdsPower client, LLM router, automation interfaces (stubs), proxy manager |
| **Frontend Engineer** | TBD | Frontend | Apply page, WebSocket progress, Q&A bank (RJSF), onboarding flow |
| **Legal Counsel** | Outsourced (part-time) | Legal/Compliance | ToS draft, privacy policy, disclaimer text, counsel engagement |

### Timeline Summary

| Phase | Weeks | Goal | Key Milestone |
|-------|-------|------|---------------|
| **Phase 0: Foundation** | 1-2 | Full stack running locally, hello-world workflows | M1: "Hello World" |
| **Phase 1: Copilot MVP Core** | 3-5 | Paste URL, watch AI fill, review, approve | M2/M3: "First Apply" / "Core Loop" |
| **Phase 2: Dashboard + HITL** | 6-8 | Full Copilot dashboard, CAPTCHA handling, notifications | M4: "Full UX" |
| **Phase 3: QA + Copilot Beta** | 9-10 | Security audit, 50+ test runs, 10 beta users | M5: "Copilot Beta" |
| **Phase 4: Autopilot Foundation** | 11-14 | Trust gate, quality gates, consent, circuit breaker | M6: "Autopilot Engine" |
| **Phase 5: Autopilot Polish + Beta** | 15-18 | 25 users, threshold slider, Greenhouse + Lever | M7: "Autopilot Beta" |
| **Phase 6: Scale** | 19-26 | Workday, bulk mode, enterprise, cover letters | M8: "Scale Launch" |

---

## 2. File and Document Index

### All Research and Planning Documents

| # | File | Status | Purpose | Reading Priority |
|---|------|--------|---------|------------------|
| 01 | `01_competitor_ux_analysis.md` | REFERENCE | Competitor landscape analysis (Simplify, LazyApply, Sonara, etc.) | 5 (background) |
| 02 | `02_user_flows_and_ux_design.md` | PARTIALLY SUPERSEDED | Original UX flows. Onboarding revised by doc 05. Core apply flow still valid. | 4 (skim, defer to 05 for onboarding) |
| 03 | `03_complete_prd.md` | ACTIVE (Section 1.1 superseded) | Feature specs (Sections 4-5), API spec (Section 5), data model (Section 6). Section 1.1 product vision replaced by doc 09 Section 0. | 2 (read Sections 3-6 for feature detail) |
| -- | `04_product_roadmap.md` | SUPERSEDED | Original Copilot-only roadmap. Fully replaced by doc 09. | DO NOT READ |
| 05 | `05_autopilot_ux_onboarding.md` | ACTIVE | Revised onboarding (3-step, 90-second), mode selection UX, Autopilot dashboard, trust escalation, notification strategy | 3 (read for UX specifications) |
| 06 | `06_autopilot_privacy_legal.md` | ACTIVE | UETA analysis, CFAA analysis, 5-layer consent architecture, GDPR Article 22, waiver/disclaimer requirements | 3 (read for legal requirements feeding into tickets) |
| 07 | `07_opensource_frontend_backend_research.md` | ACTIVE | OSS evaluation: shadcn-admin, Tremor, AdminJS, Novu, react-vnc, RJSF, Sonner | 4 (reference when implementing OSS integrations) |
| 08 | `08_competitor_autopilot_ux_research.md` | REFERENCE | Competitor Autopilot UX teardowns | 5 (background) |
| 09 | `09_updated_product_roadmap.md` | ACTIVE -- PRIMARY | Master roadmap v2.0. All phases, all tickets, dependency graph, risk register, team sizing. This is the sprint-level plan. | 1 (READ FIRST) |
| 10 | `10_stagehand_orchestration_research.md` | ACTIVE | Stagehand capabilities, Magnitude fallback, orchestration options, verification strategy | 4 (reference for Core track) |
| 11 | `11_integration_architecture.md` | ACTIVE -- ARCHITECTURE | Full TypeScript stack decision, component architecture, inter-component communication, data flows, monorepo structure | 1 (READ FOR ARCHITECTURE) |
| -- | `wekruit-design-system.html` | ACTIVE | WeKruit visual design system: espresso theme, color tokens, typography (Halant + Geist), component styles | 3 (reference for all frontend work) |
| 14 | `14_final_engineering_plan.md` | **THIS DOCUMENT** | Consolidated engineering plan. Single source of truth for sprint execution. | 0 (READ BEFORE ANYTHING) |
| 15 | `15_deployment_sre_plan.md` | ACTIVE | Hetzner + Coolify deployment, CI/CD pipeline (GitHub Actions YAML), SRE runbook, cost breakdown, production checklist | 2 (READ FOR DEPLOYMENT + CI/CD) |
| 16 | `16_code_architecture_guide.md` | ACTIVE -- **HIGHEST AUTHORITY** | Monorepo structure, DTOs (Zod), ts-rest contracts, feature-based modules, DI (@fastify/awilix), error handling, naming conventions. **Overrides older architecture patterns in docs 11/14.** | 0 (READ FOR ALL CODE PATTERNS) |
| 17 | `17_agent_team_prompt.md` | ACTIVE | Claude Code agent team prompt. Self-contained instructions for 6-teammate swarm. References all other docs. | 0 (USE TO LAUNCH AGENT TEAM) |

### Reading Order for a New Engineer Joining the Team

1. **This document** (`14_final_engineering_plan.md`) -- full context in one place
2. `16_code_architecture_guide.md` -- **HIGHEST authority for code patterns**: monorepo, DTOs, ts-rest, modules, DI, naming
3. `15_deployment_sre_plan.md` -- deployment stack, CI/CD pipeline, SRE runbook, cost model
4. `11_integration_architecture.md` -- TypeScript stack decision rationale, Hatchet choice
5. `09_updated_product_roadmap.md` -- detailed ticket specs for your assigned phase
6. `03_complete_prd.md` Sections 3-6 -- feature specs, API spec, data model
7. `05_autopilot_ux_onboarding.md` -- if working on frontend/UX
8. `06_autopilot_privacy_legal.md` -- if working on consent, audit trail, or legal features
9. `07_opensource_frontend_backend_research.md` -- if integrating any OSS library
10. `10_stagehand_orchestration_research.md` -- if working on Core track automation
11. `wekruit-design-system.html` -- if working on any frontend component
12. `01_competitor_ux_analysis.md` and `08_competitor_autopilot_ux_research.md` -- for product context

**For Agent Team:** Use `17_agent_team_prompt.md` -- self-contained prompt for 6-teammate Claude Code swarm.

---

## 3. Sprint Plan (Phase 0 + Phase 1 -- First 5 Weeks)

### Sprint 0: Foundation (Weeks 1-2)

**Sprint Goal:** Every engineer can run the full stack locally. Dashboard shell loads. Auth works. Hatchet runs a hello-world workflow. Core automation interfaces are stubbed. Legal counsel is engaged.

**Total Story Points:** 33 SP

---

#### Ticket S0-01: Fork shadcn-admin and Configure with WeKruit Design System

| Field | Value |
|-------|-------|
| **Title** | Fork shadcn-admin and apply WeKruit design system |
| **Description** | Fork satnaing/shadcn-admin as the dashboard foundation. Remove demo content. Apply WeKruit espresso-themed design tokens (Halant headings, Geist body, warm earthy tones per `wekruit-design-system.html`). Configure React Router with `/login`, `/dashboard`, `/apply`, `/settings`, `/onboarding/*`. Set up React Query via ts-rest client for server data (user profile, task list). Set up Zustand for client UI state only (sidebar, modals, theme). Mount Sonner `<Toaster />`. |
| **Acceptance Criteria** | (1) `localhost:5173` renders dashboard shell with WeKruit branding. (2) Demo content removed. (3) Routes configured: `/login`, `/dashboard`, `/apply`, `/settings`, `/onboarding/*`. (4) Zustand store initialized with 3 slices. (5) Tailwind configured with WeKruit tokens (Copilot blue `#1E40AF`, Autopilot purple `#7C3AED`, espresso palette). (6) Halant font for headings, Geist for body text. (7) Dark/light mode toggle works. (8) Sidebar collapses on mobile (<768px). (9) Protected route wrapper redirects to `/login`. |
| **Points** | 3 |
| **Dependencies** | None |
| **Track** | Frontend |
| **Assignee** | Full-Stack Lead |

---

#### Ticket S0-02: PostgreSQL Schema and Drizzle Migrations

| Field | Value |
|-------|-------|
| **Title** | Database schema with Drizzle ORM models and drizzle-kit migrations |
| **Description** | Set up PostgreSQL with Drizzle ORM schema definitions in `packages/db`. Create initial schema: `users`, `resumes`, `tasks`, `task_events`, `application_results`, `browser_profiles`, `proxy_bindings`, `screening_answers`, `consent_records`, `audit_trail`. Configure drizzle-kit for migration generation and push. |
| **Acceptance Criteria** | (1) `pnpm --filter @wekruit/db db:migrate` creates all tables cleanly. (2) All tables have proper indexes (`user_id+status` on tasks, etc.). (3) `task_status` ENUM includes Autopilot states: `AUTOPILOT_QUEUED`, `AUTOPILOT_EXECUTING`, `AUTOPILOT_SUBMITTED`, `QUALITY_GATE_BLOCKED`. (4) `consent_records` tracks versions, types, timestamps per user. (5) `audit_trail` has JSONB data field. (6) Seed script (`pnpm --filter @wekruit/db db:seed`) creates 2 test users, 5 sample tasks. (7) Drizzle schema defined in `packages/db/src/schema/` with one file per table. |
| **Points** | 5 |
| **Dependencies** | None |
| **Track** | Backend |
| **Assignee** | Backend Engineer |

---

#### Ticket S0-03: Fastify Project Structure and Google OAuth

| Field | Value |
|-------|-------|
| **Title** | Fastify scaffold with project structure and Google OAuth 2.0 |
| **Description** | Scaffold Fastify application in `apps/api/` with plugin architecture (routes, services, middleware, plugins directories). Implement Google OAuth 2.0 login. Set up CORS for dashboard origin. Health check endpoint. Integrate Drizzle ORM via Fastify plugin. |
| **Acceptance Criteria** | (1) Fastify starts on port 8000. (2) `POST /api/v1/auth/google` accepts authorization code, returns JWT + user profile. (3) `GET /api/v1/auth/me` returns current user from JWT. (4) JWT middleware protects all `/api/v1/*` except auth. (5) CORS configured for `http://localhost:5173`. (6) `GET /api/v1/health` returns 200. (7) Drizzle client injected via Fastify plugin (`fastify.db`). (8) Zod used for request/response validation. |
| **Points** | 5 |
| **Dependencies** | S0-02 |
| **Track** | Backend |
| **Assignee** | Backend Engineer |

---

#### Ticket S0-04: Gmail OAuth Login Page (Frontend)

| Field | Value |
|-------|-------|
| **Title** | Login page with "Sign in with Google" using shadcn-admin auth template |
| **Description** | Build login page with Google OAuth button. Implement OAuth 2.0 flow with PKCE. Handle success redirect to `/dashboard` and error states. |
| **Acceptance Criteria** | (1) "Sign in with Google" button on `/login` (styled per WeKruit design system). (2) Clicking triggers Google OAuth consent screen. (3) Success redirects to `/dashboard` with user profile loaded in Zustand. (4) JWT stored securely (httpOnly cookie). (5) Logout clears session and redirects to `/login`. |
| **Points** | 2 |
| **Dependencies** | S0-01, S0-03 |
| **Track** | Frontend |
| **Assignee** | Full-Stack Lead |

---

#### Ticket S0-05: Hatchet Setup and Hello World Workflow

| Field | Value |
|-------|-------|
| **Title** | Install Hatchet, configure TypeScript SDK, run hello-world durable workflow |
| **Description** | Spin up Hatchet (Docker). Configure Hatchet TypeScript SDK in `apps/worker/`. Create a 3-step hello-world workflow that demonstrates state transitions and durable event waits using `worker.registerWorkflow()`. Verify it appears in Hatchet dashboard. |
| **Acceptance Criteria** | (1) Hatchet engine running with web UI accessible at `localhost:8888`. (2) TypeScript worker connects and registers test workflow. (3) Workflow completes 3 steps with transitions visible in Hatchet UI. (4) Hatchet shares the PostgreSQL instance with the app. (5) Worker uses `@hatchet-dev/typescript-sdk`. |
| **Points** | 3 |
| **Dependencies** | S0-02 |
| **Track** | Backend |
| **Assignee** | Backend Engineer |

---

#### Ticket S0-06: Consent Records API

| Field | Value |
|-------|-------|
| **Title** | Build consent tracking API for Layer 1-2 consent |
| **Description** | Build consent recording API using Fastify routes + Drizzle ORM. Records user consent with version, type, timestamp, and IP. Supports account registration and Copilot disclaimer consent. Autopilot consent (Layers 3-5) added in Phase 4. Request validation with Zod schemas. |
| **Acceptance Criteria** | (1) `POST /api/v1/consent` records acceptance: `{type, version, ip_address, user_agent}`. (2) `GET /api/v1/consent` returns all records for current user. (3) `GET /api/v1/consent/check?type=copilot_disclaimer&version=1.0` returns boolean. (4) Types: `tos_acceptance`, `privacy_policy`, `copilot_disclaimer`, `autopilot_consent` (future). (5) Records are immutable (append-only). |
| **Points** | 3 |
| **Dependencies** | S0-02, S0-03 |
| **Track** | Backend |
| **Assignee** | Backend Engineer |

---

#### Ticket S0-07: Copilot Legal Disclaimer Modal

| Field | Value |
|-------|-------|
| **Title** | Build legal disclaimer modal for first-time Copilot use (Layer 2 consent) |
| **Description** | Modal shown before first use of any automation feature. Acknowledges platform ToS violation risk and account restriction risk. Uses versioned acceptance stored via S0-06 API. |
| **Acceptance Criteria** | (1) Modal appears on first automation attempt. (2) Content includes: platform ToS risk, account restriction risk, WeKruit liability limitations. (3) Active checkbox (not pre-checked). (4) Consent version stored with timestamp. (5) Re-appears if disclaimer version changes. (6) "Cancel" returns to dashboard; "Accept" unlocks Copilot. (7) Keyboard-navigable and screen-reader compatible. |
| **Points** | 3 |
| **Dependencies** | S0-01, S0-06 |
| **Track** | Frontend |
| **Assignee** | Frontend Engineer |

---

#### Ticket S0-08: AdsPower Client Library (Stub with Interface)

| Field | Value |
|-------|-------|
| **Title** | Build async TypeScript client for AdsPower Local API |
| **Description** | Build `AdsPowerManager` class in `apps/worker/src/browser/` with profile management, browser lifecycle, proxy binding. Even though full browser automation is deferred, this client is needed for session management and noVNC provisioning. Uses `fetch` API for HTTP calls. |
| **Acceptance Criteria** | (1) `AdsPowerManager` with async methods: `launchProfile()`, `stopProfile()`, `checkActive()`, `updateProxy()`. (2) `launchProfile()` returns CDP WebSocket URL + connected Playwright BrowserContext + Page. (3) Retry logic with exponential backoff (max 3). (4) Custom error types: `AdsPowerConnectionError`, `ProfileNotFoundError`, `BrowserStartError`. (5) Integration test: create -> start -> verify CDP URL -> stop. |
| **Points** | 3 |
| **Dependencies** | None |
| **Track** | Core |
| **Assignee** | Core Engineer |

---

#### Ticket S0-09: LLM Router Setup

| Field | Value |
|-------|-------|
| **Title** | Set up custom LLM Router with 3-tier model routing |
| **Description** | Build `LLMRouter` class in `packages/llm/` using Anthropic TypeScript SDK and OpenAI TypeScript SDK directly. Route by task type: Claude Sonnet 4.5 (premium), GPT-4.1 mini (mid), GPT-4.1 nano (budget). Automatic fallback on 5xx errors. Token usage logging per request. |
| **Acceptance Criteria** | (1) `LLMRouter.complete(request)` routes to correct model based on `taskType`. (2) Routing: `form_analysis` -> Sonnet 4.5, `field_mapping` -> GPT-4.1 mini, `confirmation` -> GPT-4.1 nano. (3) Fallback on 5xx. (4) Token usage logged per request (model, input_tokens, output_tokens, cost_usd). (5) Shared as `@wekruit/llm` workspace package. |
| **Points** | 3 |
| **Dependencies** | None |
| **Track** | Core |
| **Assignee** | Core Engineer |

---

#### Ticket S0-10: Proxy Manager with IP Verification

| Field | Value |
|-------|-------|
| **Title** | Build proxy management module with IPRoyal residential proxy |
| **Description** | `ProxyManager` in `apps/worker/src/browser/` for proxy credentials, sticky sessions, and IP verification. Binds residential proxies to AdsPower profiles. |
| **Acceptance Criteria** | (1) `assignProxy(profileId, country="US")` binds proxy to AdsPower profile. (2) `verifyProxy()` confirms IP matches expected proxy IP. (3) Sticky sessions maintain same IP for 10+ minutes. |
| **Points** | 2 |
| **Dependencies** | S0-08 |
| **Track** | Core |
| **Assignee** | Core Engineer |

---

#### Ticket S0-11: Docker Compose Development Environment

| Field | Value |
|-------|-------|
| **Title** | Create Docker Compose for infrastructure services |
| **Description** | `docker/docker-compose.yml` for: PostgreSQL 16, Redis 7, Hatchet, MinIO, Novu (self-hosted). Apps (api, worker, web) run on host via `pnpm dev` for hot-reload. Volume mounts for data persistence. |
| **Acceptance Criteria** | (1) `docker compose -f docker/docker-compose.yml up -d` starts all infrastructure services. (2) PostgreSQL data persists via named volume. (3) Hatchet dashboard accessible at `localhost:8888`. (4) Novu self-hosted running and accessible at `localhost:3003`. (5) MinIO accessible at `localhost:9000` (API) and `localhost:9001` (console). (6) All apps connect to Docker services via localhost ports. (7) `docker compose down -v` cleanly tears down. |
| **Points** | 3 |
| **Dependencies** | S0-02, S0-05 |
| **Track** | Infrastructure |
| **Assignee** | Backend Engineer |

---

#### Ticket S0-12: CI/CD Pipeline Setup (GitHub Actions)

| Field | Value |
|-------|-------|
| **Title** | Set up GitHub Actions CI pipeline |
| **Description** | GitHub Actions for: lint (ESLint + Prettier via `pnpm lint`), type-check (tsc via `pnpm typecheck`), unit tests (Vitest via `pnpm test`) on PR. Staging deploy on merge to main. Uses Turborepo for efficient pipeline caching. |
| **Acceptance Criteria** | (1) Workflow runs on every PR: lint, typecheck, test across all workspaces. (2) Staging deploy on merge to main. (3) Build artifacts cached via Turborepo remote cache. (4) Pipeline runs in < 5 minutes. (5) pnpm store cached in GitHub Actions. |
| **Points** | 2 |
| **Dependencies** | None |
| **Track** | Infrastructure |
| **Assignee** | Backend Engineer |

---

#### Ticket S0-13: Legal Research and Disclaimer Drafting

| Field | Value |
|-------|-------|
| **Title** | Draft Copilot legal disclaimer, initial ToS, Privacy Policy; engage outside counsel |
| **Description** | Research UETA, CFAA, platform ToS implications for Copilot mode. Draft initial ToS and Privacy Policy. Identify and engage outside counsel. |
| **Acceptance Criteria** | (1) Copilot disclaimer text drafted (Layer 2). (2) Initial ToS drafted for Copilot. (3) Initial Privacy Policy drafted. (4) Outside counsel identified and engagement letter signed. (5) UETA analysis documented. (6) LinkedIn ToS risk assessment completed. |
| **Points** | 3 |
| **Dependencies** | None |
| **Track** | Legal/Compliance |
| **Assignee** | Legal Counsel |

---

### Sprint 0: Definition of Done

- [ ] Every engineer can start infrastructure with `docker compose up` and apps with `pnpm dev`
- [ ] Dashboard loads at `localhost:5173` with WeKruit espresso theme and Google OAuth working
- [ ] Hatchet hello-world workflow completes 3 steps (TypeScript SDK)
- [ ] shadcn-admin forked, branded with Halant + Geist fonts, and rendering
- [ ] Drizzle schema defined, migrations run, seed data loaded
- [ ] Novu self-hosted instance running
- [ ] CI pipeline running on PRs (ESLint + tsc + Vitest)
- [ ] AdsPower client can create/start/stop browser profiles
- [ ] LLM Router routes to correct model tier (shared `@wekruit/llm` package)
- [ ] Copilot legal disclaimer drafted
- [ ] Outside legal counsel engaged

---

### Sprint 1: Copilot MVP Core (Weeks 3-4)

**Sprint Goal:** A user can upload a resume, paste a LinkedIn Easy Apply URL, watch real-time progress via WebSocket, and see the Q&A bank prompt after first application. Core automation interfaces are defined (actual LinkedIn form filling may use mocked responses for demo).

**Total Story Points:** ~48 SP (first 2 weeks of Phase 1's 68 SP)

---

#### Ticket S1-01: Resume Upload and 3-Step Onboarding Page

| Field | Value |
|-------|-------|
| **Title** | Build 3-step onboarding: Google sign-in, resume upload (drag-and-drop), quick review |
| **Description** | Revised onboarding per doc 05: 3 progress dots (not 5). Drag-and-drop PDF/DOCX upload (max 10MB). Quick Review shows ONLY name, email, phone, location, collapsed experience, skills. "Edit details" defers to Settings. Single CTA: "Looks Good -- Let's Go". Target: 80-90 seconds to dashboard. |
| **Acceptance Criteria** | (1) 3 progress dots: Sign Up -> Resume -> Quick Review. (2) Drag-and-drop accepts PDF/DOCX up to 10MB. (3) Speed promise: "You'll be applying to your first job in about 2 minutes". (4) Quick Review shows ONLY essential fields (not Q&A bank). (5) "Edit details" link defers to Settings. (6) CTA: "Looks Good -- Let's Go". (7) Onboarding time tracked (< 90s target). |
| **Points** | 5 |
| **Dependencies** | S0-01, S1-02 |
| **Track** | Frontend |
| **Assignee** | Frontend Engineer |

---

#### Ticket S1-02: Resume Upload + LLM Parsing API

| Field | Value |
|-------|-------|
| **Title** | Backend resume upload, LLM-powered parsing, and CRUD endpoints |
| **Description** | Multipart upload endpoint via Fastify. PDF extraction (pdf-parse) and DOCX extraction (mammoth) as preprocessing. LLM extracts structured fields plus inferred screening answers (years of experience, education level) with "resume-inferred" source tag. File stored in S3 (MinIO). Zod schemas for request/response validation. |
| **Acceptance Criteria** | (1) `POST /api/v1/resumes/upload` accepts multipart PDF/DOCX up to 10MB. (2) Returns 202 with `resume_id`, processes async via Hatchet workflow. (3) LLM extracts standard fields + inferred screening answers. (4) `GET/PUT /api/v1/resumes/{id}` for retrieval and corrections. (5) Raw file stored encrypted (SSE-S3) in MinIO. |
| **Points** | 5 |
| **Dependencies** | S0-02, S0-03, S0-09 |
| **Track** | Backend |
| **Assignee** | Backend Engineer |

---

#### Ticket S1-03: Screening Question Bank API (JSON Schema)

| Field | Value |
|-------|-------|
| **Title** | CRUD endpoints for screening questions stored as JSON Schema |
| **Description** | Questions stored as JSON Schema for RJSF rendering on frontend. Supports organic growth: new questions auto-added when encountered in applications. Fastify routes with Zod validation. Drizzle ORM queries. |
| **Acceptance Criteria** | (1) `GET /api/v1/questions` returns JSON Schema for dynamic form rendering. (2) `POST /api/v1/answers` saves answers with `{question_id, answer, always_use, source}`. (3) Source enum: `user_input`, `resume_inferred`, `application_learned`. (4) `POST /api/v1/questions/discover` auto-adds new questions. (5) Questions categorized: Work Authorization, Experience, Preferences, Logistics. |
| **Points** | 3 |
| **Dependencies** | S0-02, S0-03 |
| **Track** | Backend |
| **Assignee** | Backend Engineer |

---

#### Ticket S1-04: Apply Page (URL Input + Job Preview + First-Time State)

| Field | Value |
|-------|-------|
| **Title** | Build /apply page with URL input, platform detection, job preview card |
| **Description** | First-time state per doc 05 ("Ready to apply to your first job!"). URL input with paste detection and validation. Platform detection badge (LinkedIn icon + "Easy Apply"). Job preview card. Copilot mode indicator (steering wheel icon). Sample job links for cold-start. |
| **Acceptance Criteria** | (1) First-time state with sparkle icon and sample job links. (2) URL paste detection and validation. (3) Platform badge on valid URL. (4) Job preview: title, company, location, posted date. (5) Copilot indicator: steering wheel + "you review everything before submit". (6) "Start Application" disabled until URL valid + resume saved. (7) Clicking "Start" creates task via API and transitions to progress view. |
| **Points** | 5 |
| **Dependencies** | S0-01, S1-05 |
| **Track** | Frontend |
| **Assignee** | Frontend Engineer |

---

#### Ticket S1-05: Task Creation + Job Application Workflow (Hatchet)

| Field | Value |
|-------|-------|
| **Title** | Task creation endpoint and Hatchet JobApplicationWorkflow with Copilot pause-before-submit |
| **Description** | `POST /api/v1/tasks` creates a task and triggers a Hatchet workflow via the TypeScript SDK (`hatchet.admin.runWorkflow()`). Workflow steps registered via `worker.registerWorkflow()`: StartBrowser -> Navigate -> AnalyzePage -> FillForm -> PauseForReview -> Submit -> VerifySubmission -> Cleanup. In Sprint 1, the Core automation steps (Navigate, Analyze, Fill) use stub implementations that return mock data. The workflow structure and state machine are real. PauseForReview uses `ctx.waitForEvent('review:approved')` for durable pause. |
| **Acceptance Criteria** | (1) `POST /api/v1/tasks` with `{job_url, resume_id, mode: "copilot"}` returns `{task_id, status: "CREATED"}`. (2) Hatchet workflow transitions through all steps (stubs OK for automation steps). (3) PauseForReview sends field data via WebSocket, waits for Hatchet durable event. (4) Each step updates task status in DB (via Drizzle) and publishes WebSocket event (via Redis pub/sub). (5) `GET /api/v1/tasks/{id}` and `GET /api/v1/tasks` for retrieval. |
| **Points** | 8 |
| **Dependencies** | S0-02, S0-03, S0-05 |
| **Track** | Backend |
| **Assignee** | Backend Engineer |

---

#### Ticket S1-06: WebSocket Server for Real-Time Updates

| Field | Value |
|-------|-------|
| **Title** | WebSocket endpoint with Redis Pub/Sub for task progress streaming |
| **Description** | Build WebSocket handler as Fastify plugin at `wss://api/ws`. JWT auth on handshake via query parameter (`?token={jwt}`). Redis Pub/Sub relay from Hatchet workers to WebSocket server. Message types: `state_change`, `progress`, `human_needed`, `field_review`, `completed`, `error`. Uses `@fastify/websocket` plugin. |
| **Acceptance Criteria** | (1) WebSocket at `wss://api/v1/ws?token={jwt}` with JWT auth. (2) Messages: `state_change`, `progress`, `human_needed`, `field_review` (Copilot), `completed`, `error`. (3) `field_review` includes field values with confidence scores. (4) Heartbeat ping/pong every 30s. (5) Client subscribes/unsubscribes per taskId. |
| **Points** | 5 |
| **Dependencies** | S0-03, S0-11 (Redis) |
| **Track** | Backend |
| **Assignee** | Backend Engineer |

---

#### Ticket S1-07: WebSocket Client Hook + Real-Time Progress Component

| Field | Value |
|-------|-------|
| **Title** | Build `useTaskWebSocket` hook and live progress component |
| **Description** | React hook for WebSocket connection with auto-reconnect. Vertical step timeline (Queued -> Starting -> Navigating -> Analyzing -> Filling -> Submitting -> Verifying -> Done). Progress bar, elapsed time, connection status indicator. |
| **Acceptance Criteria** | (1) `useTaskWebSocket(taskId)` connects to WS endpoint. (2) Auto-reconnect with exponential backoff (1s, 2s, 4s, max 30s). (3) Connection indicator: green/yellow/red. (4) Vertical timeline with step descriptions. (5) Progress bar (0-100%) + elapsed time. (6) On completion: success card with confirmation screenshot thumbnail. |
| **Points** | 5 |
| **Dependencies** | S0-01, S1-06 |
| **Track** | Frontend |
| **Assignee** | Frontend Engineer |

---

#### Ticket S1-08: Screening Q&A Bank UI (RJSF-Powered)

| Field | Value |
|-------|-------|
| **Title** | Q&A bank using react-jsonschema-form, post-first-app prompt |
| **Description** | Dynamic Q&A form rendered from JSON Schema via RJSF. Presented as post-first-app prompt (NOT during onboarding). Pre-filled from resume parsing and first application data. Each answer has "Always use" vs "Ask each time" toggle. Accessible via `/settings/answers`. |
| **Acceptance Criteria** | (1) RJSF renders questions from JSON Schema fetched from API. (2) Post-first-app prompt: "Save time on your next application". (3) Pre-filled answers from resume parsing (medium confidence) and first app (high confidence). (4) Each answer has toggle. (5) Accessible at `/settings/answers`. (6) "Save All" and "Skip" buttons. |
| **Points** | 4 |
| **Dependencies** | S0-01, S1-03 |
| **Track** | Frontend |
| **Assignee** | Frontend Engineer |

---

#### Ticket S1-09: Resume Parser (LLM-Powered Core Module)

| Field | Value |
|-------|-------|
| **Title** | Resume parsing with pdf-parse + mammoth + LLM structured extraction |
| **Description** | `parseResume(fileBuffer, fileType): Promise<ResumeData>` in `apps/worker/` returns structured data. Uses pdf-parse for PDF text extraction and mammoth for DOCX text extraction. LLM (via `@wekruit/llm` router) extracts structured fields. Also extracts inferred screening answers during parsing. This is the Core track implementation that the backend API (S1-02) invokes via Hatchet workflow. |
| **Acceptance Criteria** | (1) Returns structured `ResumeData` (typed in `packages/shared`). (2) Also returns `inferredAnswers[]` with `{question, answer, confidence, source: "resume-inferred"}`. (3) Processing time < 15 seconds for a typical 2-page resume. (4) Quality benchmark: test against 10 sample resumes; if pdf-parse quality is insufficient, flag for Python microservice fallback. |
| **Points** | 5 |
| **Dependencies** | S0-09 |
| **Track** | Core |
| **Assignee** | Core Engineer |

---

#### Ticket S1-10: Core Automation Interface Contracts (Stubs)

| Field | Value |
|-------|-------|
| **Title** | Define typed TypeScript interfaces for form analysis, form filling, and platform adapters |
| **Description** | Since Stagehand/Magnitude integration is deferred, define the typed TypeScript interfaces in `packages/shared/src/types/automation.ts` that the Hatchet workflow step handlers call. Implement stub/mock versions in `apps/worker/` that return realistic fake data with simulated delays. This allows frontend and backend to develop against real contracts. Interfaces: `PlatformAdapter`, `BrowserAction`, `ActionResult`, `FormFieldMapping`. |
| **Acceptance Criteria** | (1) `PlatformAdapter` interface with methods: `detect()`, `getFormStructure()`, `getSubmitFlow()`. (2) `LinkedInEasyApplyAdapter` stub returns mock field data and simulated delays. (3) `AgentOrchestrator` stub with 3-layer fallback interface (Stagehand -> Magnitude -> human). (4) All interfaces fully typed with JSDoc documentation. (5) Hatchet workflow (S1-05) can execute end-to-end using stubs. (6) Types exported from `@wekruit/shared` package for cross-workspace consumption. |
| **Points** | 5 |
| **Dependencies** | S0-08 |
| **Track** | Core |
| **Assignee** | Core Engineer |

---

#### Ticket S1-11: Task Event Logging and Audit Trail Service

| Field | Value |
|-------|-------|
| **Title** | Event logging service for Copilot audit and future GDPR compliance |
| **Description** | Records every state transition, field fill, LLM decision with explainability data. Implemented as a Fastify service using Drizzle ORM. |
| **Acceptance Criteria** | (1) `TaskEventService.log(taskId, eventType, data)` inserts into `task_events` via Drizzle. (2) Events: `state_change`, `field_filled` (with source/confidence), `screenshot_taken`, `llm_decision` (with model, reasoning). (3) `GET /api/v1/tasks/{id}/events` returns paginated history. (4) PII redacted in API responses (unless requesting user is task owner). |
| **Points** | 2 |
| **Dependencies** | S0-02 |
| **Track** | Backend |
| **Assignee** | Backend Engineer |

---

#### Ticket S1-12: Privacy Policy v1.0 and ToS v1.0 (Copilot Drafts)

| Field | Value |
|-------|-------|
| **Title** | Finalize Privacy Policy and ToS covering Copilot mode; submit to counsel |
| **Description** | Privacy Policy covers: data collection, LLM processing, screenshot storage, sub-processors (Anthropic, OpenAI), retention periods. ToS covers: Copilot liability, platform ToS risk, user responsibilities. Submit to outside counsel with 2-week review timeline. |
| **Acceptance Criteria** | (1) Privacy Policy and ToS drafted. (2) Submitted to counsel. (3) Placeholder pages at `/legal/privacy` and `/legal/terms`. |
| **Points** | 2 |
| **Dependencies** | S0-13 |
| **Track** | Legal/Compliance |
| **Assignee** | Legal Counsel |

---

### Sprint 1 Overflow into Week 5

The remaining Phase 1 tickets (approximately 20 SP) are completed in Week 5:

- **S1-13: Stagehand CDP Connection + Navigation** (3 SP, Core) -- Connect Stagehand to AdsPower via CDP. Verify navigate, screenshot, DOM extraction using Playwright page connected through `AdsPowerManager`.
- **S1-14: Screenshot and Artifact Manager** (2 SP, Core) -- Screenshots at key moments for audit trail. Upload to S3 via the S3 plugin.

### Sprint 1: Definition of Done

- [ ] New user completes onboarding in < 90 seconds (Google login -> resume upload -> quick review)
- [ ] User pastes LinkedIn URL, watches real-time progress via WebSocket (with stub automation)
- [ ] Copilot review screen shows fields with confidence scores; user can approve
- [ ] Q&A bank prompt appears after first application with pre-filled answers
- [ ] All events logged in audit trail with LLM decision explainability
- [ ] Core automation interfaces defined with typed TypeScript contracts and working stubs
- [ ] Privacy Policy and ToS v1.0 submitted for legal review

---

## 4. Dependency Graph

### Foundation Dependencies (Must Be Done First)

```
S0-02 (Drizzle Schema)
  |---> S0-03 (Fastify + OAuth)
  |       |---> S0-04 (Login Page)
  |       |---> S0-06 (Consent API)
  |       |       |---> S0-07 (Disclaimer Modal)
  |       |---> S1-02 (Resume Upload API)
  |       |---> S1-03 (Q&A Bank API)
  |       |---> S1-05 (Task API + Hatchet Workflow)
  |       |       |---> S1-06 (WebSocket Server)
  |       |               |---> S1-07 (WebSocket Client + Progress UI)
  |       |---> S1-11 (Event Logging)
  |
  |---> S0-05 (Hatchet TS SDK Setup)
  |       |---> S1-05 (Task API + Hatchet Workflow)
  |
  |---> S0-11 (Docker Compose)

S0-01 (shadcn-admin Fork)
  |---> S0-04 (Login Page)
  |---> S0-07 (Disclaimer Modal)
  |---> S1-01 (Onboarding)
  |---> S1-04 (Apply Page)
  |---> S1-07 (Progress Component)
  |---> S1-08 (Q&A Bank UI)

S0-08 (AdsPower Client)
  |---> S0-10 (Proxy Manager)
  |---> S1-10 (Core Interfaces)
  |---> S1-13 (Stagehand CDP Connection)

S0-09 (LLM Router -- @wekruit/llm)
  |---> S1-02 (Resume Upload API -- uses LLM for parsing)
  |---> S1-09 (Resume Parser Core)
  |---> S1-10 (Core Interfaces -- form analysis uses LLM)
```

### Cross-Phase Critical Dependencies

```
AUTH SYSTEM (S0-03, S0-04)
  |---> Every authenticated feature

DRIZZLE SCHEMA (S0-02 -- @wekruit/db)
  |---> Every API endpoint
  |---> Every backend service

DESIGN SYSTEM (S0-01 -- WeKruit tokens applied)
  |---> Every frontend page and component

WEBSOCKET (S1-06)
  |---> Real-time progress (S1-07)
  |---> noVNC integration (Phase 2 -- F2.4)
  |---> Kill switch (Phase 2 -- F2.5)

HATCHET WORKFLOWS (S0-05, S1-05)
  |---> All task execution
  |---> Autopilot engine (Phase 4)
  |---> Circuit breaker (Phase 4)

CORE INTERFACES (S1-10 -- @wekruit/shared types)
  |---> LinkedIn adapter implementation (Phase 1-2 Core track)
  |---> Greenhouse adapter (Phase 5)
  |---> Lever adapter (Phase 5)

LEGAL COUNSEL ENGAGEMENT (S0-13)
  |---> ToS/Privacy drafts (S1-12)
  |---> Counsel review (Phase 2 -- L2.1)
  |---> Copilot Beta gate (Phase 3 -- requires approved ToS)
  |---> Autopilot legal work (Phase 4)

COPILOT BETA COMPLETION (Phase 3)
  |---> All Autopilot work (Phase 4+)
  |---> User feedback informs Autopilot design
```

### Parallelization Opportunities in Sprint 0

These can be done simultaneously by different engineers:

- **Backend Engineer:** S0-02 -> S0-03 -> S0-05 -> S0-11 (sequential chain)
- **Full-Stack Lead:** S0-01 (parallel with S0-02), then S0-04 (after S0-01 + S0-03)
- **Core Engineer:** S0-08, S0-09, S0-10 (all parallel with backend work)
- **Frontend Engineer:** Joins after S0-01 is done, starts S0-07
- **Legal:** S0-13 (fully parallel)

---

## 5. Open Decisions (Prioritized)

### Decision 1: Hatchet TypeScript SDK -- CONFIRMED

| Field | Detail |
|-------|--------|
| **Decision** | **Hatchet with TypeScript SDK.** Confirmed 2026-02-11. See `11_integration_architecture.md` Section 1.4 for full rationale. |
| **Rationale** | Hatchet TS SDK provides durable workflows with native pause/resume (`ctx.waitForEvent()`), built-in dashboard with step-level traces, crash recovery, and rate limiting. It eliminates the need for a separate BullMQ + XState orchestration layer. Shares PostgreSQL with the app. The TS SDK calls Stagehand directly in the worker -- no language boundary. |
| **Secondary Queue** | BullMQ retained for lightweight background jobs (email sending, screenshot cleanup, cache warming) that do not need durable execution. |
| **Status** | DECIDED. No further discussion needed. |

### Decision 2: Monorepo Structure -- Turborepo + pnpm Workspaces

| Field | Detail |
|-------|--------|
| **Decision** | **Turborepo + pnpm workspaces.** Full TypeScript monorepo with `apps/web`, `apps/api`, `apps/worker`, `packages/db`, `packages/shared`, `packages/ui`, `packages/llm`. |
| **Rationale** | Full TypeScript stack makes a monorepo essential -- shared types across frontend, API, worker, and database schema eliminate type duplication. Turborepo provides fast cached builds. pnpm is the standard for TypeScript monorepos. |
| **Status** | DECIDED. See `11_integration_architecture.md` Section 8 for full directory structure. |

### Decision 3: Stagehand for Browser Automation -- CONFIRMED

| Field | Detail |
|-------|--------|
| **Decision** | **Stagehand (TypeScript) as primary browser automation, Magnitude (TypeScript) as fallback.** Confirmed 2026-02-11. |
| **Rationale** | With the full TypeScript stack, Stagehand integrates directly -- no language boundary. Stagehand runs on Playwright (Node.js-native), supports auto-caching of selectors (Redis-backed for cross-worker sharing), self-healing selectors, native iframe/Shadow DOM handling. The Hatchet TS worker calls Stagehand directly. Three-layer fallback: Stagehand -> Magnitude -> human (noVNC). |
| **Implementation** | DEFERRED to Phase 1-2 Core track. Sprint 0-1 uses typed interface stubs (S1-10). Interfaces defined in `packages/shared/src/types/automation.ts` enable plug-and-play implementation later. |
| **Status** | DECIDED. No further discussion needed. |

### Decision 4: Node.js Worker Architecture -- RESOLVED

| Field | Detail |
|-------|--------|
| **Decision** | **No separate Node.js microservice needed.** With the full TypeScript stack, the Hatchet worker IS a Node.js process. Stagehand, Playwright, Hatchet TS SDK, and all automation logic run in the same worker process. |
| **Rationale** | The original Decision 4 (Python Hatchet workers calling a separate Node.js service for Stagehand) is obsolete. The TypeScript stack eliminates the language boundary entirely. |
| **Status** | RESOLVED. No decision needed. |

### Decision 5: WeKruit Design System Application Method

| Field | Detail |
|-------|--------|
| **Decision Needed** | How do we apply the WeKruit espresso design system to shadcn-admin? The design system HTML file exists but needs to be converted to Tailwind tokens. |
| **Options** | (A) Manual Tailwind config with CSS variables matching the design system. (B) Generate a tailwind.config.ts from the design system HTML programmatically. (C) Use shadcn themes mechanism with custom WeKruit theme. |
| **Recommendation** | **Option A: Manual Tailwind config.** Extract colors, fonts, spacing, border-radius from `wekruit-design-system.html` into `apps/web/tailwind.config.ts` `extend` block. Define CSS variables in `:root` for dynamic theme switching. See `11_integration_architecture.md` Section 7 for the complete Tailwind config. This is a one-time task in S0-01 and takes ~2 hours. |
| **Who Decides** | Full-Stack Lead |
| **Must Decide By** | Sprint 0 Day 2 (during S0-01 execution) |

### Decision 6: Self-Hosted vs Cloud Novu

| Field | Detail |
|-------|--------|
| **Decision Needed** | Self-host Novu (Docker) or use Novu Cloud? |
| **Options** | (A) Self-hosted (Docker Compose). (B) Novu Cloud (free tier). |
| **Recommendation** | **Option A: Self-hosted** for development and staging. No data leaves our infra. Novu Cloud for production if scaling requires it. Start self-hosted in Docker Compose. |
| **Who Decides** | Backend Engineer |
| **Must Decide By** | Sprint 0 (during S0-11 Docker Compose setup) |

### Decision 7: Encryption at Rest for Resumes

| Field | Detail |
|-------|--------|
| **Decision Needed** | AES-256 encryption at application level or rely on MinIO/S3 server-side encryption? |
| **Options** | (A) Application-level AES-256 (encrypt before upload). (B) MinIO/S3 server-side encryption (SSE-S3). (C) Both. |
| **Recommendation** | **Option B: SSE-S3** for Sprint 0-1. Application-level encryption adds complexity to the upload/download path. SSE-S3 provides encryption at rest with no code changes. Add application-level encryption in Phase 3 security hardening if needed. |
| **Who Decides** | Backend Engineer |
| **Must Decide By** | Sprint 1 (during S1-02 resume upload) |

### Decision 8: AdminJS vs Custom Admin

| Field | Detail |
|-------|--------|
| **Decision Needed** | SQLAdmin (Python) is not available in TypeScript. How do we provide internal admin tooling? |
| **Options** | (A) AdminJS -- auto-generated admin UI for Node.js ORMs. (B) Custom admin pages built with shadcn-admin components. (C) Defer admin UI to Phase 2+. |
| **Recommendation** | **Option C: Defer.** For Sprint 0-1, use direct database access (pgAdmin, Drizzle Studio via `pnpm drizzle-kit studio`) for internal admin. Build custom admin pages in Phase 2 if needed. AdminJS is an option but adds a dependency for minimal MVP benefit. |
| **Who Decides** | Backend Engineer |
| **Must Decide By** | Phase 2 |

---

## 6. Risk Register (Consolidated)

### HIGH Severity

| # | Risk | Source | Impact | Likelihood | Mitigation | Owner |
|---|------|--------|--------|------------|------------|-------|
| R1 | **LinkedIn bot detection evolves** -- LinkedIn updates fingerprinting, breaking automation | PRD, Roadmap | All LinkedIn automation fails | Medium | AdsPower fingerprints, sacrificial test accounts, conservative rate limits (25/day Copilot, 10/day Autopilot), human-like delays, Greenhouse-first pivot plan | Core Engineer |
| R2 | **Autopilot legal exposure** -- UETA Section 10(b) liability, GDPR Article 22 enforcement, Amazon v. Perplexity precedent | Legal doc 06 | Legal action, forced shutdown | Low-Medium | 9 mandatory quality gates, comprehensive audit trail, outside counsel review, enhanced E&O insurance, per-session consent, kill switch < 2 sec | Legal Counsel |
| R3 | **LinkedIn C&D** -- LinkedIn sends cease-and-desist targeting autonomous submission | Legal doc 06 | Must disable LinkedIn Autopilot | Medium | LinkedIn Autopilot has most conservative limits (10/day). Contingency: disable LinkedIn Autopilot within 24 hours, maintain Copilot mode. Greenhouse/Lever unaffected. | Legal Counsel |
| R8 | **Team velocity** -- 4-person team cannot sustain velocity across 5 tracks for 26 weeks | Roadmap | Missed milestones, burnout | Medium-High | OSS adoption reduces work by 33-50 weeks. Legal track outsourced. P2 items deferrable. Automation core deferred (reduces Sprint 0-1 scope). Weekly velocity reviews. | Full-Stack Lead |

### MEDIUM Severity

| # | Risk | Source | Impact | Likelihood | Mitigation | Owner |
|---|------|--------|--------|------------|------------|-------|
| R4 | **Quality gate over-blocking** -- 9 gates block too many Autopilot apps | Roadmap | Autopilot feels useless | Medium | Beta test with 25 users. Per-gate analytics. Individual thresholds tunable (within legal minimums). Target < 20% block rate. | Backend Engineer |
| R5 | **Hatchet TS SDK immaturity** -- Hatchet TypeScript SDK is newer than the Python SDK, may have edge cases | Roadmap | Workflow reliability issues | Medium | Spike in Sprint 0 (S0-05). If Hatchet TS SDK fails: Temporal TypeScript SDK as fallback, abstraction layer in workflow definitions. | Backend Engineer |
| R6 | **AdsPower API reliability** -- Local API may be flaky or poorly documented | Roadmap | Browser provisioning failures | Medium | Spike in Sprint 0 (S0-08). Retry logic with exponential backoff. Patchright as fallback for direct CDP. | Core Engineer |
| R9 | **Consent fatigue** -- 5-layer consent frustrates users, reduces Autopilot adoption | Legal doc 06 | Low Autopilot conversion | Medium | Layer 1-2 are standard click-through. Layer 3 is one-time. Layer 4 has "remember settings". Layer 5 is configuration. Test onboarding < 3 min. | Full-Stack Lead |
| R12 | **pdf-parse/mammoth quality** -- TypeScript PDF/DOCX extraction may produce inferior results compared to Python alternatives | Architecture doc 11 | Resume parsing accuracy degrades | Medium | Benchmark against 50 test resumes in Week 2. Python microservice fallback ready (tiny stateless service behind HTTP). Decision point: Week 2 end. | Core Engineer |

### LOW Severity

| # | Risk | Source | Impact | Likelihood | Mitigation | Owner |
|---|------|--------|--------|------------|------------|-------|
| R7 | **noVNC integration complexity** | Roadmap | CAPTCHA handling delayed | Low (react-vnc reduces) | react-vnc reduces from 5 SP to 3 SP. Fallback: screenshot + "apply manually" link. | Frontend Engineer |
| R11 | **shadcn-admin divergence** -- Upstream changes to shadcn-admin conflict with our fork | OSS doc 07 | Merge conflicts | Low | We fork and own the code. shadcn components are copy-paste, no vendor lock-in. Only pull upstream security patches. | Full-Stack Lead |

---

## 7. Definition of Done -- MVP (Phase 0-3, Copilot Beta at Week 10)

### Feature Completeness (All P0 Features Working)

- [ ] Google OAuth sign-up / sign-in
- [ ] Resume upload (PDF/DOCX) with LLM parsing and user review
- [ ] 3-step onboarding completed in < 90 seconds
- [ ] URL paste with platform auto-detection (LinkedIn MVP)
- [ ] Job preview card with match score
- [ ] One-click "Start Application" triggering Hatchet workflow
- [ ] Real-time WebSocket progress with vertical timeline
- [ ] Per-field confidence scores displayed
- [ ] Copilot review/approve screen before submission
- [ ] Screening Q&A bank (RJSF-powered, post-first-app prompt)
- [ ] Application tracking dashboard with filters (shadcn-admin + Tremor)
- [ ] CAPTCHA detection -> noVNC viewer -> resume automation
- [ ] Kill switch stops all tasks in < 2 seconds (button + Ctrl+Shift+K)
- [ ] Novu notifications (in-app + email)
- [ ] Settings page with profile, preferences, and locked Autopilot indicator
- [ ] Error recovery UI for top 10 failure modes

### Quality Gates Met

- [ ] E2E test suite (Playwright Test) covering full Copilot journey; 80% critical path coverage
- [ ] Backend integration tests: API endpoints (Vitest), Hatchet workflow, WebSocket, rate limiting
- [ ] Frontend security hardening: no secrets in bundle, XSS prevention, CSP headers
- [ ] Backend security audit: OWASP Top 10 checklist complete
- [ ] 0 high/critical dependency vulnerabilities
- [ ] CI pipeline green (ESLint + tsc + Vitest) on every PR

### Legal Documents Reviewed by Counsel

- [ ] Terms of Service v1.0 (Copilot) -- approved by outside counsel
- [ ] Privacy Policy v1.0 -- approved by outside counsel
- [ ] Copilot legal disclaimer text -- approved
- [ ] Beta user agreement drafted and signed by all participants
- [ ] Data retention policy implemented (audit: 2 years, screenshots: 30-90 days, LLM logs: 90 days)

### Testing and Validation

- [ ] 50+ LinkedIn test runs completed with >= 80% success rate
- [ ] Top 5 failure modes documented with mitigations
- [ ] Performance: onboarding < 90 seconds, application < 3 minutes, WebSocket < 2s latency

### Beta Users

- [ ] 10 beta users onboarded and completing applications
- [ ] Beta feedback mechanism in place (in-app + email)
- [ ] Usage metrics tracked (applications/user/day, success rate, intervention rate)

### Infrastructure

- [ ] Production environment deployed and stable 48 hours
- [ ] Staging environment mirroring production
- [ ] Sentry + Grafana dashboards active with real metrics
- [ ] SSL, domain, DNS configured
- [ ] Database backups automated (daily)

---

## 8. Handoff Checklist -- What Each Engineer Needs to Get Started

### 1. Repository Setup

```bash
# Clone the repo
git clone <repo-url>
cd wekruit-autoapply

# Monorepo structure (Turborepo + pnpm workspaces):
# apps/
#   web/             -- Dashboard SPA (React 18 + Vite + shadcn-admin fork)
#   api/             -- Fastify API server (Drizzle ORM, Hatchet TS SDK, Zod)
#   worker/          -- Browser automation worker (Hatchet worker, Stagehand, Playwright)
# packages/
#   db/              -- Drizzle schema, migrations, seed data
#   shared/          -- Shared types, constants, utilities (@wekruit/shared)
#   ui/              -- shadcn/ui components with WeKruit theme (@wekruit/ui)
#   llm/             -- LLM router + provider abstraction (@wekruit/llm)
# docker/            -- Docker Compose and Dockerfiles
# product-research/  -- All planning docs (read-only reference)
```

### 2. Environment Variables

Create `.env` from `.env.example` in the repo root (shared by all apps):

```env
# Database
DATABASE_URL=postgres://wekruit:wekruit_dev@localhost:5432/wekruit

# Redis
REDIS_URL=redis://localhost:6379

# Hatchet
HATCHET_CLIENT_TOKEN=<from Hatchet dashboard at localhost:8888>
HATCHET_CLIENT_TLS_STRATEGY=none

# Auth
GOOGLE_CLIENT_ID=<from Google Cloud Console>
GOOGLE_CLIENT_SECRET=<from Google Cloud Console>
GOOGLE_REDIRECT_URI=http://localhost:5173/auth/callback
JWT_SECRET=<generate with openssl rand -hex 32>
JWT_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d

# LLM Providers
ANTHROPIC_API_KEY=<your key>
OPENAI_API_KEY=<your key>

# AdsPower
ADSPOWER_API_URL=http://localhost:50325

# IPRoyal Proxy
IPROYAL_USERNAME=<your username>
IPROYAL_PASSWORD=<your password>

# Object Storage (MinIO)
S3_ENDPOINT=http://localhost:9000
S3_ACCESS_KEY=wekruit
S3_SECRET_KEY=wekruit_dev
S3_BUCKET=wekruit-uploads
S3_REGION=us-east-1

# Novu
NOVU_API_KEY=<from Novu self-hosted dashboard>
NOVU_API_URL=http://localhost:3003

# Stripe (Phase 5+)
STRIPE_SECRET_KEY=<key>
STRIPE_WEBHOOK_SECRET=<key>

# App
NODE_ENV=development
API_PORT=8000
WEB_PORT=5173
CORS_ORIGIN=http://localhost:5173
```

### 3. Local Dev Setup

```bash
# Install all workspace dependencies
pnpm install

# Start infrastructure services (PostgreSQL, Redis, Hatchet, MinIO, Novu)
docker compose -f docker/docker-compose.yml up -d

# Run database migrations (Drizzle)
pnpm --filter @wekruit/db db:migrate

# Seed development data
pnpm --filter @wekruit/db db:seed

# Start all apps in development mode (hot-reload via Turborepo)
pnpm dev

# This runs concurrently:
#   apps/web     -> http://localhost:5173  (Vite dev server)
#   apps/api     -> http://localhost:8000  (Fastify)
#   apps/worker  -> connects to Hatchet on :7077

# Verify everything is running:
# - Dashboard:     http://localhost:5173
# - API health:    http://localhost:8000/api/v1/health
# - Hatchet UI:    http://localhost:8888
# - Novu:          http://localhost:3003
# - MinIO console: http://localhost:9001
# - Drizzle Studio: pnpm --filter @wekruit/db drizzle-kit studio
```

### 4. Design System Setup

The WeKruit design system is defined in `product-research/wekruit-design-system.html`. Key tokens extracted into `apps/web/tailwind.config.ts` (see `11_integration_architecture.md` Section 7 for the complete config):

- **Fonts:** Halant (headings), Geist Sans (body), Geist Mono (code)
- **Colors:** Espresso palette with warm earthy tones
  - Copilot blue: `#1E40AF`
  - Autopilot purple: `#7C3AED`
  - Primary/accent colors from design system HTML
- **Border radius, spacing, shadows:** Per design system specs
- **Dark mode:** `[data-theme="dark"]` attribute on `<html>` -- CSS custom properties redefine automatically

Font files are loaded via Google Fonts or self-hosted in `apps/web/public/fonts/`.

### 5. API Documentation Location

- **API Contracts:** ts-rest definitions in `packages/contracts/` (see doc 16 Section 3)
- **DTOs:** Zod schemas in `packages/shared/src/schemas/` -- all request/response types
- **API Spec in PRD:** `product-research/03_complete_prd.md` Section 5
- **API Contract in Architecture:** `product-research/11_integration_architecture.md` Section 6
- **Endpoint list:** All endpoints prefixed with `/api/v1/`

### 6. Testing Setup

```bash
# Run all checks (what CI runs)
pnpm lint              # ESLint + Prettier across all workspaces
pnpm typecheck         # tsc --noEmit across all workspaces
pnpm test              # Vitest across all workspaces

# Run tests for a specific workspace
pnpm --filter @wekruit/api test         # API unit + integration tests
pnpm --filter @wekruit/web test         # Frontend component tests
pnpm --filter @wekruit/worker test      # Worker unit tests
pnpm --filter @wekruit/db test          # Schema + migration tests

# E2E tests (Phase 3+)
pnpm --filter @wekruit/web test:e2e     # Playwright Test

# Generate Drizzle migration after schema change
pnpm --filter @wekruit/db db:generate

# Build all packages and apps
pnpm build
```

### 7. Key Conventions

- **Branch naming:** `feature/S0-01-shadcn-admin-fork`, `fix/S1-05-websocket-reconnect`
- **Commit messages:** `[S0-01] Fork shadcn-admin and apply WeKruit tokens`
- **PR template:** Title, description, ticket reference, screenshots (for UI changes), test evidence
- **Code review:** All PRs require 1 approval. PRs must pass ESLint + tsc + Vitest in CI.
- **API versioning:** All endpoints under `/api/v1/`. Breaking changes increment version.
- **Error responses:** Consistent JSON format: `{ error: { code: "ERROR_CODE", message: "Human-readable message", details?: Record<string, unknown> } }`
- **Shared types:** All cross-workspace types go in `packages/shared`. Import as `@wekruit/shared`.
- **Validation:** Zod schemas as single source of truth, consumed by ts-rest contracts (see doc 16 Section 2).

### 8. Who to Ask

| Question | Ask |
|----------|-----|
| Architecture, tech stack decisions | Full-Stack Lead |
| Database schema, API design, Hatchet workflows | Backend Engineer |
| AdsPower, LLM, automation, proxy | Core Engineer |
| UI components, design system, UX | Full-Stack Lead or Frontend Engineer |
| Legal requirements, consent flows | Legal Counsel |
| "Where is X documented?" | This document (Section 2) or `09_updated_product_roadmap.md` |
| Monorepo / workspace setup | See `11_integration_architecture.md` Section 8 |

---

## Appendix A: Sprint Velocity Targets

| Sprint | Weeks | Target SP | SP/Engineer/Week | Notes |
|--------|-------|-----------|------------------|-------|
| Sprint 0 | 1-2 | 33 | ~4.1 | Heavy parallelization; infrastructure setup |
| Sprint 1 | 3-4 | 48 | ~6.0 | Highest intensity; core MVP features |
| Week 5 | 5 | 20 | ~5.0 | Sprint 1 overflow + integration testing |

**Velocity health check:** If Sprint 0 delivers < 25 SP, re-scope Sprint 1 P1 items to Phase 2.

## Appendix B: WeKruit Design System Quick Reference

| Token | Value | Usage |
|-------|-------|-------|
| **Heading Font** | Halant (serif) | All h1-h4, modal titles, hero text |
| **Body Font** | Geist Sans | All body text, labels, buttons |
| **Mono Font** | Geist Mono | Code snippets, technical values |
| **Copilot Color** | `#1E40AF` (blue) | Copilot mode badges, indicators, active states |
| **Autopilot Color** | `#7C3AED` (purple) | Autopilot mode badges, indicators (locked = gray) |
| **Copilot Icon** | Steering wheel | Mode selection, status indicators |
| **Autopilot Icon** | Gauge needle | Mode selection, status indicators |
| **Background** | Warm neutral/cream tones | Per design system HTML |
| **Toast Library** | Sonner | All transient UI feedback |
| **Notification** | Novu `<Inbox>` | Bell icon in header, dropdown panel |

## Appendix C: Migration from Python References in Earlier Documents

Earlier planning documents (03, 09, 10) reference Python-specific tools. Here is the mapping for engineers reading those documents:

| Earlier Document Reference | TypeScript Equivalent |
|---|---|
| FastAPI + uvicorn | Fastify 5.x on Node.js |
| SQLAlchemy + Alembic | Drizzle ORM + drizzle-kit |
| Pydantic schemas | Zod + ts-rest contracts (see doc 16) |
| Hatchet Python SDK (`@hatchet.task` decorator) | Hatchet TypeScript SDK (`worker.registerWorkflow()`) |
| SQLAdmin at `/admin` | Drizzle Studio (`drizzle-kit studio`) |
| Ruff (linter) | ESLint + @typescript-eslint |
| mypy (type checker) | tsc (TypeScript compiler, strict mode) |
| pytest | Vitest (unit) + Playwright Test (e2e) |
| pdfplumber + python-docx | pdf-parse + mammoth |
| Browser-Use (Python) | Stagehand (TypeScript) |
| LangChain (Python) | Custom LLM router using Anthropic/OpenAI TypeScript SDKs |
| Python virtual env | pnpm workspaces |
| `pip install` | `pnpm install` |
| `python scripts/seed.py` | `pnpm --filter @wekruit/db db:seed` |
| `alembic upgrade head` | `pnpm --filter @wekruit/db db:migrate` |

---

*This document is the single source of truth for WeKruit AutoApply engineering execution. It consolidates research from documents 01-11 and supersedes all previous planning documents. When in doubt, refer here first, then to document 11 for architecture details, then to document 09 for detailed ticket specifications.*
