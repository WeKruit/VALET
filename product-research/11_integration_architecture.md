# WeKruit Valet -- Integration Architecture Document

**Version:** 1.0
**Date:** 2026-02-11
**Status:** Architecture Decision Record -- Ready for Implementation
**Author:** Principal Engineer
**Inputs:** PRD (doc 03), OSS Research (doc 07), Updated Roadmap (doc 09), Stagehand/Orchestration Research (doc 10), WeKruit Design System

---

## Table of Contents

1. [Technology Stack Decision](#1-technology-stack-decision)
2. [Component Architecture](#2-component-architecture)
3. [Inter-Component Communication](#3-inter-component-communication)
4. [Data Flow Diagrams](#4-data-flow-diagrams)
5. [Stagehand Integration Pattern](#5-stagehand-integration-pattern)
6. [API Contract](#6-api-contract)
7. [Design System Integration](#7-design-system-integration)
8. [Monorepo Structure](#8-monorepo-structure)
9. [Migration Path from PRD Architecture](#9-migration-path-from-prd-architecture)
10. [Open Decisions & Trade-offs](#10-open-decisions--trade-offs)

---

## 1. Technology Stack Decision

### 1.1 The Core Conflict

The PRD specifies **FastAPI (Python) + Hatchet (Python SDK) + SQLAlchemy + PostgreSQL**. The Stagehand research reveals that the browser automation core -- the most complex and critical subsystem -- is **TypeScript-only** (Stagehand runs on Playwright, which is Node.js-native). This creates a fundamental architecture tension.

Three options were evaluated:

| Option | Stack | Pros | Cons |
|--------|-------|------|------|
| **A: Polyglot** | FastAPI (Python API) + Node.js worker (Stagehand) + Hatchet (Python SDK) | Keeps PRD architecture intact; Python ecosystem for ML/LLM | Two runtimes; serialization boundary between API and worker; Hatchet Python SDK cannot directly invoke Stagehand; requires HTTP/queue bridge |
| **B: Full TypeScript** | Next.js API routes + Hatchet TS SDK + Stagehand + React | Single language; shared types end-to-end; Hatchet TS SDK calls Stagehand directly; simpler deployment | Loses Python ML ecosystem; Next.js API routes are less battle-tested for complex backend logic than FastAPI |
| **C: TypeScript with standalone API** | Fastify/Express (Node.js API) + Hatchet TS SDK + Stagehand + React frontend (Vite) | Single runtime; dedicated API server (not coupled to frontend framework); Hatchet TS SDK talks directly to Stagehand worker | Loses Python; needs separate frontend build |

### 1.2 Decision: Option C -- Full TypeScript with Standalone API (Fastify)

**The decisive factor is that Stagehand is TypeScript.** The browser automation worker -- which handles form filling, verification, fallback switching, and cache management -- is the most complex subsystem in the product. Making it communicate across a language boundary (Python API <-> Node.js worker) adds serialization overhead, type duplication, and debugging friction that is not justified by any benefit Python provides.

**Why not Next.js API routes (Option B)?** Next.js API routes are designed for serverless/edge deployment and are tightly coupled to the Next.js framework. WeKruit's API needs long-lived WebSocket connections, background workers, and direct Hatchet SDK integration -- all of which work better in a dedicated server process. Coupling the API to the frontend framework creates deployment rigidity and makes it harder to scale them independently.

**Why Fastify over Express?** Fastify is faster (2-3x throughput over Express), has built-in schema validation via JSON Schema (replacing Pydantic's role), first-class TypeScript support, and a plugin architecture that maps cleanly to our domain modules. It is the modern Node.js API framework.

**What do we lose from Python?**
- **SQLAlchemy/Alembic**: Replaced by Drizzle ORM (TypeScript, excellent PostgreSQL support, schema-as-code migrations)
- **LangChain (Python)**: LangChain has a full TypeScript SDK (`langchain/js`). Resume parsing, LLM routing, and structured extraction all work in TypeScript.
- **pdfplumber/python-docx**: Replaced by `pdf-parse` (Node.js) and `mammoth` (DOCX to text). Alternatively, use a small Python microservice for PDF extraction if quality is insufficient -- this is the one area where Python has a clear edge. Evaluated below.
- **SQLAdmin**: Not available in TypeScript. For internal admin, use a lightweight alternative (AdminJS or a custom admin using the same shadcn-admin components). This is a minor loss -- SQLAdmin saved 1-2 days, not weeks.

**PDF/DOCX parsing escape hatch:** If `pdf-parse` + `mammoth` produce inferior results compared to `pdfplumber` + `python-docx`, we deploy a tiny Python microservice (`wekruit-parser`) behind a gRPC or HTTP endpoint. This is an isolated, stateless service with no shared state -- the simplest form of polyglot. Decision: start with TypeScript libraries; benchmark against Python libraries in Week 2; switch to microservice only if TypeScript extraction quality is measurably worse on a test set of 50 resumes.

### 1.3 Final Stack

| Layer | Technology | Justification |
|-------|-----------|---------------|
| **Language** | TypeScript (end-to-end) | Single language eliminates type duplication, enables shared packages, simplifies hiring |
| **API Framework** | Fastify 5.x | Fastest Node.js framework; built-in JSON Schema validation; WebSocket support; plugin architecture |
| **Frontend Framework** | React 18 + Vite | shadcn-admin is Vite-based; no SSR needed for a dashboard app; fast HMR |
| **ORM** | Drizzle ORM | TypeScript-native; SQL-like query builder (no magic); schema-as-code; PostgreSQL-optimized; push/pull migrations |
| **Database** | PostgreSQL 16 | Confirmed from PRD; JSONB for flexible data; pgvector for semantic search; row-level security |
| **Cache / Queue Backend** | Redis 7 | BullMQ queue backend; WebSocket pub/sub relay; Stagehand selector cache; session store |
| **Orchestrator** | Hatchet (TypeScript SDK) | Durable workflows with pause/resume; built-in dashboard; PostgreSQL-backed; rate limiting; TypeScript-native |
| **Browser Automation** | Stagehand v3 (primary) + Magnitude (fallback) | TypeScript; Playwright-based; auto-caching; Shadow DOM + iframe support |
| **Anti-Detect Browser** | AdsPower | Fingerprint management; CDP WebSocket; profile pool |
| **LLM Router** | LiteLLM (TypeScript) or custom router | Multi-provider routing; cost optimization; fallback chains |
| **Human Takeover** | noVNC via react-vnc | WebSocket-based remote browser; React component wrapper |
| **Object Storage** | S3-compatible (MinIO local, AWS S3 prod) | Resume files; screenshots; artifacts |
| **Notifications** | Novu (self-hosted) | In-app inbox; multi-channel; React SDK + Node.js SDK |
| **Monorepo** | Turborepo | Fast builds; workspace dependencies; pipeline caching |
| **Package Manager** | pnpm | Disk-efficient; strict dependency resolution; workspace support |

### 1.4 Orchestrator Decision: Hatchet TS SDK (not BullMQ + XState)

The Stagehand research proposed BullMQ + XState. Hatchet TS SDK is the better choice for three reasons:

| Criterion | Hatchet TS SDK | BullMQ + XState |
|-----------|---------------|-----------------|
| **Durable pause/resume** | Native. `ctx.waitForEvent("captcha:solved")` suspends workflow durably. Survives worker restart. | Must be hand-built. BullMQ has no durable wait. XState's `invoke` can await, but state is lost on worker crash unless manually persisted. |
| **Monitoring** | Built-in web dashboard with step-level execution traces, latency metrics, and searchable logs. Free. | BullMQ has Bull Board (basic). XState has no production monitoring UI. Would need to build or integrate a custom dashboard. |
| **Complexity** | Single system. Define workflow as a class with `@hatchet.step()` decorators (TS equivalent). | Two systems (queue + state machine) that must be kept in sync. XState machines need to be serialized/deserialized for each job. More moving parts. |
| **Rate limiting** | Built-in per-workflow and per-tenant rate limiting. | Must be implemented manually in BullMQ job options or custom middleware. |
| **Crash recovery** | Built-in. Workflow resumes from last completed step after worker restart. | BullMQ retries the entire job. XState state must be manually checkpointed to Redis/DB and restored. |
| **Operational overhead** | Single binary + PostgreSQL (shares our app DB). | Redis (already have it) + custom state persistence layer. |

**XState is not eliminated** -- it can still be used *inside* a Hatchet step for complex sub-workflows (e.g., the multi-page LinkedIn Easy Apply flow within the `FillForm` step). But it does not replace Hatchet as the top-level orchestrator.

**BullMQ is not eliminated** -- it serves as a lightweight secondary queue for non-workflow tasks: email sending, screenshot cleanup, cache warming. These do not need durable execution or pause/resume.

### 1.5 LLM Router Decision

**Option A: LiteLLM TypeScript** -- LiteLLM has a TypeScript/JavaScript SDK that provides unified API access to 100+ LLM providers with automatic retries, fallbacks, and cost tracking.

**Option B: Custom Router** -- A thin wrapper around provider SDKs (Anthropic TS SDK, OpenAI TS SDK) with a routing table.

**Decision: Start with a custom router; evaluate LiteLLM TS SDK.**

LiteLLM's TypeScript SDK is less mature than its Python counterpart. For MVP, build a minimal `LLMRouter` class that:
- Routes by task type (form analysis -> Claude Sonnet 4.5, field mapping -> GPT-4.1 mini, confirmation -> GPT-4.1 nano)
- Falls back on 5xx errors
- Logs token usage per call
- Uses provider SDKs directly (Anthropic SDK, OpenAI SDK)

This is ~200 lines of code and avoids a dependency on LiteLLM's TS SDK maturity. Migrate to LiteLLM when/if the TS SDK stabilizes or if we need >3 providers.

---

## 2. Component Architecture

### 2.1 High-Level Architecture Diagram

```
+------------------------------------------------------------------+
|                         CLIENT LAYER                              |
|                                                                   |
|  +--------------------+           +----------------------------+  |
|  | React Dashboard    |           | Chrome Extension           |  |
|  | (Vite + shadcn-    |           | (Content Script +          |  |
|  |  admin + WeKruit   |           |  Popup)                    |  |
|  |  Design System)    |           |                            |  |
|  +--------+-----------+           +-------------+--------------+  |
|           |                                     |                 |
+-----------|-------------------------------------|------ -----------+
            | REST + WebSocket                    | REST
            v                                     v
+------------------------------------------------------------------+
|                          API LAYER                                 |
|                                                                   |
|  +------------------------------------------------------------+  |
|  |                    Fastify API Server                       |  |
|  |                                                             |  |
|  |  +-----------+ +----------+ +----------+ +--------------+  |  |
|  |  | Auth      | | Tasks    | | Users    | | WebSocket    |  |  |
|  |  | (Google   | | (CRUD +  | | (Profile | | (Real-time   |  |  |
|  |  |  OAuth)   | |  Submit) | |  + Prefs)| |  updates)    |  |  |
|  |  +-----------+ +----------+ +----------+ +--------------+  |  |
|  |  +-----------+ +----------+ +----------+ +--------------+  |  |
|  |  | Resumes   | | Q&A Bank | | Consent  | | Billing      |  |  |
|  |  | (Upload + | | (CRUD +  | | (Legal   | | (Stripe      |  |  |
|  |  |  Parse)   | |  Match)  | |  Records)| |  Webhooks)   |  |  |
|  |  +-----------+ +----------+ +----------+ +--------------+  |  |
|  +------------------------------------------------------------+  |
|           |                    |                                   |
+-----------|--------------------|-----------  ----------------------+
            | Hatchet SDK        | Redis Pub/Sub
            v                    v
+------------------------------------------------------------------+
|                     ORCHESTRATION LAYER                            |
|                                                                   |
|  +------------------------------------------------------------+  |
|  |                  Hatchet Engine                             |  |
|  |  (Go binary, self-hosted, PostgreSQL-backed)               |  |
|  |                                                             |  |
|  |  Workflows:                                                 |  |
|  |    - JobApplicationWorkflow (9 steps, durable)              |  |
|  |    - BatchApplicationWorkflow (sequential with delays)      |  |
|  |    - ResumeParsingWorkflow (async processing)               |  |
|  |    - ScreenshotCleanupWorkflow (scheduled)                  |  |
|  |                                                             |  |
|  |  Features: pause/resume, rate limiting, retry policies,     |  |
|  |            monitoring dashboard, crash recovery             |  |
|  +------------------------------------------------------------+  |
|           |                                                       |
+-----------|-------------------------------------------------------+
            | Task dispatch
            v
+------------------------------------------------------------------+
|                      WORKER LAYER                                  |
|                                                                   |
|  +------------------------------------------------------------+  |
|  |              Browser Automation Worker(s)                   |  |
|  |                                                             |  |
|  |  +------------------+  +-------------------+               |  |
|  |  | AdsPower Manager |  | Stagehand v3      |               |  |
|  |  | (Profile pool,   |  | (Primary agent,   |               |  |
|  |  |  CDP connection) |  |  cached selectors) |               |  |
|  |  +------------------+  +-------------------+               |  |
|  |  +------------------+  +-------------------+               |  |
|  |  | Magnitude        |  | LLM Router        |               |  |
|  |  | (Fallback agent, |  | (Claude/GPT/       |               |  |
|  |  |  visual bypass)  |  |  Gemini routing)   |               |  |
|  |  +------------------+  +-------------------+               |  |
|  |  +------------------+  +-------------------+               |  |
|  |  | CAPTCHA Detector |  | Verification      |               |  |
|  |  | (DOM + URL +     |  | Engine            |               |  |
|  |  |  text + LLM)     |  | (3-layer checks)  |               |  |
|  |  +------------------+  +-------------------+               |  |
|  |  +------------------+                                      |  |
|  |  | noVNC Manager    |                                      |  |
|  |  | (Xvfb + x11vnc   |                                      |  |
|  |  |  + websockify)    |                                      |  |
|  |  +------------------+                                      |  |
|  +------------------------------------------------------------+  |
|                                                                   |
+------------------------------------------------------------------+
            |
            v
+------------------------------------------------------------------+
|                      DATA LAYER                                    |
|                                                                   |
|  +----------------+  +----------+  +---------------------------+  |
|  | PostgreSQL 16  |  | Redis 7  |  | S3-Compatible Storage    |  |
|  | (Drizzle ORM)  |  |          |  | (MinIO / AWS S3)         |  |
|  |                |  | - BullMQ |  |                           |  |
|  | Tables:        |  |   queues |  | Buckets:                  |  |
|  | - users        |  | - WS     |  | - resumes/               |  |
|  | - resumes      |  |   pub/sub|  | - screenshots/            |  |
|  | - tasks        |  | - Stage- |  | - artifacts/              |  |
|  | - task_events  |  |   hand   |  |                           |  |
|  | - applications |  |   cache  |  |                           |  |
|  | - qa_entries   |  | - Session|  |                           |  |
|  | - consent      |  |   store  |  |                           |  |
|  | - audit_trail  |  |          |  |                           |  |
|  | - browser_     |  |          |  |                           |  |
|  |   profiles     |  |          |  |                           |  |
|  | - proxy_       |  |          |  |                           |  |
|  |   bindings     |  |          |  |                           |  |
|  +----------------+  +----------+  +---------------------------+  |
|                                                                   |
+------------------------------------------------------------------+
            |
            v
+------------------------------------------------------------------+
|                    EXTERNAL SERVICES                               |
|                                                                   |
|  +------------+ +----------+ +----------+ +-------------------+   |
|  | Anthropic  | | OpenAI   | | Google   | | Stripe            |   |
|  | (Claude    | | (GPT-4.1 | | (OAuth)  | | (Billing)         |   |
|  |  Sonnet)   | |  mini/   | |          | |                   |   |
|  |            | |  nano)   | |          | |                   |   |
|  +------------+ +----------+ +----------+ +-------------------+   |
|  +------------+ +----------+ +-------------------+               |
|  | IPRoyal    | | Novu     | | AdsPower           |               |
|  | (Proxies)  | | (Notif.) | | (Anti-detect       |               |
|  |            | |          | |  browser API)       |               |
|  +------------+ +----------+ +-------------------+               |
+------------------------------------------------------------------+
```

### 2.2 Process Topology (Deployment Units)

In development (`docker compose up`), these are separate containers. In production, they scale independently.

| Process | Technology | Scaling | Notes |
|---------|-----------|---------|-------|
| `web` | Vite dev server (dev) / Nginx + static files (prod) | Horizontal via CDN | Static SPA, no SSR |
| `api` | Fastify + Node.js | Horizontal (stateless, WebSocket sticky sessions) | Handles REST, WebSocket, Hatchet SDK calls |
| `worker` | Node.js + Hatchet worker + Stagehand + Playwright | Vertical first (one browser per worker), then horizontal | Each worker handles one browser session at a time; scale by adding workers |
| `hatchet` | Hatchet Engine (Go binary) | Single instance (dev), HA (prod) | Shares PostgreSQL with app |
| `postgres` | PostgreSQL 16 | Single instance (dev), managed (prod) | Primary datastore |
| `redis` | Redis 7 | Single instance (dev), managed (prod) | Queue backend, pub/sub, cache |
| `novu` | Novu self-hosted (Docker) | Single instance | Notification service |
| `minio` | MinIO (dev) / AWS S3 (prod) | Managed in prod | Object storage |

---

## 3. Inter-Component Communication

### 3.1 Communication Matrix

```
                Frontend    API     Hatchet   Worker    Redis    PostgreSQL
Frontend          --       REST/WS    --        --        --        --
API             REST/WS     --      SDK       (via H)   Pub/Sub   Drizzle
Hatchet           --       gRPC      --       gRPC       --       Direct
Worker            --       (via H)  gRPC       --       BullMQ    Drizzle
Redis             --        --        --        --        --        --
PostgreSQL        --        --        --        --        --        --
```

### 3.2 Frontend <-> API

**REST API** for all CRUD operations. OpenAPI schema auto-generated from Fastify JSON Schema definitions. Frontend uses `@tanstack/react-query` for data fetching with automatic caching, revalidation, and optimistic updates.

**WebSocket** for real-time updates. Single persistent connection per authenticated client at `wss://{host}/api/ws`. Multiplexed by topic:

```typescript
// WebSocket message envelope
interface WSMessage {
  type: 'task_update' | 'field_review' | 'human_needed' |
        'task_complete' | 'task_error' | 'notification';
  taskId?: string;
  payload: Record<string, unknown>;
  timestamp: string;
}

// Example: task progress update
{
  type: 'task_update',
  taskId: 'task_abc123',
  payload: {
    state: 'FILLING_FORM',
    progress: 45,
    currentStep: 'Answering screening questions (3 of 5)',
    fields: [
      { label: 'First Name', value: 'Adam', confidence: 1.0, source: 'profile', status: 'filled' },
      { label: 'Years of Experience', value: '7', confidence: 0.95, source: 'qa_bank', status: 'filled' },
      // ...
    ],
    screenshotUrl: '/api/screenshots/task_abc123/latest.jpg',
  },
  timestamp: '2026-02-11T09:14:22Z',
}
```

**Authentication:** JWT token passed in `Authorization: Bearer {token}` header for REST, and as query parameter `?token={jwt}` for WebSocket handshake (WebSocket API does not support custom headers in browsers).

### 3.3 API <-> Hatchet (Orchestrator)

The API server uses the **Hatchet TypeScript SDK** to:
1. **Trigger workflows:** `hatchet.admin.runWorkflow('job-application', { taskId, jobUrl, userId, resumeId })`
2. **Send events:** `hatchet.admin.sendEvent('captcha:solved', { taskId })` (durable event to wake paused workflow)
3. **Cancel workflows:** `hatchet.admin.cancelWorkflow(workflowRunId)` (kill switch)
4. **Query status:** `hatchet.admin.getWorkflowRun(workflowRunId)` (for REST endpoints)

No message queue between API and Hatchet -- the SDK makes direct gRPC calls to the Hatchet engine.

### 3.4 Hatchet <-> Worker

Hatchet dispatches steps to workers via gRPC streaming. The worker registers as a Hatchet worker with step handler functions:

```typescript
// Worker registration (simplified)
const worker = hatchet.worker('browser-automation');

worker.registerWorkflow({
  name: 'job-application',
  steps: [
    { name: 'provision-browser', handler: provisionBrowserStep },
    { name: 'navigate-to-job', handler: navigateStep },
    { name: 'analyze-page', handler: analyzePageStep },
    { name: 'fill-form', handler: fillFormStep },
    { name: 'wait-for-review', handler: waitForReviewStep },  // durable wait
    { name: 'submit', handler: submitStep },
    { name: 'verify', handler: verifyStep },
    { name: 'cleanup', handler: cleanupStep },
  ],
});

await worker.start();
```

Each step handler receives a `Context` object with:
- `ctx.input()` -- data from previous step
- `ctx.log()` -- structured logging visible in Hatchet dashboard
- `ctx.waitForEvent('captcha:solved', { timeout: '30m' })` -- durable pause
- `ctx.playground()` -- debugging interface

**Progress reporting:** Worker publishes progress updates to Redis Pub/Sub. The API server's WebSocket handler subscribes to `task:{taskId}:progress` channels and relays to connected clients.

```typescript
// Inside a Hatchet step handler
async function fillFormStep(ctx: StepContext) {
  const { taskId, fields } = ctx.input();
  const redis = getRedisClient();

  for (const field of fields) {
    await stagehand.act(`fill the "${field.label}" field with "${field.value}"`);

    // Publish progress to Redis -> WebSocket -> Frontend
    await redis.publish(`task:${taskId}:progress`, JSON.stringify({
      type: 'task_update',
      taskId,
      payload: {
        state: 'FILLING_FORM',
        currentStep: `Filling "${field.label}"...`,
        progress: calculateProgress(fields, field),
        field: { label: field.label, value: field.value, confidence: field.confidence, status: 'filled' },
      },
      timestamp: new Date().toISOString(),
    }));
  }

  return { filledFields: fields };
}
```

### 3.5 Worker <-> noVNC (CAPTCHA Pause/Resume)

When the CAPTCHA detector fires inside a Hatchet step:

1. **Worker** starts a VNC server on the browser's display:
   - Xvfb is already running (AdsPower runs in a virtual framebuffer)
   - Start `x11vnc` bound to the Xvfb display
   - Start `websockify` to proxy VNC over WebSocket
   - Record the `wsUrl` for noVNC

2. **Worker** publishes a `human_needed` message to Redis Pub/Sub with the VNC WebSocket URL:
   ```json
   {
     "type": "human_needed",
     "taskId": "task_abc123",
     "payload": {
       "reason": "CAPTCHA detected",
       "vncUrl": "wss://worker-1.internal:6901/websockify?token=jwt_abc",
       "screenshotUrl": "/api/screenshots/task_abc123/captcha.jpg",
       "timeout": 300
     }
   }
   ```

3. **Worker** calls `ctx.waitForEvent('captcha:solved', { timeout: '30m' })` -- this durably pauses the Hatchet workflow. The worker process is freed to handle other tasks.

4. **Frontend** receives the `human_needed` message via WebSocket, opens the `<VncScreen>` modal with the VNC URL.

5. **User** solves the CAPTCHA in the noVNC viewer and clicks "Resume Automation."

6. **Frontend** calls `POST /api/applications/{id}/captcha-solved`.

7. **API** emits the Hatchet durable event: `hatchet.admin.sendEvent('captcha:solved', { taskId })`.

8. **Hatchet** wakes the workflow. The worker picks it up, verifies the CAPTCHA is gone (DOM check), and continues from the paused step.

9. **Worker** stops `x11vnc` and `websockify`.

### 3.6 Worker <-> LLM Router

The LLM Router is a shared TypeScript module (in `packages/llm/`) used by the worker process:

```typescript
// packages/llm/src/router.ts
export class LLMRouter {
  private providers: Map<string, LLMProvider>;

  constructor(config: LLMRouterConfig) {
    this.providers = new Map([
      ['anthropic', new AnthropicProvider(config.anthropicApiKey)],
      ['openai', new OpenAIProvider(config.openaiApiKey)],
    ]);
  }

  async complete(request: LLMRequest): Promise<LLMResponse> {
    const model = this.routeToModel(request.taskType);
    try {
      return await this.providers.get(model.provider)!.complete({
        model: model.name,
        messages: request.messages,
        tools: request.tools,
        responseFormat: request.responseFormat,
      });
    } catch (error) {
      if (isRetryable(error)) {
        return this.fallback(request, model);
      }
      throw error;
    }
  }

  private routeToModel(taskType: TaskType): ModelConfig {
    const routing: Record<TaskType, ModelConfig> = {
      form_analysis:        { provider: 'anthropic', name: 'claude-sonnet-4-5-20250514' },
      screening_answer:     { provider: 'anthropic', name: 'claude-sonnet-4-5-20250514' },
      field_mapping:        { provider: 'openai',    name: 'gpt-4.1-mini' },
      error_recovery:       { provider: 'openai',    name: 'gpt-4.1-mini' },
      confirmation_check:   { provider: 'openai',    name: 'gpt-4.1-nano' },
      navigation_decision:  { provider: 'openai',    name: 'gpt-4.1-nano' },
    };
    return routing[taskType];
  }
}
```

**Token budgets** enforced per application:
- Per-application cap: 50,000 tokens / $0.50
- Per-call logging: model, input tokens, output tokens, cost, latency
- Logged to `task_events` table with `event_type: 'llm_call'`

---

## 4. Data Flow Diagrams

### 4.1 User Submits Job URL -> Application Complete

```
User                Frontend              API                Hatchet            Worker              LLM
 |                     |                    |                   |                  |                  |
 |  Paste URL          |                    |                   |                  |                  |
 |-------------------->|                    |                   |                  |                  |
 |                     | POST /api/tasks    |                   |                  |                  |
 |                     | {jobUrl, resumeId} |                   |                  |                  |
 |                     |------------------->|                   |                  |                  |
 |                     |                    | Create task (DB)  |                  |                  |
 |                     |                    | Run workflow ------+----------------->|                  |
 |                     | 202 {taskId}       |                   |                  |                  |
 |                     |<-------------------|                   |                  |                  |
 |                     |                    |                   |                  |                  |
 |                     | Connect WS         |                   |                  |                  |
 |                     | Subscribe task:id  |                   |                  |                  |
 |                     |<==================>|                   |                  |                  |
 |                     |                    |                   | Step 1:          |                  |
 |                     |                    |                   | provision-browser|                  |
 |                     |                    |                   |----------------->|                  |
 |                     |                    |                   |                  | AdsPower.start() |
 |                     |                    |                   |                  | CDP connect      |
 |                     |                    |  Redis pub/sub    |                  |                  |
 |                     | WS: PROVISIONING   |<======================================|                  |
 |                     |<==================>|                   |                  |                  |
 |  "Starting..."      |                    |                   |                  |                  |
 |<--------------------|                    |                   | Step 2: navigate |                  |
 |                     |                    |                   |----------------->|                  |
 |                     |                    |                   |                  | page.goto(url)   |
 |                     | WS: NAVIGATING     |<======================================|                  |
 |                     |<==================>|                   |                  |                  |
 |                     |                    |                   | Step 3: analyze  |                  |
 |                     |                    |                   |----------------->|                  |
 |                     |                    |                   |                  | extract DOM ------>|
 |                     |                    |                   |                  |                  | map fields
 |                     |                    |                   |                  |<-----------------|
 |                     | WS: ANALYZING      |<======================================|                  |
 |                     |<==================>|                   |                  |                  |
 |                     |                    |                   | Step 4: fill     |                  |
 |                     |                    |                   |----------------->|                  |
 |                     |                    |                   |                  | Stagehand.act()  |
 |                     |                    |                   |                  | per field        |
 |                     | WS: FILLING (x N)  |<======================================|                  |
 |                     |<==================>|                   |                  |                  |
 |                     |                    |                   | Step 5: review   |                  |
 |  Review fields      |                    |                   | (Copilot mode)   |                  |
 |  [Approve] [Edit]   | WS: field_review   |<======================================|                  |
 |<====================|<==================>|                   |                  |                  |
 |                     |                    |                   | waitForEvent     |                  |
 |                     |                    |                   | ('review:        |                  |
 |  Click [Approve]    |                    |                   |  approved')      |                  |
 |-------------------->| POST /tasks/{id}/  |                   |                  |                  |
 |                     |   approve          |                   |                  |                  |
 |                     |------------------->| sendEvent --------+----------------->|                  |
 |                     |                    |                   | Step 6: submit   |                  |
 |                     |                    |                   |----------------->|                  |
 |                     |                    |                   |                  | click submit btn |
 |                     | WS: SUBMITTING     |<======================================|                  |
 |                     |<==================>|                   | Step 7: verify   |                  |
 |                     |                    |                   |----------------->|                  |
 |                     |                    |                   |                  | check success ----->|
 |                     |                    |                   |                  |<-----------------|
 |                     |                    |                   |                  | screenshot       |
 |                     |                    |                   |                  | -> S3            |
 |                     |                    |                   | Step 8: cleanup  |                  |
 |                     |                    |                   |----------------->|                  |
 |                     |                    |                   |                  | AdsPower.stop()  |
 |                     |                    |   Update task DB  |                  |                  |
 |                     | WS: COMPLETED      |<======================================|                  |
 |                     |<==================>|                   |                  |                  |
 |  "Success!"         |                    |                   |                  |                  |
 |<--------------------|                    |                   |                  |                  |
```

### 4.2 CAPTCHA Detected -> Human Takeover -> Resume

```
Worker                       Redis          API/WS           Frontend           User
  |                            |              |                 |                  |
  | CAPTCHA detected           |              |                 |                  |
  | Start x11vnc + websockify  |              |                 |                  |
  |                            |              |                 |                  |
  | Publish: human_needed      |              |                 |                  |
  |--------------------------->|              |                 |                  |
  |                            |------------->|                 |                  |
  |                            |              | WS: human_needed|                  |
  |                            |              |---------------->|                  |
  |                            |              |                 | Open VNC modal   |
  |                            |              |                 |----------------->|
  |                            |              |                 |  "CAPTCHA! Help" |
  | ctx.waitForEvent(          |              |                 |                  |
  |   'captcha:solved',        |              |                 |                  |
  |   timeout: '30m')          |              |                 |                  |
  | [WORKFLOW PAUSED]          |              |                 |                  |
  |                            |              |                 |                  |
  |                            |              |                 |  <VncScreen>     |
  |                            |              |                 |<======WS======>Worker:VNC
  |                            |              |                 |                  |
  |                            |              |                 |  User solves     |
  |                            |              |                 |  CAPTCHA         |
  |                            |              |                 |                  |
  |                            |              |                 | Click "Resume"   |
  |                            |              |                 |<-----------------|
  |                            |              | POST /tasks/    |                  |
  |                            |              |  {id}/captcha-  |                  |
  |                            |              |  solved         |                  |
  |                            |              |<----------------|                  |
  |                            |              |                 |                  |
  |                            |   sendEvent('captcha:solved')  |                  |
  |<=========================================>|                 |                  |
  | [WORKFLOW RESUMES]         |              |                 |                  |
  |                            |              |                 |                  |
  | Verify CAPTCHA gone (DOM)  |              |                 |                  |
  | Stop x11vnc + websockify   |              |                 |                  |
  | Continue from paused step  |              |                 |                  |
  |                            |              |                 |                  |
  | Publish: task_update       |              |                 |                  |
  |--------------------------->|------------->|---------------->|                  |
  |                            |              |                 | Close VNC modal  |
  |                            |              |                 | Show progress    |
  |                            |              |                 |----------------->|
```

### 4.3 Autopilot Batch: 10 URLs Queued and Processed

```
User            Frontend              API                  Hatchet              Worker
 |                 |                    |                      |                   |
 | Paste 10 URLs   |                    |                      |                   |
 |---------------->|                    |                      |                   |
 |                 | POST /api/tasks/   |                      |                   |
 |                 |   batch            |                      |                   |
 |                 | {urls: [...],      |                      |                   |
 |                 |  mode: "autopilot"}|                      |                   |
 |                 |------------------->|                      |                   |
 |                 |                    | Validate all URLs    |                   |
 |                 |                    | Check quality gates  |                   |
 |                 |                    | Create 10 tasks      |                   |
 |                 |                    | Run batch workflow --+------------------>|
 |                 | 202 {batchId,      |                      |                   |
 |                 |  taskIds: [...]}   |                      |                   |
 |                 |<-------------------|                      |                   |
 |                 |                    |                      |                   |
 | "10 queued"     |                    |                      |                   |
 |<----------------|                    |                      |                   |
 |                 |                    |                      | for each task:    |
 |                 |                    |                      |   1. provision    |
 |                 |                    |                      |   2. navigate     |
 |                 |                    |                      |   3. analyze      |
 |                 |                    |                      |   4. fill         |
 |                 |                    |                      |   5. quality gates|
 |                 |                    |                      |   6. submit       |
 |                 |                    |                      |   7. verify       |
 |                 |                    |                      |   8. cleanup      |
 |                 |                    |                      |   9. delay(120s)  |
 |                 |                    |                      |  [repeat]         |
 |                 |                    |                      |                   |
 |                 | WS: batch_progress |<======================================|
 |                 |   {completed: 1/10,|                      |                   |
 |                 |    current: task_2,|                      |                   |
 |                 |    failed: 0}      |                      |                   |
 | "1/10 done"     |<==================>|                      |                   |
 |<----------------|                    |                      |                   |
 |                 |                    |                      |                   |
 |  ... (repeat for each task) ...     |                      |                   |
 |                 |                    |                      |                   |
 |                 | WS: batch_complete |<======================================|
 |                 |   {completed: 9,   |                      |                   |
 |                 |    failed: 1,      |                      |                   |
 |                 |    total: 10}      |                      |                   |
 | "9/10 success"  |<==================>|                      |                   |
 |<----------------|                    |                      |                   |
```

### 4.4 Real-Time Progress: Worker State -> WebSocket -> Dashboard

```
Worker Process              Redis                API Process            Frontend
     |                        |                       |                     |
     | Stagehand fills field  |                       |                     |
     | "First Name" = "Adam"  |                       |                     |
     |                        |                       |                     |
     | PUBLISH                |                       |                     |
     | task:{taskId}:progress |                       |                     |
     | { state, field, ... }  |                       |                     |
     |----------------------->|                       |                     |
     |                        | SUBSCRIBE             |                     |
     |                        | task:{taskId}:progress|                     |
     |                        |---------------------->|                     |
     |                        |                       | Find WS connections |
     |                        |                       | for this user/task  |
     |                        |                       |                     |
     |                        |                       | ws.send({           |
     |                        |                       |   type: 'task_update|',
     |                        |                       |   payload: { ... }  |
     |                        |                       | })                  |
     |                        |                       |-------------------->|
     |                        |                       |                     |
     |                        |                       |                     | React state update
     |                        |                       |                     | useTaskWebSocket hook
     |                        |                       |                     | re-renders:
     |                        |                       |                     |  - Progress bar: 45%
     |                        |                       |                     |  - Timeline: checkmark
     |                        |                       |                     |  - Field log: new entry
     |                        |                       |                     |  - Screenshot: refresh
```

**Latency budget:** Worker PUBLISH -> Redis -> API SUBSCRIBE -> WebSocket send -> Frontend render. Target: < 200ms end-to-end.

---

## 5. Stagehand Integration Pattern

### 5.1 Worker Initialization with AdsPower CDP

```typescript
// apps/worker/src/browser/adsPowerManager.ts
import { chromium, type Page, type BrowserContext } from 'playwright';

export class AdsPowerManager {
  private baseUrl = process.env.ADSPOWER_API_URL || 'http://localhost:50325';

  async launchProfile(profileId: string): Promise<{
    browser: BrowserContext;
    page: Page;
    cdpUrl: string;
  }> {
    // 1. Start the AdsPower profile and get CDP URL
    const startResponse = await fetch(
      `${this.baseUrl}/api/v1/browser/start?serial_number=${profileId}`,
      { method: 'GET' }
    );
    const { data } = await startResponse.json();
    const cdpUrl = data.ws.puppeteer; // CDP WebSocket URL

    // 2. Connect Playwright to the running browser via CDP
    const browser = await chromium.connectOverCDP(cdpUrl);
    const context = browser.contexts()[0];
    const page = context.pages()[0] || await context.newPage();

    return { browser: context, page, cdpUrl };
  }

  async stopProfile(profileId: string): Promise<void> {
    await fetch(
      `${this.baseUrl}/api/v1/browser/stop?serial_number=${profileId}`,
      { method: 'GET' }
    );
  }
}
```

```typescript
// apps/worker/src/browser/stagehandFactory.ts
import { Stagehand } from '@browserbasehq/stagehand';
import type { Page } from 'playwright';

export async function createStagehandSession(
  page: Page,
  config: StagehandConfig
): Promise<Stagehand> {
  // Stagehand v3 supports connecting to an existing Playwright page
  const stagehand = new Stagehand({
    env: 'LOCAL',           // Not using Browserbase cloud
    modelName: config.modelName || 'claude-sonnet-4-5-20250514',
    modelClientOptions: {
      apiKey: config.anthropicApiKey,
    },
    enableCaching: true,    // Enable selector caching (Redis-backed)
    verbose: config.debug ? 2 : 0,
    // Connect to existing page (AdsPower browser)
    page: page,
  });

  await stagehand.init();
  return stagehand;
}
```

### 5.2 Three-Layer Fallback Architecture

```typescript
// apps/worker/src/agents/agentOrchestrator.ts

export class AgentOrchestrator {
  private stagehand: Stagehand;
  private magnitude: MagnitudeClient;
  private platformStats: PlatformStatsCache;  // Redis-backed

  constructor(
    stagehand: Stagehand,
    magnitude: MagnitudeClient,
    platformStats: PlatformStatsCache
  ) {
    this.stagehand = stagehand;
    this.magnitude = magnitude;
    this.platformStats = platformStats;
  }

  /**
   * Execute a browser action with 3-layer fallback:
   *   Layer 1: Stagehand (fast, cached, DOM-based)
   *   Layer 2: Magnitude (slower, visual, general)
   *   Layer 3: Human takeover (noVNC)
   */
  async executeAction(
    action: BrowserAction,
    context: ActionContext
  ): Promise<ActionResult> {
    const platform = context.platform; // 'linkedin', 'greenhouse', etc.
    const successRate = await this.platformStats.getSuccessRate(platform, 'stagehand');

    // Route directly to Magnitude if Stagehand has poor history on this platform
    if (successRate < 0.5 && successRate > 0) {
      return this.tryMagnitude(action, context);
    }

    // Layer 1: Stagehand
    try {
      const result = await this.tryStagehand(action, context);
      await this.platformStats.recordSuccess(platform, 'stagehand');
      return result;
    } catch (error) {
      await this.platformStats.recordFailure(platform, 'stagehand');

      // Non-retryable Stagehand errors -> immediate Magnitude switch
      if (isNonRetryable(error)) {
        context.logger.warn(`Stagehand non-retryable error, switching to Magnitude`, { error });
        return this.tryMagnitude(action, context);
      }

      // Retryable errors -> retry once, then Magnitude
      try {
        await sleep(2000);
        const retryResult = await this.tryStagehand(action, context);
        await this.platformStats.recordSuccess(platform, 'stagehand');
        return retryResult;
      } catch {
        return this.tryMagnitude(action, context);
      }
    }
  }

  private async tryStagehand(action: BrowserAction, context: ActionContext): Promise<ActionResult> {
    switch (action.type) {
      case 'fill':
        await this.stagehand.act(
          `Fill the "${action.fieldLabel}" field with "${action.value}"`
        );
        break;
      case 'click':
        await this.stagehand.act(`Click the "${action.target}" button`);
        break;
      case 'select':
        await this.stagehand.act(
          `Select "${action.value}" from the "${action.fieldLabel}" dropdown`
        );
        break;
      case 'upload':
        // File uploads use Playwright directly (not Stagehand)
        const input = await this.stagehand.page.locator(action.selector);
        await input.setInputFiles(action.filePath);
        break;
    }

    // Verify the action succeeded (Layer 1 verification)
    return this.verifyAction(action, context);
  }

  private async tryMagnitude(action: BrowserAction, context: ActionContext): Promise<ActionResult> {
    try {
      const result = await this.magnitude.execute(action, context.page);
      await this.platformStats.recordSuccess(context.platform, 'magnitude');
      return result;
    } catch (error) {
      await this.platformStats.recordFailure(context.platform, 'magnitude');
      // Both agents failed -> request human takeover
      return { status: 'human_needed', reason: `Both Stagehand and Magnitude failed: ${error.message}` };
    }
  }

  private async verifyAction(action: BrowserAction, context: ActionContext): Promise<ActionResult> {
    if (action.type === 'fill') {
      // Extract the field value after filling to verify
      const actual = await this.stagehand.extract({
        instruction: `What is the current value of the "${action.fieldLabel}" field?`,
        schema: z.object({ value: z.string() }),
      });

      if (actual.value !== action.value) {
        return { status: 'verification_failed', expected: action.value, actual: actual.value };
      }
    }
    return { status: 'success' };
  }
}

function isNonRetryable(error: Error): boolean {
  const nonRetryableTypes = [
    'XPathResolutionError',
    'ContentFrameNotFoundError',
    'StagehandShadowRootMissingError',
  ];
  return nonRetryableTypes.some(t => error.constructor.name === t || error.message.includes(t));
}
```

### 5.3 Verification Integration in Workflow

Three verification layers integrated into the Hatchet workflow:

```typescript
// apps/worker/src/workflows/jobApplication.ts (simplified)

async function fillFormStep(ctx: StepContext): Promise<StepOutput> {
  const { fields, taskId, page } = ctx.input();
  const orchestrator = new AgentOrchestrator(stagehand, magnitude, platformStats);
  const redis = getRedisClient();
  const results: FieldResult[] = [];

  // Fill fields one by one with Layer 1 verification (per-action)
  for (const field of fields) {
    const result = await orchestrator.executeAction(
      { type: 'fill', fieldLabel: field.label, value: field.value, selector: field.selector },
      { platform: field.platform, page, logger: ctx.log }
    );

    if (result.status === 'human_needed') {
      // Escalate to human takeover
      return { needsHuman: true, reason: result.reason, completedFields: results };
    }

    results.push({ ...field, fillResult: result });

    // Publish progress
    await publishProgress(redis, taskId, field, results.length, fields.length);
  }

  // Layer 2 verification: extract entire form and compare
  const formSnapshot = await stagehand.extract({
    instruction: 'Extract all visible form field values on this page',
    schema: formDataSchema,
  });

  const mismatches = compareFormData(fields, formSnapshot);
  if (mismatches.length > 0) {
    ctx.log(`Form verification found ${mismatches.length} mismatches`, { mismatches });
    // Attempt to correct mismatches
    for (const mismatch of mismatches) {
      await orchestrator.executeAction(
        { type: 'fill', fieldLabel: mismatch.field, value: mismatch.expected },
        { platform: fields[0].platform, page, logger: ctx.log }
      );
    }
  }

  return { filledFields: results, verificationPassed: mismatches.length === 0 };
}

async function verifyStep(ctx: StepContext): Promise<StepOutput> {
  const { page, taskId } = ctx.input();

  // Layer 3 verification: result-level
  const pageAnalysis = await stagehand.extract({
    instruction: 'Is this a success/confirmation page? Look for confirmation messages, thank you text, or application received indicators.',
    schema: z.object({
      isSuccessPage: z.boolean(),
      confirmationText: z.string().optional(),
      hasErrorMessage: z.boolean(),
      errorText: z.string().optional(),
    }),
  });

  // Take confirmation screenshot
  const screenshot = await page.screenshot({ type: 'jpeg', quality: 80 });
  const screenshotUrl = await uploadToS3(`screenshots/${taskId}/confirmation.jpg`, screenshot);

  return {
    success: pageAnalysis.isSuccessPage && !pageAnalysis.hasErrorMessage,
    confirmationText: pageAnalysis.confirmationText,
    screenshotUrl,
  };
}
```

### 5.4 Cache System Across Applications

Stagehand's built-in cache uses `hash(instruction + startURL + config)` as the cache key. By default, this is stored in-memory or on disk. For cross-application and cross-worker caching, we configure it to use Redis:

```typescript
// apps/worker/src/cache/stagehandRedisCache.ts
import { type CacheProvider } from '@browserbasehq/stagehand';
import { Redis } from 'ioredis';

export class StagehandRedisCache implements CacheProvider {
  private redis: Redis;
  private ttl: number;

  constructor(redis: Redis, ttlSeconds: number = 86400 * 30) { // 30-day default TTL
    this.redis = redis;
    this.ttl = ttlSeconds;
  }

  async get(key: string): Promise<string | null> {
    return this.redis.get(`stagehand:cache:${key}`);
  }

  async set(key: string, value: string): Promise<void> {
    await this.redis.setex(`stagehand:cache:${key}`, this.ttl, value);
  }

  async has(key: string): Promise<boolean> {
    return (await this.redis.exists(`stagehand:cache:${key}`)) === 1;
  }
}
```

**Cache behavior across applications:**
- First application on LinkedIn: Stagehand calls the LLM to resolve selectors (~$0.05-0.10 per operation). Selectors are cached in Redis.
- Second+ application on LinkedIn: Stagehand retrieves cached selectors from Redis (~50ms per operation, $0 LLM cost).
- If a cached selector fails (LinkedIn changed their DOM), Stagehand automatically re-resolves and updates the cache.
- Cache is shared across all workers (Redis is the single source of truth).
- Platform-specific cache statistics tracked for routing decisions.

### 5.5 Interface Contracts (for future scraping core)

The scraping/automation core does not need to be fully implemented now. These interfaces define the contracts that the worker layer depends on, so future implementation is plug-and-play:

```typescript
// packages/shared/src/types/automation.ts

/** A single browser action to execute */
export interface BrowserAction {
  type: 'fill' | 'click' | 'select' | 'upload' | 'navigate' | 'wait' | 'scroll';
  fieldLabel?: string;
  value?: string;
  selector?: string;
  target?: string;
  filePath?: string;
  url?: string;
  timeout?: number;
}

/** Result of executing a browser action */
export interface ActionResult {
  status: 'success' | 'verification_failed' | 'human_needed' | 'error';
  reason?: string;
  expected?: string;
  actual?: string;
}

/** A platform adapter that knows how to apply on a specific ATS */
export interface PlatformAdapter {
  platform: string;                          // 'linkedin', 'greenhouse', 'lever', 'workday'
  detect(url: string): boolean;              // URL pattern match
  getFormStructure(page: Page): Promise<FormField[]>;  // Extract form fields
  getSubmitFlow(page: Page): Promise<SubmitStep[]>;    // Multi-step flow definition
}

/** Mapping of a form field to user data */
export interface FormFieldMapping {
  fieldLabel: string;
  selector: string;
  inputType: 'text' | 'textarea' | 'select' | 'radio' | 'checkbox' | 'file';
  value: string;
  confidence: number;          // 0.0 - 1.0
  source: 'profile' | 'qa_bank' | 'llm_generated' | 'resume_inferred';
}
```

---

## 6. API Contract

### 6.1 Base Configuration

- **Base URL:** `/api/v1`
- **Auth:** Bearer JWT token in `Authorization` header (all routes except `/auth/*`)
- **Content-Type:** `application/json` (except file uploads: `multipart/form-data`)
- **Error format:** `{ error: { code: string, message: string, details?: Record<string, unknown> } }`
- **Pagination:** `?page=1&limit=25` with response header `X-Total-Count`
- **Rate limiting:** 100 req/min per user; `X-RateLimit-Remaining` header

### 6.2 Authentication

```
POST   /api/v1/auth/google
  Body:     { code: string, redirectUri: string }
  Response: { accessToken: string, refreshToken: string, user: UserProfile }
  Notes:    Exchange Google OAuth authorization code for JWT tokens

POST   /api/v1/auth/refresh
  Body:     { refreshToken: string }
  Response: { accessToken: string, refreshToken: string }
  Notes:    Rotate refresh token on each use

GET    /api/v1/auth/me
  Response: UserProfile
  Notes:    Returns current user from JWT

POST   /api/v1/auth/logout
  Response: 204 No Content
  Notes:    Invalidates refresh token server-side
```

### 6.3 Applications (Tasks)

```
POST   /api/v1/applications
  Body: {
    jobUrl: string,
    resumeId: string,
    mode: 'copilot' | 'autopilot',
    overrides?: Record<string, string>   // Optional pre-edited field values
  }
  Response: 202 Accepted
  {
    id: string,
    status: 'CREATED',
    workflowRunId: string,
    wsChannel: string                    // WebSocket topic for this task
  }
  Notes: Creates task in DB, triggers Hatchet workflow.
         Returns immediately; progress via WebSocket.

POST   /api/v1/applications/batch
  Body: {
    urls: string[],                      // Max 25
    resumeId: string,
    mode: 'copilot' | 'autopilot',
    delayBetween?: number                // Seconds, default 120
  }
  Response: 202 Accepted
  {
    batchId: string,
    applications: Array<{ id: string, jobUrl: string, status: 'QUEUED' }>
  }

GET    /api/v1/applications
  Query: {
    status?: 'CREATED' | 'IN_PROGRESS' | 'WAITING_REVIEW' | 'WAITING_HUMAN' |
             'SUBMITTED' | 'COMPLETED' | 'FAILED' | 'CANCELLED',
    platform?: 'linkedin' | 'greenhouse' | 'lever' | 'workday',
    mode?: 'copilot' | 'autopilot',
    dateFrom?: string,                   // ISO 8601
    dateTo?: string,
    page?: number,
    limit?: number                       // Default 25, max 100
  }
  Response: {
    data: Application[],
    pagination: { page: number, limit: number, total: number }
  }

GET    /api/v1/applications/:id
  Response: ApplicationDetail
  {
    id: string,
    jobUrl: string,
    platform: string,
    status: string,
    mode: string,
    jobTitle: string,
    company: string,
    location: string,
    matchScore: number,
    fields: FieldResult[],               // Per-field fill results with confidence
    screenshots: ScreenshotRef[],
    events: TaskEvent[],                 // Last 50 events
    createdAt: string,
    completedAt: string | null,
    duration: number | null,             // Seconds
    error: { code: string, message: string } | null
  }

GET    /api/v1/applications/stats
  Response: {
    total: number,
    completed: number,
    failed: number,
    successRate: number,                 // 0.0 - 1.0
    avgDuration: number,                 // Seconds
    byPlatform: Record<string, { total: number, successRate: number }>,
    byMode: Record<string, { total: number, successRate: number }>,
    todayCount: number,
    dailyLimit: number
  }

POST   /api/v1/applications/:id/approve
  Body: {
    editedFields?: Record<string, string>  // Optional user edits to fields
  }
  Response: 200 { status: 'SUBMITTING' }
  Notes: Copilot mode -- user approves pre-submit review.
         Emits Hatchet durable event 'review:approved'.

POST   /api/v1/applications/:id/captcha-solved
  Response: 200 { status: 'RESUMING' }
  Notes: Emits Hatchet durable event 'captcha:solved'.
         Worker verifies CAPTCHA is gone before continuing.

POST   /api/v1/applications/:id/pause
  Response: 200 { status: 'PAUSED' }
  Notes: Sends pause signal to Hatchet workflow.
         Worker completes current action, then pauses.

POST   /api/v1/applications/:id/cancel
  Response: 200 { status: 'CANCELLED' }
  Notes: Cancels Hatchet workflow. Worker stops browser.

DELETE /api/v1/applications/active
  Response: 200 { cancelledCount: number }
  Notes: Kill switch -- cancels ALL active tasks for this user.
         Must complete in < 2 seconds.

GET    /api/v1/applications/:id/events
  Query: { page?: number, limit?: number }
  Response: {
    data: TaskEvent[],
    pagination: { page: number, limit: number, total: number }
  }
  Notes: Paginated audit trail for a single application.
```

### 6.4 Resumes

```
POST   /api/v1/resumes/upload
  Body:     multipart/form-data { file: File (PDF/DOCX, max 10MB) }
  Response: 202 Accepted { id: string, status: 'PARSING' }
  Notes:    Triggers async LLM parsing via Hatchet workflow.

GET    /api/v1/resumes
  Response: Resume[]
  Notes:    Max 5 active resumes per user.

GET    /api/v1/resumes/:id
  Response: ResumeDetail
  {
    id: string,
    filename: string,
    parsedData: ParsedResumeData,
    inferredAnswers: InferredAnswer[],
    isDefault: boolean,
    uploadedAt: string,
    parseConfidence: number
  }

PUT    /api/v1/resumes/:id
  Body:     { parsedData: Partial<ParsedResumeData> }
  Response: ResumeDetail
  Notes:    User corrections to parsed data.

DELETE /api/v1/resumes/:id
  Response: 204 No Content

PUT    /api/v1/resumes/:id/default
  Response: 200 { isDefault: true }
```

### 6.5 Q&A Bank

```
GET    /api/v1/questions
  Response: { schema: JSONSchema, answers: UserAnswer[] }
  Notes:    Returns JSON Schema for RJSF rendering + user's saved answers.

POST   /api/v1/answers
  Body:     { questionId: string, answer: string, alwaysUse: boolean }
  Response: UserAnswer

PUT    /api/v1/answers/:id
  Body:     { answer?: string, alwaysUse?: boolean }
  Response: UserAnswer

DELETE /api/v1/answers/:id
  Response: 204 No Content

POST   /api/v1/questions/discover
  Body:     { questions: Array<{ text: string, context: string }> }
  Response: { added: number, matched: number }
  Notes:    Called by worker when new screening questions are encountered.
            Matches against existing questions semantically.
```

### 6.6 User Preferences & Consent

```
GET    /api/v1/users/preferences
  Response: UserPreferences

PUT    /api/v1/users/preferences
  Body:     Partial<UserPreferences>
  Response: UserPreferences

POST   /api/v1/consent
  Body: {
    type: 'tos' | 'privacy_policy' | 'copilot_disclaimer' | 'autopilot_consent',
    version: string,
    ipAddress?: string
  }
  Response: ConsentRecord

GET    /api/v1/consent
  Response: ConsentRecord[]

GET    /api/v1/consent/check
  Query:    { type: string, version: string }
  Response: { valid: boolean, acceptedAt: string | null }

POST   /api/v1/users/export
  Response: 202 Accepted { downloadUrl: string }
  Notes:    GDPR Article 20 -- data portability. Async job.

DELETE /api/v1/users
  Response: 202 Accepted
  Notes:    GDPR Article 17 -- right to erasure. Async deletion.
```

### 6.7 WebSocket

```
GET    /api/v1/ws?token={jwt}
  Protocol: WebSocket
  Notes:    Single persistent connection per client.
            Multiplexed by message type and taskId.

  Client -> Server messages:
    { action: 'subscribe', taskId: string }
    { action: 'unsubscribe', taskId: string }
    { action: 'ping' }

  Server -> Client messages:
    { type: 'task_update',    taskId: string, payload: TaskUpdate }
    { type: 'field_review',   taskId: string, payload: FieldReviewRequest }
    { type: 'human_needed',   taskId: string, payload: HumanTakeoverRequest }
    { type: 'task_complete',  taskId: string, payload: TaskCompletionSummary }
    { type: 'task_error',     taskId: string, payload: TaskError }
    { type: 'notification',   payload: Notification }
    { type: 'pong' }

  Heartbeat: Server sends ping every 30s; client must respond with pong.
  Reconnection: Client implements exponential backoff (1s, 2s, 4s, max 30s).
```

### 6.8 Type Definitions (shared across frontend and API)

```typescript
// packages/shared/src/types/api.ts

export interface Application {
  id: string;
  jobUrl: string;
  platform: 'linkedin' | 'greenhouse' | 'lever' | 'workday' | 'unknown';
  status: ApplicationStatus;
  mode: 'copilot' | 'autopilot';
  jobTitle: string | null;
  company: string | null;
  location: string | null;
  matchScore: number | null;
  createdAt: string;
  completedAt: string | null;
  duration: number | null;
}

export type ApplicationStatus =
  | 'CREATED'
  | 'QUEUED'
  | 'PROVISIONING'
  | 'NAVIGATING'
  | 'ANALYZING'
  | 'FILLING_FORM'
  | 'WAITING_REVIEW'     // Copilot: paused for user approval
  | 'WAITING_HUMAN'      // CAPTCHA or manual intervention needed
  | 'SUBMITTING'
  | 'VERIFYING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED'
  | 'AUTOPILOT_QUEUED'
  | 'AUTOPILOT_EXECUTING'
  | 'AUTOPILOT_SUBMITTED'
  | 'QUALITY_GATE_BLOCKED';

export interface TaskEvent {
  id: string;
  taskId: string;
  eventType: string;
  data: Record<string, unknown>;
  createdAt: string;
}

export interface FieldResult {
  label: string;
  value: string;
  confidence: number;
  source: 'profile' | 'qa_bank' | 'llm_generated' | 'resume_inferred';
  status: 'filled' | 'skipped' | 'failed' | 'pending';
  agent: 'stagehand' | 'magnitude' | 'human';
}

export interface ParsedResumeData {
  fullName: string;
  email: string;
  phone: string;
  location: string;
  workHistory: WorkExperience[];
  education: Education[];
  skills: string[];
  certifications: string[];
  languages: string[];
  urls: { linkedin?: string; github?: string; portfolio?: string; website?: string };
}
```

---

## 7. Design System Integration

### 7.1 The Bridge: WeKruit CSS Custom Properties -> Tailwind Theme

The WeKruit design system uses CSS custom properties (`--wk-*` tokens). shadcn-admin uses Tailwind utility classes with its own CSS variable system (`--background`, `--foreground`, etc.). The bridge connects them.

**Strategy:** Extend Tailwind's theme configuration to reference WeKruit CSS custom properties. This lets developers use Tailwind utilities (`bg-wk-surface-page`, `text-wk-primary`) that resolve to WeKruit design tokens at runtime. Dark mode is handled by the `[data-theme="dark"]` selector, which redefines the CSS custom properties -- no Tailwind `dark:` prefixes needed for themed values.

```typescript
// apps/web/tailwind.config.ts
import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['selector', '[data-theme="dark"]'],  // Match WeKruit's data-theme approach
  content: ['./src/**/*.{ts,tsx}', '../../packages/ui/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // ── Colors mapped from WeKruit CSS custom properties ──
      colors: {
        // Brand
        'wk-espresso':      'var(--wk-brand-espresso)',
        'wk-espresso-90':   'var(--wk-brand-espresso-90)',
        'wk-espresso-80':   'var(--wk-brand-espresso-80)',
        'wk-espresso-70':   'var(--wk-brand-espresso-70)',

        // Surfaces
        'wk-page':          'var(--wk-surface-page)',
        'wk-raised':        'var(--wk-surface-raised)',
        'wk-sunken':        'var(--wk-surface-sunken)',
        'wk-card':          'var(--wk-surface-card)',
        'wk-white':         'var(--wk-surface-white)',

        // Text
        'wk-text':          'var(--wk-text-primary)',
        'wk-text-secondary':'var(--wk-text-secondary)',
        'wk-text-tertiary': 'var(--wk-text-tertiary)',
        'wk-text-inverse':  'var(--wk-text-inverse)',

        // Accents
        'wk-amber':         'var(--wk-accent-amber)',
        'wk-amber-light':   'var(--wk-accent-amber-light)',
        'wk-teal':          'var(--wk-accent-teal)',
        'wk-coral':         'var(--wk-accent-coral)',

        // Borders (used via border-wk-* utilities)
        'wk-border':        'var(--wk-border-default)',
        'wk-border-subtle': 'var(--wk-border-subtle)',
        'wk-border-strong': 'var(--wk-border-strong)',

        // shadcn compatibility aliases (override shadcn defaults with WeKruit tokens)
        background:         'var(--wk-surface-page)',
        foreground:         'var(--wk-text-primary)',
        card:               'var(--wk-surface-card)',
        'card-foreground':  'var(--wk-text-primary)',
        popover:            'var(--wk-surface-raised)',
        'popover-foreground': 'var(--wk-text-primary)',
        primary:            'var(--wk-brand-espresso)',
        'primary-foreground': 'var(--wk-surface-page)',
        secondary:          'var(--wk-surface-sunken)',
        'secondary-foreground': 'var(--wk-text-primary)',
        muted:              'var(--wk-surface-sunken)',
        'muted-foreground': 'var(--wk-text-secondary)',
        accent:             'var(--wk-accent-amber)',
        'accent-foreground':'var(--wk-text-primary)',
        destructive:        'var(--wk-accent-coral)',
        'destructive-foreground': 'var(--wk-text-inverse)',
        border:             'var(--wk-border-default)',
        input:              'var(--wk-border-default)',
        ring:               'var(--wk-brand-espresso)',
      },

      // ── Typography ──
      fontFamily: {
        display: ['var(--wk-font-display)', 'serif'],      // Halant
        body:    ['var(--wk-font-body)', 'sans-serif'],     // Geist
        sans:    ['var(--wk-font-body)', 'sans-serif'],     // Override Tailwind default
      },
      fontSize: {
        'wk-xs':   'var(--wk-text-xs)',
        'wk-sm':   'var(--wk-text-sm)',
        'wk-base': 'var(--wk-text-base)',
        'wk-lg':   'var(--wk-text-lg)',
        'wk-xl':   'var(--wk-text-xl)',
        'wk-2xl':  'var(--wk-text-2xl)',
        'wk-3xl':  'var(--wk-text-3xl)',
        'wk-4xl':  'var(--wk-text-4xl)',
        'wk-5xl':  'var(--wk-text-5xl)',
        'wk-6xl':  'var(--wk-text-6xl)',
      },
      fontWeight: {
        'wk-light':    'var(--wk-weight-light)',
        'wk-regular':  'var(--wk-weight-regular)',
        'wk-medium':   'var(--wk-weight-medium)',
        'wk-semibold': 'var(--wk-weight-semibold)',
        'wk-bold':     'var(--wk-weight-bold)',
      },
      lineHeight: {
        'wk-tight':    'var(--wk-leading-tight)',
        'wk-snug':     'var(--wk-leading-snug)',
        'wk-normal':   'var(--wk-leading-normal)',
        'wk-relaxed':  'var(--wk-leading-relaxed)',
      },
      letterSpacing: {
        'wk-tight':    'var(--wk-tracking-tight)',
        'wk-normal':   'var(--wk-tracking-normal)',
        'wk-wide':     'var(--wk-tracking-wide)',
        'wk-wider':    'var(--wk-tracking-wider)',
      },

      // ── Spacing ──
      spacing: {
        'wk-1':  'var(--wk-space-1)',
        'wk-2':  'var(--wk-space-2)',
        'wk-3':  'var(--wk-space-3)',
        'wk-4':  'var(--wk-space-4)',
        'wk-5':  'var(--wk-space-5)',
        'wk-6':  'var(--wk-space-6)',
        'wk-8':  'var(--wk-space-8)',
        'wk-10': 'var(--wk-space-10)',
        'wk-12': 'var(--wk-space-12)',
        'wk-16': 'var(--wk-space-16)',
        'wk-20': 'var(--wk-space-20)',
        'wk-24': 'var(--wk-space-24)',
        'wk-32': 'var(--wk-space-32)',
      },

      // ── Border Radius ──
      borderRadius: {
        'wk-sm':   'var(--wk-radius-sm)',
        'wk-md':   'var(--wk-radius-md)',
        'wk-lg':   'var(--wk-radius-lg)',
        'wk-xl':   'var(--wk-radius-xl)',
        'wk-2xl':  'var(--wk-radius-2xl)',
        'wk-3xl':  'var(--wk-radius-3xl)',
        'wk-full': 'var(--wk-radius-full)',
      },

      // ── Shadows ──
      boxShadow: {
        'wk-sm': 'var(--wk-shadow-sm)',
        'wk-md': 'var(--wk-shadow-md)',
        'wk-lg': 'var(--wk-shadow-lg)',
        'wk-xl': 'var(--wk-shadow-xl)',
      },

      // ── Layout ──
      maxWidth: {
        'wk':        'var(--wk-max-width)',
        'wk-content':'var(--wk-content-width)',
        'wk-narrow': 'var(--wk-narrow-width)',
      },

      // ── Transitions ──
      transitionTimingFunction: {
        'wk-default': 'var(--wk-ease-default)',
        'wk-spring':  'var(--wk-ease-spring)',
      },
      transitionDuration: {
        'wk-fast': 'var(--wk-duration-fast)',
        'wk-base': 'var(--wk-duration-base)',
        'wk-slow': 'var(--wk-duration-slow)',
      },
    },
  },
  plugins: [],
};

export default config;
```

### 7.2 Component Theming Approach

shadcn/ui components are copy-paste -- we own the code. The theming approach:

1. **Import WeKruit CSS custom properties** in the global stylesheet (`apps/web/src/styles/globals.css`):
   ```css
   @import './wekruit-tokens.css';   /* All --wk-* custom properties */
   @tailwind base;
   @tailwind components;
   @tailwind utilities;
   ```

2. **Override shadcn component styles** to use WeKruit tokens. Since the Tailwind config maps shadcn's semantic colors (`background`, `foreground`, `primary`, etc.) to WeKruit CSS vars, most components work out of the box. For components that need deeper customization:

   ```tsx
   // packages/ui/src/components/button.tsx
   // Extend shadcn's Button with WeKruit styling
   const buttonVariants = cva(
     'inline-flex items-center justify-center gap-wk-2 font-body font-wk-medium transition-all duration-wk-base ease-wk-default',
     {
       variants: {
         variant: {
           default: 'bg-wk-espresso text-wk-text-inverse hover:opacity-[0.88] hover:-translate-y-px shadow-wk-sm hover:shadow-wk-md',
           secondary: 'bg-wk-white text-wk-text border border-wk-border hover:bg-wk-raised hover:border-wk-border-strong',
           ghost: 'text-wk-text hover:bg-wk-sunken',
           cta: 'bg-wk-espresso text-wk-text-inverse font-wk-semibold hover:opacity-[0.88] hover:-translate-y-0.5 shadow-wk-md hover:shadow-wk-lg',
           destructive: 'bg-wk-coral text-wk-text-inverse hover:opacity-90',
         },
         size: {
           sm: 'px-3.5 py-1.5 text-wk-xs rounded-wk-md',
           default: 'px-6 py-2.5 text-wk-sm rounded-wk-lg',
           lg: 'px-8 py-3.5 text-wk-base rounded-wk-lg',
         },
       },
       defaultVariants: { variant: 'default', size: 'default' },
     }
   );
   ```

3. **Mode-specific tokens** for Copilot (blue) and Autopilot (purple) can be added as CSS custom properties:
   ```css
   :root {
     --wk-mode-copilot: #1E40AF;
     --wk-mode-autopilot: #7C3AED;
   }
   ```
   And mapped in Tailwind:
   ```typescript
   colors: {
     'wk-copilot': 'var(--wk-mode-copilot)',
     'wk-autopilot': 'var(--wk-mode-autopilot)',
   }
   ```

### 7.3 Dark Mode Strategy

WeKruit uses `[data-theme="dark"]` attribute on `<html>`. This is the correct approach:

1. **Toggle mechanism:** A React context/zustand store controls the theme. On toggle, set `document.documentElement.dataset.theme = 'dark'` (or remove it for light).

2. **No Tailwind `dark:` prefixes needed for themed colors.** Since all `--wk-*` CSS custom properties are redefined in `[data-theme="dark"]`, and Tailwind utilities reference these vars, dark mode is automatic. A `bg-wk-page` utility renders `#FCF6EF` in light mode and `#1A1210` in dark mode without any `dark:bg-*` class.

3. **Tailwind `darkMode` config:** Set to `['selector', '[data-theme="dark"]']` so that any non-themed Tailwind utilities (e.g., third-party components) can still use `dark:` prefix if needed.

4. **Persistence:** Theme preference stored in `localStorage` and synced to user preferences API.

---

## 8. Monorepo Structure

```
wekruit-autoapply/
├── apps/
│   ├── web/                          # Dashboard SPA (React + Vite)
│   │   ├── src/
│   │   │   ├── components/           # Page-specific components
│   │   │   │   ├── apply/            # Apply page components
│   │   │   │   ├── dashboard/        # Dashboard page components
│   │   │   │   ├── settings/         # Settings page components
│   │   │   │   ├── onboarding/       # Onboarding flow
│   │   │   │   └── auth/             # Auth pages
│   │   │   ├── hooks/                # Custom React hooks
│   │   │   │   ├── useTaskWebSocket.ts
│   │   │   │   ├── useAuth.ts
│   │   │   │   └── useApplications.ts
│   │   │   ├── stores/               # Zustand stores
│   │   │   │   ├── authStore.ts
│   │   │   │   ├── taskStore.ts
│   │   │   │   └── themeStore.ts
│   │   │   ├── routes/               # React Router page components
│   │   │   ├── styles/
│   │   │   │   ├── globals.css        # Tailwind base + WeKruit token import
│   │   │   │   └── wekruit-tokens.css # All --wk-* CSS custom properties
│   │   │   ├── lib/                  # Utilities (api client, etc.)
│   │   │   └── main.tsx
│   │   ├── tailwind.config.ts        # WeKruit-extended Tailwind config
│   │   ├── vite.config.ts
│   │   ├── tsconfig.json
│   │   └── package.json
│   │
│   ├── api/                          # Fastify API server
│   │   ├── src/
│   │   │   ├── routes/               # Fastify route modules
│   │   │   │   ├── auth.ts
│   │   │   │   ├── applications.ts
│   │   │   │   ├── resumes.ts
│   │   │   │   ├── questions.ts
│   │   │   │   ├── users.ts
│   │   │   │   ├── consent.ts
│   │   │   │   └── ws.ts             # WebSocket handler
│   │   │   ├── services/             # Business logic
│   │   │   │   ├── applicationService.ts
│   │   │   │   ├── resumeService.ts
│   │   │   │   ├── authService.ts
│   │   │   │   ├── notificationService.ts  # Novu SDK integration
│   │   │   │   └── hatchetService.ts       # Hatchet admin SDK wrapper
│   │   │   ├── middleware/
│   │   │   │   ├── auth.ts           # JWT validation
│   │   │   │   ├── rateLimit.ts      # Per-user rate limiting
│   │   │   │   └── errorHandler.ts
│   │   │   ├── plugins/              # Fastify plugins
│   │   │   │   ├── database.ts       # Drizzle connection
│   │   │   │   ├── redis.ts          # Redis connection
│   │   │   │   ├── s3.ts             # S3 client
│   │   │   │   └── websocket.ts      # WebSocket + Redis pub/sub
│   │   │   └── server.ts             # Fastify app entry point
│   │   ├── tsconfig.json
│   │   └── package.json
│   │
│   └── worker/                       # Browser automation worker
│       ├── src/
│       │   ├── workflows/            # Hatchet workflow definitions
│       │   │   ├── jobApplication.ts  # Main 9-step workflow
│       │   │   ├── batchApplication.ts
│       │   │   ├── resumeParsing.ts
│       │   │   └── screenshotCleanup.ts
│       │   ├── steps/                # Individual Hatchet step handlers
│       │   │   ├── provisionBrowser.ts
│       │   │   ├── navigateToJob.ts
│       │   │   ├── analyzePage.ts
│       │   │   ├── fillForm.ts
│       │   │   ├── waitForReview.ts
│       │   │   ├── submitApplication.ts
│       │   │   ├── verifySubmission.ts
│       │   │   └── cleanup.ts
│       │   ├── agents/               # Browser agent orchestration
│       │   │   ├── agentOrchestrator.ts   # 3-layer fallback
│       │   │   ├── stagehandAgent.ts      # Stagehand wrapper
│       │   │   ├── magnitudeAgent.ts      # Magnitude wrapper
│       │   │   └── verificationEngine.ts  # 3-layer verification
│       │   ├── browser/              # Browser management
│       │   │   ├── adsPowerManager.ts     # AdsPower API client
│       │   │   ├── stagehandFactory.ts    # Stagehand initialization
│       │   │   ├── proxyManager.ts        # IPRoyal integration
│       │   │   └── vncManager.ts          # noVNC server management
│       │   ├── platforms/            # Platform-specific adapters
│       │   │   ├── linkedin.ts
│       │   │   ├── greenhouse.ts
│       │   │   ├── lever.ts
│       │   │   ├── workday.ts
│       │   │   └── registry.ts       # Platform detection + routing
│       │   ├── captcha/              # CAPTCHA detection
│       │   │   ├── detector.ts
│       │   │   └── patterns.ts
│       │   ├── humanBehavior/        # Anti-detection
│       │   │   ├── delays.ts
│       │   │   ├── mouseMovement.ts
│       │   │   └── typing.ts
│       │   └── main.ts               # Worker entry point (registers with Hatchet)
│       ├── tsconfig.json
│       └── package.json
│
├── packages/
│   ├── ui/                           # Shared UI component library
│   │   ├── src/
│   │   │   ├── components/           # shadcn/ui components customized with WeKruit tokens
│   │   │   │   ├── button.tsx
│   │   │   │   ├── card.tsx
│   │   │   │   ├── dialog.tsx
│   │   │   │   ├── input.tsx
│   │   │   │   ├── badge.tsx
│   │   │   │   ├── data-table.tsx    # TanStack Table wrapper
│   │   │   │   ├── progress.tsx
│   │   │   │   ├── vnc-viewer.tsx    # react-vnc wrapper with WeKruit chrome
│   │   │   │   └── ...
│   │   │   └── index.ts
│   │   ├── tsconfig.json
│   │   └── package.json
│   │
│   ├── db/                           # Database schema + migrations
│   │   ├── src/
│   │   │   ├── schema/               # Drizzle schema definitions
│   │   │   │   ├── users.ts
│   │   │   │   ├── resumes.ts
│   │   │   │   ├── tasks.ts
│   │   │   │   ├── taskEvents.ts
│   │   │   │   ├── applications.ts
│   │   │   │   ├── qaEntries.ts
│   │   │   │   ├── consentRecords.ts
│   │   │   │   ├── auditTrail.ts
│   │   │   │   ├── browserProfiles.ts
│   │   │   │   ├── proxyBindings.ts
│   │   │   │   └── index.ts          # Re-exports all schemas
│   │   │   ├── migrations/           # Drizzle migrations (generated)
│   │   │   ├── seed.ts               # Development seed data
│   │   │   └── client.ts             # Drizzle client factory
│   │   ├── drizzle.config.ts
│   │   ├── tsconfig.json
│   │   └── package.json
│   │
│   ├── shared/                       # Shared types + utilities
│   │   ├── src/
│   │   │   ├── types/
│   │   │   │   ├── api.ts            # API request/response types
│   │   │   │   ├── automation.ts     # Browser action + result types
│   │   │   │   ├── ws.ts             # WebSocket message types
│   │   │   │   └── index.ts
│   │   │   ├── constants/
│   │   │   │   ├── platforms.ts      # Platform URL patterns
│   │   │   │   ├── status.ts         # Application status enum
│   │   │   │   └── limits.ts         # Rate limits, daily caps
│   │   │   └── utils/
│   │   │       ├── urlDetection.ts   # Platform detection from URL
│   │   │       └── confidence.ts     # Confidence scoring helpers
│   │   ├── tsconfig.json
│   │   └── package.json
│   │
│   └── llm/                          # LLM routing + provider abstraction
│       ├── src/
│       │   ├── router.ts             # LLMRouter class
│       │   ├── providers/
│       │   │   ├── anthropic.ts
│       │   │   ├── openai.ts
│       │   │   └── types.ts
│       │   ├── prompts/
│       │   │   ├── formAnalysis.ts
│       │   │   ├── fieldMapping.ts
│       │   │   ├── screeningAnswer.ts
│       │   │   ├── resumeParsing.ts
│       │   │   └── verification.ts
│       │   └── index.ts
│       ├── tsconfig.json
│       └── package.json
│
├── docker/
│   ├── Dockerfile.api                # Multi-stage: build -> slim Node.js runtime
│   ├── Dockerfile.worker             # Includes Playwright + Chromium
│   ├── Dockerfile.web                # Build Vite -> Nginx
│   └── docker-compose.yml            # Full dev stack
│
├── .github/
│   └── workflows/
│       ├── ci.yml                    # Lint + type-check + test on PR
│       └── deploy.yml                # Staging deploy on merge to main
│
├── turbo.json                        # Turborepo pipeline config
├── pnpm-workspace.yaml               # Workspace definition
├── tsconfig.base.json                # Shared TS config
├── .eslintrc.js                      # Shared ESLint config
├── .prettierrc                       # Shared Prettier config
└── package.json                      # Root package.json (scripts, devDeps)
```

### 8.1 Key Workspace Dependencies

```yaml
# pnpm-workspace.yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

```jsonc
// turbo.json
{
  "pipeline": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "lint": {},
    "typecheck": {},
    "test": {
      "dependsOn": ["^build"]
    },
    "db:generate": {
      "cache": false
    },
    "db:migrate": {
      "cache": false
    }
  }
}
```

### 8.2 Docker Compose (Development)

```yaml
# docker/docker-compose.yml
version: '3.9'

services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: wekruit
      POSTGRES_PASSWORD: wekruit_dev
      POSTGRES_DB: wekruit
    ports:
      - '5432:5432'
    volumes:
      - pgdata:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports:
      - '6379:6379'

  hatchet:
    image: ghcr.io/hatchet-dev/hatchet/hatchet-lite:latest
    environment:
      DATABASE_URL: postgres://wekruit:wekruit_dev@postgres:5432/wekruit
      SERVER_AUTH_COOKIE_INSECURE: 'true'
    ports:
      - '8888:8888'   # Hatchet dashboard
      - '7077:7077'   # Hatchet gRPC
    depends_on:
      - postgres

  minio:
    image: minio/minio:latest
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: wekruit
      MINIO_ROOT_PASSWORD: wekruit_dev
    ports:
      - '9000:9000'
      - '9001:9001'
    volumes:
      - minio_data:/data

  novu:
    image: ghcr.io/novuhq/novu/api:latest
    environment:
      NODE_ENV: development
      MONGO_URL: mongodb://mongo:27017/novu
      REDIS_HOST: redis
    ports:
      - '3003:3000'
    depends_on:
      - redis

  # Note: apps (api, worker, web) run on host via `pnpm dev`
  # for hot-reload. They connect to Docker services above.

volumes:
  pgdata:
  minio_data:
```

**Development workflow:**
1. `docker compose -f docker/docker-compose.yml up -d` -- starts infrastructure services
2. `pnpm install` -- installs all workspace dependencies
3. `pnpm db:migrate` -- runs Drizzle migrations
4. `pnpm dev` -- starts api, worker, and web in parallel with hot-reload via Turborepo

---

## 9. Migration Path from PRD Architecture

The PRD was written assuming Python/FastAPI. The roadmap references Python-specific tools (SQLAlchemy, Alembic, Ruff, mypy). Here is how each PRD/roadmap item maps to the TypeScript architecture:

| PRD/Roadmap Reference | Python Stack | TypeScript Equivalent | Migration Notes |
|---|---|---|---|
| FastAPI app | FastAPI + uvicorn | Fastify 5.x | Route structure identical; JSON Schema validation replaces Pydantic |
| SQLAlchemy models | SQLAlchemy + Alembic | Drizzle ORM + drizzle-kit | Schema-as-code; `drizzle-kit push` replaces `alembic upgrade head` |
| Pydantic schemas | Pydantic v2 | Zod + TypeBox (JSON Schema) | Zod for runtime validation; TypeBox for Fastify schema generation |
| `@hatchet.task` decorator | Hatchet Python SDK | Hatchet TypeScript SDK | Nearly identical API; `worker.registerWorkflow()` replaces decorators |
| SQLAdmin at `/admin` | SQLAdmin | AdminJS or custom shadcn-admin pages | Minor loss; AdminJS provides similar auto-generated admin UI for Node.js ORMs |
| Ruff (linter) | Ruff | ESLint + @typescript-eslint | Standard TS linting |
| mypy (type checker) | mypy | tsc (TypeScript compiler) | Built-in; stricter than mypy |
| pytest | pytest | Vitest (unit) + Playwright Test (e2e) | Same paradigm |
| LangChain (Python) | langchain (Python) | @langchain/core + @langchain/anthropic + @langchain/openai | Full JS/TS SDK available |
| pdfplumber + python-docx | Python PDF/DOCX libs | pdf-parse + mammoth | Evaluate quality; Python microservice fallback if needed |
| Browser-Use | Browser-Use (Python) | Stagehand (TypeScript) | Stagehand is the direct replacement and is more capable |

**Story point impact:** The migration from Python to TypeScript does NOT add story points to the roadmap. The tasks are the same -- only the implementation language changes. In fact, eliminating the Python<->TypeScript serialization boundary for worker communication likely *reduces* total effort.

---

## 10. Open Decisions & Trade-offs

### 10.1 Decisions Made

| Decision | Choice | Confidence | Revisit If |
|---|---|---|---|
| Language | TypeScript (end-to-end) | HIGH | Never (Stagehand locks this in) |
| API Framework | Fastify | HIGH | Performance issues at scale (unlikely) |
| ORM | Drizzle | HIGH | Major Prisma improvements that close the gap |
| Orchestrator | Hatchet (TS SDK) | HIGH | Hatchet TS SDK has critical bugs (unlikely, actively maintained) |
| Frontend | React + Vite (SPA) | HIGH | SEO becomes important (would add Next.js) |
| Queue (secondary) | BullMQ | MEDIUM | Could use Hatchet for everything; BullMQ only for simple background jobs |
| LLM Router | Custom (not LiteLLM) | MEDIUM | LiteLLM TS SDK matures |
| PDF Parsing | pdf-parse (TS) | MEDIUM | Quality benchmarking in Week 2; Python microservice fallback ready |
| Monorepo tool | Turborepo | HIGH | Nx offers more features but more complexity |
| Package manager | pnpm | HIGH | Standard for TypeScript monorepos |

### 10.2 Decisions Deferred

| Decision | Options | When to Decide | Dependencies |
|---|---|---|---|
| **Stagehand v3 cache backend** | Redis adapter vs filesystem | Week 2, when Stagehand integration begins | Stagehand v3 cache provider API stability |
| **AdminJS vs custom admin** | AdminJS (auto-generated) vs shadcn-admin pages | Week 1, during scaffolding | How much internal admin tooling is needed for MVP |
| **Novu self-hosted vs cloud** | Self-hosted (Docker) vs Novu Cloud | Week 6, when notification integration starts | Operational complexity tolerance |
| **Worker scaling model** | 1 browser per worker process vs browser pool per worker | Week 3, when worker implementation begins | Memory/CPU profiling of Playwright + Stagehand |
| **VNC vs WebRTC** | react-vnc (noVNC) vs Neko (WebRTC) | Post-MVP, based on user feedback on latency | Latency requirements for human takeover |

### 10.3 Key Trade-offs Accepted

1. **Losing Python ecosystem for ML/LLM.** The LangChain JS SDK is less mature than Python. We accept slightly less tooling maturity in exchange for eliminating the language boundary. If we need heavy ML (fine-tuning, embeddings at scale), we add a Python microservice -- but this is unlikely for the core product.

2. **Fastify over Express.** Express has a larger ecosystem. Fastify has better performance and TypeScript support. The ecosystem gap is narrowing. We accept a smaller middleware library in exchange for speed and type safety.

3. **Drizzle over Prisma.** Prisma has a larger community and better documentation. Drizzle gives us more control over SQL, better performance (no query engine binary), and a lighter runtime. We accept a steeper initial learning curve for long-term flexibility.

4. **No SSR.** The dashboard is a SPA behind authentication -- SEO is irrelevant. We avoid Next.js complexity (server components, API routes coupling) and keep a clean separation between frontend and API. If we ever need a marketing site with SEO, it would be a separate Next.js app, not the dashboard.

5. **Hatchet over Temporal.** Temporal is more battle-tested at scale (Uber, Snap). Hatchet is newer but simpler to deploy (single binary vs Temporal's multi-service cluster), has a better dashboard, and integrates with PostgreSQL (no Cassandra/MySQL dependency). For our scale (hundreds of workflows per day, not millions), Hatchet is sufficient. We can migrate to Temporal later if we outgrow Hatchet.

---

## Appendix A: Development Workflow Commands

```bash
# Initial setup
git clone git@github.com:wekruit/wekruit-autoapply.git
cd wekruit-autoapply
pnpm install

# Start infrastructure (PostgreSQL, Redis, Hatchet, MinIO)
docker compose -f docker/docker-compose.yml up -d

# Run database migrations
pnpm --filter @wekruit/db db:migrate

# Seed development data
pnpm --filter @wekruit/db db:seed

# Start all apps in development mode (hot-reload)
pnpm dev

# This runs concurrently:
#   apps/web     -> http://localhost:5173  (Vite dev server)
#   apps/api     -> http://localhost:8000  (Fastify)
#   apps/worker  -> connects to Hatchet on :7077

# Run all checks (what CI runs)
pnpm lint        # ESLint across all workspaces
pnpm typecheck   # tsc --noEmit across all workspaces
pnpm test        # Vitest across all workspaces

# Generate Drizzle migration after schema change
pnpm --filter @wekruit/db db:generate

# Build all packages and apps
pnpm build
```

## Appendix B: Environment Variables

```bash
# .env (root, shared by all apps)

# Database
DATABASE_URL=postgres://wekruit:wekruit_dev@localhost:5432/wekruit

# Redis
REDIS_URL=redis://localhost:6379

# Hatchet
HATCHET_CLIENT_TOKEN=<from-hatchet-dashboard>
HATCHET_CLIENT_TLS_STRATEGY=none

# S3 / MinIO
S3_ENDPOINT=http://localhost:9000
S3_ACCESS_KEY=wekruit
S3_SECRET_KEY=wekruit_dev
S3_BUCKET=wekruit-uploads
S3_REGION=us-east-1

# Google OAuth
GOOGLE_CLIENT_ID=<from-google-cloud-console>
GOOGLE_CLIENT_SECRET=<from-google-cloud-console>
GOOGLE_REDIRECT_URI=http://localhost:5173/auth/callback

# JWT
JWT_SECRET=<random-32-byte-hex>
JWT_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d

# LLM Providers
ANTHROPIC_API_KEY=<key>
OPENAI_API_KEY=<key>

# AdsPower
ADSPOWER_API_URL=http://localhost:50325

# Novu
NOVU_API_KEY=<from-novu-dashboard>
NOVU_API_URL=http://localhost:3003

# Stripe
STRIPE_SECRET_KEY=<key>
STRIPE_WEBHOOK_SECRET=<key>

# App
NODE_ENV=development
API_PORT=8000
WEB_PORT=5173
CORS_ORIGIN=http://localhost:5173
```

---

*This document is the single source of truth for the WeKruit AutoApply integration architecture. All implementation decisions should reference this document. Update this document when architecture decisions change.*
