# Sprint Backlog — WeKruit Valet

> Prioritized task backlog with effort estimates, dependencies, files touched, and acceptance criteria.

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

## Phase 1 — Browser Automation Core

### T-010: AdsPower Client — API Wrapper
- **Priority**: P0 | **Points**: 5 | **Sprint**: 1.1
- **Depends on**: T-003
- **Files**: `apps/worker/src/adapters/ads-power.ts`, `packages/shared/src/schemas/browser-profile.ts`
- **Description**: Implement `AdsPowerClient` class wrapping Local API (port 50325). All endpoints: create/open/close/delete/check-status/list profiles.
- **Acceptance Criteria**:
  - [ ] All CRUD operations work against real AdsPower
  - [ ] CDP WebSocket URL extracted from `data.ws.puppeteer`
  - [ ] Profile fingerprint configuration (OS, browser, WebGL)
  - [ ] Error handling: connection refused, profile not found, already open
  - [ ] Integration test passes with local AdsPower running

### T-011: AdsPower Profile Lifecycle
- **Priority**: P0 | **Points**: 3 | **Sprint**: 1.1
- **Depends on**: T-010
- **Files**: `apps/worker/src/adapters/ads-power.ts`, `packages/db/src/schema.ts`
- **Description**: Profile state machine (idle → provisioning → active → closing → idle). Sync state with `browser_profiles` DB table.
- **Acceptance Criteria**:
  - [ ] Profile state tracked in DB
  - [ ] Concurrent open requests for same profile are serialized
  - [ ] Orphan profiles cleaned up on worker restart

### T-012: Stagehand v3 — CDP Connection
- **Priority**: P0 | **Points**: 5 | **Sprint**: 1.2
- **Depends on**: T-010
- **Files**: `apps/worker/src/adapters/stagehand-adapter.ts`, `packages/llm/src/router.ts`
- **Description**: Initialize Stagehand with `localBrowserLaunchOptions.cdpUrl` pointing to AdsPower CDP WebSocket. Wire up LLM router for model selection.
- **Acceptance Criteria**:
  - [ ] Stagehand connects to AdsPower browser via CDP
  - [ ] `act()`, `extract()`, `observe()` all work
  - [ ] LLM calls route through `@valet/llm` router
  - [ ] Connection survives page navigation

### T-013: Stagehand Agent Mode & Custom Tools
- **Priority**: P1 | **Points**: 5 | **Sprint**: 1.2
- **Depends on**: T-012
- **Files**: `apps/worker/src/adapters/stagehand-adapter.ts`, `apps/worker/src/tools/`
- **Description**: Configure Stagehand agent mode with custom tools: form-fill, navigate, screenshot, extract-field. Use Vercel AI SDK tool format.
- **Acceptance Criteria**:
  - [ ] Agent mode runs multi-step tasks autonomously
  - [ ] Custom tools callable by agent
  - [ ] Token usage tracked per tool call
  - [ ] Agent respects max-step limits

### T-014: Stagehand Progress Pipeline
- **Priority**: P1 | **Points**: 3 | **Sprint**: 1.2
- **Depends on**: T-012
- **Files**: `apps/worker/src/adapters/stagehand-adapter.ts`, `apps/api/src/routes/ws.ts`
- **Description**: Stream Stagehand events (action started, element found, action completed) through WebSocket to frontend for real-time progress.
- **Acceptance Criteria**:
  - [ ] Events emitted for each Stagehand action
  - [ ] Events flow: Stagehand → Worker → API (WebSocket) → Frontend
  - [ ] No event loss under normal conditions

### T-015: Replace Browser Agent Mock
- **Priority**: P0 | **Points**: 3 | **Sprint**: 1.2
- **Depends on**: T-012, T-013
- **Files**: `apps/worker/src/adapters/browser-agent.mock.ts` → delete, `apps/worker/src/container.ts`
- **Description**: Remove `browser-agent.mock.ts`. Wire `StagehandAdapter` into DI container as `IBrowserAgent` implementation.
- **Acceptance Criteria**:
  - [ ] Mock file deleted
  - [ ] DI container resolves real adapter
  - [ ] All workflow tasks that used mock now use real Stagehand
  - [ ] `form-analyzer.mock.ts` also replaced (Stagehand `extract()` handles this)

### T-016: Magnitude — CDP Connection & Plan Reuse
- **Priority**: P1 | **Points**: 5 | **Sprint**: 1.3
- **Depends on**: T-010
- **Files**: `apps/worker/src/adapters/magnitude-adapter.ts`
- **Description**: Initialize Magnitude with `browser.cdp` pointing to AdsPower. Implement plan saving/loading for repeated flows.
- **Acceptance Criteria**:
  - [ ] Magnitude connects to AdsPower browser via CDP
  - [ ] Completes a multi-step navigation task
  - [ ] Plans saved to DB/filesystem after first run
  - [ ] Saved plans reused on subsequent runs (faster, cheaper)

### T-017: Proxy Manager — IPRoyal Integration
- **Priority**: P1 | **Points**: 3 | **Sprint**: 1.3
- **Depends on**: T-010
- **Files**: `apps/worker/src/adapters/proxy-manager.ts`, `packages/db/src/schema.ts`
- **Description**: Integrate IPRoyal residential proxies with AdsPower profile binding. Sticky sessions per profile.
- **Acceptance Criteria**:
  - [ ] Proxy assigned per AdsPower profile
  - [ ] Sticky session maintained across browser restarts
  - [ ] Proxy rotation on detection/block
  - [ ] `proxy-manager.mock.ts` deleted

### T-018: E2E Test — Full Browser Automation
- **Priority**: P1 | **Points**: 5 | **Sprint**: 1.3
- **Depends on**: T-012, T-016, T-017
- **Files**: `tests/e2e/browser-automation.test.ts`
- **Description**: End-to-end test: open AdsPower profile → connect Stagehand → navigate to test page → fill form → extract data → close profile.
- **Acceptance Criteria**:
  - [ ] Test passes against real AdsPower + real browser
  - [ ] Proxy is active during test
  - [ ] Profile cleaned up after test
  - [ ] Can be run in CI with AdsPower available

---

## Phase 2 — Orchestration Agent & Engine Switching

### T-020: SandboxController Class
- **Priority**: P0 | **Points**: 8 | **Sprint**: 2.1
- **Depends on**: T-012, T-016
- **Files**: `apps/worker/src/sandbox/sandbox-controller.ts`
- **Description**: Central controller managing AdsPower profile + engine connections. Handles connect, disconnect, switch, health check. Concurrency control via `async-mutex`.
- **Acceptance Criteria**:
  - [ ] Creates/manages AdsPower profile lifecycle
  - [ ] Connects Stagehand or Magnitude engine
  - [ ] Engine switch: disconnect current → connect new (< 3s)
  - [ ] Mutex prevents concurrent engine operations
  - [ ] Session state logged at switch boundaries

### T-021: Cross-Task Engine Sharing
- **Priority**: P1 | **Points**: 3 | **Sprint**: 2.1
- **Depends on**: T-020
- **Files**: `apps/worker/src/workflows/job-application.ts`
- **Description**: Share `SandboxController` instance across Hatchet workflow tasks using closure pattern. Engine persists across `navigate`, `fill-form`, `submit` tasks.
- **Acceptance Criteria**:
  - [ ] Same browser session used across DAG tasks
  - [ ] Engine survives task boundaries
  - [ ] Cleanup runs even if workflow fails (finally block)

### T-022: Orchestration Agent — LLM Decision Engine
- **Priority**: P0 | **Points**: 8 | **Sprint**: 2.2
- **Depends on**: T-020
- **Files**: `apps/worker/src/orchestration/agent.ts`, `packages/llm/src/router.ts`
- **Description**: LLM-powered agent that decides actions within Hatchet task steps. Hybrid: scripted high-level flow, LLM handles details. Replaces `IAgentOrchestrator` mock.
- **Acceptance Criteria**:
  - [ ] Agent receives page context, decides next action
  - [ ] Routes between Stagehand act/extract/observe based on context
  - [ ] Decision logging: every LLM call + chosen action → DB
  - [ ] Mock `IAgentOrchestrator` removed

### T-023: Fallback Cascade
- **Priority**: P1 | **Points**: 5 | **Sprint**: 2.2
- **Depends on**: T-020, T-022
- **Files**: `apps/worker/src/orchestration/fallback.ts`
- **Description**: Implement fallback chain: Stagehand DOM → Stagehand CUA → Magnitude → Human. Auto-escalate on repeated failures.
- **Acceptance Criteria**:
  - [ ] Stagehand DOM failure triggers CUA attempt
  - [ ] CUA failure triggers Magnitude
  - [ ] Magnitude failure triggers human takeover
  - [ ] Escalation events logged with reason
  - [ ] Max retries configurable per level

### T-024: CAPTCHA Detection
- **Priority**: P0 | **Points**: 5 | **Sprint**: 2.3
- **Depends on**: T-012, T-016
- **Files**: `apps/worker/src/adapters/captcha-detector.ts`
- **Description**: Detect CAPTCHAs using Stagehand `observe()` + Magnitude vision. Confidence scoring. Replaces `captcha-detector.mock.ts`.
- **Acceptance Criteria**:
  - [ ] Detects reCAPTCHA, hCaptcha, Cloudflare Turnstile
  - [ ] Confidence score (0-1) with configurable threshold
  - [ ] Low false positive rate (< 5%)
  - [ ] Mock deleted

### T-025: CAPTCHA Pause/Resume in Hatchet
- **Priority**: P0 | **Points**: 5 | **Sprint**: 2.3
- **Depends on**: T-024, T-003
- **Files**: `apps/worker/src/workflows/job-application.ts`, `apps/api/src/routes/webhooks.ts`
- **Description**: When CAPTCHA detected, workflow pauses via `durableTask` + `waitFor("captcha-solved")`. API endpoint to signal resolution.
- **Acceptance Criteria**:
  - [ ] CAPTCHA detection triggers workflow pause
  - [ ] WebSocket notification sent to frontend
  - [ ] API endpoint accepts `captcha-solved` event
  - [ ] Workflow resumes within 5 seconds of signal
  - [ ] Timeout after 5 minutes → abort or retry

### T-026: LinkedIn Flow
- **Priority**: P1 | **Points**: 8 | **Sprint**: 2.3
- **Depends on**: T-022
- **Files**: `apps/worker/src/platforms/linkedin.ts`
- **Description**: LinkedIn Easy Apply automation. Login → search → filter → apply → fill → submit. Replaces `linkedin.mock.ts`.
- **Acceptance Criteria**:
  - [ ] Successful Easy Apply submission on test account
  - [ ] Handles multi-page application forms
  - [ ] Resume upload works
  - [ ] Rate limiting respected (max 25 applies/day configurable)

### T-027: Greenhouse Flow
- **Priority**: P1 | **Points**: 8 | **Sprint**: 2.3
- **Depends on**: T-022
- **Files**: `apps/worker/src/platforms/greenhouse.ts`
- **Description**: Greenhouse application automation. Navigate → fill form → upload resume → submit. Replaces `greenhouse.mock.ts`.
- **Acceptance Criteria**:
  - [ ] Successful application on test Greenhouse board
  - [ ] Handles custom questions (text, dropdown, checkbox)
  - [ ] Resume + cover letter upload
  - [ ] EEO/demographic fields handled appropriately

---

## Phase 3 — Sandbox & Human-in-the-Loop

### T-030: VNC Docker Image
- **Priority**: P0 | **Points**: 5 | **Sprint**: 3.1
- **Depends on**: —
- **Files**: `docker/sandbox/Dockerfile`, `docker/sandbox/supervisord.conf`
- **Description**: Docker image with Xvfb (1920x1080x24) + x11vnc + websockify + noVNC. Supervisor manages all processes.
- **Acceptance Criteria**:
  - [ ] Image builds successfully (< 2GB)
  - [ ] VNC accessible via WebSocket on port 6080
  - [ ] noVNC web client works in browser
  - [ ] Password authentication required
  - [ ] All processes restart on failure

### T-031: VNC WebSocket Routing
- **Priority**: P1 | **Points**: 3 | **Sprint**: 3.1
- **Depends on**: T-030, T-002
- **Files**: `apps/api/src/routes/vnc.ts`, `fly/api.toml`
- **Description**: Route VNC WebSocket connections through API server using `fly-replay` header to reach correct sandbox machine.
- **Acceptance Criteria**:
  - [ ] `wss://api/vnc/:sessionId` routes to correct sandbox
  - [ ] `fly-replay` header targets sandbox machine ID
  - [ ] Connection survives Fly.io proxy layer
  - [ ] Auth token validated before routing

### T-032: MVP Sandbox Dockerfile
- **Priority**: P0 | **Points**: 8 | **Sprint**: 3.2
- **Depends on**: T-030
- **Files**: `docker/sandbox/Dockerfile.mvp`, `fly/sandbox.toml`
- **Description**: Combined Docker image: worker + AdsPower + VNC stack in single container. Fly.io deployment with 4GB RAM, 2 vCPU.
- **Acceptance Criteria**:
  - [ ] Single container runs worker + browser + VNC
  - [ ] AdsPower starts on boot, VNC shows desktop
  - [ ] Worker connects to local AdsPower
  - [ ] Deploys to Fly.io and runs stable for 1 hour

### T-033: Sandbox Registry
- **Priority**: P1 | **Points**: 3 | **Sprint**: 3.2
- **Depends on**: T-032
- **Files**: `apps/api/src/services/sandbox-registry.ts`, `packages/shared/src/schemas/sandbox.ts`
- **Description**: Redis-backed registry tracking active sandboxes: machine ID, session ID, status, VNC URL, timestamps.
- **Acceptance Criteria**:
  - [ ] Sandbox registered on creation
  - [ ] Status updated on lifecycle events
  - [ ] TTL auto-expires stale entries
  - [ ] API can query active sandboxes for a user

### T-034: Human Takeover Flow
- **Priority**: P0 | **Points**: 8 | **Sprint**: 3.3
- **Depends on**: T-025, T-031, T-033
- **Files**: `apps/api/src/routes/takeover.ts`, `apps/worker/src/workflows/job-application.ts`
- **Description**: Full human-in-the-loop: CAPTCHA detected → workflow pauses → WebSocket notification → user opens VNC → solves CAPTCHA → signals done → workflow resumes.
- **Acceptance Criteria**:
  - [ ] End-to-end flow works within 30 seconds (excluding human time)
  - [ ] VNC session shows correct browser at CAPTCHA page
  - [ ] Human can interact with browser normally
  - [ ] "Done" button signals workflow to resume
  - [ ] Timeout after 5 min auto-aborts

---

## Phase 4 — Frontend Integration

### T-040: WebSocket Connection Manager
- **Priority**: P1 | **Points**: 3 | **Sprint**: 4.1
- **Depends on**: T-014
- **Files**: `apps/web/src/lib/websocket.ts`, `apps/web/src/hooks/use-websocket.ts`
- **Description**: WebSocket client with auto-reconnect, heartbeat, message queuing. React hook for subscription.
- **Acceptance Criteria**:
  - [ ] Auto-reconnects on disconnect (exponential backoff)
  - [ ] Heartbeat prevents idle timeout
  - [ ] Messages queued during reconnection, delivered on connect
  - [ ] `useWebSocket()` hook with typed message handlers

### T-041: Task Progress View
- **Priority**: P1 | **Points**: 5 | **Sprint**: 4.1
- **Depends on**: T-040
- **Files**: `apps/web/src/components/task-progress.tsx`, `apps/web/src/components/step-indicator.tsx`
- **Description**: Real-time task progress showing workflow steps, current action, screenshots. Updates via WebSocket.
- **Acceptance Criteria**:
  - [ ] Shows all workflow steps with status (pending, active, complete, failed)
  - [ ] Current action description updates live
  - [ ] Periodic screenshots display in timeline
  - [ ] Engine indicator (Stagehand/Magnitude icon)

### T-042: VNC Viewer Component
- **Priority**: P0 | **Points**: 5 | **Sprint**: 4.2
- **Depends on**: T-031, T-040
- **Files**: `apps/web/src/components/vnc-viewer.tsx`, `packages/ui/src/components/vnc-toolbar.tsx`
- **Description**: React VNC viewer using react-vnc v3.2.0. Connection state machine, toolbar (zoom, clipboard), responsive layout.
- **Acceptance Criteria**:
  - [ ] Connects to VNC via WebSocket URL
  - [ ] Shows remote desktop with keyboard/mouse input
  - [ ] Toolbar: zoom in/out, fit-to-window, clipboard sync
  - [ ] Connection state UI (connecting spinner, error message)
  - [ ] Mobile touch events work

### T-043: Takeover Modal
- **Priority**: P0 | **Points**: 5 | **Sprint**: 4.2
- **Depends on**: T-042, T-034
- **Files**: `apps/web/src/components/takeover-modal.tsx`
- **Description**: Modal triggered by CAPTCHA/review WebSocket event. Shows context (what happened, why paused) + embedded VNC viewer + "Done" button.
- **Acceptance Criteria**:
  - [ ] Modal appears on takeover WebSocket event
  - [ ] Shows reason for takeover (CAPTCHA type, screenshot)
  - [ ] VNC viewer embedded and functional
  - [ ] "Done" button signals API → Hatchet resume
  - [ ] Timer shows remaining time before auto-abort

### T-044: Dashboard & Metrics
- **Priority**: P2 | **Points**: 5 | **Sprint**: 4.3
- **Depends on**: T-041
- **Files**: `apps/web/src/pages/dashboard.tsx`, `apps/api/src/routes/metrics.ts`
- **Description**: Dashboard showing active jobs, success/fail rates, cost tracking, recent applications.
- **Acceptance Criteria**:
  - [ ] Active job cards with status and progress
  - [ ] Success/failure rate chart (last 7 days)
  - [ ] LLM cost per application displayed
  - [ ] Recent applications list with status, platform, timestamp

### T-045: Copilot Review Screen
- **Priority**: P2 | **Points**: 5 | **Sprint**: 4.3
- **Depends on**: T-041
- **Files**: `apps/web/src/pages/review.tsx`
- **Description**: Side-by-side view: extracted form data (left) vs live browser preview (right). User approves or edits before submission.
- **Acceptance Criteria**:
  - [ ] Extracted fields displayed in editable form
  - [ ] Browser screenshot/VNC on right side
  - [ ] Approve → submit, Edit → update fields and resubmit
  - [ ] Confidence indicators per field

---

## Phase 5 — Testing & Launch

### T-050: Integration Test Suite
- **Priority**: P1 | **Points**: 8 | **Sprint**: 5.1
- **Depends on**: T-034
- **Files**: `tests/integration/`, `vitest.config.ts`
- **Description**: Full integration tests covering: profile creation → browser launch → form fill → CAPTCHA detection → human takeover → submit.
- **Acceptance Criteria**:
  - [ ] Tests cover full application lifecycle
  - [ ] Can run against dev environment
  - [ ] Cleanup: all profiles/sandboxes removed after test
  - [ ] 90%+ coverage on critical path code

### T-051: Load Testing
- **Priority**: P2 | **Points**: 5 | **Sprint**: 5.1
- **Depends on**: T-050
- **Files**: `tests/load/`, `scripts/load-test.sh`
- **Description**: Concurrent sandbox session testing. Target: 10 concurrent applications across 5 sandbox sessions.
- **Acceptance Criteria**:
  - [ ] 10 concurrent applications complete without crash
  - [ ] Memory stays under 80% on sandbox containers
  - [ ] No VNC connection drops under load
  - [ ] P95 latency for takeover flow < 5 seconds

### T-052: Security Audit
- **Priority**: P1 | **Points**: 5 | **Sprint**: 5.1
- **Depends on**: T-034
- **Files**: various
- **Description**: Security review: VNC auth tokens, WebSocket authentication, API auth middleware, CORS configuration, secret management.
- **Acceptance Criteria**:
  - [ ] VNC requires valid session token
  - [ ] WebSocket connections authenticated
  - [ ] No secrets in logs or error messages
  - [ ] CORS allows only expected origins

### T-053: Observability Setup
- **Priority**: P1 | **Points**: 5 | **Sprint**: 5.2
- **Depends on**: T-034
- **Files**: `apps/api/src/lib/logger.ts`, `apps/worker/src/lib/logger.ts`, monitoring config
- **Description**: Structured logging (pino), application metrics (success rate, engine usage, LLM cost), alerting on failures.
- **Acceptance Criteria**:
  - [ ] All services use structured JSON logging
  - [ ] Key metrics tracked: applications/hr, success rate, cost/application
  - [ ] Alerts on: sandbox OOM, workflow failure spike, CAPTCHA rate spike
  - [ ] Logs queryable in Fly.io dashboard

### T-054: Production Deployment
- **Priority**: P0 | **Points**: 5 | **Sprint**: 5.2
- **Depends on**: T-050, T-052, T-053
- **Files**: `.github/workflows/deploy-prod.yml`, `fly/` configs
- **Description**: Production Fly.io deployment. Staging → Production promotion with approval gate.
- **Acceptance Criteria**:
  - [ ] Production apps deployed and healthy
  - [ ] PR staging → main requires approval
  - [ ] Rollback documented and tested
  - [ ] All production secrets configured

---

## Summary

| Phase | Tasks | Total Points | Duration |
|-------|-------|-------------|----------|
| 0 — Foundation | T-001 to T-005 | 24 | 2 weeks |
| 1 — Browser Automation | T-010 to T-018 | 37 | 3 weeks |
| 2 — Orchestration | T-020 to T-027 | 50 | 3 weeks |
| 3 — Sandbox & HITL | T-030 to T-034 | 30 | 3 weeks |
| 4 — Frontend | T-040 to T-045 | 28 | 3 weeks |
| 5 — Testing & Launch | T-050 to T-054 | 28 | 2 weeks |
| **Total** | **38 tasks** | **197 points** | **~16 weeks** |

## Dependency Graph (Critical Path)

```
T-003 (Hatchet)
  └→ T-010 (AdsPower Client)
       └→ T-012 (Stagehand CDP)
            ├→ T-013 (Agent Mode)
            │    └→ T-015 (Replace Mocks)
            │         └→ T-022 (Orchestration Agent)
            │              └→ T-023 (Fallback Cascade)
            │              └→ T-026 (LinkedIn)
            │              └→ T-027 (Greenhouse)
            ├→ T-016 (Magnitude CDP)
            │    └→ T-020 (SandboxController)
            │         └→ T-021 (Cross-Task Sharing)
            └→ T-024 (CAPTCHA Detection)
                 └→ T-025 (Pause/Resume)
                      └→ T-034 (Human Takeover)
                           └→ T-050 (Integration Tests)
                                └→ T-054 (Production Deploy)

T-030 (VNC Docker) ← can start in parallel with Phase 2
  └→ T-031 (VNC Routing)
       └→ T-032 (MVP Sandbox)
            └→ T-033 (Registry)
                 └→ T-034 (Human Takeover)

T-040 (WebSocket) ← can start once T-014 done
  └→ T-041 (Task Progress)
  └→ T-042 (VNC Viewer)
       └→ T-043 (Takeover Modal)
```

## Quick Start — What to Work on First

1. **Right now**: T-001 (CI) and T-002 (Fly.io setup) — no dependencies, unblocks everything
2. **Then**: T-003 (Hatchet on Fly.io) — critical blocker for all automation work
3. **Then**: T-010 (AdsPower Client) — first real integration, unblocks browser automation
4. **Parallel track**: T-030 (VNC Docker image) — can be built while working on Phase 1-2
