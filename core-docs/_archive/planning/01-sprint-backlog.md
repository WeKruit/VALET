# Sprint Backlog — WeKruit Valet

> Prioritized task backlog with effort estimates, dependencies, files touched, and acceptance criteria.
> Updated to reflect the **multi-tier sandbox architecture** from [04-multi-tier-sandbox-architecture.md](../sandbox/04-multi-tier-sandbox-architecture.md).

## Estimation Key

| Points | Effort | Description |
|--------|--------|-------------|
| 1 | ~2 hours | Trivial — config change, small utility |
| 2 | ~4 hours | Small — single file, well-defined scope |
| 3 | ~1 day | Medium — multi-file, some complexity |
| 5 | ~2 days | Large — cross-package, integration work |
| 8 | ~3-4 days | XL — major feature, significant testing |
| 13 | ~1 week | Epic — break down further if possible |

## Priority Levels

- **P0**: Blocks everything — do first
- **P1**: Critical path — required for MVP
- **P2**: Important — significantly improves quality
- **P3**: Nice to have — defer if behind schedule

---

## Phase 0 — Foundation & DevOps

### T-001: GitHub Actions CI Pipeline
- **Priority**: P0 | **Points**: 5 | **Sprint**: 0.1
- **Depends on**: —
- **Files**: `.github/workflows/ci.yml`, `turbo.json`
- **Description**: Create GitHub Actions workflow that runs on PR to `develop`: install → lint → typecheck → test → build. Use Turborepo remote caching.
- **Acceptance Criteria**:
  - [ ] PR to `develop` triggers CI
  - [ ] All 5 steps run in order, fail-fast
  - [ ] Turborepo cache reduces repeat build times
  - [ ] Badge shows pass/fail status

### T-002: Fly.io Dev Environment Setup
- **Priority**: P0 | **Points**: 5 | **Sprint**: 0.1
- **Depends on**: —
- **Files**: `fly/api.toml`, `fly/worker.toml`, `fly/web.toml`, `fly/hatchet.toml`, `scripts/setup-fly.sh`
- **Description**: Create all Fly.io apps for dev environment. Configure secrets, networking, and health checks.
- **Acceptance Criteria**:
  - [ ] `setup-fly.sh dev` creates all 4 apps
  - [ ] All secrets set via `fly secrets set`
  - [ ] Health check endpoints respond 200
  - [ ] Apps accessible at `*.fly.dev` URLs

### T-003: Hatchet Self-Hosted on Fly.io
- **Priority**: P0 | **Points**: 8 | **Sprint**: 0.1
- **Depends on**: T-002
- **Files**: `fly/hatchet.toml`, `docker/hatchet/Dockerfile`
- **Description**: Deploy Hatchet engine on Fly.io with CloudAMQP RabbitMQ. Configure dashboard access, worker registration, and API connectivity.
- **Acceptance Criteria**:
  - [ ] Hatchet dashboard accessible at `valet-hatchet-dev.fly.dev`
  - [ ] Worker connects and registers workflows
  - [ ] Workflow can be triggered via API
  - [ ] `durableTask` + `waitFor` pattern works

### T-004: Auto-Deploy Pipeline
- **Priority**: P1 | **Points**: 3 | **Sprint**: 0.2
- **Depends on**: T-001, T-002
- **Files**: `.github/workflows/deploy-dev.yml`
- **Description**: Merge to `develop` auto-deploys to Fly.io dev. Uses `FLY_API_TOKEN` secret per environment.
- **Acceptance Criteria**:
  - [ ] Merge to `develop` triggers deploy
  - [ ] All 4 apps deploy in correct order (DB migrations first)
  - [ ] Rollback possible via `fly releases`

### T-005: Staging Environment
- **Priority**: P2 | **Points**: 3 | **Sprint**: 0.2
- **Depends on**: T-002
- **Files**: `.github/workflows/deploy-stg.yml`, branch protection rules
- **Description**: Create staging environment, branch protection for `staging` and `main`, deploy pipeline for staging.
- **Acceptance Criteria**:
  - [ ] `staging` branch auto-deploys to stg environment
  - [ ] Branch protection requires CI pass
  - [ ] PR develop → staging works

---

## Phase 1 (Weeks 1–4) — Tier 3 MVP: Fly Machines + Camoufox

> Ship the cheapest, most elastic tier first. Ephemeral Fly Machines with Camoufox anti-detect Firefox, Playwright automation, and noVNC for human-in-the-loop.

### T-100: IBrowserAgent Interface + Agent Factory
- **Priority**: P0 | **Points**: 3 | **Sprint**: 1.1
- **Depends on**: —
- **Files**: `packages/shared/src/types/automation.ts`, `apps/worker/src/sandbox/agent-factory.ts`
- **Description**: Define the shared `IBrowserAgent` interface that all tiers implement. Create the `createBrowserAgent(tier)` factory function with a Tier 3 placeholder. This interface is the foundation for all subsequent agent implementations.
- **Acceptance Criteria**:
  - [ ] `IBrowserAgent` interface exported from `packages/shared`
  - [ ] Methods: `navigate`, `fillField`, `clickElement`, `uploadFile`, `extractData`, `takeScreenshot`, `getCurrentUrl`, `act`, `extract`, `observe`
  - [ ] `createBrowserAgent` factory function with `case 3` returning `PlaywrightBrowserAgent`
  - [ ] Unit tests for factory function

### T-101: Docker Image — Camoufox + Playwright + noVNC
- **Priority**: P0 | **Points**: 5 | **Sprint**: 1.1
- **Depends on**: —
- **Files**: `docker/sandbox/Dockerfile`, `docker/sandbox/entrypoint.sh`, `docker/sandbox/supervisord.conf`
- **Description**: Create Docker image for the Tier 3 sandbox container. Includes Camoufox (anti-detect Firefox), Playwright, Xvfb, x11vnc, websockify/noVNC for human-in-the-loop, and a lightweight HTTP API (Express/Fastify) for receiving task payloads. Image pushed to `registry.fly.io/valet-sandbox`.
- **Acceptance Criteria**:
  - [ ] Docker image builds successfully (<2GB compressed)
  - [ ] Camoufox launches headless via Playwright `firefox.connect()`
  - [ ] noVNC accessible on port 6080 when in headed mode
  - [ ] HTTP API on port 8080 accepts task payloads
  - [ ] Image pushed to Fly.io registry
  - [ ] Passes basic fingerprint tests (canvas, WebGL, navigator)

### T-102: Fly Machine Lifecycle Manager
- **Priority**: P0 | **Points**: 5 | **Sprint**: 1.1
- **Depends on**: T-101
- **Files**: `apps/worker/src/sandbox/fly-machine-manager.ts`, `apps/worker/src/sandbox/fly-api.ts`
- **Description**: Implement the Fly Machine lifecycle manager that creates, starts, stops, and destroys Fly Machines via the Fly Machines REST API. Handles machine provisioning with the `valet-sandbox` Docker image, environment variable injection (TASK_ID, USER_ID, CALLBACK_URL), and graceful cleanup.
- **Acceptance Criteria**:
  - [ ] `createMachine(config)` creates a new Fly Machine with correct image and env vars
  - [ ] `startMachine(id)` starts a stopped machine
  - [ ] `stopMachine(id)` gracefully stops a running machine
  - [ ] `destroyMachine(id)` destroys a machine and releases resources
  - [ ] `waitForMachine(id, state)` polls until machine reaches desired state
  - [ ] Machine uses `performance-2x-cpu`, 4096 MB memory, `auto_destroy: true`
  - [ ] Error handling for Fly API failures (429, 500, network timeouts)

### T-103: Warm Pool Strategy (5 Stopped Machines)
- **Priority**: P1 | **Points**: 3 | **Sprint**: 1.2
- **Depends on**: T-102
- **Files**: `apps/worker/src/sandbox/warm-pool.ts`
- **Description**: Implement warm pool strategy that keeps 5 stopped Fly Machines pre-created to reduce cold start from ~25s to ~3s. When a warm machine is claimed, asynchronously replenish the pool. Background cron (via Hatchet scheduled workflow) monitors pool size and tops up.
- **Acceptance Criteria**:
  - [ ] `getWarmMachine()` returns a stopped machine and starts it (<3s)
  - [ ] Pool replenishment runs asynchronously after machine claimed
  - [ ] Falls back to cold-start `createMachine()` if pool is empty
  - [ ] Hatchet scheduled workflow maintains pool at target size (configurable, default 5)
  - [ ] Stopped machine cost verified negligible (~$1.50/mo for 5 machines)

### T-104: PlaywrightBrowserAgent (IBrowserAgent Implementation)
- **Priority**: P0 | **Points**: 5 | **Sprint**: 1.2
- **Depends on**: T-100, T-101
- **Files**: `apps/worker/src/sandbox/agents/playwright-browser-agent.ts`
- **Description**: Implement `PlaywrightBrowserAgent` class that connects to Camoufox inside a Fly Machine via Playwright's `firefox.connect(wsEndpoint)`. Implements all `IBrowserAgent` methods. Includes Camoufox-specific fingerprint configuration and human-like input timing.
- **Acceptance Criteria**:
  - [ ] Connects to Camoufox in Fly Machine via Playwright CDP/WebSocket
  - [ ] `navigate(url)` loads pages with configurable timeout
  - [ ] `fillField(selector, value)` types with human-like delay (50–150ms per char)
  - [ ] `clickElement(selector)` clicks with random offset within element bounds
  - [ ] `uploadFile(selector, filePath)` handles file input elements
  - [ ] `extractData(instruction, schema)` uses LLM for structured extraction
  - [ ] `takeScreenshot()` returns PNG buffer
  - [ ] `act()`, `extract()`, `observe()` proxy to Stagehand-compatible interface
  - [ ] All methods throw typed errors on failure

### T-105: storageState Save/Restore to Supabase S3
- **Priority**: P1 | **Points**: 3 | **Sprint**: 1.2
- **Depends on**: T-104
- **Files**: `apps/worker/src/sandbox/session-state.ts`
- **Description**: Implement Playwright `storageState()` save and restore via Supabase Storage S3. After each task, serialize cookies + localStorage + sessionStorage to S3 under `browser-states/{userId}/storage-state.json`. On new container start, restore state into the browser context. Handles missing/corrupt state gracefully.
- **Acceptance Criteria**:
  - [ ] `saveSessionState(context, userId)` serializes and uploads to S3
  - [ ] `restoreSessionState(userId)` downloads and returns `StorageState` object
  - [ ] Includes sessionStorage (not captured by default `storageState()`)
  - [ ] Returns `undefined` if no prior state exists (fresh user)
  - [ ] Handles corrupt/invalid state files (logs warning, returns undefined)
  - [ ] S3 objects use versioning for rollback

### T-106: Tier Routing in Hatchet Workflow
- **Priority**: P0 | **Points**: 3 | **Sprint**: 1.3
- **Depends on**: T-102, T-104
- **Files**: `apps/worker/src/workflows/job-application.ts`, `apps/worker/src/sandbox/tier-router.ts`
- **Description**: Implement `selectTier()` function in the Hatchet workflow that routes tasks to the appropriate sandbox tier. For Phase 1, only Tier 3 is available — the routing logic is built with all 4 tiers in mind but falls back to Tier 3 for everything. The workflow creates a machine, runs the agent, and handles cleanup.
- **Acceptance Criteria**:
  - [ ] `selectTier(ctx)` returns `{ tier: 3, provider: "fly-machines" }` for all tasks (Phase 1)
  - [ ] Workflow step: select tier → provision sandbox → run agent → cleanup
  - [ ] `createBrowserAgent(tier)` called with result of `selectTier()`
  - [ ] Machine always destroyed in `finally` block (even on failure)
  - [ ] Workflow visible and triggerable in Hatchet dashboard
  - [ ] Structured logging of tier selection decision

### T-107: noVNC Integration for HITL on Fly Machines
- **Priority**: P1 | **Points**: 3 | **Sprint**: 1.3
- **Depends on**: T-101, T-102
- **Files**: `apps/web/src/features/tasks/components/vnc-panel.tsx`, `apps/api/src/modules/vnc/vnc.routes.ts`, `apps/api/src/modules/vnc/vnc.service.ts`
- **Description**: Wire noVNC human-in-the-loop for Tier 3 Fly Machines. When a task enters HITL mode (CAPTCHA, copilot review), the API generates a short-lived VNC token, the frontend connects via the noVNC React viewer, and the user can interact with the browser. "Done" button signals the API to resume the Hatchet workflow.
- **Acceptance Criteria**:
  - [ ] `POST /api/v1/vnc/token` generates VNC access token (5 min TTL)
  - [ ] Frontend VNC panel connects to Fly Machine's noVNC endpoint
  - [ ] User can see and interact with the remote browser
  - [ ] "Done" button sends signal → API → Hatchet `waitFor` resume
  - [ ] VNC panel shows reason for takeover (CAPTCHA type, screenshot)
  - [ ] Timer shows remaining time before auto-abort
  - [ ] Panel hides when task resumes automation

### T-108: Webhook Callback from Sandbox to Hatchet
- **Priority**: P1 | **Points**: 3 | **Sprint**: 1.3
- **Depends on**: T-101, T-106
- **Files**: `apps/api/src/modules/webhooks/sandbox-webhook.routes.ts`, `packages/contracts/src/webhooks.ts`
- **Description**: Implement webhook endpoint that receives progress callbacks from the sandbox container (running inside Fly Machines). Events include: `step_started`, `step_completed`, `captcha_detected`, `error`, `completed`. Forwards events to WebSocket for frontend real-time updates and signals Hatchet workflow as needed (e.g., CAPTCHA pause).
- **Acceptance Criteria**:
  - [ ] `POST /api/v1/webhooks/sandbox` accepts progress events
  - [ ] Bearer token validation on webhook endpoint
  - [ ] Events forwarded to frontend via WebSocket
  - [ ] `captcha_detected` event triggers Hatchet `waitFor` signal
  - [ ] `completed` event triggers Hatchet task completion
  - [ ] Idempotent: duplicate webhooks don't cause duplicate side-effects
  - [ ] Retry-safe: sandbox retries on 5xx with exponential backoff

### T-109: E2E Test — Fly Machine Task Execution
- **Priority**: P1 | **Points**: 5 | **Sprint**: 1.4
- **Depends on**: T-106, T-107, T-108
- **Files**: `tests/e2e/fly-machine-e2e.test.ts`, `scripts/e2e-fly-test.sh`
- **Description**: End-to-end validation of the full Tier 3 pipeline: frontend trigger → API → Hatchet workflow → Fly Machine provisioned → Camoufox runs automation → webhook callbacks → result displayed in frontend. Includes HITL flow (CAPTCHA → noVNC → solve → resume).
- **Acceptance Criteria**:
  - [ ] API trigger creates Hatchet workflow run
  - [ ] Fly Machine created, started, and running sandbox container
  - [ ] Playwright automation executes on a test target site
  - [ ] Progress webhooks received and forwarded to frontend
  - [ ] HITL flow: CAPTCHA triggers noVNC, "Done" resumes workflow
  - [ ] Machine destroyed after task completes
  - [ ] Full pipeline completes in <90s (warm pool) or <120s (cold start)
  - [ ] Test script runnable from local machine or CI

---

## Phase 2 (Weeks 5–7) — Tier 2: Browserbase + Stagehand

> Add the managed cloud tier with Browserbase for built-in stealth, persistent contexts, and embeddable Live View. Stagehand v3 for AI-driven automation.

### T-200: Browserbase SDK Integration
- **Priority**: P0 | **Points**: 3 | **Sprint**: 2.1
- **Depends on**: —
- **Files**: `apps/worker/src/sandbox/browserbase-client.ts`, `packages/shared/src/schemas/browserbase.ts`
- **Description**: Integrate the Browserbase SDK (`@browserbasehq/sdk`). Implement session lifecycle: create context (per-user persistent), create session with context + proxy settings, get Live View URL, close session. Environment variables for `BROWSERBASE_API_KEY` and `BROWSERBASE_PROJECT_ID`.
- **Acceptance Criteria**:
  - [ ] `createContext(projectId)` creates a persistent Browserbase context
  - [ ] `createSession({ contextId, proxy })` creates session with persistent context
  - [ ] `getDebugUrl(sessionId)` returns Live View iframe URL
  - [ ] `closeSession(sessionId)` terminates session cleanly
  - [ ] Context ID stored in user DB record for reuse
  - [ ] Proxy configured with US geolocation by default

### T-201: Stagehand v3 Integration + StagehandBrowserAgent
- **Priority**: P0 | **Points**: 5 | **Sprint**: 2.1
- **Depends on**: T-100, T-200
- **Files**: `apps/worker/src/sandbox/agents/stagehand-browser-agent.ts`
- **Description**: Integrate Stagehand v3 (`@browserbasehq/stagehand`) and implement `StagehandBrowserAgent` conforming to `IBrowserAgent`. Stagehand v3 uses CDP directly (no Playwright dependency). Connects to Browserbase sessions for Tier 2, or to any CDP URL for Tier 3 (future). Uses `act()`, `extract()`, `observe()` primitives.
- **Acceptance Criteria**:
  - [ ] `StagehandBrowserAgent` implements all `IBrowserAgent` methods
  - [ ] Connects to Browserbase session via Stagehand's `env: "BROWSERBASE"` mode
  - [ ] `act(instruction)` performs actions via AI-driven DOM analysis
  - [ ] `extract(instruction, schema)` returns structured data matching Zod schema
  - [ ] `observe(instruction)` returns list of possible actions on current page
  - [ ] Model configured as `anthropic/claude-sonnet-4-20250514`
  - [ ] Agent factory updated: `case 2` returns `StagehandBrowserAgent`

### T-202: Browserbase Contexts API for Session Persistence
- **Priority**: P1 | **Points**: 3 | **Sprint**: 2.2
- **Depends on**: T-200
- **Files**: `apps/worker/src/sandbox/browserbase-client.ts`, `packages/db/src/schema.ts`, `packages/db/drizzle/` (migration)
- **Description**: Implement per-user persistent context management using Browserbase Contexts API. Each user gets one Browserbase context (stores cookies, localStorage across sessions). Context ID stored in users table. On session create, context is attached with `persist: true`. Handles context expiry and recreation.
- **Acceptance Criteria**:
  - [ ] `browserbase_context_id` column added to users table (nullable)
  - [ ] Migration generated and applied
  - [ ] First session for user creates context and stores ID
  - [ ] Subsequent sessions reuse existing context ID
  - [ ] Handles expired/deleted contexts (recreate on 404)
  - [ ] Context preserves cookies + localStorage between sessions

### T-203: Live View Iframe in Task Detail Page
- **Priority**: P1 | **Points**: 3 | **Sprint**: 2.2
- **Depends on**: T-200, T-107
- **Files**: `apps/web/src/features/tasks/components/live-view-panel.tsx`, `apps/web/src/features/tasks/pages/task-detail-page.tsx`
- **Description**: Add Browserbase Live View iframe to the task detail page as an alternative to noVNC for Tier 2 tasks. When the task is on Tier 2 and enters HITL mode, show an iframe pointing to `debuggerFullscreenUrl`. The existing noVNC panel (T-107) is shown for Tier 3 tasks. Panel selection is automatic based on the active tier.
- **Acceptance Criteria**:
  - [ ] Live View iframe rendered for Tier 2 HITL tasks
  - [ ] noVNC panel rendered for Tier 3 HITL tasks (existing from T-107)
  - [ ] `allow="clipboard-read; clipboard-write"` set on iframe
  - [ ] "Done" button signals API → Hatchet resume (same flow as noVNC)
  - [ ] Loading state while Live View URL is being fetched
  - [ ] Graceful fallback if Live View URL unavailable

### T-204: Tier 3 → Tier 2 Automatic Retry Escalation
- **Priority**: P1 | **Points**: 3 | **Sprint**: 2.3
- **Depends on**: T-106, T-201
- **Files**: `apps/worker/src/sandbox/tier-router.ts`, `apps/worker/src/workflows/job-application.ts`
- **Description**: Implement automatic retry escalation: when a Tier 3 task fails due to anti-detect detection (bot block, CAPTCHA loop, access denied), automatically retry on Tier 2 (Browserbase) which has stronger stealth. Configurable max retries per tier. Escalation logged for analytics.
- **Acceptance Criteria**:
  - [ ] Tier 3 failure with detection-related error triggers Tier 2 retry
  - [ ] Detection errors classified: `bot_blocked`, `captcha_loop`, `access_denied`
  - [ ] Non-detection errors (network, timeout) retry on same tier first
  - [ ] Max 1 escalation per task (Tier 3 → Tier 2, not further)
  - [ ] Escalation event logged with reason for analytics
  - [ ] User notified of tier change via WebSocket

### T-205: E2E Test — Browserbase Task Execution
- **Priority**: P1 | **Points**: 3 | **Sprint**: 2.3
- **Depends on**: T-201, T-202, T-203
- **Files**: `tests/e2e/browserbase-e2e.test.ts`
- **Description**: End-to-end test of the Tier 2 pipeline: Hatchet workflow routes to Browserbase → Stagehand agent runs automation → Live View available → result returned. Includes session persistence (run two tasks, verify cookies survive).
- **Acceptance Criteria**:
  - [ ] Browserbase session created with persistent context
  - [ ] Stagehand agent navigates and fills form on test target
  - [ ] Live View URL generated and accessible
  - [ ] Session state persists: second task sees cookies from first
  - [ ] Session cleaned up after task completes
  - [ ] Tier 3 → Tier 2 escalation triggers correctly on simulated block

---

## Phase 3 (Weeks 8–11) — Tier 1: EC2 Pool + AdsPower

> Add the dedicated tier with persistent EC2 instances, AdsPower anti-detect browser, and Selenium automation. Best fingerprint protection for high-security sites like LinkedIn.

### T-300: EC2 Terraform for Pool of N Instances
- **Priority**: P0 | **Points**: 5 | **Sprint**: 3.1
- **Depends on**: —
- **Files**: `infra/terraform/main.tf`, `infra/terraform/variables.tf`, `infra/terraform/outputs.tf`, `infra/terraform/cloud-init.yml`
- **Description**: Terraform configuration for a pool of EC2 t3.xlarge instances (16GB RAM, 8–10 profiles each) with Ubuntu 22.04. Auto-scaling group with min=2, desired based on queue depth. Security groups (SSH admin, HTTPS/WSS from Fly.io CIDR). Elastic IPs. cloud-init installs Python 3.11, Chrome, Xvfb, pip dependencies.
- **Acceptance Criteria**:
  - [ ] `terraform apply` creates N EC2 instances + ASG + security groups + EIPs
  - [ ] cloud-init installs all system dependencies on first boot
  - [ ] SSH access works with configured key pair
  - [ ] Security groups: 22 (admin IP), 443 (Fly.io CIDR), 6080 (Fly.io CIDR)
  - [ ] Instances tagged with environment (dev/stg/prod) and pool index
  - [ ] Auto-scaling group scales based on configurable thresholds

### T-301: AdsPower + Selenium per EC2 Instance
- **Priority**: P0 | **Points**: 5 | **Sprint**: 3.1
- **Depends on**: T-300
- **Files**: `infra/ansible/playbook.yml`, `infra/ansible/roles/adspower/`, `infra/ec2-worker/`
- **Description**: Ansible playbook to deploy AdsPower + Selenium-based Valet worker on each EC2 instance. AdsPower runs headless as systemd service. Valet EC2 worker (FastAPI, forked from axon-browser-worker) starts as systemd service. Includes LinkedIn Easy Apply handler and webhook callbacks.
- **Acceptance Criteria**:
  - [ ] AdsPower installed and running as `adspower.service`
  - [ ] Local API accessible on port 50325
  - [ ] Valet EC2 worker running as `valet-worker.service` on port 8080
  - [ ] Selenium connects to AdsPower profiles
  - [ ] Bearer token auth on all worker API endpoints
  - [ ] License activation procedure documented (VNC → GUI → enter key)

### T-302: SeleniumBrowserAgent (IBrowserAgent Implementation)
- **Priority**: P0 | **Points**: 5 | **Sprint**: 3.2
- **Depends on**: T-100, T-301
- **Files**: `apps/worker/src/sandbox/agents/selenium-browser-agent.ts`, `apps/worker/src/clients/ec2-worker-client.ts`
- **Description**: Implement `SeleniumBrowserAgent` conforming to `IBrowserAgent`. This agent acts as a TypeScript HTTP client that proxies `IBrowserAgent` calls to the Python EC2 worker's REST API (which drives Selenium + AdsPower locally). Includes health check, submit task, poll status, cancel task.
- **Acceptance Criteria**:
  - [ ] `SeleniumBrowserAgent` implements all `IBrowserAgent` methods
  - [ ] Methods translate to HTTP calls to EC2 worker FastAPI endpoints
  - [ ] `submitTask(task)` sends POST, returns task ID
  - [ ] `getTaskStatus(taskId)` polls for result
  - [ ] Bearer token auth header on all requests
  - [ ] Timeout handling (configurable, default 5 min)
  - [ ] Agent factory updated: `case 1` returns `SeleniumBrowserAgent`

### T-303: Profile-to-Instance Assignment via Redis
- **Priority**: P0 | **Points**: 5 | **Sprint**: 3.2
- **Depends on**: T-301
- **Files**: `apps/worker/src/services/profile-pool.ts`, `packages/db/src/schema.ts`, `packages/db/drizzle/` (migration)
- **Description**: Service managing pool of AdsPower profiles across EC2 instances. Uses Redis distributed locks to prevent concurrent use. Profiles have states: idle → locked → in-use → cooldown → idle. Each user gets a dedicated profile. Routing: Hatchet sends task to the EC2 instance holding the user's profile.
- **Acceptance Criteria**:
  - [ ] `ec2_profiles` table: id, adspower_profile_id, instance_id, user_id, status enum, locked_by, locked_at, cooldown_until
  - [ ] `acquireProfile(userId)` returns profile + instance, sets Redis lock
  - [ ] `releaseProfile(profileId)` releases lock, starts cooldown
  - [ ] Concurrent calls never return same profile
  - [ ] Lock TTL (10 min) auto-releases stuck profiles
  - [ ] Indexes on status and user_id for efficient queries

### T-304: Auto-Scaling + Health Monitoring
- **Priority**: P1 | **Points**: 3 | **Sprint**: 3.3
- **Depends on**: T-300, T-301
- **Files**: `infra/terraform/cloudwatch.tf`, `infra/terraform/autoscaling.tf`, `infra/ansible/roles/cloudwatch/`
- **Description**: CloudWatch agent on EC2 reporting CPU, memory, AdsPower/FastAPI process status. Alarms for process-down and high-memory. Auto-scaling group adjusts instance count based on Hatchet queue depth (polled via Lambda or cron). Instance health checks with auto-recovery.
- **Acceptance Criteria**:
  - [ ] CloudWatch agent installed, system + custom metrics reporting
  - [ ] Alarms: adspower-down, fastapi-down, high-memory (>85%)
  - [ ] SNS email notification on alarm
  - [ ] ASG scales out when queue depth > threshold
  - [ ] ASG scales in when idle for >30 min (preserving min capacity)
  - [ ] EC2 auto-recovery on system status check failure

### T-305: E2E Test — EC2 Full Pipeline
- **Priority**: P1 | **Points**: 5 | **Sprint**: 3.3
- **Depends on**: T-302, T-303
- **Files**: `tests/e2e/ec2-e2e.test.ts`, `scripts/e2e-ec2-test.sh`
- **Description**: End-to-end test: frontend → API → Hatchet → Tier 1 routing → EC2 worker → AdsPower + Selenium → LinkedIn Easy Apply → webhook → result in frontend. Includes profile acquisition, task execution, and profile release.
- **Acceptance Criteria**:
  - [ ] Hatchet routes to Tier 1 for Premium user
  - [ ] Profile acquired and locked via Redis
  - [ ] EC2 worker executes LinkedIn Easy Apply
  - [ ] Progress webhooks received and forwarded to frontend
  - [ ] Profile released after task (even on failure)
  - [ ] noVNC accessible during HITL mode
  - [ ] Full pipeline completes in <5 min

---

## Phase 4 (Weeks 12–13) — Tier 4: API-Direct

> Add direct ATS API integration for platforms that expose public candidate submission endpoints. No browser needed — fastest, cheapest, most reliable tier.

### T-400: ATS Detection Module (URL → Provider)
- **Priority**: P0 | **Points**: 3 | **Sprint**: 4.1
- **Depends on**: —
- **Files**: `apps/worker/src/handlers/api-direct/detect-ats.ts`, `packages/shared/src/schemas/ats.ts`
- **Description**: Implement ATS detection module that maps a job URL to its ATS provider and capabilities. Pattern matching on hostname: `boards.greenhouse.io` → Greenhouse, `jobs.lever.co` → Lever, `myworkdayjobs.com` → Workday. Returns `ATSInfo` with `provider`, `hasDirectAPI`, and URL component extractors (board token, posting ID).
- **Acceptance Criteria**:
  - [ ] `detectATS(jobUrl)` returns `ATSInfo` object
  - [ ] Greenhouse: extracts board token from URL
  - [ ] Lever: extracts posting ID from URL
  - [ ] Workday: identified but `hasDirectAPI: false` (future)
  - [ ] Unknown URLs return `{ provider: "unknown", hasDirectAPI: false }`
  - [ ] Unit tests for all known URL patterns
  - [ ] Tier router updated: checks `detectATS()` first, routes to Tier 4 if `hasDirectAPI`

### T-401: Greenhouse Job Board API Handler
- **Priority**: P0 | **Points**: 3 | **Sprint**: 4.1
- **Depends on**: T-400
- **Files**: `apps/worker/src/handlers/api-direct/greenhouse.ts`
- **Description**: Implement Greenhouse Job Board API handler. Submits candidate applications via `POST /v1/boards/{token}/jobs/{id}` with multipart form data (name, email, phone, resume, custom question answers). Handles rate limits and error responses.
- **Acceptance Criteria**:
  - [ ] `applyViaGreenhouseAPI(params)` submits application
  - [ ] Multipart form with: first_name, last_name, email, phone, resume file, custom answers
  - [ ] Basic Auth with employer API key
  - [ ] Handles 429 (rate limit) with retry
  - [ ] Handles 422 (validation errors) with clear error message
  - [ ] Returns standardized `ApplicationResult`

### T-402: Lever Postings API Handler
- **Priority**: P1 | **Points**: 3 | **Sprint**: 4.1
- **Depends on**: T-400
- **Files**: `apps/worker/src/handlers/api-direct/lever.ts`
- **Description**: Implement Lever Postings API handler. Submits candidate applications via `POST /v0/postings/{postingId}` with JSON body (name, email, phone, resume URL, custom fields). Handles Lever-specific field mapping and rate limits.
- **Acceptance Criteria**:
  - [ ] `applyViaLeverAPI(params)` submits application
  - [ ] JSON body with: name, email, phone, urls, resume, custom questions
  - [ ] Handles 429 (rate limit) with retry
  - [ ] Handles error responses with clear messages
  - [ ] Returns standardized `ApplicationResult`

### T-403: APIDirectAgent (IBrowserAgent Implementation)
- **Priority**: P0 | **Points**: 3 | **Sprint**: 4.2
- **Depends on**: T-100, T-401, T-402
- **Files**: `apps/worker/src/sandbox/agents/api-direct-agent.ts`
- **Description**: Implement `APIDirectAgent` conforming to `IBrowserAgent`. Unlike browser-based agents, this routes to the appropriate ATS API handler based on provider. Browser-specific methods (`navigate`, `clickElement`, `takeScreenshot`) throw `UnsupportedOperationError`. The `act()` method delegates to the correct API handler.
- **Acceptance Criteria**:
  - [ ] `APIDirectAgent` implements `IBrowserAgent` interface
  - [ ] `act()` routes to Greenhouse or Lever handler based on provider
  - [ ] Browser-only methods throw `UnsupportedOperationError` with clear message
  - [ ] Agent factory updated: `case 4` returns `APIDirectAgent`
  - [ ] Tier router: `detectATS()` → Tier 4 → `APIDirectAgent` → ATS handler
  - [ ] Unit tests for routing and error handling

---

## Phase 5 (Weeks 14–16) — Pricing & Polish

> Add user plan management, usage metering, billing, and analytics. Tune tier fallback cascade based on real data.

### T-500: User Plan Management (Starter/Pro/Premium)
- **Priority**: P0 | **Points**: 5 | **Sprint**: 5.1
- **Depends on**: —
- **Files**: `packages/db/src/schema.ts`, `packages/db/drizzle/` (migration), `packages/shared/src/schemas/plan.ts`, `apps/api/src/modules/plans/plan.routes.ts`, `apps/api/src/modules/plans/plan.service.ts`
- **Description**: Implement user plan management. Three tiers: Starter ($29/mo, 50 apps, Tier 3 only), Professional ($79/mo, 200 apps, Tier 2+3), Premium ($199/mo, 600 apps, Tier 1+2+3). Plan determines: application quota, allowed tiers, concurrent sessions, max resumes, Q&A bank size. Plan stored in users table, enforced at API and workflow level.
- **Acceptance Criteria**:
  - [ ] `plan` column added to users table (enum: starter, professional, premium, trial)
  - [ ] Plan schema defines limits: apps/month, allowed tiers, concurrency, resumes, Q&A
  - [ ] API enforces quota: rejects task creation when monthly limit reached
  - [ ] Tier router respects plan: Starter users never route to Tier 1 or 2
  - [ ] Free trial: 7 days Professional tier, 10 applications
  - [ ] `GET /api/v1/plans/usage` returns current usage vs. limits

### T-501: Usage Metering + Stripe Billing
- **Priority**: P0 | **Points**: 5 | **Sprint**: 5.1
- **Depends on**: T-500
- **Files**: `apps/api/src/modules/billing/billing.routes.ts`, `apps/api/src/modules/billing/billing.service.ts`, `apps/api/src/modules/billing/stripe-webhook.ts`
- **Description**: Integrate Stripe for subscription billing and usage-based overage charges. Stripe Checkout for plan signup, Stripe Billing Portal for management, webhook handler for subscription events. Usage metering: track applications per billing period, charge overage at plan-specific rate ($0.50/$0.35/$0.25 per extra app).
- **Acceptance Criteria**:
  - [ ] Stripe Checkout session created for plan signup
  - [ ] Stripe Billing Portal accessible for plan changes / cancellation
  - [ ] Webhook handles: `checkout.session.completed`, `invoice.paid`, `customer.subscription.updated`, `customer.subscription.deleted`
  - [ ] Usage tracked per billing period, exposed via API
  - [ ] Overage charges applied at end of billing cycle
  - [ ] Plan downgrades handled at end of current period

### T-502: Tier Fallback Cascade Tuning
- **Priority**: P2 | **Points**: 3 | **Sprint**: 5.2
- **Depends on**: T-204
- **Files**: `apps/worker/src/sandbox/tier-router.ts`, `apps/worker/src/sandbox/tier-metrics.ts`
- **Description**: Tune the tier fallback cascade based on real production data. Track success/failure rates per tier per ATS platform. Adjust routing: if a site consistently fails on Tier 3, preemptively route to Tier 2. Configurable via feature flags (no code deploy needed). Metrics stored in Redis for fast lookup.
- **Acceptance Criteria**:
  - [ ] Success/failure rate tracked per (tier, ATS hostname) pair
  - [ ] Sites with >30% Tier 3 failure rate auto-route to Tier 2
  - [ ] Tier routing overrides configurable via Redis feature flags
  - [ ] Metrics dashboard endpoint: `GET /api/v1/admin/tier-metrics`
  - [ ] No code deploy needed to adjust routing thresholds

### T-503: Analytics Dashboard
- **Priority**: P2 | **Points**: 3 | **Sprint**: 5.2
- **Depends on**: T-500, T-502
- **Files**: `apps/web/src/features/analytics/pages/analytics-page.tsx`, `apps/api/src/modules/analytics/analytics.routes.ts`
- **Description**: Admin and user-facing analytics dashboard. Per-user: applications this month, success rate, tier breakdown, usage vs. quota. Admin: total applications, tier distribution, failure rates by ATS, cost per application, revenue vs. COGS.
- **Acceptance Criteria**:
  - [ ] User dashboard: monthly apps, success rate, tier pie chart, quota bar
  - [ ] Admin dashboard: total apps, tier breakdown, failure heatmap by ATS
  - [ ] Cost-per-application tracking (compute + LLM + proxy)
  - [ ] Revenue vs. COGS chart (admin only)
  - [ ] Date range filtering (7d, 30d, 90d, custom)
  - [ ] Data fetched via dedicated analytics API endpoints

---

## Summary

| Phase | Tasks | Total Points | Duration |
|-------|-------|-------------|----------|
| 0 — Foundation & DevOps | T-001 to T-005 | 24 | 2 weeks |
| 1 — Tier 3 MVP (Fly Machines + Camoufox) | T-100 to T-109 | 38 | 4 weeks |
| 2 — Tier 2 (Browserbase + Stagehand) | T-200 to T-205 | 20 | 3 weeks |
| 3 — Tier 1 (EC2 Pool + AdsPower) | T-300 to T-305 | 28 | 4 weeks |
| 4 — Tier 4 (API-Direct) | T-400 to T-403 | 12 | 2 weeks |
| 5 — Pricing & Polish | T-500 to T-503 | 16 | 3 weeks |
| **Total** | **34 tasks** | **138 points** | **~18 weeks** |

## Dependency Graph (Critical Path)

```
Phase 0 (Foundation)
T-001 (CI Pipeline)
T-002 (Fly.io Setup)
  └→ T-003 (Hatchet on Fly.io)
T-004 (Auto-Deploy) ← depends on T-001 + T-002
T-005 (Staging Env) ← depends on T-002

Phase 1 (Tier 3 — Fly Machines)
T-100 (IBrowserAgent Interface) ← can start immediately
T-101 (Docker Image: Camoufox) ← can start immediately
  └→ T-102 (Fly Machine Lifecycle Manager)
       └→ T-103 (Warm Pool Strategy)
       └→ T-106 (Tier Routing in Hatchet Workflow) ← also needs T-104
       └→ T-107 (noVNC Integration for HITL) ← also needs T-101
       └→ T-108 (Webhook Callback from Sandbox) ← also needs T-101
T-100 + T-101
  └→ T-104 (PlaywrightBrowserAgent)
       └→ T-105 (storageState Save/Restore)
T-106 + T-107 + T-108
  └→ T-109 (E2E Test: Fly Machine)

Phase 2 (Tier 2 — Browserbase)
T-200 (Browserbase SDK) ← can start in parallel with Phase 1
  └→ T-201 (Stagehand v3 + StagehandBrowserAgent) ← also needs T-100
  └→ T-202 (Browserbase Contexts API)
  └→ T-203 (Live View Iframe) ← also needs T-107
T-106 + T-201
  └→ T-204 (Tier 3→2 Retry Escalation)
T-201 + T-202 + T-203
  └→ T-205 (E2E Test: Browserbase)

Phase 3 (Tier 1 — EC2)
T-300 (EC2 Terraform) ← can start in parallel with Phase 2
  └→ T-301 (AdsPower + Selenium per Instance)
       └→ T-302 (SeleniumBrowserAgent) ← also needs T-100
       └→ T-303 (Profile-to-Instance Redis)
       └→ T-304 (Auto-Scaling + Health Monitoring) ← also needs T-300
T-302 + T-303
  └→ T-305 (E2E Test: EC2 Full Pipeline)

Phase 4 (Tier 4 — API-Direct)
T-400 (ATS Detection Module) ← can start in parallel with Phase 3
  └→ T-401 (Greenhouse API Handler)
  └→ T-402 (Lever API Handler)
T-100 + T-401 + T-402
  └→ T-403 (APIDirectAgent)

Phase 5 (Pricing & Polish)
T-500 (User Plan Management) ← can start in parallel with Phase 4
  └→ T-501 (Usage Metering + Stripe)
T-204
  └→ T-502 (Tier Fallback Cascade Tuning)
T-500 + T-502
  └→ T-503 (Analytics Dashboard)
```

## Quick Start — What to Work on First

1. **Right now**: T-001 (CI) and T-002 (Fly.io setup) — no dependencies, unblocks everything
2. **Then**: T-003 (Hatchet on Fly.io) — critical blocker for orchestration
3. **Parallel track A**: T-100 (IBrowserAgent) + T-101 (Docker image) — start Phase 1 immediately
4. **Parallel track B**: T-200 (Browserbase SDK) — can begin Tier 2 prep in parallel
5. **Phase 1 critical path**: T-101 → T-102 → T-104 → T-106 → T-109
6. **Converge at**: T-109 (E2E test on Fly Machines) — validates Tier 3 MVP works
7. **Then**: Phase 2 (Browserbase), Phase 3 (EC2), Phase 4 (API-Direct) in sequence with parallelism
8. **Finally**: Phase 5 (Pricing + Polish) once all tiers are functional

---

*Last updated: 2026-02-13*
*Reflects: [04-multi-tier-sandbox-architecture.md](../sandbox/04-multi-tier-sandbox-architecture.md) implementation roadmap*
