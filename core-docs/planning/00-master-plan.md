# Master Plan — WeKruit Valet

> From codebase foundations to production-ready automated job applications.

## Executive Summary

Valet is a monorepo with solid foundations (Turborepo, Drizzle, ts-rest, Hatchet DAG workflows) but **all browser automation is currently mocked**. The path to MVP requires implementing the real AdsPower → Stagehand/Magnitude → VNC pipeline inside the existing Hatchet workflow structure, then layering on the sandbox infrastructure for human-in-the-loop takeover.

---

## Phase Overview

```
Phase 0  [Weeks 1-2]   Foundation & DevOps
Phase 1  [Weeks 3-5]   Browser Automation Core
Phase 2  [Weeks 6-8]   Orchestration Agent & Engine Switching
Phase 3  [Weeks 9-11]  Sandbox & Human-in-the-Loop
Phase 4  [Weeks 12-14] Frontend Integration & Polish
Phase 5  [Weeks 15-16] Testing, Hardening & Launch Prep
```

---

## Phase 0 — Foundation & DevOps (Weeks 1–2)

**Goal**: CI/CD pipeline, Hatchet on Fly.io, dev environment fully operational.

### Sprint 0.1 (Week 1): CI/CD & Infrastructure
- [ ] GitHub Actions: lint → typecheck → test → build on PR to `develop`
- [ ] Fly.io app creation for dev environment (`setup-fly.sh dev`)
- [ ] Hatchet self-hosted deployment on Fly.io (RabbitMQ via CloudAMQP)
- [ ] Database migrations pipeline (direct connection for DDL)
- [ ] Environment secrets management (Fly secrets for each app)

### Sprint 0.2 (Week 2): Dev Environment Validation
- [ ] Health check script validates all service connectivity
- [ ] Auto-deploy `develop` → dev environment
- [ ] Staging branch and environment setup
- [ ] Branch protection rules on GitHub
- [ ] Verify Hatchet dashboard accessible, worker registers successfully

### Deliverables
- All services running on Fly.io dev environment
- CI pipeline passing on every PR
- `pnpm dev` starts everything locally with real service connections

### Risks
| Risk | Mitigation |
|------|------------|
| Hatchet Fly.io deployment issues | CloudAMQP managed RabbitMQ, `fly-replay` for dashboard routing |
| Supabase connection pooling limits | Dual connection strategy (pooler for app, direct for migrations) |

---

## Phase 1 — Browser Automation Core (Weeks 3–5)

**Goal**: Replace ALL mock adapters with real implementations.

### Sprint 1.1 (Week 3): AdsPower Client
- [ ] `AdsPowerClient` class — real Local API calls (port 50325)
- [ ] Profile CRUD: create, open, close, delete, check-status
- [ ] CDP WebSocket URL extraction (`data.ws.puppeteer`)
- [ ] Profile fingerprint configuration (OS, browser version, WebGL)
- [ ] Integration test against local AdsPower instance
- [ ] Replace `ads-power.mock.ts` with real adapter

**Reference**: [core-docs/integration/01-adspower-integration.md](../integration/01-adspower-integration.md)

### Sprint 1.2 (Week 4): Stagehand v3 Integration
- [ ] Stagehand SDK setup — connect via CDP to AdsPower browser
- [ ] Three primitives: `act()`, `extract()`, `observe()` with LLM routing
- [ ] Agent mode with custom tools (form-fill, navigate, screenshot)
- [ ] Element caching for multi-step form interactions
- [ ] Streaming/progress pipeline (Stagehand events → WebSocket → frontend)
- [ ] Replace `browser-agent.mock.ts` with `StagehandAdapter`
- [ ] Replace `form-analyzer.mock.ts` with Stagehand `extract()`

**Reference**: [core-docs/integration/02-stagehand-integration.md](../integration/02-stagehand-integration.md)

### Sprint 1.3 (Week 5): Magnitude & Proxy Integration
- [ ] Magnitude SDK setup — connect via CDP (`browser.cdp`)
- [ ] Plan saving and reuse for repeated job board flows
- [ ] IPRoyal proxy integration with AdsPower profile binding
- [ ] Proxy rotation strategy (per-profile sticky sessions)
- [ ] Replace `proxy-manager.mock.ts` with real adapter
- [ ] E2E test: open profile → connect Stagehand → navigate → extract → close

**Reference**: [core-docs/integration/03-magnitude-integration.md](../integration/03-magnitude-integration.md)

### Deliverables
- Real browser opens, navigates, fills forms, extracts data
- All 6 mock adapters replaced with real implementations
- Proxy-protected browsing with anti-detect fingerprints

### Risks
| Risk | Mitigation |
|------|------------|
| AdsPower API instability | Retry with exponential backoff, health monitoring |
| Stagehand CDP connection drops | Reconnection logic, Hatchet retry on task failure |
| Rate limiting on job boards | Per-profile proxy rotation, human-like delays |

---

## Phase 2 — Orchestration Agent & Engine Switching (Weeks 6–8)

**Goal**: LLM-powered orchestration brain that routes between engines intelligently.

### Sprint 2.1 (Week 6): SandboxController
- [ ] `SandboxController` class — manages AdsPower profile + engine connections
- [ ] Engine lifecycle: connect, disconnect, switch, health check
- [ ] Concurrency control with `async-mutex` (one engine at a time)
- [ ] Session state preservation across engine switches
- [ ] Cross-task engine sharing via closure pattern in Hatchet workflows

**Reference**: [core-docs/integration/04-engine-switching.md](../integration/04-engine-switching.md)

### Sprint 2.2 (Week 7): Orchestration Agent
- [ ] `OrchestrationAgent` — LLM decides actions within Hatchet task steps
- [ ] Hybrid script/LLM approach: scripted high-level flow, LLM handles details
- [ ] Decision points: which engine to use, when to escalate, retry strategy
- [ ] Fallback cascade: Stagehand DOM → Stagehand CUA → Magnitude → Human
- [ ] Replace `IAgentOrchestrator` mock with real implementation
- [ ] Action logging (every LLM decision + engine action → DB)

### Sprint 2.3 (Week 8): CAPTCHA & Anti-Detection
- [ ] CAPTCHA detection via Stagehand `observe()` + Magnitude vision
- [ ] Replace `captcha-detector.mock.ts` with real detector
- [ ] Hatchet `durableTask` + `waitFor("captcha-solved")` pause/resume
- [ ] Human takeover trigger → WebSocket notification to frontend
- [ ] Anti-detection tuning: timing randomization, mouse movement patterns
- [ ] LinkedIn and Greenhouse specific flows (replace mock adapters)

### Deliverables
- Intelligent engine routing with automatic fallback
- CAPTCHA detection triggers human-in-the-loop
- Full application flow: login → search → apply → fill → submit

### Risks
| Risk | Mitigation |
|------|------------|
| LLM hallucination causing wrong actions | Action validation layer, screenshot verification |
| Engine switching instability | Mutex locking, health checks before/after switch |
| CAPTCHA detection false positives | Confidence threshold, human confirmation for ambiguous |

---

## Phase 3 — Sandbox & Human-in-the-Loop (Weeks 9–11)

**Goal**: VNC-accessible sandboxes with real-time human takeover capability.

### Sprint 3.1 (Week 9): VNC Stack
- [ ] Docker image: Xvfb + x11vnc + websockify + noVNC + supervisord
- [ ] VNC server with password auth and token validation
- [ ] websockify WebSocket bridge (TCP port 5900 → WS port 6080)
- [ ] `fly-replay` header routing for VNC WebSocket connections
- [ ] Local development: VNC accessible at `ws://localhost:6080`

**Reference**: [core-docs/sandbox/01-vnc-stack.md](../sandbox/01-vnc-stack.md)

### Sprint 3.2 (Week 10): Sandbox Deployment (MVP)
- [ ] MVP Dockerfile: worker + AdsPower + VNC in single container
- [ ] Fly.io `fly.toml` for sandbox worker (4GB RAM, 2 vCPU)
- [ ] `.internal` DNS networking (worker ↔ API)
- [ ] Redis sandbox registry (`SandboxRegistry` class)
- [ ] Sandbox lifecycle: create → provision → running → cleanup

**Reference**: [core-docs/sandbox/02-sandbox-deployment.md](../sandbox/02-sandbox-deployment.md)

### Sprint 3.3 (Week 11): Human-in-the-Loop Flow
- [ ] WebSocket channel: sandbox ↔ API ↔ frontend for takeover events
- [ ] Hatchet `waitFor` integration — pause workflow on takeover request
- [ ] VNC session handoff: bot pauses → human takes control → resumes
- [ ] Takeover timeout (5 minutes) with auto-resume or abort
- [ ] Screenshot capture at takeover moments (Supabase Storage)

### Deliverables
- User can VNC into running sandbox from browser
- CAPTCHA/review triggers popup, user solves, bot resumes
- Sandbox auto-cleans up after job application completes

### Risks
| Risk | Mitigation |
|------|------------|
| VNC latency | noVNC compression, Fly.io region-aware placement |
| Container resource limits | 4GB RAM cap, AdsPower memory monitoring, OOM killer config |
| WebSocket disconnection | Reconnection with session token, state recovery |

---

## Phase 4 — Frontend Integration & Polish (Weeks 12–14)

**Goal**: Production-quality UI with real-time updates and VNC viewer.

### Sprint 4.1 (Week 12): Task Progress & Real-Time Updates
- [ ] WebSocket connection manager (auto-reconnect, heartbeat)
- [ ] Task progress view — step-by-step live updates
- [ ] Application status cards with engine indicator (Stagehand/Magnitude)
- [ ] Screenshot timeline (periodic captures during automation)

### Sprint 4.2 (Week 13): VNC Viewer & Takeover UI
- [ ] `VncViewer` React component (react-vnc v3.2.0)
- [ ] Connection state machine: disconnected → connecting → connected → active
- [ ] `TakeoverModal` — notification + VNC embed for CAPTCHA solving
- [ ] Toolbar: zoom, clipboard sync, connection quality indicator
- [ ] Mobile-responsive VNC viewer (touch events)

**Reference**: [core-docs/ux-ui/01-user-experience-design.md](../ux-ui/01-user-experience-design.md)

### Sprint 4.3 (Week 14): Dashboard & Settings
- [ ] Dashboard: active jobs, success/fail rates, cost tracking
- [ ] Copilot review screen — side-by-side (extracted data vs form preview)
- [ ] Settings: LLM provider keys, proxy config, notification preferences
- [ ] Resume upload/management (Supabase Storage)
- [ ] Error states and recovery flows

### Deliverables
- Full working UI with live automation visibility
- VNC takeover works end-to-end from browser
- Dashboard shows meaningful metrics

### Risks
| Risk | Mitigation |
|------|------------|
| WebSocket message ordering | Sequence numbers, server-side buffering |
| VNC viewer performance in browser | noVNC is battle-tested, fallback to screenshot mode |
| UI complexity | Component library (`@valet/ui`) keeps things consistent |

---

## Phase 5 — Testing, Hardening & Launch Prep (Weeks 15–16)

**Goal**: Production-ready reliability and observability.

### Sprint 5.1 (Week 15): Testing & Reliability
- [ ] Integration tests: full application flow (AdsPower → Stagehand → form → submit)
- [ ] Load testing: concurrent sandbox sessions (target: 10 concurrent for MVP)
- [ ] Error recovery tests: network failures, engine crashes, timeout scenarios
- [ ] Hatchet workflow replay/retry validation
- [ ] Security audit: VNC auth, WebSocket auth, API auth, CORS

### Sprint 5.2 (Week 16): Observability & Launch
- [ ] Structured logging (pino) across all services
- [ ] Metrics: application success rate, engine usage, LLM cost per application
- [ ] Alerting: sandbox OOM, workflow failures, CAPTCHA detection rate
- [ ] Production Fly.io deployment (`setup-fly.sh prod`)
- [ ] Staging → Production promotion pipeline
- [ ] Launch checklist and runbook

### Deliverables
- 95%+ test coverage on critical paths
- Production deployment with monitoring
- Runbook for common operational scenarios

---

## Critical Path

```
Hatchet on Fly.io (0.1)
  └→ AdsPower Client (1.1)
       └→ Stagehand Integration (1.2)
            ├→ Magnitude Integration (1.3)
            └→ SandboxController (2.1)
                 └→ Orchestration Agent (2.2)
                      └→ CAPTCHA / Anti-Detection (2.3)
                           └→ VNC Stack (3.1)
                                └→ Sandbox Deployment (3.2)
                                     └→ Human-in-the-Loop (3.3)
                                          └→ Frontend Integration (4.1–4.3)
                                               └→ Testing & Launch (5.1–5.2)
```

**Bottleneck**: Phase 1 (browser automation) blocks everything. Get AdsPower + Stagehand working ASAP.

---

## Architecture Decision Log

| # | Decision | Date | Status | Context |
|---|----------|------|--------|---------|
| ADR-001 | Keep Hatchet for orchestration | Week 0 | Accepted | No sandbox platform (E2B, OpenHands, Daytona) replaces Hatchet's durable execution + human-in-the-loop `waitFor` |
| ADR-002 | AdsPower for browser management | Week 0 | Accepted | Anti-detect fingerprints, profile isolation, Local API, proxy binding — irreplaceable for job board automation |
| ADR-003 | Stagehand primary, Magnitude fallback | Week 0 | Accepted | DOM-first is faster/cheaper; vision-first handles edge cases. CDP connection means both work with AdsPower |
| ADR-004 | MVP: worker IS the sandbox | Week 0 | Accepted | Single container with VNC avoids distributed complexity. Scale to ephemeral Fly Machines later |
| ADR-005 | 3-tier LLM routing | Week 0 | Accepted | Claude Sonnet 4.5 (complex) → GPT-4.1 mini (routine) → GPT-4.1 nano (trivial). ~$0.045-0.12/application |
| ADR-006 | Fly Machines for sandbox (production) | Week 0 | Proposed | Ephemeral machines per session, `.internal` DNS, `fly-replay` routing. Evaluate after MVP |
| ADR-007 | noVNC for browser-based VNC | Week 0 | Accepted | Zero-install, WebSocket transport, battle-tested. react-vnc wraps it for React integration |

---

## Risk Register

| # | Risk | Probability | Impact | Mitigation | Owner |
|---|------|-------------|--------|------------|-------|
| R1 | AdsPower Local API changes or breaks | Medium | High | Pin API version, abstract behind adapter interface | Backend |
| R2 | Job boards detect automation | High | High | Anti-detect profiles, human-like timing, proxy rotation, Magnitude vision fallback | Backend |
| R3 | VNC latency makes takeover unusable | Low | Medium | noVNC compression, Fly.io region placement, fallback to screenshot mode | Infra |
| R4 | LLM costs exceed budget | Medium | Medium | 3-tier routing, caching, plan reuse (Magnitude), token monitoring | Backend |
| R5 | Hatchet self-hosting instability | Low | High | CloudAMQP managed RabbitMQ, health monitoring, consider Hatchet Cloud if issues persist | DevOps |
| R6 | Sandbox container OOM | Medium | Medium | 4GB RAM cap, AdsPower memory monitoring, automatic cleanup | Infra |
| R7 | CAPTCHA detection false positives | Medium | Low | Confidence threshold, human confirmation for ambiguous cases | Backend |
| R8 | WebSocket reliability (long-running sessions) | Medium | Medium | Heartbeat, auto-reconnect, sequence numbers, server-side buffering | Full Stack |

---

## Team & Responsibilities

| Role | Scope |
|------|-------|
| Backend Engineer | Phases 1-2: Browser automation, orchestration agent, engine switching |
| Infrastructure Engineer | Phases 0, 3: CI/CD, Fly.io, sandbox deployment, VNC stack |
| Frontend Engineer | Phase 4: Real-time UI, VNC viewer, dashboard |
| Full Stack | Phase 5: Integration testing, hardening, launch |

> **Note**: For a solo developer or small team, work phases sequentially following the critical path. Phases 1-2 and Phase 3 have some parallelism opportunity (VNC Docker image can be built while orchestration agent is in progress).

---

## Success Criteria (MVP)

- [ ] User uploads resume, selects job boards, clicks "Apply"
- [ ] Bot opens real browser (AdsPower), navigates to job board, fills application
- [ ] When CAPTCHA appears, user gets notification and VNC access to solve it
- [ ] Bot resumes after human intervention, completes application
- [ ] Dashboard shows progress, screenshots, and success/failure status
- [ ] Works for LinkedIn Easy Apply and Greenhouse as first two integrations
- [ ] Handles 10 concurrent applications across 5 sandbox sessions
- [ ] Cost per application: < $0.15 (LLM + compute)
