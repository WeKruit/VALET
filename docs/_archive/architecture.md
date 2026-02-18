# WeKruit Valet -- System Architecture

**Version:** 1.0
**Date:** 2026-02-12
**Status:** Active
**Audience:** Engineering

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Component Architecture](#2-component-architecture)
3. [Request Flows](#3-request-flows)
4. [Sandbox Architecture](#4-sandbox-architecture)
5. [Browser Automation](#5-browser-automation)
6. [Orchestration Agent](#6-orchestration-agent)
7. [LLM Strategy](#7-llm-strategy)
8. [Data Model](#8-data-model)
9. [Deployment Architecture](#9-deployment-architecture)
10. [Security Model](#10-security-model)
11. [Scaling Strategy](#11-scaling-strategy)
12. [Implementation Roadmap](#12-implementation-roadmap)

---

## 1. System Overview

Valet is a browser automation platform that applies to jobs on behalf of users. It operates in two modes: **Copilot** (human reviews each step before submission) and **Autopilot** (autonomous submission with quality gates). The system drives real browsers through ATS platforms (LinkedIn, Greenhouse, Lever, Workday), fills forms using LLM-powered field mapping, handles CAPTCHAs via human-in-the-loop VNC takeover, and maintains a per-user Q&A bank that learns from each application.

### High-Level Component Diagram

```
+-----------------------------------------------------------------------+
|                            USER BROWSER                               |
|                                                                       |
|  +------------------+    +------------------+    +------------------+ |
|  |   React SPA      |    |   noVNC Client   |    |   WebSocket      | |
|  |   (TanStack       |    |   (VNC viewer)   |    |   (progress,     | |
|  |    Router)        |    |                  |    |    state_change,  | |
|  +--------+---------+    +--------+---------+    |    field_review)  | |
|           |                       |               +--------+---------+ |
+-----------|-----------------------|------------------------|-----------+
            | HTTPS                 | WSS                    | WSS
            v                       v                        v
+-----------------------------------------------------------------------+
|                        FLY.IO EDGE (TLS + fly-replay)                 |
+-----------------------------------------------------------------------+
            |                       |                        |
            v                       v                        v
+-------------------+  +---------------------+  +-----------------------+
|   apps/web        |  |   apps/api          |  |   GhostHands API      |
|   (Vite static)   |  |   (Fastify 5)       |  |   (EC2)               |
|                   |  |                     |  |                       |
|   Port: 5173      |  |   Port: 8000        |  |   Browser automation  |
+-------------------+  |                     |  |   + job dispatch      |
                       |   - Auth (Google     |  +-----------+-----------+
                       |     OAuth + JWT)     |              |
                       |   - Task CRUD        |              | REST API
                       |   - Resume upload    |              v
                       |   - WebSocket hub    |  +-----------------------+
                       |   - GDPR endpoints   |  |   apps/worker         |
                       |   - Rate limiting    |  |   (GH REST client)    |
                       |   - DI (awilix)      |  |                       |
                       +---------+------------+  |   Workflows:          |
                                 |               |   - job-application   |
                    +------------+------------+  |   - resume-parse      |
                    |            |             |  |                       |
                    v            v             v  |   Adapters (mock):    |
             +-----------+ +----------+ +-----+  |   - AdsPower          |
             | Supabase  | | Upstash  | | S3  |  |   - Stagehand         |
             | Postgres  | | Redis    | | Stor|  |   - Platform adapters |
             |           | |          | | age |  +-----------+-----------+
             | - pooler  | | - pub/sub| |     |              |
             |   :6543   | | - cache  | | res |              | CDP (future)
             | - direct  | | - budget | | scr |              v
             |   :5432   | | - rate   | | art |  +-----------------------+
             +-----------+ +----------+ +-----+  |   Browser Sandbox     |
                                                  |   (Fly Machine)       |
                                                  |                       |
                                                  |   - AdsPower profile  |
                                                  |   - Xvfb + x11vnc    |
                                                  |   - websockify/noVNC  |
                                                  +-----------------------+
```

### Package Dependency Graph

```
packages/shared     <-- Zod schemas, types, constants (leaf dependency)
    ^        ^
    |        |
packages/    packages/llm     packages/db       packages/ui
contracts        ^                 ^                  ^
    ^  ^         |                 |                  |
    |  |    +----+----+            |                  |
    |  +----|         |            |                  |
    |       |  apps/  |     apps/  |           apps/  |
    +-------|  worker |     api  --+           web  --+
            |         |       ^
            +---------+       |
                              |
                        apps/api
```

---

## 2. Component Architecture

### 2.1 packages/shared

**Role:** Single source of truth for all Zod schemas, derived TypeScript types, constants, and shared interfaces.

**What exists:**

- Zod schemas in `src/schemas/` for all domain objects (tasks, users, resumes, Q&A, consent, etc.)
- TypeScript types derived via `z.infer<>` -- never hand-written
- Automation type interfaces: `IPlatformAdapter`, `IBrowserAgent`, `IFormAnalyzer`, `ICaptchaDetector`, `IProxyManager`, `IAgentOrchestrator`
- Environment validation (`src/env.ts`)
- Shared constants (retention policies, rate limits)

**What is needed:**

- Sandbox state types (machine registry, VNC tokens)
- Orchestration agent state machine types
- Obstacle detection result types

### 2.2 packages/contracts

**Role:** ts-rest API contract definitions consumed by both the API server and the React frontend.

**What exists:** 8 contract modules:

- `auth` -- Google OAuth flow, token refresh, logout
- `users` -- Profile CRUD, onboarding
- `tasks` -- Task CRUD, apply, cancel, list with filters
- `task-events` -- Event stream for a task
- `resumes` -- Upload, list, delete, parse status
- `qa-bank` -- Q&A CRUD, category filter, bulk import
- `consent` -- Consent records, version tracking
- `health` -- Service health check

**What is needed:**

- Sandbox contract (VNC token, takeover request)
- WebSocket message type contracts (currently ad-hoc)

### 2.3 packages/db

**Role:** Drizzle ORM schema, migrations, seed data, database client.

**What exists:** 11 tables with full relations:

- `users`, `tasks`, `task_events`, `resumes`, `qa_bank`
- `consent_records`, `browser_profiles`, `proxy_bindings`
- `application_results`, `audit_trail`, `application_fields`
- pgEnums for `task_status`, `platform`, `application_mode`
- Composite indexes on `(user_id, status)`, `(user_id, created_at)`
- Dual connection support (pooler + direct)

**What is needed:**

- `sandbox_sessions` table (machine_id, vnc_token, cdp_port, status, task_id)
- Migration for sandbox-related columns

### 2.4 packages/llm

**Role:** LLM provider abstraction with 3-tier routing, budget tracking, caching, and prompt templates.

**What exists:**

- `LLMRouter` class with automatic fallback chain
- Providers: `AnthropicProvider` (Claude Sonnet 4.5), `OpenAIProvider` (GPT-4.1 mini + nano)
- `BudgetTracker` -- Redis-backed per-application and per-user-daily spend limits
- Response cache (hash-based deduplication)
- Prompt templates: `form-analysis`, `field-mapping`, `answer-generation`

**What is needed:**

- Prompts: `obstacle-detection`, `question-categorization`, `screenshot-analysis`
- Stagehand agent tool definitions (Vercel AI SDK format)
- Streaming support for real-time progress

### 2.5 packages/ui

**Role:** Radix + Tailwind component library shared by the web app.

**What exists:** Standard component set (buttons, inputs, dialogs, cards, etc.)

**What is needed:**

- noVNC viewer component (wraps noVNC client library)
- Application stepper with live state indicators
- Field review panel for copilot mode

### 2.6 apps/api

**Role:** Fastify 5 API server. Entry point for all client requests.

**What exists:**

- Google OAuth 2.0 + JWT RS256 authentication (httpOnly cookies)
- Module-based architecture with DI via `@fastify/awilix` (`AppCradle` pattern)
- Task CRUD with GhostHands job dispatch (POST /api/v1/gh/valet/apply) and cancel
- Resume upload to Supabase Storage S3
- WebSocket hub using Redis pub/sub for real-time progress
- GDPR data export + account deletion (30-day soft delete)
- Rate limiting (per-user, per-IP) via Redis sliding window
- Security headers via `@fastify/helmet`, CORS, HSTS
- Request validation via ts-rest + Zod at the boundary

**What is needed:**

- VNC proxy endpoint (validates JWT + VNC token, returns `fly-replay` header)
- Sandbox management API (provision, status, destroy)
- Kill switch endpoint (sub-2-second automation halt)

### 2.7 apps/worker

**Role:** GhostHands job dispatch worker. Executes browser automation tasks via GH API.

**What exists:**

- `job-application` workflow -- 7-step DAG:
  `start-browser -> analyze-form -> fill-fields -> upload-resume -> check-captcha -> submit -> verify`
  - `check-captcha`: durableTask with `waitFor("captcha_solved")`
  - `submit`: durableTask with `waitFor("review_approved")` in copilot mode
- `resume-parse` workflow -- 3-step linear:
  `extract-text -> llm-parse -> save-results`
  - Downloads PDF from S3, extracts text via `pdf-parse`
  - Real LLM calls via `LLMRouter` for structured parsing
  - Infers Q&A answers from resume content, saves to `qa_bank`
- `EventLogger` service for structured audit trail
- Real-time progress via Redis pub/sub to WebSocket hub

**Mock adapters (need real implementations):**

| Adapter            | Mock File                  | Behavior                                     |
| ------------------ | -------------------------- | -------------------------------------------- |
| AdsPower API       | `ads-power.mock.ts`        | In-memory Map, fake CDP URLs                 |
| Browser Agent      | `browser-agent.mock.ts`    | Simulates Stagehand: navigate, fill, observe |
| Form Analyzer      | `form-analyzer.mock.ts`    | Returns hardcoded form structures            |
| CAPTCHA Detector   | `captcha-detector.mock.ts` | Random 10% trigger rate                      |
| Proxy Manager      | `proxy-manager.mock.ts`    | Generates fake IPs                           |
| LinkedIn Adapter   | `linkedin.mock.ts`         | Realistic multi-page flow data               |
| Greenhouse Adapter | `greenhouse.mock.ts`       | Realistic multi-page flow data               |

**What is needed:**

- `SandboxController` -- manages AdsPower profiles, engine connections, VNC
- `OrchestrationAgent` -- LLM-powered brain driving the browser
- `PageHandler` -- page-level form interaction logic
- `SandboxManager` service -- Fly Machine lifecycle
- Real platform adapters (replacing all mocks)
- Screenshot capture to S3

### 2.8 apps/web

**Role:** React SPA with Vite + TanStack Router.

**What exists:**

- Routing: dashboard, task detail, apply form, onboarding, settings, Q&A bank
- Task tracking with real-time WebSocket progress updates
- 8-step task stepper visualization
- ts-rest React Query v5 integration (`initTsrReactQuery`)
- Google OAuth login flow

**What is needed:**

- noVNC viewer integration (VNC takeover for CAPTCHA/review)
- Field review UI for copilot mode (approve/edit filled fields)
- Autopilot dashboard with quality gate status

---

## 3. Request Flows

### 3.1 Job Application Flow (Happy Path -- Autopilot)

```
User                    Web SPA              API Server           GH API             Worker              Browser Sandbox
 |                        |                     |                    |                  |                      |
 |-- POST /tasks -------->|                     |                    |                  |                      |
 |                        |-- POST /tasks ----->|                    |                  |                      |
 |                        |                     |-- INSERT task ---->|                  |                      |
 |                        |                     |-- emit task:created|                  |                      |
 |                        |                     |                    |-- dispatch ------>|                      |
 |                        |<-- 201 {taskId} ----|                    |                  |                      |
 |                        |                     |                    |                  |                      |
 |                        |         [WebSocket connected: tasks:{userId}]               |                      |
 |                        |                     |                    |                  |                      |
 |                        |                     |                    |   start-browser  |                      |
 |                        |                     |                    |   ============>  |                      |
 |                        |                     |                    |                  |-- provision sandbox ->|
 |                        |                     |                    |                  |<- CDP url + VNC url --|
 |                        |                     |                    |                  |                      |
 |<-- WS: state_change "provisioning" ----------|<-- Redis pub/sub --|<----- publish --|                      |
 |                        |                     |                    |                  |                      |
 |                        |                     |                    |   analyze-form   |                      |
 |                        |                     |                    |   ============>  |                      |
 |                        |                     |                    |                  |-- navigate to URL --->|
 |                        |                     |                    |                  |-- detect platform --->|
 |                        |                     |                    |                  |-- analyze DOM ------->|
 |                        |                     |                    |                  |<-- form structure ----|
 |<-- WS: progress 25% "Detected LinkedIn, 3 pages" ----------------|<----- publish --|                      |
 |                        |                     |                    |                  |                      |
 |                        |                     |                    |   fill-fields    |                      |
 |                        |                     |                    |   ============>  |                      |
 |                        |                     |                    |                  |-- map fields (LLM) ->|
 |                        |                     |                    |                  |-- fill via CDP ----->|
 |                        |                     |                    |                  |<-- filled 12 fields -|
 |<-- WS: progress 60% "Filled 12 fields" -----|<-- Redis pub/sub --|<----- publish --|                      |
 |                        |                     |                    |                  |                      |
 |                        |                     |                    |   upload-resume  |                      |
 |                        |                     |                    |   ============>  |                      |
 |                        |                     |                    |                  |-- upload via CDP ---->|
 |<-- WS: progress 70% ---|                     |                    |                  |                      |
 |                        |                     |                    |                  |                      |
 |                        |                     |                    |   check-captcha  |                      |
 |                        |                     |                    |   ============>  |                      |
 |                        |                     |                    |                  |-- screenshot -------->|
 |                        |                     |                    |                  |-- LLM: captcha? ----->|
 |                        |                     |                    |                  |<-- no captcha --------|
 |<-- WS: progress 80% ---|                     |                    |                  |                      |
 |                        |                     |                    |                  |                      |
 |                        |                     |                    |   submit         |                      |
 |                        |                     |                    |   ============>  |                      |
 |                        |                     |                    |                  |-- click submit ------>|
 |<-- WS: state_change "submitting" ------------|                    |                  |                      |
 |                        |                     |                    |                  |                      |
 |                        |                     |                    |   verify         |                      |
 |                        |                     |                    |   ============>  |                      |
 |                        |                     |                    |                  |-- check confirm page->|
 |                        |                     |                    |                  |-- screenshot to S3 -->|
 |<-- WS: completed {confirmationId} -----------|                    |                  |                      |
 |                        |                     |                    |                  |-- destroy sandbox --->|
 |                        |                     |                    |                  |                      |
```

### 3.2 Human-in-the-Loop Flow (CAPTCHA Takeover via VNC)

```
User                Web SPA            API Server         GH API            Worker             Sandbox
 |                    |                    |                 |                  |                  |
 |                    |                    |                 |  check-captcha   |                  |
 |                    |                    |                 |  (durableTask)   |                  |
 |                    |                    |                 |  ============>   |                  |
 |                    |                    |                 |                  |-- detect CAPTCHA->|
 |                    |                    |                 |                  |<-- CAPTCHA found -|
 |                    |                    |                 |                  |                  |
 |                    |                    |                 |                  |-- publish ------->|
 |<-- WS: human_needed {reason, vncUrl} --|<-- Redis -------|<----- publish --|                  |
 |                    |                    |                 |                  |                  |
 |  [User sees CAPTCHA alert in UI]       |                 |  ctx.waitFor(    |                  |
 |                    |                    |                 |  "captcha_solved"|                  |
 |-- Click "Take Over" -->|               |                 |  )               |                  |
 |                    |                    |                 |  [worker paused] |                  |
 |                    |-- GET /sandbox/vnc-token -->|        |                  |                  |
 |                    |                    |-- validate JWT  |                  |                  |
 |                    |                    |-- lookup Redis  |                  |                  |
 |                    |                    |   sandbox:{taskId}                 |                  |
 |                    |                    |-- generate one- |                  |                  |
 |                    |                    |   time VNC token|                  |                  |
 |                    |<-- {vncToken, wsUrl} --|             |                  |                  |
 |                    |                    |                 |                  |                  |
 |  [noVNC connects via WSS]              |                 |                  |                  |
 |                    |--- WSS fly-replay header ---------->|                  |                  |
 |                    |          (API validates, Fly routes to correct machine)|                  |
 |                    |<============================================ VNC stream ================>|
 |                    |                    |                 |                  |                  |
 |  [User solves CAPTCHA in VNC viewer]   |                 |                  |                  |
 |                    |                    |                 |                  |                  |
 |-- Click "Done" --->|                   |                 |                  |                  |
 |                    |-- POST /tasks/{id}/captcha-solved ->|                  |                  |
 |                    |                    |-- emit event -->|                  |                  |
 |                    |                    |                 |-- resume ------->|                  |
 |                    |                    |                 | captcha_solved   |                  |
 |                    |                    |                 |                  |-- continue ------>|
 |<-- WS: progress 80% "CAPTCHA solved" --|                 |                  |                  |
 |                    |                    |                 |                  |                  |
```

### 3.3 Resume Parsing Flow

```
User              Web SPA              API Server           GH API           Worker
 |                  |                     |                    |                |
 |-- Upload PDF --->|                     |                    |                |
 |                  |-- POST /resumes     |                    |                |
 |                  |   (multipart) ----->|                    |                |
 |                  |                     |-- Upload to S3     |                |
 |                  |                     |   (resumes bucket) |                |
 |                  |                     |-- INSERT resume    |                |
 |                  |                     |   status=uploaded  |                |
 |                  |                     |-- emit resume:     |                |
 |                  |                     |   uploaded ------->|                |
 |                  |<-- 201 {resumeId} --|                    |                |
 |                  |                     |                    |-- dispatch ---->|
 |                  |                     |                    |                |
 |                  |                     |                    | extract-text   |
 |                  |                     |                    | ==============>|
 |                  |                     |                    |                |-- S3 GetObject
 |                  |                     |                    |                |-- pdf-parse
 |                  |                     |                    |                |
 |                  |                     |                    | llm-parse      |
 |                  |                     |                    | ==============>|
 |                  |                     |                    |                |-- LLMRouter.complete()
 |                  |                     |                    |                |   taskType: answer_generation
 |                  |                     |                    |                |   model: claude-sonnet-4-5
 |                  |                     |                    |                |
 |                  |                     |                    |                |<-- structured JSON:
 |                  |                     |                    |                |    name, email, phone,
 |                  |                     |                    |                |    work history, education,
 |                  |                     |                    |                |    skills, inferred Q&A
 |                  |                     |                    |                |
 |                  |                     |                    | save-results   |
 |                  |                     |                    | ==============>|
 |                  |                     |                    |                |-- UPDATE resumes
 |                  |                     |                    |                |   SET parsedData, status=parsed
 |                  |                     |                    |                |-- INSERT qa_bank[]
 |                  |                     |                    |                |   (inferred answers)
 |                  |                     |                    |                |
 |<-- WS: resume_parsed {confidence} ----|<-- Redis pub/sub --|<--- publish --|
 |                  |                     |                    |                |
```

### 3.4 Copilot Review Flow

```
User                  Web SPA              API Server         Worker
 |                      |                     |                  |
 |                      |                     |                  |  [fill-fields completes]
 |                      |                     |                  |
 |<-- WS: field_review  |<-- Redis pub/sub --|<---- publish ----|
 |    {fields: [        |                     |                  |
 |      {name: "First   |                     |                  |
 |       Name",         |                     |                  |
 |       value: "Adam", |                     |                  |
 |       confidence:0.98,|                    |                  |
 |       source:"resume"|                    |                  |
 |      }, ...          |                     |                  |
 |    ]}                |                     |                  |
 |                      |                     |                  |
 |  [User reviews fields in UI]              |                  |
 |  [User edits "Expected Salary" field]     |                  |
 |  [User clicks "Approve & Submit"]         |                  |
 |                      |                     |                  |  [submit task is a durableTask]
 |-- Approve ---------->|                     |                  |  [ctx.waitFor("review_approved")]
 |                      |-- POST /tasks/{id}/ |                  |
 |                      |   review-approve -->|                  |
 |                      |                     |-- emit event --->|
 |                      |                     |  review_approved |
 |                      |                     |                  |-- resume -------->
 |                      |                     |                  |-- apply edits
 |                      |                     |                  |-- click submit
 |                      |                     |                  |
 |<-- WS: state_change "submitting" ---------|<---- publish ----|
 |                      |                     |                  |
 |<-- WS: completed ----|                     |                  |
 |                      |                     |                  |
```

---

## 4. Sandbox Architecture

The sandbox is an isolated browser environment where automation runs. It hosts AdsPower (anti-detect browser), a virtual display, and VNC for human takeover.

### 4.1 MVP: Worker-is-the-Sandbox

For the MVP, the browser runs directly on the worker machine. No separate Fly Machines.

```
+-----------------------------------------------+
|  Fly Worker Machine (shared-cpu-2x, 1GB)      |
|                                                |
|  +------------------+  +-------------------+  |
|  |  Node.js Worker  |  |  Xvfb :99         |  |
|  |  (GH REST client)|  |  (virtual display)|  |
|  |                  |  +-------------------+  |
|  |  - SandboxCtrl   |           |             |
|  |  - Stagehand     |  +-------------------+  |
|  |  - OrchAgent     |  |  x11vnc           |  |
|  +--------+---------+  |  (VNC server)     |  |
|           |             +-------------------+  |
|           | CDP                  |             |
|           v              websockify :6901     |
|  +------------------+           |             |
|  |  AdsPower        |  +-------------------+  |
|  |  (headless)      |  |  noVNC (optional) |  |
|  |  - anti-detect   |  |  HTTP :6080       |  |
|  |  - profile mgmt  |  +-------------------+  |
|  +------------------+                         |
+-----------------------------------------------+
```

**Constraints:**

- 1 session per worker machine
- CDP connection is localhost (no network latency)
- VNC exposed on the worker's HTTP service port
- Scale horizontally by adding more worker machines

**Dockerfile (single image):**

```
Base:    Ubuntu 22.04
Runtime: Node.js 22 + Xvfb + x11vnc + websockify + fluxbox
App:     AdsPower (downloaded at build) + Worker binary
Init:    supervisord manages all processes
Size:    ~1.5 GB
```

### 4.2 Production: Ephemeral Fly Machines

Each browser session gets its own Fly Machine, created on demand and destroyed after the session ends.

```
+-------------------+            +----------------------------------+
|  Worker Machine   |            |  Sandbox Machine (ephemeral)     |
|                   | CDP over   |                                  |
|  Node.js Worker   | WireGuard  |  Xvfb + x11vnc + websockify     |
|  - SandboxCtrl ---|----------->|  AdsPower (headless)             |
|  - Stagehand      |            |  noVNC HTTP                      |
|  - OrchAgent      |            |                                  |
+-------------------+            +----------------------------------+
         |                                    ^
         |                                    | WSS (fly-replay)
         v                                    |
+-------------------+            +-------------------+
|  API Server       |            |  User Browser     |
|                   |            |  (noVNC client)   |
|  fly-replay:      |----------->|                   |
|  instance={id}    |   302-like +-------------------+
+-------------------+
```

**Lifecycle:**

1. Worker calls Fly Machines API: `POST /v1/apps/{app}/machines` with sandbox Docker image
2. Machine boots (~3-5 seconds), starts Xvfb + AdsPower + x11vnc + websockify
3. `entrypoint.sh` generates a random VNC token, writes to stdout (captured by worker)
4. Worker connects Stagehand to AdsPower via CDP over Fly private network
5. VNC token stored in Redis: `sandbox:{taskId}` with 1-hour TTL (renewed while active)
6. When user requests VNC takeover: API validates JWT + VNC token, responds with `fly-replay` header
7. Fly proxy replays the WebSocket connection to the correct machine
8. On session end: worker calls `DELETE /v1/apps/{app}/machines/{id}` to destroy

**Networking:**

| Path              | Protocol | Route                                                                    |
| ----------------- | -------- | ------------------------------------------------------------------------ |
| Worker -> Sandbox | CDP/WS   | `{privateIp}.vm.{app}.internal:{cdpPort}` (WireGuard)                    |
| User -> Sandbox   | WSS      | API validates, responds `fly-replay: app=...,instance=...,state=started` |

**Redis Sandbox Registry:**

```
Key:   sandbox:{taskId}
Value: {
  machineId:          "e286504f711e86",
  appName:            "valet-sandbox-dev",
  privateIp:          "fdaa:0:1234::2",
  cdpPort:            9222,
  vncPort:            6901,
  vncToken:           "a7b3c9d2e1f0",
  adsPowerProfileId:  "profile_abc123",
  status:             "running",
  createdAt:          "2026-02-12T10:30:00Z"
}
TTL:   3600 (renewed every 5 minutes while active)
```

### 4.3 VNC Security

VNC access is token-gated:

1. API generates a one-time VNC token per session, stores in Redis
2. Frontend requests VNC access via `GET /api/v1/sandbox/{taskId}/vnc-token`
3. API validates: JWT is valid, user owns the task, task is in `waiting_human` state
4. API returns the VNC WebSocket URL with the token
5. Frontend connects via noVNC; the `fly-replay` header routes to the correct sandbox
6. Token is invalidated after first use or after 5 minutes (whichever comes first)

### 4.4 Cost Model

| Component           | Cost                   | Notes                        |
| ------------------- | ---------------------- | ---------------------------- |
| Fly Machine compute | $0.002-0.006/session   | shared-cpu-1x, ~3-5 min      |
| Residential proxy   | $0.05-0.10/session     | Per-IP pricing from provider |
| LLM API calls       | $0.02-0.05/session     | See Section 7 for breakdown  |
| **Total per app**   | **$0.07-0.16/session** |                              |

---

## 5. Browser Automation

### 5.1 Engine Architecture: Primary + Fallback

```
+-----------------------------------------------------------+
|  OrchestrationAgent                                       |
|                                                           |
|  +-----------------------+  +-------------------------+  |
|  |  Stagehand v3         |  |  Magnitude              |  |
|  |  (PRIMARY - DOM mode) |  |  (FALLBACK - vision)    |  |
|  |                       |  |                         |  |
|  |  - DOM parsing        |  |  - Pixel coordinates    |  |
|  |  - Built-in fillForm  |  |  - DOM-agnostic         |  |
|  |  - Element caching    |  |  - patchright           |  |
|  |  - Streaming callbacks|  |    (anti-detect fork)   |  |
|  |  - Custom tools (AI)  |  |  - Vision-first LLM    |  |
|  +-----------+-----------+  +------------+------------+  |
|              |                           |                |
|              +-------------+-------------+                |
|                            |                              |
|                     CDP Connection                        |
|                            |                              |
+----------------------------+------------------------------+
                             |
                             v
              +-----------------------------+
              |  AdsPower Browser           |
              |  (anti-detect Chromium)     |
              |                             |
              |  - Unique fingerprint       |
              |  - Persistent profile       |
              |  - Proxy binding            |
              |  - Cookie isolation         |
              +-----------------------------+
```

### 5.2 Stagehand v3 (Primary Engine)

Stagehand is a DOM-first browser automation agent built on Playwright with native CDP support.

**Integration points:**

- Connects to AdsPower via CDP URL (no local browser launch)
- Works with our 3-tier LLM router (supports any LLM via Vercel AI SDK)
- Built-in `fillForm` tool handles multi-field forms
- Element caching avoids redundant DOM queries on same page
- Streaming callbacks emit progress events to the worker

**Custom tools (Vercel AI SDK format):**

- `lookupQABank` -- checks existing Q&A bank before generating answers
- `checkBudget` -- queries BudgetTracker before making expensive LLM calls
- `logEvent` -- emits structured events to EventLogger

### 5.3 Magnitude (Fallback Engine)

Magnitude is a vision-first automation engine for complex/dynamic UIs where DOM parsing fails.

**When to switch:** After 3 consecutive Stagehand failures on the same page element, or when DOM structure is obfuscated (e.g., Shadow DOM, canvas-rendered forms).

**Integration:**

- Uses patchright (anti-detect Playwright fork) for stealth
- Pixel-coordinate based interactions -- works on any UI
- Takes screenshots and uses LLM vision to determine actions
- Higher LLM cost per action (screenshot analysis every step)

### 5.4 AdsPower Integration

AdsPower provides anti-detect browser profiles with unique fingerprints.

**Profile management:**

- One profile per user (reused across sessions for cookie persistence)
- Fingerprint includes: User-Agent, WebGL hash, Canvas hash, timezone, language, screen resolution
- Proxy binding per profile (residential IP)

**API surface (to implement):**

- `POST /api/v1/user/create` -- create browser profile
- `POST /api/v1/browser/start` -- launch profile, returns CDP URL
- `POST /api/v1/browser/stop` -- close profile
- `GET /api/v1/browser/active` -- list running profiles

### 5.5 Engine Selection Logic

```
analyze_page():
    try:
        result = stagehand.observe(page)      # DOM analysis
        if result.confidence > 0.7:
            return ("stagehand", result)
    except DOMParseError:
        pass

    # Fallback to vision
    screenshot = page.screenshot()
    result = magnitude.analyze(screenshot)     # Vision analysis
    return ("magnitude", result)
```

---

## 6. Orchestration Agent

### 6.1 Agent Architecture

The orchestration agent is the "brain" that drives the entire application process. It is an LLM-powered controller that decides what action to take at each step.

```
+----------------------------------------------------------------------+
|  OrchestrationAgent                                                  |
|                                                                      |
|  +--------------------+    +--------------------+    +-----------+   |
|  |  State Machine     |    |  SandboxController |    |  LLM      |   |
|  |                    |    |                    |    |  Router    |   |
|  |  CREATED           |    |  - AdsPower API    |    |           |   |
|  |  PROVISIONING      |    |  - Engine select   |    |  Sonnet   |   |
|  |  NAVIGATING        |    |  - CDP management  |    |  4.1-mini |   |
|  |  ANALYZING         |    |  - VNC control     |    |  4.1-nano |   |
|  |  FILLING           |    |  - Screenshot      |    +-----------+   |
|  |  REVIEWING         |    +--------------------+                    |
|  |  SUBMITTING        |                                              |
|  |  VERIFYING         |    +--------------------+    +-----------+   |
|  |  COMPLETED/FAILED  |    |  PageHandler       |    |  Q&A Bank |   |
|  +--------------------+    |                    |    |  Lookup   |   |
|                            |  - navigateToJob   |    +-----------+   |
|                            |  - analyzeForm     |                    |
|                            |  - mapFields       |    +-----------+   |
|                            |  - fillCurrentPage |    |  Budget   |   |
|                            |  - answerQuestion  |    |  Tracker  |   |
|                            |  - uploadDocument  |    +-----------+   |
|                            |  - submitApp       |                    |
|                            |  - verifySubmit    |    +-----------+   |
|                            |  - detectObstacle  |    |  Event    |   |
|                            +--------------------+    |  Logger   |   |
|                                                      +-----------+   |
+----------------------------------------------------------------------+
```

### 6.2 State Machine

```
                        +----------+
                        | CREATED  |
                        +----+-----+
                             |
                             v
                     +-------+--------+
                     | PROVISIONING   |  AdsPower profile + sandbox
                     +-------+--------+
                             |
                             v
                     +-------+--------+
                     | NAVIGATING     |  Navigate to job URL
                     +-------+--------+
                             |
                             v
                     +-------+--------+
              +----->| ANALYZING      |  Detect platform, parse form
              |      +-------+--------+
              |              |
              |              v
              |      +-------+--------+
              |      | FILLING        |  Map fields, fill form, upload docs
              |      +-------+--------+
              |              |
              |              +------- mode == copilot? ------+
              |              |                               |
              |              | no                             v
              |              |                    +----------+--------+
              |              |                    | REVIEWING         |
              |              |                    | (copilot pause)   |
              |              |                    | waitFor(review_   |
              |              |                    |   approved)       |
              |              |                    +----------+--------+
              |              |                               |
              |              +<------------------------------+
              |              |
              |              v                  captcha/error
              |      +-------+--------+    +----> WAITING_HUMAN
              |      | SUBMITTING     |    |     (durableTask waitFor)
              |      +-------+--------+    |          |
              |              |             |          | event received
              |              +-------------+          |
              |              |   <--------------------+
              |              v
              |      +-------+--------+
              |      | VERIFYING      |  Confirm submission
              |      +-------+--------+
              |              |
              |         +----+----+
              |         |         |
              |         v         v
              |   +---------+ +--------+
              |   |COMPLETED| |FAILED  |
              |   +---------+ +---+----+
              |                   |
              +-------------------+  retry (max 3)
```

### 6.3 SandboxController

Manages the lifecycle of a browser sandbox for a single application session.

```
class SandboxController:
    constructor(taskId, userId, config)

    // Lifecycle
    async provision():    Create AdsPower profile, start browser, connect engine
    async connect():      Establish CDP connection to AdsPower
    async teardown():     Stop browser, cleanup profile, destroy machine

    // Engine
    getEngine():          Returns current Stagehand or Magnitude instance
    switchEngine():       Fallback from Stagehand to Magnitude

    // VNC
    getVncUrl():          Returns websockify URL for human takeover
    enableVnc():          Start VNC server (x11vnc + websockify)
    disableVnc():         Stop VNC server

    // Screenshot
    async screenshot():   Capture current page, upload to S3, return URL
```

### 6.4 OrchestrationAgent

LLM-powered brain with methods for each phase of the application process.

```
class OrchestrationAgent:
    constructor(sandbox: SandboxController, llm: LLMRouter, qaBank, budget)

    // Navigation
    async navigateToJob(url):         Navigate browser to job URL
    async detectPlatform():           Identify ATS platform from page

    // Analysis
    async analyzeCurrentForm():       Extract form structure via DOM/vision
    async mapFieldsToUserData(form):  LLM maps form fields to user data

    // Interaction
    async fillCurrentPage(mapping):   Fill all fields on current page
    async answerScreeningQuestion(q): Check QA bank -> LLM generate -> quality gate
    async uploadDocument(field, doc):  Handle file upload fields

    // Submission
    async submitApplication():        Click submit, handle confirmation dialogs
    async verifySubmission():         Check for confirmation page/email

    // Error handling
    async detectObstacle():           LLM screenshot analysis for blocks
    async handleObstacle(obstacle):   Retry / human_takeover / abort
```

### 6.5 Screening Question Strategy

```
Question arrives
       |
       v
+------+-------+
| QA Bank      |  Exact or fuzzy match?
| Lookup       +----> YES: use stored answer (confidence from source)
+------+-------+
       | NO
       v
+------+-------+
| LLM Generate |  Generate answer from user profile + resume
+------+-------+
       |
       v
+------+-------+
| Quality Gate |  confidence >= 0.85?
+------+-------+
       |         |
      YES        NO
       |         |
       v         v
  Auto-fill   Copilot review
       |      (pause for user)
       v         |
+------+-------+ |
| Save to      |<+  After submission
| QA Bank      |     (verified answers only)
+--------------+
```

### 6.6 Error Recovery

```
Obstacle detected (via LLM screenshot analysis)
       |
       v
+------+-------+
| Classify     |  CAPTCHA / login_wall / error_page / rate_limit / unknown
+------+-------+
       |
       +-- CAPTCHA --------> human_takeover (durableTask waitFor)
       |
       +-- login_wall -----> re-authenticate via AdsPower profile cookies
       |
       +-- error_page -----> retry (max 3, exponential backoff)
       |
       +-- rate_limit -----> wait + retry (backoff 30s, 60s, 120s)
       |
       +-- unknown ---------> screenshot to S3 + human_takeover
```

### 6.7 Copilot vs Autopilot

| Feature              | Copilot                               | Autopilot                            |
| -------------------- | ------------------------------------- | ------------------------------------ |
| Screenshot frequency | Every step                            | On state transitions only            |
| Field review         | Required (pause for approval)         | Auto-fill if confidence > 0.85       |
| Screening questions  | Always reviewed by user               | Auto-answer if QA bank match > 0.9   |
| Submission           | Requires explicit "Submit" click      | Auto-submit after quality gates pass |
| Quality gates        | User is the quality gate              | 9 automated gates (see below)        |
| Speed                | ~3-5 min/application (user-dependent) | ~1-2 min/application                 |

**Autopilot Quality Gates:**

1. All required fields filled
2. No field confidence below 0.7
3. Resume uploaded successfully
4. No unresolved screening questions
5. No CAPTCHA detected
6. Platform rate limit not exceeded
7. Per-application budget not exceeded
8. Per-user daily budget not exceeded
9. No obstacle detected on pre-submit screenshot

---

## 7. LLM Strategy

### 7.1 Three-Tier Model Routing

```
+-------------------------------------------------------------------+
|  LLMRouter                                                        |
|                                                                   |
|  PRIMARY (complex reasoning)         Cost/1K tokens               |
|  +----------------------------+     Input    Output               |
|  | Claude Sonnet 4.5          |     $0.003   $0.015               |
|  | - form_analysis            |                                   |
|  | - answer_generation        |                                   |
|  | - screenshot_analysis      |                                   |
|  +----------------------------+                                   |
|                                                                   |
|  SECONDARY (routine tasks)                                        |
|  +----------------------------+                                   |
|  | GPT-4.1 mini               |     $0.0004  $0.0016              |
|  | - field_mapping            |                                   |
|  | - error_recovery           |                                   |
|  +----------------------------+                                   |
|                                                                   |
|  BUDGET (trivial tasks)                                           |
|  +----------------------------+                                   |
|  | GPT-4.1 nano               |     $0.0001  $0.0004              |
|  | - confirmation             |                                   |
|  | - navigation               |                                   |
|  +----------------------------+                                   |
|                                                                   |
|  FALLBACK: primary -> secondary -> budget -> error                |
|  Retries on: 5xx, rate limit, timeout, overloaded                 |
+-------------------------------------------------------------------+
```

### 7.2 Task Type Routing Table

| Task Type             | Model             | Tier      | Use Case                                      |
| --------------------- | ----------------- | --------- | --------------------------------------------- |
| `form_analysis`       | Claude Sonnet 4.5 | Primary   | Parse form structure from DOM/screenshot      |
| `answer_generation`   | Claude Sonnet 4.5 | Primary   | Generate screening question answers           |
| `screenshot_analysis` | Claude Sonnet 4.5 | Primary   | Detect obstacles, verify submission           |
| `field_mapping`       | GPT-4.1 mini      | Secondary | Map form fields to user profile data          |
| `error_recovery`      | GPT-4.1 mini      | Secondary | Diagnose and recover from automation errors   |
| `confirmation`        | GPT-4.1 nano      | Budget    | Verify page state (is this the confirm page?) |
| `navigation`          | GPT-4.1 nano      | Budget    | Determine next navigation action              |

### 7.3 Budget Enforcement

```
BudgetTracker (Redis-backed)
|
+-- Per-application limit: $0.10 (default)
|   Key: budget:app:{applicationId}
|   Checked before every LLM call
|
+-- Per-user daily limit: $5.00 (default)
|   Key: budget:user:{userId}:{YYYY-MM-DD}
|   TTL: 2 days
|
+-- Request log for audit:
    Key: budget:log:{applicationId}
    Entries: [{model, inputTokens, outputTokens, costUsd, timestamp}]
    TTL: 7 days
```

### 7.4 Cost per Application (Estimated)

| Step                    | Model        | Input Tokens | Output Tokens | Cost       |
| ----------------------- | ------------ | ------------ | ------------- | ---------- |
| Form analysis           | Sonnet 4.5   | ~2,000       | ~500          | $0.014     |
| Field mapping           | GPT-4.1 mini | ~1,500       | ~300          | $0.001     |
| Screening Q&A (x3)      | Sonnet 4.5   | ~1,000 x3    | ~200 x3       | $0.018     |
| Screenshot analysis x2  | Sonnet 4.5   | ~1,500 x2    | ~100 x2       | $0.012     |
| Navigation decisions x3 | GPT-4.1 nano | ~500 x3      | ~50 x3        | $0.0003    |
| Confirmation            | GPT-4.1 nano | ~300         | ~50           | $0.0001    |
| **Total (typical)**     |              |              |               | **$0.045** |
| **Total (worst case)**  |              |              |               | **$0.12**  |

### 7.5 Response Cache

Hash-based deduplication prevents redundant LLM calls for identical inputs. Cache key is `sha256(model + messages + temperature)`. Cache is stored in Redis with a 1-hour TTL. Particularly effective for:

- Repeated navigation decisions on same page
- Identical screening questions across applications
- Form analysis of standard platform layouts

---

## 8. Data Model

### 8.1 Entity Relationship Diagram

```
+------------------+       +------------------+       +--------------------+
|  users           |       |  tasks           |       |  task_events       |
|------------------|       |------------------|       |--------------------|
|  id (PK, UUID)   |<--+   |  id (PK, UUID)   |<--+   |  id (PK, UUID)     |
|  email           |   |   |  user_id (FK) ---|---+   |  task_id (FK) -----|--+
|  name            |   |   |  job_url         |   |   |  event_type        |  |
|  google_id       |   |   |  platform        |   |   |  metadata (JSONB)  |  |
|  phone           |   |   |  status          |   |   |  created_at        |  |
|  location        |   |   |  mode            |   |   +--------------------+  |
|  linkedin_url    |   |   |  resume_id       |   |                          |
|  work_history    |   |   |  job_title       |   |   +--------------------+  |
|  education       |   |   |  company_name    |   |   |  application_results|  |
|  skills          |   |   |  progress        |   |   |--------------------|  |
|  preferences     |   |   |  current_step    |   +---|  task_id (FK)      |  |
|  subscription    |   |   |  confidence_score|       |  result_type       |  |
|  tier            |   |   |  match_score     |       |  data (JSONB)      |  |
|  created_at      |   |   |  fields_filled   |       |  created_at        |  |
|  deleted_at      |   |   |  duration_seconds|       +--------------------+  |
+------------------+   |   |  error_code      |                               |
        |              |   |  workflow_run_id  |       +--------------------+  |
        |              |   |  browser_profile  |       |  application_fields|  |
        |              |   |  _id              |       |--------------------|  |
        |              |   |  screenshots      |       |  application_id    |--+
        |              |   |  llm_usage        |       |    (FK -> tasks)   |
        |              |   |  created_at       |       |  field_name        |
        |              |   |  started_at       |       |  field_value       |
        |              |   |  completed_at     |       |  confidence        |
        |              |   +------------------+       |  source            |
        |              |                               +--------------------+
        |              |
        |   +----------+---+       +--------------------+
        |   |  resumes     |       |  qa_bank           |
        |   |--------------|       |--------------------|
        +---|  user_id(FK) |   +---|  user_id (FK)      |
        |   |  filename    |   |   |  category          |
        |   |  storage_key |   |   |  question          |
        |   |  parsed_data |   |   |  answer            |
        |   |  raw_text    |   |   |  source            |
        |   |  parsing_    |   |   |  created_at        |
        |   |  confidence  |   |   +--------------------+
        |   |  status      |   |
        |   |  parsed_at   |   |   +--------------------+
        |   +--------------+   |   |  consent_records   |
        |                      |   |--------------------|
        +----------------------+---|  user_id (FK)      |
        |                          |  consent_type      |
        |                          |  version           |
        |                          |  ip_address        |
        |                          |  granted_at        |
        |                          |  revoked_at        |
        |                          +--------------------+
        |
        |   +------------------+       +--------------------+
        |   | browser_profiles |       |  proxy_bindings    |
        |   |------------------|       |--------------------|
        +---| user_id (FK)     |       |  profile_id        |
        |   | ads_power_id     |       |  proxy_host        |
        |   | fingerprint      |       |  proxy_port        |
        |   | last_used_at     |       |  proxy_type        |
        |   +------------------+       |  assigned_at       |
        |                              +--------------------+
        |
        |   +------------------+
        |   |  audit_trail     |
        |   |------------------|
        +---| user_id          |
            | action           |
            | entity_type      |
            | entity_id        |
            | metadata (JSONB) |
            | ip_address       |
            | created_at       |
            +------------------+
```

### 8.2 Key Enums

```sql
task_status:      created | queued | in_progress | waiting_human | completed | failed | cancelled
platform:         linkedin | greenhouse | lever | workday | unknown
application_mode: copilot | autopilot
```

### 8.3 Key Indexes

| Table | Index                    | Columns                 | Purpose                    |
| ----- | ------------------------ | ----------------------- | -------------------------- |
| tasks | `idx_tasks_user_status`  | `(user_id, status)`     | Dashboard task list filter |
| tasks | `idx_tasks_user_created` | `(user_id, created_at)` | Task history pagination    |
| tasks | `idx_tasks_status`       | `(status)`              | Worker queue polling       |

---

## 9. Deployment Architecture

### 9.1 Fly.io Application Layout

```
Fly.io Organization: wekruit
|
+-- valet-api-{env}         Fastify API server
|   Config: fly/api.toml
|   Machine: shared-cpu-2x, 512MB
|   Scaling: min=1, max=3
|   Ports: 8000 (HTTP), 443 (TLS termination)
|
+-- valet-web-{env}         Static SPA (Vite build)
|   Config: fly/web.toml
|   Machine: shared-cpu-1x, 256MB
|   Scaling: min=1, max=2
|   Build args: VITE_API_URL, VITE_WS_URL
|
+-- valet-worker-{env}      GhostHands job dispatch worker
|   Config: fly/worker.toml
|   Machine: shared-cpu-2x, 1GB (MVP: includes browser)
|   Scaling: min=1, max=5
|   Ports: none (outbound only, except VNC in MVP)
|
|
+-- valet-sandbox-{env}     (Production only) Ephemeral browser machines
    No toml -- created via Fly Machines API
    Machine: shared-cpu-1x, 512MB
    Lifecycle: created per session, destroyed after
```

### 9.2 Environment Matrix

| Env        | Branch  | API URL                       | Web URL                       |
| ---------- | ------- | ----------------------------- | ----------------------------- |
| Local      | any     | http://localhost:8000         | http://localhost:5173         |
| Dev        | develop | https://valet-api-dev.fly.dev | https://valet-web-dev.fly.dev |
| Staging    | staging | https://valet-api-stg.fly.dev | https://valet-web-stg.fly.dev |
| Production | main    | https://valet-api.fly.dev     | https://valet-web.fly.dev     |

### 9.3 CI/CD Pipeline

```
feature/* branch
    |
    v
+-------------------+
| GitHub Actions CI |  .github/workflows/ci.yml
| - pnpm install    |  Trigger: push to any branch, PR
| - pnpm lint       |
| - pnpm typecheck  |
| - pnpm test       |
| - pnpm build      |
| - pnpm audit      |
+-------------------+
    |
    | PR merged
    v
+-------------------+      +-------------------+      +-------------------+
| develop branch    |      | staging branch    |      | main branch       |
| cd-dev.yml        |      | cd-staging.yml    |      | cd-prod.yml       |
| Auto-deploy to    |----->| Auto-deploy to    |----->| Auto-deploy to    |
| Fly.io dev        |  PR  | Fly.io stg        |  PR  | Fly.io prod       |
+-------------------+      +-------------------+      +-------------------+
```

**Deploy order (per environment):** API -> Worker -> Web

Each CD workflow:

1. Builds the relevant app(s)
2. Deploys via `fly deploy --config fly/{app}.toml --app valet-{app}-{env} --remote-only`
3. Runs health check against deployed URL

### 9.4 External Services

| Service         | Provider          | Purpose                               | Connection                  |
| --------------- | ----------------- | ------------------------------------- | --------------------------- |
| Database        | Supabase Postgres | Primary data store                    | Pooler :6543 / Direct :5432 |
| Redis           | Upstash           | Cache, pub/sub, rate limiting, budget | TLS (rediss://)             |
| Object Store    | Supabase Storage  | Resumes, screenshots, artifacts       | S3 API (HTTPS)              |
| Auth            | Google OAuth 2.0  | User authentication                   | HTTPS                       |
| Job Dispatch    | GhostHands API    | Browser automation orchestration      | REST (X-GH-Service-Key)     |
| Message Queue   | CloudAMQP         | Async messaging (RabbitMQ)            | AMQPS                       |
| LLM (primary)   | Anthropic         | Claude Sonnet 4.5                     | HTTPS API                   |
| LLM (secondary) | OpenAI            | GPT-4.1 mini + nano                   | HTTPS API                   |

---

## 10. Security Model

Full details in `docs/security-architecture.md`. Summary of key controls:

### 10.1 Authentication

- Google OAuth 2.0 (no password storage)
- JWT RS256 (asymmetric signing)
- Access tokens: 15-minute expiry, httpOnly cookie
- Refresh tokens: 7-day expiry, one-time-use rotation
- WebSocket auth: JWT validated on handshake

### 10.2 Authorization

- All database queries scoped to authenticated `userId`
- No admin role (yet) -- single-tenant per user
- Consent-gated features (5-layer progressive consent)
- Rate limits per user and per platform

### 10.3 Browser Sandbox Security

- Each sandbox runs in an isolated Fly Machine (production)
- AdsPower profiles are per-user, not shared
- VNC access requires: valid JWT + task ownership + task in `waiting_human` state + one-time token
- CDP connections are over Fly private WireGuard mesh (not public internet)
- Sandbox machines are destroyed after session ends (no persistent state beyond AdsPower profile)

### 10.4 Data Protection

- TLS 1.2+ for all connections (HTTPS, WSS, database, Redis)
- S3 objects encrypted at rest (SSE-S3, AES-256)
- PII redacted from logs (pino) and error tracking (Sentry)
- GDPR: data export, 30-day soft delete, consent records
- Resume content processed in-memory only (not cached on disk)

### 10.5 LLM Security

- User PII inserted into prompts via structured templates with delimiters
- LLM output validated against Zod schemas before use
- No raw LLM output used in SQL, shell commands, or DOM manipulation
- Budget limits prevent runaway API costs
- Prompt injection mitigated by system/user message separation

---

## 11. Scaling Strategy

### 11.1 MVP Phase (0-100 users)

```
Architecture:  Worker IS the sandbox (single Dockerfile)
Workers:       1-3 machines (1 session each, shared-cpu-2x)
Throughput:    ~3-5 concurrent applications
Database:      Supabase free/pro tier
Redis:         Upstash free tier
Cost:          ~$20-50/month infrastructure
```

### 11.2 Growth Phase (100-1,000 users)

```
Architecture:  Ephemeral Fly Machines for sandboxes
Workers:       3-5 machines (orchestration only, lighter)
Sandboxes:     Up to 20 concurrent (created on demand)
Throughput:    ~15-20 concurrent applications
Database:      Supabase Pro
Redis:         Upstash Pro
Cost:          ~$100-300/month infrastructure + per-session costs
```

### 11.3 Scale Phase (1,000+ users)

```
Architecture:  Multi-region, queue-based job scheduling
Workers:       Auto-scaled pool across regions
Sandboxes:     50+ concurrent across regions
Queue:         Priority queue (paid users first)
Database:      Supabase with read replicas
Redis:         Upstash with replication
LLM:           Response cache + pre-computed QA bank
Cost:          ~$500-2,000/month + per-session costs
```

### 11.4 MVP to Production Migration Path

| Step | Change                                      | Effort |
| ---- | ------------------------------------------- | ------ |
| 1    | Extract browser from worker Dockerfile      | Small  |
| 2    | Create sandbox Dockerfile                   | Medium |
| 3    | Implement SandboxManager (Fly Machines API) | Medium |
| 4    | Add fly-replay VNC proxy to API             | Small  |
| 5    | Update worker to connect via private net    | Small  |
| 6    | Add sandbox cleanup cron job                | Small  |

---

## 12. Implementation Roadmap

### Phase 1: Core Automation (MVP)

Priority: Get a single LinkedIn application working end-to-end.

| #   | Task                                             | Depends On | Effort |
| --- | ------------------------------------------------ | ---------- | ------ |
| 1   | Create sandbox Dockerfile (worker+browser)       | --         | 2 days |
| 2   | Implement real AdsPower API client               | --         | 2 days |
| 3   | Implement SandboxController                      | 1, 2       | 3 days |
| 4   | Integrate Stagehand v3 (CDP connection)          | 3          | 3 days |
| 5   | Implement OrchestrationAgent                     | 4          | 5 days |
| 6   | Implement PageHandler                            | 4          | 3 days |
| 7   | Build LinkedIn adapter (real)                    | 5, 6       | 3 days |
| 8   | Wire orchestration into job-application workflow | 5, 7       | 2 days |
| 9   | Add screenshot capture to S3                     | 3          | 1 day  |
| 10  | End-to-end test: LinkedIn Copilot                | 8, 9       | 2 days |

**Phase 1 total: ~4-5 weeks**

### Phase 2: Human-in-the-Loop

| #   | Task                                     | Depends On | Effort |
| --- | ---------------------------------------- | ---------- | ------ |
| 11  | VNC proxy endpoint (fly-replay)          | Phase 1    | 2 days |
| 12  | noVNC frontend component                 | --         | 2 days |
| 13  | VNC token flow (Redis, validation)       | 11         | 1 day  |
| 14  | CAPTCHA detection (real, via screenshot) | Phase 1    | 2 days |
| 15  | Field review UI (copilot mode)           | --         | 3 days |
| 16  | End-to-end test: CAPTCHA takeover        | 11-14      | 1 day  |

**Phase 2 total: ~2-3 weeks**

### Phase 3: Intelligence

| #   | Task                                             | Depends On | Effort |
| --- | ------------------------------------------------ | ---------- | ------ |
| 17  | Obstacle detection prompt                        | Phase 1    | 1 day  |
| 18  | Question categorization prompt                   | --         | 1 day  |
| 19  | QA Bank lookup integration in agent              | Phase 1    | 1 day  |
| 20  | Magnitude fallback engine                        | Phase 1    | 3 days |
| 21  | Engine switching logic                           | 20         | 1 day  |
| 22  | Autopilot quality gates                          | Phase 1    | 2 days |
| 23  | Screening question flow (QA bank -> LLM -> save) | 18, 19     | 2 days |

**Phase 3 total: ~2 weeks**

### Phase 4: Multi-Platform + Production

| #   | Task                                | Depends On | Effort |
| --- | ----------------------------------- | ---------- | ------ |
| 24  | Greenhouse adapter (real)           | Phase 1    | 3 days |
| 25  | Lever adapter (real)                | Phase 1    | 3 days |
| 26  | Workday adapter (real)              | Phase 1    | 5 days |
| 27  | Ephemeral Fly Machine sandbox       | Phase 2    | 3 days |
| 28  | SandboxManager (Fly Machines API)   | 27         | 2 days |
| 29  | Sandbox cleanup cron                | 28         | 1 day  |
| 30  | Production Dockerfiles for all apps | --         | 2 days |
| 31  | Load testing + performance tuning   | 27-30      | 3 days |

**Phase 4 total: ~4-5 weeks**

### Phase Summary

```
Phase 1: Core Automation       4-5 weeks    One platform, copilot mode, end-to-end
Phase 2: Human-in-the-Loop     2-3 weeks    VNC takeover, CAPTCHA, field review UI
Phase 3: Intelligence          2 weeks      Fallback engine, QA bank, autopilot gates
Phase 4: Multi-Platform + Prod 4-5 weeks    More platforms, ephemeral sandboxes, prod

Total estimated:               12-15 weeks
```

### Files to Create

```
# Sandbox
apps/worker/src/sandbox/sandbox-controller.ts
apps/worker/src/services/sandbox-manager.ts
docker/sandbox/Dockerfile
docker/sandbox/supervisord.conf
docker/sandbox/entrypoint.sh

# Agent
apps/worker/src/agent/orchestration-agent.ts
apps/worker/src/agent/page-handler.ts

# Real Adapters (replacing mocks)
apps/worker/src/adapters/ads-power.ts
apps/worker/src/adapters/browser-agent.ts
apps/worker/src/adapters/linkedin.ts
apps/worker/src/adapters/greenhouse.ts

# LLM Prompts
packages/llm/src/prompts/obstacle-detection.ts
packages/llm/src/prompts/question-categorization.ts
packages/llm/src/prompts/screenshot-analysis.ts

# Frontend
packages/ui/src/components/vnc-viewer.tsx
```

### Dependencies to Add

```json
{
  "@anthropic-ai/stagehand": "latest",
  "magnitude-core": "latest",
  "ai": "latest"
}
```

---

_This document is the authoritative architecture reference for WeKruit Valet. It should be updated as implementation progresses and design decisions evolve. Last updated: 2026-02-12._
