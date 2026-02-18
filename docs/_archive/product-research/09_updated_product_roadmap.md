# WeKruit Valet -- Updated Product Roadmap (v2.0)

> **Note (2026-02-11):** The tech stack has been updated from Python/FastAPI to TypeScript/Fastify per the architecture decision in `11_integration_architecture.md`. References to "FastAPI" in this document should be read as "Fastify". See `14_final_engineering_plan.md` for the updated sprint plan.

> **Version:** 2.0
> **Date:** 2026-02-11
> **Status:** Ready for Sprint Planning
> **Previous Version:** 04_product_roadmap.md (v1.0, Copilot-only)
> **Incorporates:** Autopilot UX (doc 05), Privacy/Legal (doc 06), OSS Research (doc 07), Competitor Research (doc 08)
> **Timeline:** 26 weeks (10 weeks to Copilot MVP Beta, 8 weeks to Autopilot Beta, 8 weeks to Scale)
> **Tracks:** Frontend | Backend | Core | Legal/Compliance | Infrastructure

---

## Table of Contents

0. [Updated Product Philosophy (PRD Section 1.1 Replacement)](#0-updated-product-philosophy-prd-section-11-replacement)
1. [Executive Summary of Changes](#1-executive-summary-of-changes)
2. [OSS Integration Impact](#2-oss-integration-impact)
3. [Gantt Chart](#3-gantt-chart)
4. [Phase 0: Foundation (Weeks 1-2)](#4-phase-0-foundation-weeks-1-2)
5. [Phase 1: Copilot MVP Core (Weeks 3-5)](#5-phase-1-copilot-mvp-core-weeks-3-5)
6. [Phase 2: Dashboard, UX & HITL (Weeks 6-8)](#6-phase-2-dashboard-ux--hitl-weeks-6-8)
7. [Phase 3: QA, Security & Copilot Beta (Weeks 9-10)](#7-phase-3-qa-security--copilot-beta-weeks-9-10)
8. [Phase 4: Autopilot Foundation (Weeks 11-14)](#8-phase-4-autopilot-foundation-weeks-11-14)
9. [Phase 5: Autopilot Polish & Beta (Weeks 15-18)](#9-phase-5-autopilot-polish--beta-weeks-15-18)
10. [Phase 6: Scale & Platform Expansion (Weeks 19-26)](#10-phase-6-scale--platform-expansion-weeks-19-26)
11. [Dependency Graph](#11-dependency-graph)
12. [Critical Path Analysis](#12-critical-path-analysis)
13. [Risk Register](#13-risk-register)
14. [Milestone Schedule](#14-milestone-schedule)
15. [Team Size Recommendation](#15-team-size-recommendation)

---

## 0. Updated Product Philosophy (PRD Section 1.1 Replacement)

> **This section replaces Section 1.1 "Product Vision" in `03_complete_prd.md`.** The old philosophy was "Copilot, Not Autopilot." The new philosophy is "Copilot First, Autopilot Earned."

### Section 1.1 -- Product Vision (UPDATED)

WeKruit AutoApply is a dual-mode, AI-agent-driven job application system that eliminates the repetitive drudgery of filling out job applications. The user provides a resume, pastes a job URL, and the system does everything else: navigates to the job posting, fills forms intelligently using LLM-powered analysis, answers screening questions from a pre-built Q&A bank, uploads documents, and submits. When the system encounters obstacles it cannot solve autonomously -- CAPTCHAs, ambiguous questions, or unexpected UI -- it pauses and lets the user take over via a remote browser session (noVNC), then resumes automation once the obstacle is cleared.

**The product operates in two modes: Copilot and Autopilot.**

**Copilot Mode** is the default for every new user. The AI fills forms and the user reviews every field and approves every submission. The system is transparent about what it is doing (real-time progress, per-field confidence scores, screenshots) and never submits without the user's explicit approval. This is the trust-building phase.

**Autopilot Mode** is earned, not given. After a user completes 3 successful Copilot applications with high confidence scores and zero critical overrides, Autopilot unlocks. In Autopilot, the AI fills AND submits applications automatically within user-defined parameters, subject to 9 mandatory quality gates that cannot be overridden. The user reviews post-submission summaries rather than pre-submission fields. A circuit breaker auto-pauses after 3 consecutive failures. A kill switch stops all automation in under 2 seconds.

**The product philosophy is: Copilot First, Autopilot Earned.** No competitor successfully bridges both modes. Tools are either fully manual with high trust (Simplify: 4.9/5 rating) or fully automated with low trust (LazyApply: 2.1/5 rating). WeKruit occupies the high-automation, high-trust quadrant that no competitor has claimed -- by building trust through transparent Copilot experiences before offering the speed of Autopilot.

This dual-mode architecture is built on three principles:

1. **Transparency creates trust.** Every field shows its confidence score and source. Every submission produces screenshot proof. Every AI decision is logged in an audit trail.
2. **Trust enables automation.** Users who see 3-5 correct Copilot applications gain the confidence to delegate. Progressive disclosure moves them naturally from "I review everything" to "the AI handles it."
3. **Automation with guardrails.** Autopilot is bounded by mandatory quality gates, rate limits, kill switches, and GDPR Article 22 compliance. It is the "responsible Autopilot" -- the only auto-apply tool that treats legal compliance and user safety as features, not afterthoughts.

This positions WeKruit as a premium, trust-building alternative to "spray-and-pray" competitors and as a productivity upgrade over copilot-only tools.

---

## 1. Executive Summary of Changes

### What Changed from v1.0

| Dimension             | v1.0 Roadmap                                  | v2.0 Roadmap                                         |
| --------------------- | --------------------------------------------- | ---------------------------------------------------- |
| **Philosophy**        | Copilot only                                  | Copilot First, Autopilot Earned                      |
| **Modes**             | Single mode (human approves every submission) | Dual mode with progressive trust gate                |
| **Tracks**            | 3 (Frontend, Backend, Core)                   | 5 (+ Legal/Compliance, Infrastructure)               |
| **Total Timeline**    | 30 weeks                                      | 26 weeks (compressed via OSS)                        |
| **MVP Timeline**      | 12 weeks                                      | 10 weeks (OSS integration saves 2 weeks)             |
| **Autopilot Beta**    | Not planned                                   | Week 18                                              |
| **Dashboard Build**   | Custom from scratch (6-8 weeks)               | shadcn-admin fork (1-2 weeks)                        |
| **Notifications**     | Custom build (3 weeks)                        | Novu integration (1-2 weeks)                         |
| **noVNC Integration** | Manual wrapper (2 weeks)                      | react-vnc component (3-5 days)                       |
| **Charts**            | Recharts custom (2-3 weeks)                   | Tremor drop-in (days)                                |
| **Legal Track**       | Not planned                                   | Full track: consent, GDPR, audit trail, legal review |
| **Quality Gates**     | None                                          | 9 mandatory gates for Autopilot                      |
| **Kill Switch**       | Basic (2 SP)                                  | Enhanced with <2 sec requirement, multi-trigger      |

### Net Timeline Impact

| Factor                             | Impact                        |
| ---------------------------------- | ----------------------------- |
| OSS integration savings            | -6 to -8 weeks                |
| Autopilot mode (new scope)         | +6 weeks                      |
| Legal/compliance track (new scope) | +3 weeks                      |
| Infrastructure formalization       | +1 week                       |
| **Net change**                     | **-4 weeks (30 -> 26 weeks)** |

---

## 2. OSS Integration Impact

### Adopted Open-Source Projects

| Project                                    | Replaces                                           | License    | Integration Effort           | Dev Weeks Saved |
| ------------------------------------------ | -------------------------------------------------- | ---------- | ---------------------------- | --------------- |
| **shadcn-admin**                           | Custom dashboard shell, layout, auth pages, tables | MIT        | 1-2 weeks (fork + customize) | 6-8             |
| **Tremor**                                 | Custom chart components                            | Apache 2.0 | Days (drop-in)               | 2-3             |
| **SQLAdmin**                               | Custom internal admin panel                        | BSD-3      | 1-2 days                     | 3-4             |
| **Novu**                                   | Custom notification system (in-app + email + push) | MIT        | 1-2 weeks                    | 6-8             |
| **Sonner**                                 | Custom toast notifications                         | MIT        | Hours                        | 1               |
| **react-vnc**                              | Manual noVNC React wrapper                         | MIT        | 3-5 days                     | 2-3             |
| **react-jsonschema-form**                  | Custom dynamic Q&A bank forms                      | Apache 2.0 | 1-2 weeks                    | 4-6             |
| **React Hook Form + Zod**                  | Custom form validation                             | MIT        | 0 (included in shadcn-admin) | 3-4             |
| **Stripe React + use-stripe-subscription** | Custom billing UI                                  | MIT        | 1-2 weeks                    | 4-6             |
| **React Email**                            | Custom email templates                             | MIT        | 1 week                       | 2-3             |

| Metric                           | Value                                           |
| -------------------------------- | ----------------------------------------------- |
| **Total dev weeks saved**        | 45-62 weeks                                     |
| **Total integration effort**     | 8-12 weeks                                      |
| **Net savings**                  | 33-50 weeks                                     |
| **All licenses SaaS-compatible** | Yes (MIT, Apache 2.0, BSD-3)                    |
| **AGPL projects avoided**        | Lago (use Stripe instead), OpenResume (use LLM) |

### What This Means for the Roadmap

1. **Phase 0 dashboard work shrinks dramatically.** F0.1 (scaffolding) becomes "fork shadcn-admin" instead of "build from scratch." F0.3 (layout shell) is already done in the fork.
2. **Phase 2 notifications are plug-and-play.** F2.4 and B2.3 are replaced by Novu integration tasks.
3. **Phase 3 noVNC is simplified.** F3.1 uses react-vnc instead of building a custom wrapper.
4. **Phase 5 analytics use Tremor.** F5.3 drops from 5 SP to 3 SP with Tremor charts.
5. **Q&A bank uses RJSF.** Dynamic screening question forms rendered from JSON Schema stored in the database.

---

## 3. Gantt Chart

```
Week:   1   2   3   4   5   6   7   8   9  10  11  12  13  14  15  16  17  18  19-26
       |-------|---------------|-----------|------|
       |PHASE 0|   PHASE 1     |  PHASE 2  | PH 3 |   PHASE 4         |  PHASE 5  | PHASE 6
       |Found. |  Copilot Core |  Dash+HITL| QA+B |  Autopilot Found. | AP Polish | Scale
       |-------|---------------|-----------|------|

FRONTEND TRACK (shadcn-admin + React 18 + TypeScript + Tailwind)
       [Fork+Auth][ Resume+Apply ][ Dash+HITL  ][ QA  ][ AP UI+Consent ][ AP Dash  ][ Ext+Bulk+Ent ]
Week:   1   2   3   4   5   6   7   8   9  10  11  12  13  14  15  16  17  18  19-26
        ███ ███  ███ ███ ███  ███ ███ ███  ███ ███  ███ ███ ███ ███  ███ ███ ███ ███

BACKEND TRACK (FastAPI + PostgreSQL + Hatchet)
       [DB+Auth+Htch][ APIs+WS  ][ Rate+Notif ][ Sec ][ AP Engine+Gates][ AP Audit ][ GH/Lever+Wkdy]
Week:   1   2   3   4   5   6   7   8   9  10  11  12  13  14  15  16  17  18  19-26
        ███ ███  ███ ███ ███  ███ ███ ███  ███ ███  ███ ███ ███ ███  ███ ███ ███ ███

CORE TRACK (LLM + Browser-Use + AdsPower + Proxy)
       [Ads+CDP+Proxy][ LnkIn+Form ][ Q&A+Anti-D ][ Test ][ CircuitBrk+QG ][ Selectors ][ GH+Lever+Wkdy]
Week:   1   2   3   4   5   6   7   8   9  10  11  12  13  14  15  16  17  18  19-26
        ███ ███  ███ ███ ███  ███ ███ ███  ███ ███  ███ ███ ███ ███  ███ ███ ███ ███

LEGAL/COMPLIANCE TRACK (new)
       [ Research ][ Copilot Disc][ Privacy Pol][ Rev ][ AP Consent+GDPR][ AP ToS+Ins][ Audit+Maint ]
Week:   1   2   3   4   5   6   7   8   9  10  11  12  13  14  15  16  17  18  19-26
        ░░░ ███  ░░░ ░░░ ███  ░░░ ███ ███  ███ ███  ███ ███ ███ ███  ███ ███ ░░░ ░░░

INFRASTRUCTURE TRACK (new)
       [Docker+CI ][  Monitoring  ][  Staging   ][ Prod ][ AP Infra     ][ Scale    ][ Multi-region ]
Week:   1   2   3   4   5   6   7   8   9  10  11  12  13  14  15  16  17  18  19-26
        ███ ███  ░░░ ███ ░░░  ███ ░░░ ███  ███ ░░░  ███ ░░░ ███ ░░░  ███ ███ ███ ███

MILESTONES
        *           *       *           *   *       *               *       *
       W2          W4      W5          W8  W10     W14             W18     W22
    HelloWorld  1stApply CoreLoop   FullUX CopBeta APEngine     APBeta  ScaleLnch
```

**Legend:** `███` = Active sprint work | `░░░` = Buffer/overflow or supporting work | `*` = Milestone

---

## 4. Phase 0: Foundation (Weeks 1-2)

**Goal:** Every engineer can run the full stack locally. AdsPower connects, CDP works, database is seeded, auth works, dashboard shell loads. Legal research initiated.

**Duration:** 2 weeks
**Total Story Points:** 33 SP

### Frontend Track (8 SP)

#### F0.1 -- Fork shadcn-admin & Configure (CHANGED: was custom scaffolding)

| Field                   | Value                                                                                                                                                                                                                                                                                                                                        |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Track**               | Frontend                                                                                                                                                                                                                                                                                                                                     |
| **Description**         | Fork satnaing/shadcn-admin as the dashboard foundation. Remove demo content. Configure routing (React Router) with `/login`, `/dashboard`, `/apply`, `/settings` routes. Set up Zustand store with auth, user profile, and task list slices. Integrate Sonner for toast notifications. This replaces the old F0.1+F0.3 tasks (8 SP -> 3 SP). |
| **Dependencies**        | None                                                                                                                                                                                                                                                                                                                                         |
| **Effort**              | 3 SP                                                                                                                                                                                                                                                                                                                                         |
| **Priority**            | P0                                                                                                                                                                                                                                                                                                                                           |
| **Acceptance Criteria** |                                                                                                                                                                                                                                                                                                                                              |

- shadcn-admin forked and running on `localhost:3000` with hot reload
- Demo/sample content removed; WeKruit branding applied
- React Router configured with `/login`, `/dashboard`, `/apply`, `/settings`, `/onboarding/*`
- Zustand store initialized with auth state, user profile, and task list slices
- Tailwind CSS configured with WeKruit design tokens (Copilot blue #1E40AF, Autopilot purple #7C3AED)
- Sonner `<Toaster />` component mounted at app root
- Protected route wrapper redirects unauthenticated users to `/login`
- Sidebar, header, and content area layout working (inherited from shadcn-admin)
- Dark/light mode toggle functional
- Responsive: sidebar collapses to hamburger menu on mobile (<768px)

#### F0.2 -- Gmail OAuth Login Page

| Field                   | Value                                                                                                                     |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| **Track**               | Frontend                                                                                                                  |
| **Description**         | Build the login page with "Sign in with Google" button using shadcn-admin's auth page template. Implement OAuth 2.0 flow. |
| **Dependencies**        | F0.1, B0.2                                                                                                                |
| **Effort**              | 2 SP (reduced from 3 SP -- shadcn-admin provides auth page template)                                                      |
| **Priority**            | P0                                                                                                                        |
| **Acceptance Criteria** |                                                                                                                           |

- "Sign in with Google" button renders on `/login` (styled from shadcn-admin auth template)
- Clicking triggers the Google OAuth consent screen
- Successful auth redirects to `/dashboard` with user profile loaded
- JWT stored securely (httpOnly cookie or Authorization header via Zustand)
- Logout button clears session and redirects to `/login`

#### F0.3 -- Copilot Legal Disclaimer Modal (NEW)

| Field                   | Value                                                                                                                                                                                                                                                   |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Track**               | Frontend                                                                                                                                                                                                                                                |
| **Description**         | Build the legal disclaimer modal shown before first use of Copilot mode. Acknowledges platform ToS violation risk and account restriction risk. This is Layer 2 of the 5-layer progressive consent system. Uses versioned acceptance stored in backend. |
| **Dependencies**        | F0.1, L0.1                                                                                                                                                                                                                                              |
| **Effort**              | 3 SP                                                                                                                                                                                                                                                    |
| **Priority**            | P0                                                                                                                                                                                                                                                      |
| **Acceptance Criteria** |                                                                                                                                                                                                                                                         |

- Modal appears on first attempt to use any automation feature
- Content includes: platform ToS risk, account restriction risk, WeKruit liability limitations
- User must actively check a consent box (not pre-checked)
- Consent version stored in backend with timestamp
- Modal re-appears if legal disclaimer version changes (via `LEGAL_DISCLAIMER_VERSION`)
- "Cancel" returns user to dashboard; "Accept" unlocks Copilot features
- Accessible: keyboard-navigable, screen-reader compatible

### Backend Track (16 SP)

#### B0.1 -- Database Schema & Migrations (Alembic)

| Field                   | Value                                                                                                                                                                                                                                                                                                  |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Track**               | Backend                                                                                                                                                                                                                                                                                                |
| **Description**         | Set up PostgreSQL with SQLAlchemy models and Alembic migrations. Create initial schema: `users`, `resumes`, `tasks`, `task_events`, `application_results`, `browser_profiles`, `proxy_bindings`, `screening_answers`, `consent_records` (NEW), `audit_trail` (NEW). Mount SQLAdmin for internal admin. |
| **Dependencies**        | None                                                                                                                                                                                                                                                                                                   |
| **Effort**              | 5 SP                                                                                                                                                                                                                                                                                                   |
| **Priority**            | P0                                                                                                                                                                                                                                                                                                     |
| **Acceptance Criteria** |                                                                                                                                                                                                                                                                                                        |

- `alembic upgrade head` creates all tables from clean database
- All tables have proper indexes (user_id+status on tasks, etc.)
- `task_status` ENUM includes Autopilot states: AUTOPILOT_QUEUED, AUTOPILOT_EXECUTING, AUTOPILOT_SUBMITTED, QUALITY_GATE_BLOCKED
- `consent_records` table tracks all consent versions, types, and timestamps per user
- `audit_trail` table with JSONB data field for GDPR Article 22 explainability
- SQLAdmin mounted at `/admin` with ModelAdmin classes for all tables
- Seed script creates 2 test users, 5 sample tasks, 1 browser profile
- `alembic downgrade -1` cleanly rolls back

#### B0.2 -- FastAPI Project Structure + Gmail OAuth

| Field                   | Value                                                                                                                                         |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| **Track**               | Backend                                                                                                                                       |
| **Description**         | Scaffold FastAPI application with project structure (routers, services, models, schemas). Implement Google OAuth 2.0 login flow. Set up CORS. |
| **Dependencies**        | B0.1                                                                                                                                          |
| **Effort**              | 5 SP                                                                                                                                          |
| **Priority**            | P0                                                                                                                                            |
| **Acceptance Criteria** |                                                                                                                                               |

- FastAPI app starts on port 8000 with auto-generated OpenAPI docs at `/docs`
- `POST /api/v1/auth/google` accepts authorization code, returns JWT + user profile
- `GET /api/v1/auth/me` returns current user from JWT
- JWT validation middleware protects all `/api/v1/*` routes except auth
- CORS configured to allow dashboard origin
- Health check at `GET /api/v1/health`

#### B0.3 -- Hatchet Setup & Hello World Workflow

| Field                   | Value                                                                                                                                 |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| **Track**               | Backend                                                                                                                               |
| **Description**         | Install Hatchet (Docker or cloud). Configure Python SDK. Create hello-world durable workflow. Verify it appears in Hatchet dashboard. |
| **Dependencies**        | B0.1                                                                                                                                  |
| **Effort**              | 3 SP                                                                                                                                  |
| **Priority**            | P0                                                                                                                                    |
| **Acceptance Criteria** |                                                                                                                                       |

- Hatchet engine running with web UI accessible
- Python worker connects and registers test workflow
- Workflow completes 3 steps with state transitions visible in Hatchet UI
- Hatchet shares the same Postgres instance as the app

#### B0.4 -- Consent Records API (NEW)

| Field                   | Value                                                                                                                                                                                                                       |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Track**               | Backend                                                                                                                                                                                                                     |
| **Description**         | Build consent tracking API. Records all user consent actions with version, type, timestamp, and IP. Supports Layer 1-2 consent (account registration + Copilot disclaimer). Autopilot consent (Layer 3-5) added in Phase 4. |
| **Dependencies**        | B0.1, B0.2                                                                                                                                                                                                                  |
| **Effort**              | 3 SP                                                                                                                                                                                                                        |
| **Priority**            | P0                                                                                                                                                                                                                          |
| **Acceptance Criteria** |                                                                                                                                                                                                                             |

- `POST /api/v1/consent` records consent acceptance: {type, version, ip_address, user_agent}
- `GET /api/v1/consent` returns all consent records for current user
- `GET /api/v1/consent/check?type=copilot_disclaimer&version=1.0` returns boolean
- Consent types: `tos_acceptance`, `privacy_policy`, `copilot_disclaimer`, `autopilot_consent` (future)
- Consent versioning: if version changes, previous consent is invalidated
- All consent records are immutable (append-only, no updates or deletes)

### Core Track (11 SP)

#### C0.1 -- AdsPower Client Library

| Field                   | Value                                                                                                   |
| ----------------------- | ------------------------------------------------------------------------------------------------------- |
| **Track**               | Core                                                                                                    |
| **Description**         | Build async Python client for AdsPower Local API. Profile management, browser lifecycle, proxy binding. |
| **Dependencies**        | None                                                                                                    |
| **Effort**              | 3 SP                                                                                                    |
| **Priority**            | P0                                                                                                      |
| **Acceptance Criteria** |                                                                                                         |

- `AdsPowerClient` class with async methods: `create_profile()`, `start_browser()`, `stop_browser()`, `check_active()`, `update_proxy()`
- `start_browser()` returns the CDP WebSocket URL
- Retry logic with exponential backoff (max 3 retries)
- Proper error types: `AdsPowerConnectionError`, `ProfileNotFoundError`, `BrowserStartError`
- Integration test: create profile -> start browser -> verify CDP URL -> stop browser

#### C0.2 -- Browser-Use CDP Connection + Navigation

| Field                   | Value                                                                                                |
| ----------------------- | ---------------------------------------------------------------------------------------------------- |
| **Track**               | Core                                                                                                 |
| **Description**         | Connect Browser-Use to AdsPower via CDP. Verify: navigate, screenshot, DOM extraction, JS execution. |
| **Dependencies**        | C0.1                                                                                                 |
| **Effort**              | 3 SP                                                                                                 |
| **Priority**            | P0                                                                                                   |
| **Acceptance Criteria** |                                                                                                      |

- `BrowserSession` connects to AdsPower CDP URL
- `session.navigate()` loads page, waits for DOMContentLoaded
- `session.screenshot()` returns PNG buffer
- `session.get_dom()` returns accessibility tree
- `session.execute_js()` returns results
- Connection survives 5+ minutes without dropping

#### C0.3 -- Proxy Manager + IP Verification

| Field                   | Value                                                                                           |
| ----------------------- | ----------------------------------------------------------------------------------------------- |
| **Track**               | Core                                                                                            |
| **Description**         | Build proxy management module with IPRoyal residential proxy, sticky sessions, IP verification. |
| **Dependencies**        | C0.1                                                                                            |
| **Effort**              | 2 SP                                                                                            |
| **Priority**            | P0                                                                                              |
| **Acceptance Criteria** |                                                                                                 |

- `ProxyManager` manages proxy credentials and sticky session configuration
- `assign_proxy(profile_id, country="US")` binds residential proxy to AdsPower profile
- `verify_proxy()` confirms IP matches expected proxy IP
- Sticky sessions maintain same IP for 10+ minutes

#### C0.4 -- LLM Router (LiteLLM) Setup

| Field                   | Value                                                                                                         |
| ----------------------- | ------------------------------------------------------------------------------------------------------------- |
| **Track**               | Core                                                                                                          |
| **Description**         | Set up LiteLLM with 3 tiers: Claude Sonnet 4.5, GPT-4.1 mini, GPT-4.1 nano. Model router with fallback chain. |
| **Dependencies**        | None                                                                                                          |
| **Effort**              | 3 SP                                                                                                          |
| **Priority**            | P0                                                                                                            |
| **Acceptance Criteria** |                                                                                                               |

- `LLMRouter` class with `complete(task_type, messages, tools)` method
- Task routing: form_analysis -> Sonnet 4.5, field_mapping -> GPT-4.1 mini, confirmation -> GPT-4.1 nano
- Automatic fallback on 5xx errors
- Token usage logged per request (model, input_tokens, output_tokens, cost_usd)

### Legal/Compliance Track (3 SP)

#### L0.1 -- Legal Research & Disclaimer Drafting (NEW)

| Field                   | Value                                                                                                                                                                                 |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Track**               | Legal/Compliance                                                                                                                                                                      |
| **Description**         | Draft Copilot-mode legal disclaimer text. Research UETA, CFAA, platform ToS implications for Copilot mode. Draft initial ToS and Privacy Policy. Identify outside counsel for review. |
| **Dependencies**        | None                                                                                                                                                                                  |
| **Effort**              | 3 SP                                                                                                                                                                                  |
| **Priority**            | P0                                                                                                                                                                                    |
| **Acceptance Criteria** |                                                                                                                                                                                       |

- Copilot disclaimer text drafted (Layer 2 consent)
- Initial Terms of Service drafted covering Copilot mode
- Initial Privacy Policy drafted covering data processing for Copilot
- Outside legal counsel identified and engagement letter signed
- UETA "electronic agent" analysis documented (Copilot does NOT trigger UETA agent status)
- LinkedIn ToS risk assessment completed for Copilot mode

### Infrastructure Track (5 SP)

#### I0.1 -- Docker Compose Development Environment

| Field                   | Value                                                                                                                                               |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Track**               | Infrastructure                                                                                                                                      |
| **Description**         | Create `docker-compose.yml` for all services: PostgreSQL, Redis, Hatchet, Novu (self-hosted), FastAPI, Python worker. Volume mounts for hot-reload. |
| **Dependencies**        | B0.1, B0.3                                                                                                                                          |
| **Effort**              | 3 SP                                                                                                                                                |
| **Priority**            | P0                                                                                                                                                  |
| **Acceptance Criteria** |                                                                                                                                                     |

- `docker compose up` starts all services in under 90 seconds
- PostgreSQL data persists via named volume
- FastAPI auto-reloads on code changes
- Novu self-hosted instance running and accessible
- All services can communicate (app -> DB, app -> Hatchet, app -> Novu)
- `docker compose down -v` cleanly tears down

#### I0.2 -- CI/CD Pipeline Setup (NEW)

| Field                   | Value                                                                                                  |
| ----------------------- | ------------------------------------------------------------------------------------------------------ |
| **Track**               | Infrastructure                                                                                         |
| **Description**         | Set up GitHub Actions for CI: lint, type-check, unit tests on PR. Staging deployment on merge to main. |
| **Dependencies**        | None                                                                                                   |
| **Effort**              | 2 SP                                                                                                   |
| **Priority**            | P0                                                                                                     |
| **Acceptance Criteria** |                                                                                                        |

- GitHub Actions workflow runs on every PR: lint (ESLint + Ruff), type-check (tsc + mypy), unit tests
- Staging deployment triggered on merge to main
- Build artifacts cached for faster runs
- Pipeline runs in < 5 minutes

### Phase 0: Definition of Done

- [ ] Every engineer can `docker compose up` and have the full stack running
- [ ] AdsPower -> CDP -> Browser-Use pipeline proven end-to-end
- [ ] Dashboard loads with Google OAuth working
- [ ] Hatchet hello-world workflow completes
- [ ] shadcn-admin forked, branded, and rendering
- [ ] SQLAdmin accessible at `/admin`
- [ ] Novu self-hosted instance running
- [ ] CI pipeline running on PRs
- [ ] Copilot legal disclaimer drafted
- [ ] Outside legal counsel engaged

---

## 5. Phase 1: Copilot MVP Core (Weeks 3-5)

**Goal:** A user can paste a LinkedIn Easy Apply URL, watch the system fill the application in Copilot mode, review every field, and approve submission. Onboarding under 90 seconds to first application.

**Duration:** 3 weeks (compressed from 4 -- OSS integration reduces frontend work)
**Total Story Points:** 68 SP

### Frontend Track (19 SP)

#### F1.1 -- Resume Upload & Quick Review Page (3-Step Onboarding)

| Field                   | Value                                                                                                                                                                                                                                                                                               |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Track**               | Frontend                                                                                                                                                                                                                                                                                            |
| **Description**         | Build the revised 3-step onboarding: (1) Google sign-in (done in F0.2), (2) Resume upload with drag-and-drop, (3) Quick Review showing only name/email/phone/experience summary. Omit Q&A bank from onboarding -- it grows organically after first application. Target: 80-90 seconds to dashboard. |
| **Dependencies**        | F0.1, B1.1                                                                                                                                                                                                                                                                                          |
| **Effort**              | 5 SP                                                                                                                                                                                                                                                                                                |
| **Priority**            | P0                                                                                                                                                                                                                                                                                                  |
| **Acceptance Criteria** |                                                                                                                                                                                                                                                                                                     |

- 3 progress dots (not 5): Sign Up -> Resume -> Quick Review
- Drag-and-drop zone accepts PDF/DOCX up to 10MB
- Speed promise text: "You'll be applying to your first job in about 2 minutes"
- Quick Review shows ONLY: name, email, phone, location, collapsed experience list, skills summary
- "Edit details" defers to Settings (NOT inline editing during onboarding)
- Single CTA: "Looks Good -- Let's Go" (implies arrival, not continuation)
- Everything else (Q&A bank, LinkedIn connection) deferred to post-first-app prompts
- Total onboarding time measured and tracked (<90 seconds target)

#### F1.2 -- Apply Page (URL Input + Job Preview + First-Time State)

| Field                   | Value                                                                                                                                                                                                |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Track**               | Frontend                                                                                                                                                                                             |
| **Description**         | Build `/apply` page with first-time user state ("Ready to apply to your first job!"), URL input with paste detection, job preview card, Copilot mode indicator, and sample job links for cold-start. |
| **Dependencies**        | F0.1, B1.3                                                                                                                                                                                           |
| **Effort**              | 5 SP                                                                                                                                                                                                 |
| **Priority**            | P0                                                                                                                                                                                                   |
| **Acceptance Criteria** |                                                                                                                                                                                                      |

- First-time state: sparkle icon, "Paste a job URL below" prompt, sample job links (LinkedIn, Greenhouse, Lever)
- URL input with paste detection and URL validation
- On valid URL paste: platform badge appears (LinkedIn icon + "Easy Apply")
- Job preview card: title, company, location, posted date
- Copilot mode indicator: steering wheel icon + "Copilot mode -- you review everything before submit"
- "Start Application" button disabled until URL valid + resume saved
- Clicking "Start" creates task via API and transitions to progress view

#### F1.3 -- WebSocket Connection Manager + Real-Time Progress

| Field                   | Value                                                                                                                                                                      |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Track**               | Frontend                                                                                                                                                                   |
| **Description**         | Build `useTaskWebSocket` hook and the live progress component. Vertical step timeline, current action, confidence indicators, elapsed time. Combined from old F1.4 + F1.5. |
| **Dependencies**        | F0.1, B1.4                                                                                                                                                                 |
| **Effort**              | 5 SP                                                                                                                                                                       |
| **Priority**            | P0                                                                                                                                                                         |
| **Acceptance Criteria** |                                                                                                                                                                            |

- `useTaskWebSocket(taskId)` connects to `wss://api/ws/tasks/{taskId}`
- Auto-reconnects with exponential backoff (1s, 2s, 4s, max 30s)
- Connection status indicator: connected (green), reconnecting (yellow), disconnected (red)
- Vertical timeline: Queued -> Starting -> Navigating -> Analyzing -> Filling -> Submitting -> Verifying -> Done
- Current step shows action description: "Filling 'Years of Experience' field..."
- Each completed step shows checkmark and duration
- Overall progress bar (0-100%) + elapsed time counter
- On completion: success card with confirmation screenshot thumbnail

#### F1.4 -- Screening Q&A Bank (RJSF-Powered, Post-First-App) (CHANGED)

| Field                   | Value                                                                                                                                                                                                                                         |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Track**               | Frontend                                                                                                                                                                                                                                      |
| **Description**         | Build Q&A bank using react-jsonschema-form for dynamic question rendering. Questions stored as JSON Schema in backend. Initially seeded from resume parsing + first application. Presented as a post-first-app prompt, NOT during onboarding. |
| **Dependencies**        | F0.1, B1.2                                                                                                                                                                                                                                    |
| **Effort**              | 4 SP                                                                                                                                                                                                                                          |
| **Priority**            | P0                                                                                                                                                                                                                                            |
| **Acceptance Criteria** |                                                                                                                                                                                                                                               |

- RJSF renders questions dynamically from JSON Schema fetched from API
- Post-first-app prompt: "Save time on your next application -- save your answers"
- Pre-filled with answers extracted from resume parsing (medium confidence) and first app (high confidence)
- Each answer has toggle: "Always use" vs "Ask each time"
- New questions added automatically as they appear in applications
- Q&A bank accessible via `/settings/answers` for manual editing
- "Save All" and "Skip -- I'll do this later" buttons

### Backend Track (18 SP)

#### B1.1 -- Resume Upload + LLM Parsing API

| Field                   | Value                                                                                                                                                                    |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Track**               | Backend                                                                                                                                                                  |
| **Description**         | Build resume upload, LLM-powered parsing, and CRUD endpoints. LLM also extracts common screening question answers (years of experience, education level) during parsing. |
| **Dependencies**        | B0.1, B0.2, C0.4                                                                                                                                                         |
| **Effort**              | 5 SP                                                                                                                                                                     |
| **Priority**            | P0                                                                                                                                                                       |
| **Acceptance Criteria** |                                                                                                                                                                          |

- `POST /api/v1/resumes/upload` accepts multipart PDF/DOCX up to 10MB
- Returns 202 with `resume_id`, processes async
- LLM extracts: standard fields + inferred screening answers (years of experience, education level) with "resume-inferred" source tag
- `GET/PUT /api/v1/resumes/{id}` for retrieval and user corrections
- Raw file stored encrypted (AES-256)

#### B1.2 -- Screening Question Bank API (JSON Schema-Based) (CHANGED)

| Field                   | Value                                                                                                                                                                                 |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Track**               | Backend                                                                                                                                                                               |
| **Description**         | Build CRUD endpoints for screening questions. Questions stored as JSON Schema for RJSF rendering. Supports organic growth: new questions auto-added when encountered in applications. |
| **Dependencies**        | B0.1, B0.2                                                                                                                                                                            |
| **Effort**              | 3 SP                                                                                                                                                                                  |
| **Priority**            | P0                                                                                                                                                                                    |
| **Acceptance Criteria** |                                                                                                                                                                                       |

- `GET /api/v1/questions` returns JSON Schema for dynamic form rendering
- `POST /api/v1/answers` saves user answers with `{question_id, answer, always_use, source}`
- Source enum: `user_input`, `resume_inferred`, `application_learned`
- `POST /api/v1/questions/discover` auto-adds new questions from application encounters
- Questions categorized: Work Authorization, Experience, Preferences, Logistics

#### B1.3 -- Task Creation + Job Application Workflow

| Field                   | Value                                                                                                             |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------- |
| **Track**               | Backend                                                                                                           |
| **Description**         | Build task creation endpoint and Hatchet `JobApplicationWorkflow` with Copilot-mode pause-before-submit behavior. |
| **Dependencies**        | B0.1, B0.2, B0.3, C0.1, C0.2                                                                                      |
| **Effort**              | 8 SP                                                                                                              |
| **Priority**            | P0                                                                                                                |
| **Acceptance Criteria** |                                                                                                                   |

- `POST /api/v1/tasks` accepts `{job_url, resume_id, mode: "copilot"}`, returns `{task_id, status: "CREATED"}`
- Hatchet workflow: StartBrowser -> Navigate -> AnalyzePage -> FillForm -> **PauseForReview** -> Submit -> VerifySubmission -> Cleanup
- **PauseForReview** step: in Copilot mode, sends field data to frontend via WebSocket, waits for user approval via Hatchet durable event
- Each step updates task status in DB and publishes WebSocket event
- `GET /api/v1/tasks/{id}` and `GET /api/v1/tasks` for retrieval and listing

#### B1.4 -- WebSocket Server for Real-Time Updates

| Field                   | Value                                                                                                     |
| ----------------------- | --------------------------------------------------------------------------------------------------------- |
| **Track**               | Backend                                                                                                   |
| **Description**         | Build WebSocket endpoint with Redis Pub/Sub relay. Supports task progress streaming to connected clients. |
| **Dependencies**        | B0.2, I0.1                                                                                                |
| **Effort**              | 5 SP                                                                                                      |
| **Priority**            | P0                                                                                                        |
| **Acceptance Criteria** |                                                                                                           |

- WebSocket endpoint at `wss://api/ws/tasks/{task_id}` with JWT auth
- Messages: `state_change`, `progress`, `human_needed`, `field_review` (Copilot), `completed`, `error`
- `field_review` message includes all field values with confidence scores for Copilot approval screen
- Heartbeat ping/pong every 30s

#### B1.5 -- Task Event Logging + Audit Trail Service (ENHANCED)

| Field                   | Value                                                                                                                                                                       |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Track**               | Backend                                                                                                                                                                     |
| **Description**         | Build event logging service for both Copilot audit and future Autopilot GDPR compliance. Records every state transition, field fill, LLM decision with explainability data. |
| **Dependencies**        | B0.1                                                                                                                                                                        |
| **Effort**              | 2 SP                                                                                                                                                                        |
| **Priority**            | P0                                                                                                                                                                          |
| **Acceptance Criteria** |                                                                                                                                                                             |

- `TaskEventService.log(task_id, event_type, data)` inserts into `task_events`
- Events include: state_change, field_filled (with source and confidence), screenshot_taken, llm_decision (with model, reasoning)
- `GET /api/v1/tasks/{id}/events` returns paginated event history
- PII in event_data redacted in API responses (field values replaced with `***` unless requesting user is the task owner)
- GDPR-ready: includes `llm_model_used`, `reasoning`, `confidence_score` per field decision

### Core Track (25 SP)

#### C1.1 -- Resume Parser (LLM-Powered)

| Field                   | Value                                                                                                                                   |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| **Track**               | Core                                                                                                                                    |
| **Description**         | Build resume parsing with pdfplumber + python-docx + LLM structured extraction. Also extract inferred screening answers during parsing. |
| **Dependencies**        | C0.4                                                                                                                                    |
| **Effort**              | 5 SP                                                                                                                                    |
| **Priority**            | P0                                                                                                                                      |
| **Acceptance Criteria** |                                                                                                                                         |

- `parse_resume(file_bytes, file_type) -> ResumeData` returns structured data
- Also returns `inferred_answers[]` with `{question, answer, confidence, source: "resume-inferred"}`
- Processing time < 15 seconds for typical 2-page resume

#### C1.2 -- LinkedIn Platform Adapter (DOM Selectors)

| Field                   | Value                                                                            |
| ----------------------- | -------------------------------------------------------------------------------- |
| **Track**               | Core                                                                             |
| **Description**         | Build LinkedIn Easy Apply adapter. Multi-step modal flow with human-like delays. |
| **Dependencies**        | C0.2                                                                             |
| **Effort**              | 8 SP                                                                             |
| **Priority**            | P0                                                                               |
| **Acceptance Criteria** |                                                                                  |

- `LinkedInEasyApplyAdapter` handles full Easy Apply flow
- All actions have random delays: 2-5s between fields, 3-7s between pages
- Detects "Already Applied" and CAPTCHA states
- In Copilot mode: pauses before final submit, sends field data for review

#### C1.3 -- Form Analyzer (LLM-Powered Field Mapping)

| Field                   | Value                                                                            |
| ----------------------- | -------------------------------------------------------------------------------- |
| **Track**               | Core                                                                             |
| **Description**         | LLM-powered form analysis: DOM snapshot -> field mapping with confidence scores. |
| **Dependencies**        | C0.2, C0.4                                                                       |
| **Effort**              | 5 SP                                                                             |
| **Priority**            | P0                                                                               |
| **Acceptance Criteria** |                                                                                  |

- `analyze_form(dom_snapshot, user_profile, screening_answers) -> FormFieldMapping[]`
- Each mapping: `{selector, field_label, value, input_type, confidence, source}`
- Source enum: `user_profile`, `qa_bank`, `llm_generated`, `resume_inferred`
- Confidence thresholds: >= 0.9 auto-fill, 0.7-0.9 auto-fill with warning, < 0.7 flag for review

#### C1.4 -- Form Filler Engine

| Field                   | Value                                                                                               |
| ----------------------- | --------------------------------------------------------------------------------------------------- |
| **Track**               | Core                                                                                                |
| **Description**         | Execution engine: takes FormFieldMapping[] and fills actual form in browser with human-like typing. |
| **Dependencies**        | C0.2, C1.3                                                                                          |
| **Effort**              | 5 SP                                                                                                |
| **Priority**            | P0                                                                                                  |
| **Acceptance Criteria** |                                                                                                     |

- Handles: text inputs, React synthetic events, custom dropdowns, file uploads, radio buttons
- Random delay 1-3s between fields
- Returns `FillResult` with per-field success/failure status

#### C1.5 -- Screenshot & Artifact Manager

| Field                   | Value                                                                     |
| ----------------------- | ------------------------------------------------------------------------- |
| **Track**               | Core                                                                      |
| **Description**         | Capture screenshots at key moments for audit trail and user verification. |
| **Dependencies**        | C0.2                                                                      |
| **Effort**              | 2 SP                                                                      |
| **Priority**            | P1                                                                        |
| **Acceptance Criteria** |                                                                           |

- Screenshots at: pre-fill, post-fill, pre-submit, post-submit, on-error
- Stored encrypted (AES-256) with metadata in task_events table
- Max 10 screenshots per task

### Legal/Compliance Track (2 SP)

#### L1.1 -- Privacy Policy v1.0 + ToS v1.0 (Copilot) (NEW)

| Field                   | Value                                                                                                             |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------- |
| **Track**               | Legal/Compliance                                                                                                  |
| **Description**         | Finalize Privacy Policy and Terms of Service covering Copilot mode. Submit to outside counsel for initial review. |
| **Dependencies**        | L0.1                                                                                                              |
| **Effort**              | 2 SP                                                                                                              |
| **Priority**            | P0                                                                                                                |
| **Acceptance Criteria** |                                                                                                                   |

- Privacy Policy covers: data collection, LLM processing, screenshot storage, sub-processors (Anthropic, OpenAI), retention periods
- Terms of Service covers: Copilot mode liability, platform ToS risk, user responsibilities
- Documents submitted to outside counsel with 2-week review timeline
- Placeholder pages at `/legal/privacy` and `/legal/terms`

### Phase 1: Definition of Done

- [ ] New user completes onboarding in < 90 seconds (Google login -> resume upload -> quick review)
- [ ] User pastes LinkedIn URL, watches AI fill form in real time via WebSocket
- [ ] Copilot review screen shows all fields with confidence scores; user approves or edits
- [ ] Application submitted on user approval; confirmation screenshot captured
- [ ] Q&A bank prompt appears after first application with pre-filled answers
- [ ] All events logged in audit trail with LLM decision explainability
- [ ] Privacy Policy and ToS v1.0 submitted for legal review

---

## 6. Phase 2: Dashboard, UX & Human-in-the-Loop (Weeks 6-8)

**Goal:** Full Copilot dashboard experience with application tracking, settings, notifications (Novu), noVNC CAPTCHA handling, kill switch, and error recovery.

**Duration:** 3 weeks
**Total Story Points:** 62 SP

### Frontend Track (21 SP)

#### F2.1 -- Application Tracking Dashboard (Tremor-Powered) (CHANGED)

| Field                   | Value                                                                                                                                                 |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Track**               | Frontend                                                                                                                                              |
| **Description**         | Build `/dashboard` home page using shadcn-admin data table + Tremor chart components. Summary stat cards, filterable application table, detail modal. |
| **Dependencies**        | F0.1, B2.1                                                                                                                                            |
| **Effort**              | 5 SP                                                                                                                                                  |
| **Priority**            | P0                                                                                                                                                    |
| **Acceptance Criteria** |                                                                                                                                                       |

- Tremor KPI cards: Total Applied, Success Rate, Pending, Failed
- shadcn-admin data table with TanStack Table: Job Title, Company, Platform, Status (badge), Mode (Copilot/Autopilot icon), Submitted At, Actions
- Filters: status, platform, mode, date range
- Click row to expand: screenshot thumbnails, event timeline, AI decisions with confidence
- Application detail modal with field-by-field breakdown, source column, confidence indicators

#### F2.2 -- Settings Page (Profile + Preferences + Mode Default)

| Field                   | Value                                                                                                                                                               |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Track**               | Frontend                                                                                                                                                            |
| **Description**         | Build `/settings` with tabs: Profile, Preferences, Automation (mode default + future Autopilot settings), Account. Mode selection UI prepared but Autopilot locked. |
| **Dependencies**        | F0.1, B2.2                                                                                                                                                          |
| **Effort**              | 5 SP                                                                                                                                                                |
| **Priority**            | P1                                                                                                                                                                  |
| **Acceptance Criteria** |                                                                                                                                                                     |

- Profile tab: editable resume fields
- Preferences tab: notification toggles, daily limit slider
- Automation tab: shows Copilot as current mode; Autopilot card shows locked state with progress toward unlock ("2 of 3 successful applications")
- Account tab: plan display, "Export My Data" (GDPR Article 20), "Delete Account"

#### F2.3 -- Novu Notification Integration (CHANGED: was custom build)

| Field                   | Value                                                                                                                                                    |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Track**               | Frontend                                                                                                                                                 |
| **Description**         | Integrate Novu `@novu/react` inbox component into dashboard header. Replace custom notification system with Novu. Configure Sonner for transient toasts. |
| **Dependencies**        | F0.1, B2.3                                                                                                                                               |
| **Effort**              | 3 SP (reduced from 3+3 SP -- Novu replaces custom build)                                                                                                 |
| **Priority**            | P1                                                                                                                                                       |
| **Acceptance Criteria** |                                                                                                                                                          |

- Novu `<Inbox>` component in header bell icon with unread count badge
- Clicking bell opens Novu notification dropdown with recent notifications
- Sonner toasts for real-time events: task_completed, task_failed, human_needed
- "Mark all as read" button
- Notification preferences sync with Novu subscriber preferences

#### F2.4 -- noVNC Viewer Component (react-vnc) (CHANGED: was custom wrapper)

| Field                   | Value                                                                                                |
| ----------------------- | ---------------------------------------------------------------------------------------------------- |
| **Track**               | Frontend                                                                                             |
| **Description**         | Build CAPTCHA handling UI using react-vnc `<VncScreen>` component. Opens when human takeover needed. |
| **Dependencies**        | F1.3, B2.4                                                                                           |
| **Effort**              | 3 SP (reduced from 5 SP -- react-vnc handles noVNC lifecycle)                                        |
| **Priority**            | P0                                                                                                   |
| **Acceptance Criteria** |                                                                                                      |

- `<VncScreen>` component configured with proper dimensions, scaling, and quality
- Opens automatically on `human_needed` WebSocket event
- Modal contains: reason text, VNC canvas, countdown timer (5 min), controls
- "Resume Automation" sends `takeover_complete` event
- "Cancel Application" cancels the task

#### F2.5 -- Kill Switch + Emergency Stop (ENHANCED)

| Field                   | Value                                                                                                                                               |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Track**               | Frontend                                                                                                                                            |
| **Description**         | Persistent "Stop All" button in header during active automation. Enhanced with <2 second requirement per legal doc. Keyboard shortcut Ctrl+Shift+K. |
| **Dependencies**        | F0.1, B2.5                                                                                                                                          |
| **Effort**              | 2 SP                                                                                                                                                |
| **Priority**            | P0                                                                                                                                                  |
| **Acceptance Criteria** |                                                                                                                                                     |

- Red "Stop All" button in header when any task is active
- < 2 second response time from click to all tasks cancelled
- Keyboard shortcut Ctrl+Shift+K
- Works even if server is temporarily unreachable (client-side enforcement queues the stop)
- Post-stop toast: "All automation stopped. X applications submitted. Y cancelled."

#### F2.6 -- Error Recovery UI

| Field                   | Value                                                      |
| ----------------------- | ---------------------------------------------------------- |
| **Track**               | Frontend                                                   |
| **Description**         | Error states and recovery flows for all failure scenarios. |
| **Dependencies**        | F2.1                                                       |
| **Effort**              | 3 SP                                                       |
| **Priority**            | P0                                                         |
| **Acceptance Criteria** |                                                            |

- Failed task shows: error type, message, last screenshot, actionable guidance
- "Retry" button for retryable errors
- Account restriction error: prominent warning with automation auto-stop

### Backend Track (20 SP)

#### B2.1 -- Task List + Filtering + Stats API

| Field                   | Value                                                          |
| ----------------------- | -------------------------------------------------------------- |
| **Track**               | Backend                                                        |
| **Description**         | Paginated task list with filters and aggregate stats endpoint. |
| **Dependencies**        | B0.1, B0.2                                                     |
| **Effort**              | 3 SP                                                           |
| **Priority**            | P0                                                             |
| **Acceptance Criteria** |                                                                |

- `GET /api/v1/tasks` with status, platform, mode, date range filters
- `GET /api/v1/tasks/stats` returns totals, success rate, avg duration

#### B2.2 -- User Preferences API

| Field                   | Value                                                                                                             |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------- |
| **Track**               | Backend                                                                                                           |
| **Description**         | Build preferences API with mode selection support. Autopilot preferences stored but not actionable until Phase 4. |
| **Dependencies**        | B0.1, B0.2                                                                                                        |
| **Effort**              | 2 SP                                                                                                              |
| **Priority**            | P1                                                                                                                |
| **Acceptance Criteria** |                                                                                                                   |

- `GET/PUT /api/v1/users/preferences` with JSONB storage
- Includes: daily_limit, notification_channels, default_mode ("copilot" only for now), autopilot_settings (schema ready, locked)

#### B2.3 -- Novu Integration Service (CHANGED: was custom notification service)

| Field                   | Value                                                                                                                      |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| **Track**               | Backend                                                                                                                    |
| **Description**         | Integrate Novu Python SDK for multi-channel notifications. Configure workflows for task events. Self-hosted Novu instance. |
| **Dependencies**        | B0.2, I0.1                                                                                                                 |
| **Effort**              | 3 SP (reduced from 3 SP custom -- similar effort but much more capability)                                                 |
| **Priority**            | P1                                                                                                                         |
| **Acceptance Criteria** |                                                                                                                            |

- Novu Python SDK triggers notifications on: task_completed, task_failed, human_needed
- In-app channel via Novu WebSocket
- Email channel via Novu + transactional email provider
- Subscriber preferences managed through Novu
- Notification templates configured in Novu dashboard

#### B2.4 -- noVNC + CAPTCHA Integration Service

| Field                   | Value                                                                                                     |
| ----------------------- | --------------------------------------------------------------------------------------------------------- |
| **Track**               | Backend                                                                                                   |
| **Description**         | noVNC provisioning for CAPTCHA handling. Start/stop VNC, websockify relay, Hatchet workflow pause/resume. |
| **Dependencies**        | B0.3, B1.4                                                                                                |
| **Effort**              | 5 SP                                                                                                      |
| **Priority**            | P0                                                                                                        |
| **Acceptance Criteria** |                                                                                                           |

- `start_vnc_session(profile_id) -> vnc_url` with Xvfb + x11vnc + websockify
- Hatchet `WaitForCaptcha` durable task pauses workflow
- VNC session timeout: configurable (default 5 min)
- On human resolution: workflow resumes from exact pause point

#### B2.5 -- Emergency Stop API + Rate Limiting

| Field                   | Value                                          |
| ----------------------- | ---------------------------------------------- |
| **Track**               | Backend                                        |
| **Description**         | Kill switch API and multi-level rate limiting. |
| **Dependencies**        | B0.2, B0.3, B1.3                               |
| **Effort**              | 4 SP                                           |
| **Priority**            | P0                                             |
| **Acceptance Criteria** |                                                |

- `DELETE /api/v1/tasks/active` cancels all active tasks
- Response time < 2 seconds (measured from API receipt to all Hatchet cancellations sent)
- API rate limiting: 100 req/min per user
- Task rate limiting: daily limit per user tier
- Platform rate limiting: LinkedIn capped at 25/day (Copilot mode)
- Rate limit headers in responses

### Core Track (17 SP)

#### C2.1 -- Enhanced Screening Question Matching

| Field            | Value                                                                  |
| ---------------- | ---------------------------------------------------------------------- |
| **Track**        | Core                                                                   |
| **Description**  | Semantic similarity matching for screening questions against Q&A bank. |
| **Dependencies** | C1.3                                                                   |
| **Effort**       | 3 SP                                                                   |
| **Priority**     | P0                                                                     |

#### C2.2 -- LinkedIn Login Session Manager

| Field            | Value                                                                                                |
| ---------------- | ---------------------------------------------------------------------------------------------------- |
| **Track**        | Core                                                                                                 |
| **Description**  | LinkedIn session management in AdsPower profiles. Cookie injection, health checks, expiry detection. |
| **Dependencies** | C0.1, C0.2                                                                                           |
| **Effort**       | 3 SP                                                                                                 |
| **Priority**     | P0                                                                                                   |

#### C2.3 -- Anti-Detection: Human-Like Behavior Module

| Field            | Value                                                                             |
| ---------------- | --------------------------------------------------------------------------------- |
| **Track**        | Core                                                                              |
| **Description**  | Human behavior simulation: random delays, Bezier mouse movement, scroll behavior. |
| **Dependencies** | C0.2                                                                              |
| **Effort**       | 3 SP                                                                              |
| **Priority**     | P0                                                                                |

#### C2.4 -- CAPTCHA Detector Module

| Field            | Value                                                                                             |
| ---------------- | ------------------------------------------------------------------------------------------------- |
| **Track**        | Core                                                                                              |
| **Description**  | Multi-strategy CAPTCHA detection: DOM patterns, URL redirect, page text, LLM screenshot fallback. |
| **Dependencies** | C0.2, C0.4                                                                                        |
| **Effort**       | 3 SP                                                                                              |
| **Priority**     | P0                                                                                                |

#### C2.5 -- Error Recovery Engine

| Field            | Value                                                                         |
| ---------------- | ----------------------------------------------------------------------------- |
| **Track**        | Core                                                                          |
| **Description**  | Handle top 10 failure scenarios with automatic recovery and human escalation. |
| **Dependencies** | C0.2, C1.2                                                                    |
| **Effort**       | 5 SP                                                                          |
| **Priority**     | P0                                                                            |

### Legal/Compliance Track (4 SP)

#### L2.1 -- Outside Counsel Review (Copilot ToS + Privacy Policy) (NEW)

| Field                   | Value                                                                                                                     |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| **Track**               | Legal/Compliance                                                                                                          |
| **Description**         | Review cycle with outside counsel on Copilot-mode ToS and Privacy Policy. Incorporate feedback. Finalize for beta launch. |
| **Dependencies**        | L1.1                                                                                                                      |
| **Effort**              | 2 SP                                                                                                                      |
| **Priority**            | P0                                                                                                                        |
| **Acceptance Criteria** |                                                                                                                           |

- Counsel feedback received and incorporated
- Final ToS v1.0 and Privacy Policy v1.0 approved
- Documents published at `/legal/privacy` and `/legal/terms`
- Clickwrap acceptance flow integrated into registration

#### L2.2 -- Autopilot Legal Framework Research (NEW)

| Field                   | Value                                                                                                                                                                            |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Track**               | Legal/Compliance                                                                                                                                                                 |
| **Description**         | Draft Autopilot-specific legal framework: UETA electronic agent language, GDPR Article 22 compliance plan, progressive consent architecture (Layers 3-5), enhanced ToS sections. |
| **Dependencies**        | L0.1                                                                                                                                                                             |
| **Effort**              | 2 SP                                                                                                                                                                             |
| **Priority**            | P1                                                                                                                                                                               |
| **Acceptance Criteria** |                                                                                                                                                                                  |

- Autopilot ToS sections drafted (Section X from legal doc 06)
- GDPR Article 22 automated decision-making disclosure drafted (Section Y from legal doc 06)
- 5-layer progressive consent architecture documented
- Autopilot consent form text drafted (8 checkboxes + typed confirmation)
- Insurance broker consultation scheduled

### Phase 2: Definition of Done

- [ ] Full Copilot dashboard with tracking table, filters, detail views
- [ ] Novu notifications working (in-app + email)
- [ ] CAPTCHA detected -> noVNC opens -> user solves -> automation resumes
- [ ] Kill switch stops all tasks in < 2 seconds
- [ ] Error recovery handles top 10 failure modes
- [ ] Settings page with Autopilot "locked" indicator showing progress
- [ ] ToS v1.0 and Privacy Policy v1.0 finalized by counsel

---

## 7. Phase 3: QA, Security & Copilot Beta (Weeks 9-10)

**Goal:** Security audit passed. Comprehensive tests. 10 Copilot beta users onboarded. Copilot is production-ready.

**Duration:** 2 weeks (compressed from 1 week -- spreading QA work)
**Total Story Points:** 35 SP

### Frontend Track (7 SP)

#### F3.1 -- E2E Testing Suite (Playwright)

| Field                   | Value                                                                      |
| ----------------------- | -------------------------------------------------------------------------- |
| **Track**               | Frontend                                                                   |
| **Description**         | Playwright E2E tests covering full Copilot user journey. WebSocket mocked. |
| **Dependencies**        | All F-series tasks                                                         |
| **Effort**              | 5 SP                                                                       |
| **Priority**            | P0                                                                         |
| **Acceptance Criteria** |                                                                            |

- Tests cover: onboarding, resume upload, apply flow, dashboard, settings, notifications
- WebSocket messages mocked for deterministic testing
- Tests run in CI in < 5 minutes
- 80% coverage on critical paths

#### F3.2 -- Security Hardening (Frontend)

| Field            | Value                                                                                  |
| ---------------- | -------------------------------------------------------------------------------------- |
| **Track**        | Frontend                                                                               |
| **Description**  | Audit and harden frontend security: no secrets in bundle, XSS prevention, CSP headers. |
| **Dependencies** | All F-series tasks                                                                     |
| **Effort**       | 2 SP                                                                                   |
| **Priority**     | P0                                                                                     |

### Backend Track (13 SP)

#### B3.1 -- Security Audit & Hardening

| Field            | Value                                                                                    |
| ---------------- | ---------------------------------------------------------------------------------------- |
| **Track**        | Backend                                                                                  |
| **Description**  | OWASP Top 10 audit. SQL injection, auth bypass, authorization checks, secret management. |
| **Dependencies** | All B-series tasks                                                                       |
| **Effort**       | 5 SP                                                                                     |
| **Priority**     | P0                                                                                       |

#### B3.2 -- Integration Test Suite

| Field            | Value                                                                         |
| ---------------- | ----------------------------------------------------------------------------- |
| **Track**        | Backend                                                                       |
| **Description**  | Integration tests: API endpoints, Hatchet workflow, WebSocket, rate limiting. |
| **Dependencies** | All B-series tasks                                                            |
| **Effort**       | 5 SP                                                                          |
| **Priority**     | P0                                                                            |

#### B3.3 -- Monitoring & Alerting Setup

| Field            | Value                                                                   |
| ---------------- | ----------------------------------------------------------------------- |
| **Track**        | Backend                                                                 |
| **Description**  | Sentry, Prometheus metrics, Grafana dashboards, Slack/PagerDuty alerts. |
| **Dependencies** | I0.1                                                                    |
| **Effort**       | 3 SP                                                                    |
| **Priority**     | P0                                                                      |

### Core Track (8 SP)

#### C3.1 -- LinkedIn Easy Apply Test Suite

| Field            | Value                                                                                   |
| ---------------- | --------------------------------------------------------------------------------------- |
| **Track**        | Core                                                                                    |
| **Description**  | Mock LinkedIn pages for testing form detection, filling, navigation, CAPTCHA detection. |
| **Dependencies** | C1.2, C1.3, C1.4                                                                        |
| **Effort**       | 5 SP                                                                                    |
| **Priority**     | P0                                                                                      |

#### C3.2 -- Performance & Stability Testing (50+ runs)

| Field            | Value                                                                                     |
| ---------------- | ----------------------------------------------------------------------------------------- |
| **Track**        | Core                                                                                      |
| **Description**  | 50+ test runs against LinkedIn. Target >= 80% success rate. Document top 5 failure modes. |
| **Dependencies** | C1.2                                                                                      |
| **Effort**       | 3 SP                                                                                      |
| **Priority**     | P0                                                                                        |

### Legal/Compliance Track (3 SP)

#### L3.1 -- Beta User Agreement (NEW)

| Field            | Value                                                                                                     |
| ---------------- | --------------------------------------------------------------------------------------------------------- |
| **Track**        | Legal/Compliance                                                                                          |
| **Description**  | Draft beta user agreement covering: beta status, known limitations, data handling, feedback expectations. |
| **Dependencies** | L2.1                                                                                                      |
| **Effort**       | 1 SP                                                                                                      |
| **Priority**     | P0                                                                                                        |

#### L3.2 -- Data Retention Policy Implementation (NEW)

| Field            | Value                                                                                                                                           |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| **Track**        | Legal/Compliance                                                                                                                                |
| **Description**  | Implement data retention schedules: audit records (2 years), screenshots (30-90 days configurable), LLM logs (90 days). Automated cleanup jobs. |
| **Dependencies** | B1.5                                                                                                                                            |
| **Effort**       | 2 SP                                                                                                                                            |
| **Priority**     | P0                                                                                                                                              |

### Infrastructure Track (4 SP)

#### I3.1 -- Production Deployment + Staging Environment

| Field            | Value                                                                       |
| ---------------- | --------------------------------------------------------------------------- |
| **Track**        | Infrastructure                                                              |
| **Description**  | Production and staging environment setup. SSL, domain, monitoring, backups. |
| **Dependencies** | I0.1                                                                        |
| **Effort**       | 4 SP                                                                        |
| **Priority**     | P0                                                                          |

### Phase 3: Definition of Done

- [ ] Security audit passed (OWASP Top 10 checklist complete)
- [ ] 0 high/critical dependency vulnerabilities
- [ ] 50+ LinkedIn test runs with >= 80% success rate
- [ ] 10 beta users onboarded and completing applications
- [ ] Sentry + Grafana dashboards active with real metrics
- [ ] Production environment deployed and stable 48 hours
- [ ] Beta user agreement signed by all participants

---

## 8. Phase 4: Autopilot Foundation (Weeks 11-14)

**Goal:** Build the core Autopilot engine: progressive trust gate, quality gates, circuit breaker, consent system, per-session authorization, auto-submit workflow. This is the major new work enabled by the dual-mode architecture.

**Duration:** 4 weeks
**Total Story Points:** 72 SP

### Frontend Track (22 SP)

#### F4.1 -- "Graduate to Autopilot" Unlock Modal (NEW)

| Field                   | Value                                                                                                                                                                                                          |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Track**               | Frontend                                                                                                                                                                                                       |
| **Description**         | Build the Autopilot unlock experience. After 3 successful Copilot apps with zero critical overrides, present the mode selection modal with Copilot vs Autopilot comparison, confidence stats, and mode choice. |
| **Dependencies**        | F2.2, B4.1                                                                                                                                                                                                     |
| **Effort**              | 3 SP                                                                                                                                                                                                           |
| **Priority**            | P0                                                                                                                                                                                                             |
| **Acceptance Criteria** |                                                                                                                                                                                                                |

- Triggered when user completes 3rd successful Copilot app with high confidence
- Modal shows: user stats (avg confidence, error count), mode comparison (steering wheel vs gauge icons)
- Copilot: blue (#1E40AF), outlined badge, "You review every app"
- Autopilot: purple (#7C3AED), filled badge, "AI submits, you review summary"
- "Keep Using Copilot" and "Try Autopilot" buttons
- "You can switch anytime, even per-application" reassurance text

#### F4.2 -- Autopilot Consent Form (5-Layer Consent) (NEW)

| Field                   | Value                                                                                                                                                                         |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Track**               | Frontend                                                                                                                                                                      |
| **Description**         | Build the enhanced informed consent modal for Autopilot activation. 8 checkboxes (none pre-checked) + typed confirmation phrase. This is Layer 3 of the consent architecture. |
| **Dependencies**        | F4.1, B4.2, L4.1                                                                                                                                                              |
| **Effort**              | 5 SP                                                                                                                                                                          |
| **Priority**            | P0                                                                                                                                                                            |
| **Acceptance Criteria** |                                                                                                                                                                               |

- Full-screen modal that cannot be dismissed without Accept or Cancel
- 8 consent checkboxes matching legal doc 06 Section 7.3 (none pre-checked)
- Typed confirmation: "I authorize WeKruit to submit applications on my behalf"
- Age verification: "I am at least 18 years of age"
- Links to Autopilot ToS section and Privacy Policy automated decision-making section
- Consent recorded with: version, timestamp, IP address, user agent
- Consent version tracked; re-consent required on any update
- "Cancel" returns to Copilot; "Activate Autopilot" proceeds to per-session setup

#### F4.3 -- Per-Session Autopilot Authorization (NEW)

| Field                   | Value                                                                                                                                                                              |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Track**               | Frontend                                                                                                                                                                           |
| **Description**         | Build the per-session setup flow for each Autopilot session. User confirms: platforms, max applications, time limit, exclusion list, salary range bounds. This is Layer 4 consent. |
| **Dependencies**        | F4.2, B4.3                                                                                                                                                                         |
| **Effort**              | 3 SP                                                                                                                                                                               |
| **Priority**            | P0                                                                                                                                                                                 |
| **Acceptance Criteria** |                                                                                                                                                                                    |

- Session setup form with: platform selection, max apps per session (default 15), session time limit (default 2 hours), company exclusion list
- "Remember my settings" checkbox for returning sessions
- Confirmation button: "Start Autopilot Session (X applications, Y platforms)"
- Session parameters stored and enforced by backend
- Session ends automatically when limit reached or time expires

#### F4.4 -- Mode Selection Toggle (Global + Per-Application) (NEW)

| Field                   | Value                                                                                                                                                  |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Track**               | Frontend                                                                                                                                               |
| **Description**         | Add mode toggle in Settings (global default) and in the Apply flow (per-application override). Visual consistency: blue = Copilot, purple = Autopilot. |
| **Dependencies**        | F2.2, B4.1                                                                                                                                             |
| **Effort**              | 3 SP                                                                                                                                                   |
| **Priority**            | P0                                                                                                                                                     |
| **Acceptance Criteria** |                                                                                                                                                        |

- Settings > Automation: radio cards for Copilot/Autopilot with icon + description
- Autopilot settings visible when selected: confidence threshold slider (70-100%, default 85%), consecutive failure limit (default 3)
- Apply page: "Mode for this application" toggle
- "Currently: Copilot (your global default)" or "Override to Autopilot" text
- Confidence threshold shows personalized data: "Based on your last 20 apps: at 85%, 18 would auto-submit"

#### F4.5 -- Batch Progress View (Autopilot Dashboard) (NEW)

| Field                   | Value                                                                                                                                |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| **Track**               | Frontend                                                                                                                             |
| **Description**         | Build the Autopilot batch progress dashboard. Replaces individual card view with batch progress bar, live feed, and aggregate stats. |
| **Dependencies**        | F2.1, B4.3                                                                                                                           |
| **Effort**              | 5 SP                                                                                                                                 |
| **Priority**            | P0                                                                                                                                   |
| **Acceptance Criteria** |                                                                                                                                      |

- Batch progress bar: "10 applications: 7 submitted, 2 in progress, 1 queued" with percentage
- "Pause All" / "Resume All" button in header
- Live feed: chronological list showing each app as single row with status, confidence, duration, "View Summary"
- Compact/expanded toggle
- Batch stats footer: avg confidence, avg time, errors count, Q&A bank hit rate
- Estimated completion time
- "Autopilot: N running" indicator in header

#### F4.6 -- Post-Submission Summary (Autopilot) (NEW)

| Field                   | Value                                                                                                                                                                                                              |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Track**               | Frontend                                                                                                                                                                                                           |
| **Description**         | Build the post-submission summary modal accessible from "View Summary" in the live feed. Field-by-field breakdown, source column, confidence scores, screenshot proof, "Flag Issue" and "Add to Q&A Bank" actions. |
| **Dependencies**        | F4.5, B4.4                                                                                                                                                                                                         |
| **Effort**              | 3 SP                                                                                                                                                                                                               |
| **Priority**            | P0                                                                                                                                                                                                                 |
| **Acceptance Criteria** |                                                                                                                                                                                                                    |

- Header: job title, company, submitted timestamp, duration
- Overall confidence bar (percentage)
- Field-by-field table: field name, value submitted, source (Resume/Google/Q&A Bank/AI), confidence %
- Color coding: green >= 90%, amber >= 70%, red < 70%
- Screening questions section with full AI-generated answers and confidence
- Screenshot thumbnails: completed form + confirmation page
- Actions: "View on LinkedIn", "Flag Issue", "Request Withdrawal", "Add to Q&A Bank"
- "Flag Issue" records user dispute in audit trail

### Backend Track (22 SP)

#### B4.1 -- Trust Gate & Autopilot Unlock Engine (NEW)

| Field                   | Value                                                                                                                                                                                                 |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Track**               | Backend                                                                                                                                                                                               |
| **Description**         | Build the progressive trust gate system. Track user's Copilot application history. Determine Autopilot eligibility: 3 successful Copilot apps with avg confidence >= 85% and zero critical overrides. |
| **Dependencies**        | B0.1, B2.1                                                                                                                                                                                            |
| **Effort**              | 3 SP                                                                                                                                                                                                  |
| **Priority**            | P0                                                                                                                                                                                                    |
| **Acceptance Criteria** |                                                                                                                                                                                                       |

- `GET /api/v1/autopilot/eligibility` returns: `{eligible, apps_completed, apps_required, avg_confidence, critical_overrides}`
- Eligibility check: 3+ completed Copilot apps AND avg confidence >= 85% AND 0 critical overrides
- After eligibility met: `autopilot_unlocked` event published
- Eligibility status cached but recalculated on each completed application
- Admin override available (for testing, support)

#### B4.2 -- Autopilot Consent API (NEW)

| Field                   | Value                                                                                                                                                        |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Track**               | Backend                                                                                                                                                      |
| **Description**         | Extended consent API for Autopilot Layer 3-5 consent. Records typed confirmation, individual checkbox states, consent version. Supports re-consent triggers. |
| **Dependencies**        | B0.4                                                                                                                                                         |
| **Effort**              | 3 SP                                                                                                                                                         |
| **Priority**            | P0                                                                                                                                                           |
| **Acceptance Criteria** |                                                                                                                                                              |

- `POST /api/v1/consent/autopilot` records: all 8 checkbox states, typed confirmation text, consent version, timestamp, IP
- `GET /api/v1/consent/autopilot/valid` returns boolean (checks version freshness, 90-day expiry, no re-consent triggers)
- Re-consent triggers: ToS update, Privacy Policy update, profile change, 90 days elapsed, LLM provider change
- When re-consent needed: Autopilot mode automatically blocked until re-consent completed
- Consent records are GDPR-exportable

#### B4.3 -- Autopilot Session Engine + Quality Gates (NEW)

| Field                   | Value                                                                                                                                                                                    |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Track**               | Backend                                                                                                                                                                                  |
| **Description**         | Build the Autopilot execution engine. Hatchet workflow variant that auto-submits instead of pausing for review, subject to 9 mandatory quality gates. Per-session parameter enforcement. |
| **Dependencies**        | B1.3, B4.1, B4.2                                                                                                                                                                         |
| **Effort**              | 8 SP                                                                                                                                                                                     |
| **Priority**            | P0                                                                                                                                                                                       |
| **Acceptance Criteria** |                                                                                                                                                                                          |

- `POST /api/v1/tasks` with `mode: "autopilot"` uses auto-submit workflow variant
- 9 quality gates evaluated before every submission (from legal doc 06 Section 5.1):
  1. Overall confidence >= 80%
  2. No individual field confidence < 50%
  3. No CRITICAL fields filled by LLM inference
  4. Resume-job match score >= 60%
  5. No hard-block fields (SSN, legal consents)
  6. Company not on exclusion list
  7. Role title not contradicting user profile
  8. Not a duplicate (same URL within 90 days)
  9. Salary range within user bounds
- If any gate fails: task queued for user review with explanation (NOT submitted)
- Session limits enforced: max apps per session, max duration, mandatory breaks
- Platform rate limits for Autopilot: LinkedIn 10/day (NOT 25), 3-min gaps, 15-min cool-down after 5 apps
- All decisions logged in audit trail with full explainability

#### B4.4 -- Autopilot Audit Trail (GDPR Article 22) (NEW)

| Field                   | Value                                                                                                                                                                   |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Track**               | Backend                                                                                                                                                                 |
| **Description**         | Enhanced audit trail for Autopilot submissions meeting GDPR Article 22 explainability requirements. Every field decision includes model, reasoning, confidence, source. |
| **Dependencies**        | B1.5                                                                                                                                                                    |
| **Effort**              | 3 SP                                                                                                                                                                    |
| **Priority**            | P0                                                                                                                                                                      |
| **Acceptance Criteria** |                                                                                                                                                                         |

- Per-submission audit record matching schema from legal doc 06 Section 4.2
- Includes: submission_id, session_id, user_id, timestamps, platform, job details, per-field decisions, quality gate results, screenshots, outcome
- `GET /api/v1/tasks/{id}/audit` returns complete audit record (user's own tasks only)
- `GET /api/v1/tasks/{id}/audit/export` returns JSON export (GDPR Article 20)
- GDPR Article 22 fields: right to human intervention (`user_reviewed`), right to contest (`user_disputed`), right to explanation (`field_decisions[].reasoning`)
- Retention: 2 years for audit records, 90 days for screenshots

#### B4.5 -- Circuit Breaker (3-Failure Auto-Pause) (NEW)

| Field                   | Value                                                                                                                                                                    |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Track**               | Backend                                                                                                                                                                  |
| **Description**         | Implement the 3-consecutive-failure circuit breaker for Autopilot. Auto-pauses all running Autopilot tasks and sends urgent notification. Attempts root cause diagnosis. |
| **Dependencies**        | B4.3, B2.3                                                                                                                                                               |
| **Effort**              | 3 SP                                                                                                                                                                     |
| **Priority**            | P0                                                                                                                                                                       |
| **Acceptance Criteria** |                                                                                                                                                                          |

- Tracks consecutive failure count per user per Autopilot session
- After failure #1: normal notification
- After failure #2: elevated warning ("2 consecutive failures. Monitoring closely.")
- After failure #3: auto-pause ALL Autopilot tasks, urgent Novu notification with failure details
- Root cause analysis: if all 3 failures share same reason, provide specific recommendation
- "Resume Autopilot" requires explicit user action (no auto-resume)
- Circuit breaker state persists across page reloads

#### B4.6 -- "Request Withdrawal" Feature (NEW)

| Field                   | Value                                                                                                                                   |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| **Track**               | Backend                                                                                                                                 |
| **Description**         | Build withdrawal request capability for Autopilot-submitted applications. Attempts ATS withdrawal where supported. Logs in audit trail. |
| **Dependencies**        | B1.3                                                                                                                                    |
| **Effort**              | 2 SP                                                                                                                                    |
| **Priority**            | P1                                                                                                                                      |
| **Acceptance Criteria** |                                                                                                                                         |

- `POST /api/v1/tasks/{id}/withdraw` initiates withdrawal attempt
- For LinkedIn: attempt to find and click "Withdraw" on the application
- For other platforms: log the request, show "Withdrawal requested" status
- Result stored in audit trail: `withdrawal_requested`, `withdrawal_status`
- User informed: "Withdrawal attempted. Not all platforms support programmatic withdrawal."

### Core Track (13 SP)

#### C4.1 -- Autopilot Workflow Variant (NEW)

| Field                   | Value                                                                                                                                 |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| **Track**               | Core                                                                                                                                  |
| **Description**         | Modify the Hatchet workflow to support Autopilot mode. Instead of PauseForReview, evaluate quality gates and auto-submit if all pass. |
| **Dependencies**        | C1.2, C1.3, C1.4                                                                                                                      |
| **Effort**              | 5 SP                                                                                                                                  |
| **Priority**            | P0                                                                                                                                    |
| **Acceptance Criteria** |                                                                                                                                       |

- Workflow branch: if mode == "autopilot" and all quality gates pass -> auto-submit
- If quality gate fails -> transition to QUALITY_GATE_BLOCKED, notify user
- Autopilot rate limiting enforced in workflow: min gap between submissions, cool-down periods
- EEO/demographic fields: ALWAYS "Decline to answer" unless explicitly configured
- Hard blocks: SSN, legal consents, references -> immediately block and notify

#### C4.2 -- Account Safety Monitor (ENHANCED)

| Field            | Value                                                                                                             |
| ---------------- | ----------------------------------------------------------------------------------------------------------------- |
| **Track**        | Core                                                                                                              |
| **Description**  | Real-time account health monitoring. Enhanced for Autopilot: auto-pauses all Autopilot on any restriction signal. |
| **Dependencies** | C0.2, C1.2                                                                                                        |
| **Effort**       | 3 SP                                                                                                              |
| **Priority**     | P0                                                                                                                |

#### C4.3 -- Confidence Threshold Engine (NEW)

| Field                   | Value                                                                                                                                                                                          |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Track**               | Core                                                                                                                                                                                           |
| **Description**         | Build the confidence threshold evaluation engine. Personalized historical data for threshold slider. Calculates "what would have happened at this threshold" using user's application history. |
| **Dependencies**        | C1.3, B2.1                                                                                                                                                                                     |
| **Effort**              | 5 SP                                                                                                                                                                                           |
| **Priority**            | P0                                                                                                                                                                                             |
| **Acceptance Criteria** |                                                                                                                                                                                                |

- `evaluate_threshold(user_id, threshold) -> {would_auto_submit: N, would_pause: M}`
- Uses last 20 applications' per-field confidence data
- Returns recommendation: "85% recommended (balances speed and accuracy)"
- Minimum threshold: 70% (cannot be lowered)
- Weighted average confidence: critical fields weighted 2x

### Legal/Compliance Track (8 SP)

#### L4.1 -- Autopilot ToS + Privacy Policy Sections (NEW)

| Field                   | Value                                                                                                                                               |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Track**               | Legal/Compliance                                                                                                                                    |
| **Description**         | Finalize Autopilot-specific ToS (Section X) and Privacy Policy (Section Y: Automated Decision-Making) from legal doc 06. Submit to outside counsel. |
| **Dependencies**        | L2.2                                                                                                                                                |
| **Effort**              | 3 SP                                                                                                                                                |
| **Priority**            | P0                                                                                                                                                  |
| **Acceptance Criteria** |                                                                                                                                                     |

- ToS Section X: Electronic Agent Authorization, Quality Assurance, Limitation of Liability, Indemnification, Revocation
- Privacy Policy Section Y: Automated Decision-Making, GDPR Article 22 rights, data processing in Autopilot, sub-processors, withdrawal of consent
- All UETA Section 10(b) non-waivable rights explicitly acknowledged
- Documents submitted to outside counsel

#### L4.2 -- Autopilot Consent Form Finalization (NEW)

| Field            | Value                                                                                                                               |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| **Track**        | Legal/Compliance                                                                                                                    |
| **Description**  | Final legal review of Autopilot consent form. Verify 8 checkboxes cover all required disclosures. Typed confirmation text approved. |
| **Dependencies** | L4.1                                                                                                                                |
| **Effort**       | 2 SP                                                                                                                                |
| **Priority**     | P0                                                                                                                                  |

#### L4.3 -- Insurance Review for Autopilot (NEW)

| Field                   | Value                                                                                                                                           |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| **Track**               | Legal/Compliance                                                                                                                                |
| **Description**         | Consult insurance broker on enhanced E&O coverage for Autopilot. Provide: feature description, user volume projections, data flows, guardrails. |
| **Dependencies**        | L4.1                                                                                                                                            |
| **Effort**              | 1 SP                                                                                                                                            |
| **Priority**            | P1                                                                                                                                              |
| **Acceptance Criteria** |                                                                                                                                                 |

- Insurance broker consulted with full Autopilot feature description
- Coverage gaps identified
- Budget impact estimated (30-50% premium increase expected)
- Enhanced coverage bound before Autopilot public launch

#### L4.4 -- GDPR Article 22 Compliance Verification (NEW)

| Field                   | Value                                                                                                                                                                                   |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Track**               | Legal/Compliance                                                                                                                                                                        |
| **Description**         | Verify all GDPR Article 22 requirements are met: right to explanation, right to human intervention, right to contest, right to express views. Map requirements to implemented features. |
| **Dependencies**        | B4.4                                                                                                                                                                                    |
| **Effort**              | 2 SP                                                                                                                                                                                    |
| **Priority**            | P0                                                                                                                                                                                      |
| **Acceptance Criteria** |                                                                                                                                                                                         |

- Compliance matrix: each GDPR Article 22(3) requirement mapped to feature implementation
- Right to explanation: audit trail with per-field reasoning (B4.4)
- Right to human intervention: "Flag Issue" triggers human review (F4.6)
- Right to contest: "Request Withdrawal" feature (B4.6)
- Right to express views: audit trail annotation capability
- DPA with LLM providers covers Autopilot processing

### Infrastructure Track (5 SP)

#### I4.1 -- Autopilot Infrastructure (Session Management, Scaling) (NEW)

| Field                   | Value                                                                                                                                                  |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Track**               | Infrastructure                                                                                                                                         |
| **Description**         | Infrastructure for concurrent Autopilot sessions: multiple browser profiles, rate limit enforcement at infrastructure level, session timeout watchdog. |
| **Dependencies**        | I0.1                                                                                                                                                   |
| **Effort**              | 5 SP                                                                                                                                                   |
| **Priority**            | P0                                                                                                                                                     |
| **Acceptance Criteria** |                                                                                                                                                        |

- Support 3 concurrent browser sessions per user (Hatchet concurrency control)
- Session timeout watchdog: auto-terminate sessions exceeding max duration
- Kill switch watchdog: if extension/browser crashes, auto-terminate pending tasks within 30 seconds
- Browser profile pool pre-created and warm

### Phase 4: Definition of Done

- [ ] Trust gate unlocks Autopilot after 3 successful Copilot applications
- [ ] Autopilot consent form with 8 checkboxes + typed confirmation implemented
- [ ] Per-session authorization flow working
- [ ] 9 quality gates evaluated before every Autopilot submission
- [ ] Circuit breaker auto-pauses after 3 consecutive failures
- [ ] Batch progress view showing multiple Autopilot applications
- [ ] Post-submission summary with field breakdown, confidence scores, screenshots
- [ ] "Flag Issue" and "Request Withdrawal" actions working
- [ ] Kill switch stops all Autopilot tasks in < 2 seconds
- [ ] LinkedIn Autopilot capped at 10/day with 3-minute gaps
- [ ] GDPR Article 22 compliance verified
- [ ] Autopilot ToS and Privacy Policy sections approved by counsel

---

## 9. Phase 5: Autopilot Polish & Beta (Weeks 15-18)

**Goal:** Autopilot beta with 25 users. Confidence threshold personalization. Notification digests. Selector self-healing. Copilot+Autopilot mid-application switching.

**Duration:** 4 weeks
**Total Story Points:** 55 SP

### Frontend Track (15 SP)

#### F5.1 -- Confidence Threshold Slider with Personalized Data (NEW)

| Field                   | Value                                                                                                                                               |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Track**               | Frontend                                                                                                                                            |
| **Description**         | Build the confidence threshold slider in Settings > Automation. Shows personalized "what would have happened" data from user's application history. |
| **Dependencies**        | F2.2, C4.3                                                                                                                                          |
| **Effort**              | 3 SP                                                                                                                                                |
| **Priority**            | P0                                                                                                                                                  |
| **Acceptance Criteria** |                                                                                                                                                     |

- Slider from 70% to 100%, default 85%
- Real-time preview: "At 85%: 18 would have auto-submitted, 2 would have paused (based on your last 20 apps)"
- Visual bar showing distribution of field confidences
- "Recommended: 85%" label with explanation

#### F5.2 -- Trust Nudges System (NEW)

| Field                   | Value                                                                                                                                                                                        |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Track**               | Frontend                                                                                                                                                                                     |
| **Description**         | Implement progressive trust nudges. After milestones (3 Copilot apps, 5 Autopilot apps with zero issues, user approves AI answer unchanged), show contextual prompts to increase automation. |
| **Dependencies**        | F4.1, B4.1                                                                                                                                                                                   |
| **Effort**              | 3 SP                                                                                                                                                                                         |
| **Priority**            | P1                                                                                                                                                                                           |
| **Acceptance Criteria** |                                                                                                                                                                                              |

- After 3 Copilot apps: "Ready to try Autopilot?" nudge
- After 5 Autopilot apps with zero issues: "Lower threshold from 90% to 85%?" nudge
- After approving AI answer unchanged: "Save to Q&A bank?" nudge
- After 10 apps with no overrides: "Try batch apply?" nudge
- All nudges dismissible, frequency-limited (max 1 per session)

#### F5.3 -- Autopilot-to-Copilot Mid-Application Switch (NEW)

| Field            | Value                                                                                                          |
| ---------------- | -------------------------------------------------------------------------------------------------------------- |
| **Track**        | Frontend                                                                                                       |
| **Description**  | Allow switching from Autopilot to Copilot for a paused application. Transition UI with mode change indication. |
| **Dependencies** | F4.5                                                                                                           |
| **Effort**       | 2 SP                                                                                                           |
| **Priority**     | P1                                                                                                             |

#### F5.4 -- Chrome Extension: AutoApply Button

| Field            | Value                                                                                                                                 |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| **Track**        | Frontend                                                                                                                              |
| **Description**  | Extend Chrome extension to show floating "AutoApply with WeKruit" button on job pages. Mode selector (Copilot/Autopilot if unlocked). |
| **Dependencies** | All Phase 1-4 tasks                                                                                                                   |
| **Effort**       | 5 SP                                                                                                                                  |
| **Priority**     | P1                                                                                                                                    |

#### F5.5 -- Analytics Dashboard (Tremor-Powered) (CHANGED)

| Field            | Value                                                                                                                        |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| **Track**        | Frontend                                                                                                                     |
| **Description**  | Build `/analytics` with Tremor chart components. Weekly/monthly trends, Copilot vs Autopilot comparison, platform breakdown. |
| **Dependencies** | F2.1, B5.3                                                                                                                   |
| **Effort**       | 3 SP (reduced from 5 SP -- Tremor provides ready-made charts)                                                                |
| **Priority**     | P2                                                                                                                           |

### Backend Track (16 SP)

#### B5.1 -- Autopilot Notification Digests (Novu) (NEW)

| Field                   | Value                                                                                                                                                    |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Track**               | Backend                                                                                                                                                  |
| **Description**         | Configure Novu digest workflows for Autopilot: batch completion digests (grouped), hourly/daily summary options. Failure notifications always real-time. |
| **Dependencies**        | B2.3, B4.3                                                                                                                                               |
| **Effort**              | 3 SP                                                                                                                                                     |
| **Priority**            | P0                                                                                                                                                       |
| **Acceptance Criteria** |                                                                                                                                                          |

- Novu digest workflow: groups completed Autopilot submissions into single notification
- Digest options: per-batch, hourly, daily (configurable per user)
- Failure/blocker notifications bypass digest (always real-time)
- Email digest template: table of submissions with confidence, status, "View Full Details" link
- React Email template pre-rendered for the 24-hour summary email

#### B5.2 -- Bulk Task Creation API

| Field            | Value                                                                                |
| ---------------- | ------------------------------------------------------------------------------------ |
| **Track**        | Backend                                                                              |
| **Description**  | Build `POST /api/v1/tasks/bulk` for batch URL submission with per-URL mode override. |
| **Dependencies** | B1.3, B2.5                                                                           |
| **Effort**       | 3 SP                                                                                 |
| **Priority**     | P1                                                                                   |

#### B5.3 -- Analytics Aggregation API

| Field            | Value                                                         |
| ---------------- | ------------------------------------------------------------- |
| **Track**        | Backend                                                       |
| **Description**  | Aggregate analytics with Copilot vs Autopilot mode breakdown. |
| **Dependencies** | B0.1, B2.1                                                    |
| **Effort**       | 3 SP                                                          |
| **Priority**     | P2                                                            |

#### B5.4 -- Post-Session Summary Email (NEW)

| Field                   | Value                                                                                                                                                                               |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Track**               | Backend                                                                                                                                                                             |
| **Description**         | Mandatory post-session summary email sent within 1 hour of every Autopilot session. Includes: submissions, blocked apps, action items, "Flag Issue" and "Request Withdrawal" links. |
| **Dependencies**        | B2.3, B4.4                                                                                                                                                                          |
| **Effort**              | 3 SP                                                                                                                                                                                |
| **Priority**            | P0                                                                                                                                                                                  |
| **Acceptance Criteria** |                                                                                                                                                                                     |

- Email sent within 1 hour of Autopilot session end
- Includes: session stats, submitted apps (with confidence and AI-generated answer flags), blocked apps (with reasons), action items
- Each submitted app has: "View Full Audit", "Flag Issue", "Request Withdrawal" deep links
- React Email template pre-rendered

#### B5.5 -- Billing Integration (Stripe) (NEW in this phase)

| Field            | Value                                                                                                                                       |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **Track**        | Backend                                                                                                                                     |
| **Description**  | Integrate Stripe for billing. Free tier (Copilot), Pro tier (enhanced Copilot), Autopilot tier. Feature gating via use-stripe-subscription. |
| **Dependencies** | B0.2                                                                                                                                        |
| **Effort**       | 4 SP                                                                                                                                        |
| **Priority**     | P1                                                                                                                                          |

### Core Track (16 SP)

#### C5.1 -- Selector Self-Healing Cache

| Field            | Value                                                                               |
| ---------------- | ----------------------------------------------------------------------------------- |
| **Track**        | Core                                                                                |
| **Description**  | Cache URL pattern -> selector mappings. Self-heal on cache miss by re-invoking LLM. |
| **Dependencies** | C1.2, C1.3, C0.4                                                                    |
| **Effort**       | 5 SP                                                                                |
| **Priority**     | P1                                                                                  |

#### C5.2 -- LLM Model Router Optimization (Cost Reduction)

| Field            | Value                                                                    |
| ---------------- | ------------------------------------------------------------------------ |
| **Track**        | Core                                                                     |
| **Description**  | Full 3-tier routing with prompt caching. Target: $0.021 per application. |
| **Dependencies** | C0.4                                                                     |
| **Effort**       | 5 SP                                                                     |
| **Priority**     | P1                                                                       |

#### C5.3 -- Greenhouse Platform Adapter

| Field            | Value                                                                                      |
| ---------------- | ------------------------------------------------------------------------------------------ |
| **Track**        | Core                                                                                       |
| **Description**  | Greenhouse form adapter: iframe handling, Dropzone.js uploads, Google Places autocomplete. |
| **Dependencies** | C0.2, C1.3, C1.4                                                                           |
| **Effort**       | 5 SP                                                                                       |
| **Priority**     | P1                                                                                         |

#### C5.4 -- Lever Platform Adapter

| Field            | Value                                                 |
| ---------------- | ----------------------------------------------------- |
| **Track**        | Core                                                  |
| **Description**  | Lever form adapter. Simplest adapter (standard HTML). |
| **Dependencies** | C0.2, C1.3, C1.4                                      |
| **Effort**       | 3 SP (reduced -- Lever is the simplest)               |
| **Priority**     | P1                                                    |

### Legal/Compliance Track (4 SP)

#### L5.1 -- Outside Counsel Review (Autopilot ToS + Privacy Policy) (NEW)

| Field            | Value                                                                                                 |
| ---------------- | ----------------------------------------------------------------------------------------------------- |
| **Track**        | Legal/Compliance                                                                                      |
| **Description**  | Final counsel review of Autopilot ToS sections and Privacy Policy automated decision-making sections. |
| **Dependencies** | L4.1, L4.2                                                                                            |
| **Effort**       | 2 SP                                                                                                  |
| **Priority**     | P0                                                                                                    |

#### L5.2 -- Insurance Coverage Bound (NEW)

| Field            | Value                                                                                                           |
| ---------------- | --------------------------------------------------------------------------------------------------------------- |
| **Track**        | Legal/Compliance                                                                                                |
| **Description**  | Finalize enhanced E&O insurance coverage for Autopilot. Coverage must be active before Autopilot public launch. |
| **Dependencies** | L4.3                                                                                                            |
| **Effort**       | 1 SP                                                                                                            |
| **Priority**     | P0                                                                                                              |

#### L5.3 -- Platform-Specific Autopilot Consent (LinkedIn) (NEW)

| Field            | Value                                                                                                                                     |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **Track**        | Legal/Compliance                                                                                                                          |
| **Description**  | LinkedIn-specific additional consent for Autopilot. Most conservative rate limits (10/day). Separate acknowledgment of LinkedIn ToS risk. |
| **Dependencies** | L4.2                                                                                                                                      |
| **Effort**       | 1 SP                                                                                                                                      |
| **Priority**     | P0                                                                                                                                        |

### Infrastructure Track (4 SP)

#### I5.1 -- Autopilot Scaling & Load Testing

| Field            | Value                                                                                                          |
| ---------------- | -------------------------------------------------------------------------------------------------------------- |
| **Track**        | Infrastructure                                                                                                 |
| **Description**  | Load test Autopilot: 10 concurrent sessions, 50+ submissions in a session. Verify rate limits hold under load. |
| **Dependencies** | I4.1, B4.3                                                                                                     |
| **Effort**       | 4 SP                                                                                                           |
| **Priority**     | P0                                                                                                             |

### Phase 5: Definition of Done

- [ ] 25 beta users with Autopilot access
- [ ] Confidence threshold slider with personalized data working
- [ ] Trust nudges appearing at appropriate milestones
- [ ] Autopilot notification digests (batch, hourly, daily) working
- [ ] Post-session summary emails sent within 1 hour
- [ ] Greenhouse and Lever adapters working
- [ ] Selector self-healing cache with > 80% hit rate
- [ ] LLM cost per application <= $0.025
- [ ] Autopilot ToS and Privacy Policy approved by counsel
- [ ] Enhanced insurance coverage bound
- [ ] Chrome extension with mode selector working

---

## 10. Phase 6: Scale & Platform Expansion (Weeks 19-26)

**Goal:** Workday support, multi-resume, AI cover letters, bulk mode UI, enterprise features, generic ATS adapter.

**Duration:** 8 weeks
**Total Story Points:** 72 SP

### Frontend Track (19 SP)

- F6.1 -- Bulk Mode UI (5 SP) -- Multi-URL submission with per-URL Copilot/Autopilot mode toggle
- F6.2 -- Multi-Resume Management (3 SP) -- Multiple resumes with per-application picker
- F6.3 -- AI Cover Letter Generator UI (3 SP) -- In-line generator with review/edit
- F6.4 -- Enterprise Admin Dashboard (8 SP) -- Team management, usage analytics, billing

### Backend Track (19 SP)

- B6.1 -- Workday Workflow Adapter (3 SP) -- Extended timeouts, multi-page wizard
- B6.2 -- AI Cover Letter Generation API (3 SP) -- LLM-powered per-job cover letters
- B6.3 -- Team/Enterprise API (8 SP) -- Team CRUD, roles, aggregate analytics
- B6.4 -- Greenhouse + Lever Workflow Integration (3 SP) -- Platform detection and routing
- B6.5 -- Scheduled Autopilot Sessions (2 SP) -- Future: time-based Autopilot triggers with re-authorization every 30 days

### Core Track (26 SP)

- C6.1 -- Workday Platform Adapter (Shadow DOM) (13 SP) -- Patchright for closed shadow DOM, multi-page wizard
- C6.2 -- AI Cover Letter Engine (3 SP) -- Per-job generation with company research
- C6.3 -- Generic ATS Adapter (Vision + LLM Fallback) (8 SP) -- Catch-all adapter for unknown platforms
- C6.4 -- Multi-Browser Profile Pool Management (2 SP) -- Pool warm-up, rotation

### Legal/Compliance Track (4 SP)

- L6.1 -- Platform-Specific Consent (Greenhouse, Lever, Workday) (2 SP) -- Per-platform risk acknowledgment
- L6.2 -- Enterprise Data Processing Agreement (2 SP) -- B2B DPA for enterprise customers

### Infrastructure Track (4 SP)

- I6.1 -- Multi-Region Deployment Prep (2 SP) -- EU data residency for GDPR
- I6.2 -- Advanced Monitoring & Alerting (2 SP) -- Autopilot-specific dashboards, quality gate pass/fail rates

---

## 11. Dependency Graph

### Cross-Phase Critical Dependencies

```
PHASE 0 -> PHASE 1 (all foundation work feeds core MVP)

PHASE 1 -> PHASE 2 (core APIs enable dashboard + HITL)
  B1.3 (Task API) -> B2.1 (Task List), F2.1 (Dashboard)
  B1.4 (WebSocket) -> F2.4 (noVNC), B2.4 (CAPTCHA handling)
  C1.2 (LinkedIn) -> C2.2 (Session Mgr), C2.4 (CAPTCHA)

PHASE 2 -> PHASE 3 (dashboard + HITL enable QA)
  All Phase 1-2 tasks -> Phase 3 testing suites

PHASE 3 -> PHASE 4 (Copilot beta validates before Autopilot build)
  Copilot beta feedback -> Autopilot feature refinement
  L2.1 (Counsel review) -> L4.1 (Autopilot ToS)

PHASE 4 -> PHASE 5 (Autopilot foundation enables polish)
  B4.3 (Quality Gates) -> C5.1 (Self-Healing), B5.1 (Digests)
  B4.1 (Trust Gate) -> F5.2 (Trust Nudges)
  L4.1 (AP ToS) -> L5.1 (Counsel Review)

PHASE 5 -> PHASE 6 (Autopilot beta validates before scale)
  C5.3 (Greenhouse) -> B6.4 (GH Workflow)
  C5.4 (Lever) -> B6.4 (Lever Workflow)
```

### Autopilot Feature Dependency Chain (NEW)

```
B4.1 (Trust Gate)
  |
  +--> F4.1 (Unlock Modal) --> F4.2 (Consent Form) --> F4.3 (Per-Session Auth)
  |                              |
  |                              +--> B4.2 (Consent API)
  |
  +--> B4.3 (Quality Gates + Session Engine)
         |
         +--> C4.1 (Autopilot Workflow Variant)
         |
         +--> B4.5 (Circuit Breaker)
         |
         +--> B4.4 (Audit Trail) --> L4.4 (GDPR Verification)
         |
         +--> F4.5 (Batch Progress View) --> F4.6 (Post-Submission Summary)
```

---

## 12. Critical Path Analysis

### Primary Critical Path (Core Track)

```
Week 1:  C0.1 (AdsPower) -> C0.2 (CDP)
Week 2:  C0.2 + C0.3 (Proxy) -> C0.4 (LLM Router)
Week 3:  C1.1 (Resume Parser) + C1.2 (LinkedIn - start)
Week 4:  C1.2 (complete) + C1.3 (Form Analyzer)
Week 5:  C1.4 (Form Filler) -> integrate into Hatchet workflow
Week 6:  C2.1 (Q&A Matching) + C2.2 (Session Mgr) + C2.3 (Anti-Detection)
Week 7:  C2.4 (CAPTCHA) + C2.5 (Error Recovery)
Week 8:  Integration testing + bug fixes
Week 9:  C3.1 (Test Suite) + C3.2 (Performance Testing)
Week 10: Final QA, beta launch
```

### Secondary Critical Path (Backend -- Autopilot)

```
Week 11: B4.1 (Trust Gate) + B4.2 (Consent API)
Week 12: B4.3 (Quality Gates + Session Engine - start)
Week 13: B4.3 (complete) + B4.4 (Audit Trail)
Week 14: B4.5 (Circuit Breaker) + integration testing
```

### Legal Critical Path (NEW)

```
Week 1:  L0.1 (Legal Research) -- engage counsel
Week 5:  L1.1 (ToS + Privacy v1.0 drafts)
Week 7:  L2.1 (Counsel review begins)
Week 9:  L2.1 (Counsel feedback incorporated) -- Copilot beta gate
Week 11: L4.1 (Autopilot ToS drafts)
Week 13: L4.2 (Consent form finalized)
Week 15: L5.1 (Counsel review of Autopilot docs)
Week 17: L5.1 (Counsel approval) -- Autopilot beta gate
Week 18: L5.2 (Insurance bound) -- Autopilot launch gate
```

**Legal is a gating dependency for both Copilot beta (Week 10) and Autopilot beta (Week 18).**

---

## 13. Risk Register

### R1: LinkedIn Bot Detection Evolves (Severity: HIGH)

**Mitigation:** AdsPower fingerprints, sacrificial test accounts, conservative rate limits, Greenhouse-first pivot plan.

### R2: Autopilot Legal Exposure (Severity: HIGH, NEW)

**Risk:** UETA Section 10(b) liability, GDPR Article 22 enforcement, Amazon v. Perplexity precedent changes CFAA calculus.

**Mitigation:** 9 mandatory quality gates, comprehensive audit trail, outside counsel review, enhanced insurance, per-session consent, kill switch < 2 sec.

### R3: LinkedIn C&D Against Autopilot (Severity: HIGH, NEW)

**Risk:** LinkedIn sends cease-and-desist specifically targeting autonomous submission.

**Mitigation:** LinkedIn Autopilot has most conservative limits (10/day). Contingency plan: disable LinkedIn Autopilot within 24 hours of C&D while maintaining Copilot mode. Greenhouse/Lever Autopilot unaffected.

### R4: Quality Gate Over-Blocking (Severity: MEDIUM, NEW)

**Risk:** 9 quality gates block too many applications, making Autopilot feel useless.

**Mitigation:** Beta testing with 25 users to calibrate gates. Per-gate pass/fail analytics. Individual gate thresholds tunable (within legal minimums). Target: < 20% block rate for well-configured users.

### R5: Hatchet Immaturity (Severity: MEDIUM)

**Mitigation:** Spike in Week 1, Temporal fallback, abstraction layer.

### R6: AdsPower API Reliability (Severity: MEDIUM)

**Mitigation:** Spike in Week 1, Patchright fallback.

### R7: noVNC Integration Complexity (Severity: LOW -- reduced by react-vnc)

**Mitigation:** react-vnc reduces integration effort from 5 SP to 3 SP. Fallback: screenshot + "apply manually" with link.

### R8: Team Velocity (Severity: HIGH)

**Risk:** 3-person team cannot sustain velocity across 5 tracks for 26 weeks.

**Mitigation:** OSS adoption reduces total work by 33-50 weeks. Legal track can be partially outsourced to counsel. Infrastructure track has natural slack. P2 items are deferrable.

### R9: Consent Fatigue (Severity: MEDIUM, NEW)

**Risk:** 5-layer consent system frustrates users and reduces Autopilot adoption.

**Mitigation:** Layer 1-2 are standard (click-through). Layer 3 is one-time. Layer 4 has "remember my settings." Layer 5 is configuration, not consent. Onboarding flow tested for < 3 minute total time.

---

## 14. Milestone Schedule

### M1: "Hello World" -- Week 2

**Demo:** AdsPower + CDP + Browser-Use pipeline works. Hatchet workflow runs. Dashboard shell loads with OAuth. Novu self-hosted running.

### M2: "First Apply" -- Week 4

**Demo:** LinkedIn Easy Apply form filled end-to-end in Copilot mode. Resume parsed, fields filled, screening questions answered.

### M3: "Core Loop" -- Week 5

**Demo:** User pastes URL, watches real-time Copilot progress, reviews fields with confidence scores, approves submission. Q&A bank prompt appears after first app.

### M4: "Full UX" -- Week 8

**Demo:** Complete Copilot dashboard. Application tracking, CAPTCHA handling via noVNC, kill switch, Novu notifications, Settings with Autopilot "locked" progress indicator.

### M5: "Copilot Beta" -- Week 10

**Demo:** 10 beta users. Security audit passed. 50+ test runs at >= 80% success rate. ToS + Privacy Policy approved by counsel. Production environment stable.

### M6: "Autopilot Engine" -- Week 14

**Demo:** Trust gate unlocks Autopilot. 5-layer consent flow complete. 9 quality gates working. Circuit breaker pauses after 3 failures. Batch progress view. Post-submission summaries. Kill switch < 2 sec.

### M7: "Autopilot Beta" -- Week 18

**Demo:** 25 users with Autopilot access. Confidence threshold slider with personalized data. Greenhouse + Lever adapters working. Trust nudges. Post-session summary emails. Counsel approval + insurance coverage active.

### M8: "Scale Launch" -- Week 22

**Demo:** Workday adapter (alpha). Bulk mode UI. AI cover letters. Enterprise admin dashboard (alpha). Generic ATS adapter handling unknown forms at 60%+ success rate.

---

## 15. Team Size Recommendation

### Minimum Viable Team: 4 engineers + 1 legal (part-time)

| Role                                       | Tracks                   | Phase 0-3 Focus                         | Phase 4-6 Focus                                |
| ------------------------------------------ | ------------------------ | --------------------------------------- | ---------------------------------------------- |
| **Full-Stack Lead**                        | Frontend + Backend       | shadcn-admin setup, APIs, WebSocket     | Autopilot UI, consent flows, billing           |
| **Core Engineer**                          | Core + Infrastructure    | AdsPower, Browser-Use, LinkedIn adapter | Autopilot workflow, quality gates, adapters    |
| **Backend Engineer**                       | Backend + Infrastructure | Hatchet, Novu, rate limiting            | Autopilot engine, audit trail, circuit breaker |
| **Frontend Engineer**                      | Frontend                 | Dashboard, apply flow, noVNC            | Batch progress, trust nudges, extension        |
| **Legal Counsel** (part-time / outsourced) | Legal/Compliance         | ToS, Privacy Policy, disclaimer         | Autopilot consent, GDPR, insurance             |

### Recommended Team: 5 engineers + 1 legal

Add a **QA/DevOps Engineer** for Phases 3-6 to own: test suites, CI/CD, staging/production, monitoring, load testing.

### Story Points by Phase

| Phase                   | Weeks  | Total SP | SP/Week      | Notes                            |
| ----------------------- | ------ | -------- | ------------ | -------------------------------- |
| 0: Foundation           | 2      | 33       | 16.5         | Heavy setup, parallelizable      |
| 1: Copilot Core         | 3      | 68       | 22.7         | Highest intensity phase          |
| 2: Dashboard + HITL     | 3      | 62       | 20.7         | Dashboard + noVNC + kill switch  |
| 3: QA + Beta            | 2      | 35       | 17.5         | Testing + security + legal       |
| 4: Autopilot Foundation | 4      | 72       | 18.0         | Major new scope; legal-gated     |
| 5: Autopilot Polish     | 4      | 55       | 13.8         | Polish + platform expansion      |
| 6: Scale                | 8      | 72       | 9.0          | Workday + enterprise; pace slows |
| **Total**               | **26** | **397**  | **15.3 avg** |                                  |

### Story Points by Track (Total)

| Track            | Total SP | % of Total |
| ---------------- | -------- | ---------- |
| Frontend         | 112      | 28%        |
| Backend          | 119      | 30%        |
| Core             | 110      | 28%        |
| Legal/Compliance | 28       | 7%         |
| Infrastructure   | 28       | 7%         |
| **Total**        | **397**  | **100%**   |

---

_This roadmap incorporates research from: Autopilot UX & Onboarding (doc 05), Privacy & Legal Framework (doc 06), OSS Frontend/Backend Research (doc 07), and Competitor Autopilot UX Research (doc 08). All timeline estimates account for OSS integration savings and new Autopilot/Legal scope. The engineering team should begin sprint planning from Phase 0._
