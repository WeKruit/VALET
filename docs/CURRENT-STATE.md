# VALET - Current State Technical Documentation

> Generated from source code analysis, February 2026.

## 1. Architecture Overview

### Monorepo Layout

VALET is a Turborepo + pnpm workspaces monorepo with 8 workspaces:

```
wekruit-valet/
├── apps/
│   ├── api/              Fastify 5.x REST API + WebSocket server
│   ├── web/              React 18 SPA (Vite + React Router)
│   └── worker/           GhostHands job dispatch worker
├── packages/
│   ├── shared/           Zod schemas, types, constants, error classes
│   ├── contracts/        ts-rest API contract definitions
│   ├── db/               Drizzle ORM schema, migrations, database client
│   ├── ui/               shadcn/ui component library (WeKruit themed)
│   └── llm/              LLM provider router (Anthropic + OpenAI)
├── fly/                  Fly.io deployment configs (api.toml, web.toml, worker.toml)
├── infra/
│   ├── terraform/        EC2 sandbox provisioning
│   ├── scripts/          Install scripts (AdsPower, set-secrets, health-check)
│   └── docs/             Infrastructure documentation
├── docker/               Docker Compose + init-db.sql for local infra
├── scripts/              Dev setup, Fly setup, health check, CI validation
├── tests/                E2E tests, fixtures
├── docs/                 Technical documentation
├── core-docs/            Architecture specs, research, GH integration docs
├── .github/workflows/    CI/CD pipelines (10 workflow files)
└── product-research/     Product research and analysis
```

### Dependency Graph

```
                  shared
                 /  |   \
           contracts llm  ui
           /  |      |
         api  worker  web
          |   |
          db  db
```

Explicit dependencies:

- `contracts` -> `shared`
- `llm` -> `shared`
- `ui` -> `shared`
- `api` -> `contracts`, `db`, `shared`, `llm`
- `web` -> `contracts`, `shared`, `ui`
- `worker` -> `contracts`, `db`, `shared`, `llm`
- `db` -> standalone (no internal deps)

### Runtime Architecture

```
[Browser] --> [Fly.io: apps/web SPA] --> [Fly.io: apps/api]
                                              |
                                    +---------+---------+
                                    |         |
                              [Supabase]  [Upstash]
                              (Postgres)  (Redis)
                                    |
                              [GhostHands API on EC2]
                              (POST /api/v1/gh/valet/apply)
                                    |
                              [AdsPower Browser]
```

## 2. Database Schema

Database: Supabase PostgreSQL 16. ORM: Drizzle. Schema defined in `packages/db/src/schema/`.

### Tables (19 total)

#### `users`

Core user table with profile, auth, subscription, and GDPR fields.

| Column                    | Type                        | Notes                          |
| ------------------------- | --------------------------- | ------------------------------ |
| id                        | uuid (PK)                   | auto-generated                 |
| email                     | varchar(255)                | unique, not null               |
| name                      | varchar(255)                | not null                       |
| avatarUrl                 | text                        | nullable                       |
| googleId                  | varchar(255)                | unique, nullable               |
| passwordHash              | varchar(255)                | nullable (for email/pass auth) |
| emailVerified             | boolean                     | default false                  |
| emailVerificationToken    | varchar(255)                | nullable                       |
| emailVerificationExpiry   | timestamptz                 | nullable                       |
| passwordResetToken        | varchar(255)                | nullable                       |
| passwordResetExpiry       | timestamptz                 | nullable                       |
| phone                     | varchar(50)                 | nullable                       |
| location                  | varchar(255)                | nullable                       |
| linkedinUrl               | varchar(500)                | nullable                       |
| githubUrl                 | varchar(500)                | nullable                       |
| portfolioUrl              | varchar(500)                | nullable                       |
| workHistory               | jsonb                       | default []                     |
| education                 | jsonb                       | default []                     |
| skills                    | jsonb                       | default []                     |
| certifications            | jsonb                       | default []                     |
| languages                 | jsonb                       | default []                     |
| preferences               | jsonb                       | default {}                     |
| stripeCustomerId          | varchar(255)                | unique, nullable               |
| role                      | enum(user/admin/superadmin) | default 'user'                 |
| subscriptionTier          | varchar(50)                 | default 'free'                 |
| isActive                  | boolean                     | default true                   |
| acceptedDisclaimerVersion | varchar(20)                 | nullable                       |
| acceptedDisclaimerAt      | timestamptz                 | nullable                       |
| createdAt                 | timestamptz                 | not null                       |
| updatedAt                 | timestamptz                 | not null                       |
| deletedAt                 | timestamptz                 | nullable (soft delete)         |
| deletionScheduledAt       | timestamptz                 | nullable (GDPR)                |

#### `tasks`

Core job application task table. Links to users, resumes, browser profiles, sandboxes.

| Column                                       | Type                                                                      | Notes             |
| -------------------------------------------- | ------------------------------------------------------------------------- | ----------------- |
| id                                           | uuid (PK)                                                                 |                   |
| userId                                       | uuid (FK -> users)                                                        | cascade delete    |
| jobUrl                                       | text                                                                      | not null          |
| platform                                     | enum(linkedin/greenhouse/lever/workday/unknown)                           | default 'unknown' |
| status                                       | enum(created/queued/in_progress/waiting_human/completed/failed/cancelled) | default 'created' |
| mode                                         | enum(copilot/autopilot)                                                   | default 'copilot' |
| resumeId                                     | uuid (FK -> resumes)                                                      | nullable          |
| jobTitle                                     | varchar(500)                                                              | nullable          |
| companyName                                  | varchar(255)                                                              | nullable          |
| jobLocation                                  | varchar(255)                                                              | nullable          |
| externalStatus                               | enum(applied/viewed/interview/rejected/offer/ghosted)                     | nullable          |
| progress                                     | integer                                                                   | default 0         |
| currentStep                                  | varchar(100)                                                              | nullable          |
| confidenceScore                              | real                                                                      | nullable          |
| matchScore                                   | real                                                                      | nullable          |
| fieldsFilled                                 | integer                                                                   | default 0         |
| durationSeconds                              | integer                                                                   | nullable          |
| errorCode                                    | varchar(100)                                                              | nullable          |
| errorMessage                                 | text                                                                      | nullable          |
| retryCount                                   | integer                                                                   | default 0         |
| workflowRunId                                | varchar(255)                                                              | GhostHands job ID |
| browserProfileId                             | uuid (FK -> browser_profiles)                                             | nullable          |
| screenshots                                  | jsonb                                                                     | default {}        |
| llmUsage                                     | jsonb                                                                     | default {}        |
| notes                                        | text                                                                      | nullable          |
| sandboxId                                    | uuid (FK -> sandboxes)                                                    | nullable          |
| interactionType                              | varchar(50)                                                               | HITL blocker type |
| interactionData                              | jsonb                                                                     | HITL blocker data |
| createdAt, updatedAt, startedAt, completedAt | timestamptz                                                               |                   |

Indexes: `(userId, status)`, `(userId, createdAt)`, `(status)`, `(interactionType)`, `(sandboxId)`, `(sandboxId, status)`

#### `task_events`

Audit log of task state transitions.

| Column     | Type               | Notes          |
| ---------- | ------------------ | -------------- |
| id         | uuid (PK)          |                |
| taskId     | uuid (FK -> tasks) | cascade delete |
| eventType  | varchar(100)       | not null       |
| fromStatus | varchar(50)        | nullable       |
| toStatus   | varchar(50)        | nullable       |
| eventData  | jsonb              | default {}     |
| createdAt  | timestamptz        |                |

#### `resumes`

Uploaded resume files with LLM-parsed structured data.

| Column                         | Type                                        | Notes                         |
| ------------------------------ | ------------------------------------------- | ----------------------------- |
| id                             | uuid (PK)                                   |                               |
| userId                         | uuid (FK -> users)                          | cascade delete                |
| filename                       | varchar(255)                                | not null                      |
| fileKey                        | varchar(500)                                | S3 storage key, not null      |
| fileSizeBytes                  | integer                                     | not null                      |
| mimeType                       | varchar(100)                                | not null                      |
| isDefault                      | boolean                                     | default false                 |
| status                         | enum(uploading/parsing/parsed/parse_failed) | default 'uploading'           |
| parsedData                     | jsonb                                       | LLM-extracted structured data |
| parsingConfidence              | real                                        | nullable                      |
| rawText                        | text                                        | extracted plain text          |
| createdAt, parsedAt, expiresAt | timestamptz                                 |                               |

#### `qa_bank`

User's Q&A knowledge base for form filling.

| Column               | Type                                                 | Notes                |
| -------------------- | ---------------------------------------------------- | -------------------- |
| id                   | uuid (PK)                                            |                      |
| userId               | uuid (FK -> users)                                   | cascade delete       |
| category             | varchar(50)                                          | not null             |
| question             | text                                                 | not null             |
| answer               | text                                                 | not null             |
| usageMode            | enum(always_use/ask_each_time/decline_to_answer)     | default 'always_use' |
| source               | enum(user_input/resume_inferred/application_learned) | default 'user_input' |
| timesUsed            | integer                                              | default 0            |
| createdAt, updatedAt | timestamptz                                          |                      |

#### `consent_records`

GDPR/legal consent audit trail.

| Column    | Type                                                                     | Notes          |
| --------- | ------------------------------------------------------------------------ | -------------- |
| id        | uuid (PK)                                                                |                |
| userId    | uuid (FK -> users)                                                       | cascade delete |
| type      | enum(tos_acceptance/privacy_policy/copilot_disclaimer/autopilot_consent) |                |
| version   | varchar(20)                                                              | not null       |
| ipAddress | varchar(45)                                                              | not null       |
| userAgent | text                                                                     | not null       |
| createdAt | timestamptz                                                              |                |

#### `browser_profiles`

AdsPower browser profile assignments per user per platform.

| Column                | Type                                 | Notes               |
| --------------------- | ------------------------------------ | ------------------- |
| id                    | uuid (PK)                            |                     |
| userId                | uuid (FK -> users)                   | cascade delete      |
| platform              | varchar(50)                          | not null            |
| adspowerProfileId     | varchar(100)                         | unique, not null    |
| proxyBindingId        | uuid                                 | nullable            |
| fingerprintConfig     | jsonb                                | not null            |
| status                | enum(available/in_use/error/retired) | default 'available' |
| sessionHealthy        | boolean                              | default false       |
| totalTasksCompleted   | integer                              | default 0           |
| lastUsedAt, createdAt | timestamptz                          |                     |

#### `proxy_bindings`

Proxy configurations for browser profiles.

| Column                  | Type                         | Notes             |
| ----------------------- | ---------------------------- | ----------------- |
| id                      | uuid (PK)                    |                   |
| provider                | varchar(50)                  | default 'iproyal' |
| proxyType               | varchar(20)                  | default 'socks5'  |
| hostname                | varchar(255)                 | not null          |
| port                    | integer                      | not null          |
| username                | varchar(255)                 | nullable          |
| encryptedPassword       | varchar(500)                 | nullable          |
| country                 | varchar(10)                  | default 'US'      |
| ipAddress               | varchar(45)                  | nullable          |
| sessionId               | varchar(255)                 | nullable          |
| status                  | enum(active/blocked/expired) | default 'active'  |
| blockedUntil, createdAt | timestamptz                  |                   |

#### `application_results`

Per-field results of a completed application.

| Column         | Type               | Notes          |
| -------------- | ------------------ | -------------- |
| id             | uuid (PK)          |                |
| taskId         | uuid (FK -> tasks) | cascade delete |
| fieldName      | varchar(255)       | not null       |
| fieldType      | varchar(50)        | not null       |
| value          | text               | nullable       |
| source         | varchar(50)        | not null       |
| confidence     | real               | not null       |
| qaBankEntryId  | uuid               | nullable       |
| userOverridden | boolean            | default false  |
| metadata       | jsonb              | default {}     |
| filledAt       | timestamptz        |                |

#### `application_fields`

Simple key-value field storage per application.

| Column        | Type               | Notes          |
| ------------- | ------------------ | -------------- |
| id            | uuid (PK)          |                |
| applicationId | uuid (FK -> tasks) | cascade delete |
| fieldName     | varchar(255)       | not null       |
| fieldValue    | text               | nullable       |
| createdAt     | timestamptz        |                |

#### `audit_trail`

Generic audit log for admin actions.

| Column    | Type         | Notes      |
| --------- | ------------ | ---------- |
| id        | uuid (PK)    |            |
| userId    | varchar(255) | not null   |
| action    | varchar(255) | not null   |
| details   | jsonb        | default {} |
| createdAt | timestamptz  |            |

#### `notifications`

In-app notification system.

| Column    | Type               | Notes          |
| --------- | ------------------ | -------------- |
| id        | uuid (PK)          |                |
| userId    | uuid (FK -> users) | cascade delete |
| type      | varchar(100)       | not null       |
| title     | varchar(255)       | not null       |
| body      | text               | not null       |
| read      | boolean            | default false  |
| metadata  | jsonb              | default {}     |
| createdAt | timestamptz        |                |

#### `action_manuals` + `manual_steps`

Self-learning action playbooks for ATS form navigation. Manuals define URL patterns; steps define the ordered sequence of actions.

`action_manuals`: id, urlPattern, platform, name, version, healthScore, totalRuns, successCount, failureCount, lastUsedAt, timestamps

`manual_steps`: id, manualId (FK), stepOrder, action, selector, fallbackSelector, value, description, elementType, waitAfterMs, createdAt

#### `sandboxes`

EC2 browser worker instance registry.

| Column                                             | Type                                                            | Notes                              |
| -------------------------------------------------- | --------------------------------------------------------------- | ---------------------------------- |
| id                                                 | uuid (PK)                                                       |                                    |
| name                                               | varchar(255)                                                    | not null                           |
| environment                                        | enum(dev/staging/prod)                                          | not null                           |
| instanceId                                         | varchar(50)                                                     | unique, not null (EC2 instance ID) |
| instanceType                                       | varchar(50)                                                     | not null (e.g. t3.medium)          |
| publicIp                                           | varchar(45)                                                     | nullable                           |
| privateIp                                          | varchar(45)                                                     | nullable                           |
| status                                             | enum(provisioning/active/stopping/stopped/terminated/unhealthy) |                                    |
| healthStatus                                       | enum(healthy/degraded/unhealthy)                                |                                    |
| lastHealthCheckAt                                  | timestamptz                                                     |                                    |
| capacity                                           | integer                                                         | default 5                          |
| currentLoad                                        | integer                                                         | default 0                          |
| sshKeyName                                         | varchar(255)                                                    |                                    |
| novncUrl                                           | text                                                            | for remote debugging               |
| adspowerVersion                                    | varchar(50)                                                     |                                    |
| browserEngine                                      | enum(chromium/adspower)                                         | default 'adspower'                 |
| browserConfig                                      | jsonb                                                           |                                    |
| tags                                               | jsonb                                                           |                                    |
| ec2Status                                          | enum(pending/running/stopping/stopped/terminated)               |                                    |
| autoStopEnabled                                    | boolean                                                         | default false                      |
| idleMinutesBeforeStop                              | integer                                                         | default 30                         |
| lastStartedAt, lastStoppedAt, createdAt, updatedAt | timestamptz                                                     |                                    |

#### `sandbox_secrets` (DEPRECATED)

Formerly stored per-sandbox secrets. Now managed via shared SSH keys in GitHub Secrets. Kept for data preservation only.

#### `gh_automation_jobs` (owned by GhostHands)

GhostHands automation job records. **VALET reads/writes this table but does NOT own migrations for it.**

Key fields: id, idempotencyKey, userId, jobType, targetUrl, taskDescription, inputData, priority, status, statusMessage, startedAt, completedAt, lastHeartbeat, workerId, manualId, engineType, resultData, resultSummary, errorCode, errorDetails, screenshotUrls, artifactUrls, metadata, tags, actionCount, totalTokens, llmCostCents, targetWorkerId, callbackUrl, valetTaskId, interactionType, interactionData, pausedAt, executionMode, browserMode, finalMode

#### `gh_browser_sessions` (owned by GhostHands)

Persistent login sessions (encrypted cookies) per user per domain. **VALET reads for the sessions UI.**

Fields: id, userId, domain, sessionData, encryptionKeyId, expiresAt, lastUsedAt, timestamps

#### `gh_job_events` (owned by GhostHands)

Job status transition history. **VALET reads for job timeline display.**

Fields: id, jobId, eventType, fromStatus, toStatus, message, metadata, actor, createdAt

### Drizzle Relations

Defined in `packages/db/src/schema/relations.ts`:

- users -> many(tasks, resumes, qaBank, consentRecords, browserProfiles, notifications)
- tasks -> one(user), many(taskEvents, applicationResults, applicationFields)
- taskEvents -> one(task)
- resumes -> one(user)
- qaBank -> one(user)
- consentRecords -> one(user)
- browserProfiles -> one(user)
- applicationResults -> one(task)
- applicationFields -> one(task)
- notifications -> one(user)

## 3. Frontend (apps/web)

### Tech Stack

- React 18 + Vite
- React Router (not TanStack Router)
- ts-rest + React Query for server state
- Zustand for client state (stores: `realtime.store.ts`, `ui.store.ts`)
- shadcn/ui + Tailwind CSS
- Sentry for error tracking

### Route Structure

**Public routes:**

- `/` - Landing page
- `/about` - About page
- `/contact` - Contact page
- `/login` - Login (Google OAuth + email/password)
- `/register` - Registration
- `/forgot-password`, `/reset-password`, `/verify-email` - Auth flows
- `/legal/terms`, `/legal/privacy` - Legal pages

**Auth-protected routes:**

- `/onboarding/*` - Onboarding flow (resume upload, disclaimer, mode selection)
- `/dashboard` - Main dashboard (stats cards, active tasks, recent applications, charts)
- `/tasks` - Task list
- `/tasks/:taskId` - Task detail (progress, activity feed, HITL blocker card, live view, GH job card)
- `/apply` - New application form
- `/pricing` - Pricing page
- `/settings/*` - Settings (profile, resume, QA bank, preferences, notifications, sessions)

**Admin-only routes (AdminGuard):**

- `/admin/sandboxes` - Sandbox fleet management
- `/admin/sandboxes/:id` - Sandbox detail (EC2 status, connection info, health, metrics)
- `/admin/tasks` - All tasks (across users)
- `/admin/tasks/:id` - Admin task detail
- `/admin/deploys` - Deploy history
- `/admin/monitoring` - System monitoring
- `/admin/sessions` - Browser session management

### Feature Modules

Each feature is organized as `features/<name>/` with:

- `components/` - React components
- `pages/` - Route-level page components
- `hooks/` - Custom hooks (data fetching, WebSocket, etc.)

Key features: `auth`, `dashboard`, `tasks`, `apply`, `onboarding`, `settings`, `billing`, `consent`, `legal`, `landing`, `notifications`, `admin`

### State Management

- **Server state**: React Query via ts-rest client (`lib/api-client.ts`)
- **Client state**: Zustand stores
  - `realtime.store.ts` - WebSocket connection state and task subscriptions
  - `ui.store.ts` - UI preferences (sidebar collapsed, theme, etc.)

### WebSocket Integration

- `use-task-websocket.ts` - Per-task real-time updates
- `use-dashboard-websocket.ts` - Dashboard-level updates
- Connects to `ws(s)://api/api/v1/ws?token=<jwt>`

### Lazy Loading

All route pages are lazy-loaded via `React.lazy()` except auth pages (eagerly loaded for fast initial render).

## 4. Backend (apps/api)

### Tech Stack

- Fastify 5.x
- ts-rest for type-safe API contracts
- @fastify/awilix for dependency injection
- @fastify/websocket for real-time
- jose for JWT verification
- @aws-sdk/client-s3 for Supabase Storage
- Sentry for error tracking

### Server Setup (`server.ts`)

- Listens on `PORT` (default 8000), `HOST` (default 0.0.0.0)
- Loads `.env` from monorepo root in development
- Graceful shutdown on SIGTERM/SIGINT
- Catches ECONNRESET/EPIPE at process level to prevent crashes

### Application Setup (`app.ts`)

Plugin registration order:

1. Sentry (must be first to capture all errors)
2. @fastify/cookie
3. Security plugin (CORS, helmet)
4. @fastify/multipart (10MB file limit)
5. Database plugin (Drizzle + Supabase)
6. Redis plugin (Upstash)
7. DI container plugin (awilix)
8. Swagger plugin
9. Rate limiting

Middleware hooks:

- `onRequest`: auth middleware (JWT verification), request logger
- Route-specific rate limits (applied after auth)

### DI Container (`plugins/container.ts`)

The `AppCradle` interface defines all injectable services (32 entries):

**Infrastructure:** db, redis, logger, s3

**Repositories:** taskRepo, userRepo, resumeRepo, qaBankRepo, taskEventRepo, notificationRepo, sandboxRepo, ghJobRepo, ghSessionRepo, ghJobEventRepo

**Services:** taskService, userService, resumeService, qaBankService, authService, consentService, gdprService, taskEventService, emailService, securityLogger, billingService, dashboardService, notificationService, sandboxService, ec2Service, deployService, ghosthandsClient

**Monitors:** sandboxHealthMonitor, autoStopMonitor

### API Modules

Each module follows repository/service/routes pattern:

| Module        | Routes                                                                              | Description                                    |
| ------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------- |
| auth          | POST /api/v1/auth/google, POST /api/v1/auth/register, POST /api/v1/auth/login, etc. | Google OAuth + email/password auth, JWT tokens |
| tasks         | CRUD + cancel/approve/retry/captcha-solved/export                                   | Core task management, delegates to GhostHands  |
| task-events   | GET /api/v1/tasks/:id/events                                                        | Task event timeline                            |
| users         | GET/PATCH profile, preferences                                                      | User profile management                        |
| resumes       | Upload, list, delete, set-default                                                   | Resume management + S3 storage                 |
| qa-bank       | CRUD for Q&A entries                                                                | User knowledge base for form filling           |
| consent       | Record consent, check consent                                                       | GDPR consent tracking                          |
| gdpr          | Export data, request deletion                                                       | GDPR compliance endpoints                      |
| billing       | Stripe integration, subscription management                                         | Billing and pricing                            |
| dashboard     | Stats, recent activity, trends                                                      | Dashboard data aggregation                     |
| notifications | List, mark read, mark all read                                                      | In-app notifications                           |
| sandboxes     | CRUD, start/stop EC2, health checks                                                 | Admin sandbox fleet management                 |
| ghosthands    | Webhook handlers, monitoring proxy                                                  | GH integration (see section 6)                 |

### Standalone Routes (outside ts-rest)

- `POST /api/v1/upload/resume` - Multipart file upload
- `POST /api/v1/webhooks/stripe` - Stripe webhook (raw body)
- `POST /api/v1/webhooks/ghosthands` - GH job callback (service key auth)
- `POST /api/v1/webhooks/ghosthands/deploy` - GH deploy notification (HMAC)
- Admin routes: task admin, deploy admin, GH monitoring proxy
- User routes: task user actions (resolve blocker, etc.)

### WebSocket (`websocket/handler.ts`)

- Endpoint: `GET /api/v1/ws?token=<jwt>`
- JWT verified via jose
- Redis pub/sub subscriber pattern-subscribes to `tasks:*`
- Messages broadcast to all connected clients matching userId
- Client can subscribe/unsubscribe to specific taskIds
- Heartbeat ping every `WS_CONFIG.HEARTBEAT_INTERVAL_MS`
- `publishToUser(redis, userId, message)` helper for server-side publishing

### Background Monitors

- `SandboxHealthMonitor`: Periodically checks EC2 sandbox health
- `AutoStopMonitor`: Auto-stops idle sandboxes after configured timeout

## 5. Worker (apps/worker)

### Tech Stack

- Direct REST dispatch to GhostHands API (POST /api/v1/gh/valet/apply with X-GH-Service-Key auth)
- Callbacks received at POST /api/v1/webhooks/ghosthands
- pino for logging
- Sentry for error tracking
- Redis for pub/sub progress updates
- Drizzle for database access

### Entry Point (`main.ts`)

1. Initialize Sentry
2. Detect browser engine from `BROWSER_ENGINE` env var (chromium or adspower)
3. Connect to Redis and database
4. Build sandbox providers (AdsPowerEC2Provider if `ADSPOWER_API_URL` is set)
5. Initialize GhostHands API client (dispatches jobs via POST /api/v1/gh/valet/apply)
6. Start health HTTP server
7. Graceful shutdown on SIGTERM/SIGINT

### Workflows

#### `job-application` (v1 - mock)

Event trigger: `task:created`

DAG: `start-browser -> analyze-form -> fill-fields -> upload-resume -> check-captcha* -> submit* -> verify`
(\* = durableTask with pause/resume capability)

Uses mock adapters (LinkedInMockAdapter). Simulates the full flow with delays. Publishes progress via Redis pub/sub.

#### `job-application-v2` (real browser automation)

Event trigger: `task:created`

DAG: `start-browser -> navigate-and-analyze -> fill-fields -> check-captcha* -> review-or-submit* -> verify -> cleanup`

Features:

- StickyStrategy.SOFT for closure-scoped sandbox/engine sharing across tasks
- Concurrency limit: 3 runs per userId (GROUP_ROUND_ROBIN)
- SandboxController for browser lifecycle and CDP mutex
- EngineOrchestrator for fallback cascade (Stagehand DOM -> CUA -> Magnitude)
- ExecutionEngine + ManualManager for Reuse/Explore self-learning
- Copilot mode pauses at review-or-submit for user approval
- Autopilot mode runs quality gates (confidence >= 0.7 + resume uploaded)
- onFailure handler captures error screenshot and destroys sandbox

Tier -> Provider mapping:

- Tier 1: adspower-ec2
- Tier 2: browserbase
- Tier 3: fly-machine

#### `resume-parse`

Event trigger: `resume:uploaded`

DAG: `extract-text -> llm-parse -> save-results`

1. Downloads file from S3 (supports PDF via pdf-parse, DOCX via mammoth, plain text)
2. Sends extracted text to LLM (via @valet/llm router) with structured output prompt
3. Saves parsed data to resumes table, inferred Q&A answers to qa_bank table
4. Publishes `resume_parsed` event via Redis

### Adapters (apps/worker/src/adapters/)

Mock implementations for testing: `linkedin.mock.ts`, `greenhouse.mock.ts`, `browser-agent.mock.ts`, `form-analyzer.mock.ts`, `captcha-detector.mock.ts`, `proxy-manager.mock.ts`, `ads-power.mock.ts`

Base adapter interface: `base.ts`

### Browser Engines (apps/worker/src/engines/)

- `stagehand-engine.ts` - Stagehand SDK integration
- `magnitude-engine.ts` - Magnitude browser agent
- `agent-browser.ts` - Generic agent browser interface
- `humanized-page.ts` - Human-like interaction patterns
- `mock-engine.ts` - Mock engine for testing

### Services (apps/worker/src/services/)

- `sandbox-controller.ts` - Browser lifecycle, CDP mutex, session management
- `engine-orchestrator.ts` - Fallback cascade between engines
- `execution-engine.ts` - Reuse/Explore self-learning execution
- `manual-manager.ts` - Action manual CRUD and step management
- `event-logger.ts` - Database event persistence
- `application-tracker.ts` - Application state tracking
- `failure-classifier.ts` - Error classification for retry decisions
- `learning-loop.ts` - Post-execution learning feedback

### Providers (apps/worker/src/providers/)

- `adspower-ec2.ts` - AdsPower on EC2 instances
- `browserbase.ts` - Browserbase cloud browser provider

## 6. GhostHands Integration

### Job Dispatch Flow

1. User submits job URL via web UI
2. `TaskService.create()` builds a GH profile from parsed resume data + QA bank answers
3. Calls `GhostHandsClient.submitApplication()` -> `POST /api/v1/gh/valet/apply`
4. Stores returned `job_id` as `task.workflowRunId`
5. Sets task status to `queued`
6. Publishes WebSocket update

### Callback Flow

GhostHands sends status callbacks to `POST /api/v1/webhooks/ghosthands`:

1. Verify service key (header `X-GH-Service-Key` or query param `?token=`)
2. Map GH status to VALET task status:
   - `running` -> `in_progress`
   - `completed` -> `completed`
   - `failed` -> `failed`
   - `cancelled` -> `cancelled`
   - `needs_human` -> `waiting_human`
   - `resumed` -> `in_progress`
3. Update task record with status, result/error, LLM cost
4. Handle HITL interactions: map GH types (2fa, login) to VALET types (two_factor, login_required)
5. Sync `gh_automation_jobs` table (with one retry on failure)
6. Publish WebSocket events (task_update, task_needs_human, task_resumed)

### HITL (Human-in-the-Loop) Flow

When GH encounters a blocker (CAPTCHA, 2FA, login required):

1. GH sends callback with `status: "needs_human"` + `interaction` object
2. VALET sets task to `waiting_human`, stores interaction data
3. WebSocket publishes `task_needs_human` with screenshot URL, page URL, timeout
4. User resolves via UI (e.g., enters 2FA code, completes CAPTCHA)
5. Frontend calls resolve-blocker endpoint
6. VALET calls `GhostHandsClient.resumeJob()`
7. GH sends callback with `status: "resumed"`
8. VALET clears interaction data, sets task to `in_progress`

### GhostHands Client (`ghosthands.client.ts`)

HTTP client with two base URLs:

- `baseUrl` (port 3100): Main API endpoints
- `workerBaseUrl` (port 3101): Worker status endpoints

Key methods:

- `submitApplication()` - POST /api/v1/gh/valet/apply
- `submitGenericTask()` - POST /api/v1/gh/valet/task
- `getJobStatus()` - GET /api/v1/gh/valet/status/:id
- `cancelJob()`, `retryJob()`, `resumeJob()` - Job lifecycle
- `healthCheck()`, `getDetailedHealth()`, `getMetrics()`, `getAlerts()` - Monitoring
- `listSessions()`, `clearSession()`, `clearAllSessions()` - Browser session management
- `getWorkerStatus()`, `getWorkerHealth()`, `drainWorker()` - Worker management
- `getWorkerFleet()`, `deregisterWorker()` - Fleet management

Auth: `X-GH-Service-Key` header with shared secret (`GH_SERVICE_SECRET`)

### Deploy Webhook

`POST /api/v1/webhooks/ghosthands/deploy` receives HMAC-SHA256 signed notifications when GH deploys. Creates deploy records and notifies admins.

## 7. CI/CD

### Workflow Files (10 total)

#### `ci.yml` - CI

Trigger: push/PR to main or staging
Jobs: lint, typecheck, test (with Postgres service container), build, security audit, secret scan of frontend bundle

#### `cd-staging.yml` - CD Staging

Trigger: push to staging
Uses `dorny/paths-filter` for change detection. Only deploys affected services:

- API depends on: shared, contracts, db, llm, api
- Worker depends on: shared, contracts, db, llm, worker
- Web depends on: shared, contracts, ui, web
  Calls reusable `deploy.yml` workflow.

#### `cd-prod.yml` - CD Production

Trigger: push to main + workflow_dispatch
Deploys ALL services (no change detection). Calls reusable `deploy.yml`.

#### `deploy.yml` - Reusable Deploy

Called by cd-staging and cd-prod. Steps per service:

1. Validate (typecheck + build)
2. Deploy API to Fly.io (with health check)
3. Deploy Worker to Fly.io
4. Deploy Web to Fly.io (with build args for VITE\_\* env vars)

DB migrations run automatically via Fly.io `release_command` during API deploy.

#### `cd-ec2.yml` - EC2 Worker Deploy

Trigger: push to staging/main (worker/package changes) + workflow_dispatch
Steps:

1. Build worker tarball with all package dependencies
2. Discover fleet (API query -> SANDBOX_IPS secret fallback)
3. Deploy to each sandbox in parallel (matrix strategy, max 5 parallel)
4. Per-instance: backup, extract, install deps, restart systemd service
5. Health check with retries + automatic rollback on failure
6. Update sandbox status via API

#### `provision-sandbox.yml` - Provision Sandbox

Manual trigger only. Creates new EC2 instance via Terraform, installs browser engine (chromium or adspower), deploys worker, registers with API.

#### `terminate-sandbox.yml` - Terminate Sandbox

Manual trigger only. Gracefully drains, stops service, destroys via Terraform, updates API status.

#### `secrets-sync.yml` - Secrets Sync

Manual trigger. Pushes SANDBOX_WORKER_ENV secret to all sandbox .env files and restarts workers.

#### `claude.yml` / `claude-code-review.yml`

Claude AI code review integration for PRs.

## 8. Infrastructure

### Fly.io Configuration

Three Fly.io apps per environment:

**API (`fly/api.toml`):**

- Region: iad (US East)
- Port: 3000 (internal)
- VM: 512MB RAM, shared CPU
- Release command: `node packages/db/dist/migrate.js` (auto-migrations)
- Health check: GET /api/v1/health every 15s
- Auto-stop/start machines, min 1 running

**Web (`fly/web.toml`):**

- Region: iad
- Port: 8080 (internal, static SPA served by nginx/caddy)
- VM: 256MB RAM, shared CPU
- Health check: GET /health every 30s
- Build args: VITE_API_URL, VITE_WS_URL, VITE_GOOGLE_CLIENT_ID

**Worker (`fly/worker.toml`):**

- Region: iad
- No HTTP service (connects to GhostHands outbound)
- VM: 1GB RAM, shared CPU
- Process: `node apps/worker/dist/main.js`
- No auto-stop (must stay running)
- Kill timeout: 60s (allows in-flight tasks to complete)

### Terraform (infra/terraform/)

EC2 sandbox provisioning for browser worker instances. Managed via GitHub Actions workflows.

### EC2 Sandboxes

- Ubuntu instances with browser engine (AdsPower or Chromium)
- Worker deployed via tarball (built in CI, uploaded via SCP)
- Systemd service: `valet-worker`
- App directory: `/opt/valet/app`
- Env file: `/opt/valet/.env`
- noVNC for remote debugging
- Shared SSH key across all sandboxes (SANDBOX_SSH_KEY GitHub Secret)

### Docker (docker/)

- `docker-compose.yml`: Local Postgres + Redis for development
- `init-db.sql`: Initial database setup

## 9. Environment Variables

From `.env.example`, grouped by service:

### Required

| Variable             | Description                                                  |
| -------------------- | ------------------------------------------------------------ |
| DATABASE_URL         | Supabase Postgres transaction pooler (port 6543)             |
| DATABASE_DIRECT_URL  | Supabase Postgres session pooler (port 5432, for migrations) |
| REDIS_URL            | Upstash Redis URL (rediss:// for TLS)                        |
| GOOGLE_CLIENT_ID     | Google OAuth client ID                                       |
| GOOGLE_CLIENT_SECRET | Google OAuth client secret                                   |
| JWT_SECRET           | JWT signing secret (min 32 chars)                            |
| JWT_REFRESH_SECRET   | Refresh token signing secret                                 |
| RABBITMQ_URL         | CloudAMQP URL (amqps://)                                     |
| S3_ENDPOINT          | Supabase Storage S3 endpoint                                 |
| S3_ACCESS_KEY        | S3 access key                                                |
| S3_SECRET_KEY        | S3 secret key                                                |
| ANTHROPIC_API_KEY    | Anthropic API key                                            |
| OPENAI_API_KEY       | OpenAI API key                                               |
| GHOSTHANDS_API_URL   | GhostHands API URL (default http://localhost:3100)           |
| GH_SERVICE_SECRET    | Service-to-service auth key                                  |

### Optional

| Variable                  | Description                                         |
| ------------------------- | --------------------------------------------------- |
| NODE_ENV                  | Environment (development/production)                |
| PORT                      | API server port (default 8000)                      |
| CORS_ORIGIN               | Allowed CORS origin (default http://localhost:5173) |
| S3_REGION                 | S3 region (default us-east-1)                       |
| LLM_MONTHLY_BUDGET_USD    | Monthly LLM budget (default 50)                     |
| LLM_PER_TASK_BUDGET_USD   | Per-task LLM budget (default 0.50)                  |
| STRIPE_SECRET_KEY         | Stripe API key                                      |
| STRIPE_PUBLISHABLE_KEY    | Stripe publishable key                              |
| STRIPE_WEBHOOK_SECRET     | Stripe webhook signing secret                       |
| AWS_ACCESS_KEY_ID         | AWS credentials for EC2 sandbox management          |
| AWS_SECRET_ACCESS_KEY     | AWS credentials                                     |
| RESEND_API_KEY            | Resend email service API key                        |
| SENTRY_DSN                | Sentry backend DSN                                  |
| VITE_SENTRY_DSN           | Sentry frontend DSN                                 |
| BETTER_STACK_SOURCE_TOKEN | BetterStack logging                                 |
| TURBO_TOKEN               | Turborepo remote cache                              |
| BROWSER_ENGINE            | Worker browser engine: chromium or adspower         |
| MAX_CONCURRENT_BROWSERS   | Worker concurrency limit (default 5)                |
| ADSPOWER_API_URL          | AdsPower API URL (required for v2 workflows)        |

### Frontend (VITE\_\*)

| Variable                    | Description            |
| --------------------------- | ---------------------- |
| VITE_API_URL                | Backend API URL        |
| VITE_WS_URL                 | WebSocket URL          |
| VITE_GOOGLE_CLIENT_ID       | Google OAuth client ID |
| VITE_STRIPE_PUBLISHABLE_KEY | Stripe publishable key |

## 10. Known Issues and Gaps

### Active Issues

1. **Shared database**: Staging and production share the same Supabase database. Migrations applied to one environment affect both. Need separate databases or a migration strategy.

2. **Worker v1 vs v2**: Two job-application workflows exist. V1 uses mock adapters; V2 uses real browser engines. V1 is still registered and may receive events.

3. **Screenshot upload TODOs**: Multiple `// TODO: Upload to S3` comments in v2 workflow -- screenshots are captured but not persisted to S3.

4. **Resume upload tracking**: V2 workflow's `resumeUploaded` is hardcoded to `true` with a TODO to track real status.

5. **sandbox_secrets table deprecated**: Marked deprecated but still defined in schema. Can be dropped after confirming no production reads.

6. **Active profile tracking**: Worker health server returns `0` for active profiles with `// TODO: track active profiles in future`.

### Architecture Notes

- The worker dispatches jobs to GhostHands API via REST (POST /api/v1/gh/valet/apply with X-GH-Service-Key auth) and receives callbacks at POST /api/v1/webhooks/ghosthands
- GH-owned tables (`gh_automation_jobs`, `gh_browser_sessions`, `gh_job_events`) exist in the same database. VALET must NOT create migrations for them.
- The GhostHands client has two base URLs (port 3100 for API, port 3101 for worker status) -- both derived from `GHOSTHANDS_API_URL`
- The webhook handler includes self-healing: if task is terminal but GH job record is not, it reconciles the gh_automation_jobs status
- Frontend uses React Router (not TanStack Router as mentioned in some older docs)
