# Master Plan — WeKruit Valet

> From codebase foundations to production-ready automated job applications.

## Executive Summary

Valet is a monorepo with solid foundations (Turborepo, Drizzle, ts-rest, Hatchet DAG workflows) but **all browser automation is currently mocked**. The production path uses a **4-tier sandbox architecture** to balance cost, stealth, and scalability from MVP to 1000+ users:

- **Tier 1 (EC2 + AdsPower)**: Highest stealth — persistent anti-detect profiles on reserved EC2 instances, for platforms with aggressive bot detection (LinkedIn, Workday).
- **Tier 2 (Browserbase + Stagehand)**: Managed browser infrastructure with AI-native DOM interaction, for mid-complexity job boards (Greenhouse, Lever).
- **Tier 3 (Fly Machines + Camoufox)**: Ephemeral on-demand containers with Camoufox anti-fingerprinting, the cost-efficient default tier and **MVP starting point**.
- **Tier 4 (API-Direct)**: No browser needed — direct API/ATS integration for boards that expose structured endpoints.

A `SandboxRouter` selects the appropriate tier per job based on platform, stealth requirements, and cost. Hatchet orchestrates all tiers uniformly. See [sandbox/04-multi-tier-sandbox-architecture.md](../sandbox/04-multi-tier-sandbox-architecture.md) for the full design.

---

## Phase Overview

```
Phase 0  [Weeks 1-2]   Foundation & DevOps
Phase 1  [Weeks 1-4]   Tier 3 MVP (Fly Machines + Camoufox)
Phase 2  [Weeks 5-7]   Tier 2 (Browserbase + Stagehand)
Phase 3  [Weeks 8-11]  Tier 1 (EC2 Pool + AdsPower)
Phase 4  [Weeks 12-13] Tier 4 (API-Direct) & Cross-Tier Routing
Phase 5  [Weeks 14-16] Pricing, Billing & Polish
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

## Phase 1 — Tier 3 MVP: Fly Machines + Camoufox (Weeks 1–4)

**Goal**: Ship the cheapest viable sandbox — ephemeral Fly Machines running Camoufox with Playwright, orchestrated by Hatchet. Proves the full pipeline without committing to expensive infrastructure.

### Sprint 1.1 (Weeks 1-2): Fly Machine Sandbox Provisioning
- [ ] Dockerfile: Camoufox + Playwright + Node.js worker in a single container
- [ ] `FlyMachineManager` service: create/destroy machines via Fly Machines API
- [ ] Machine lifecycle: provision → ready → running → teardown (auto-destroy on idle)
- [ ] Hatchet workflow: `run-job-application-tier3` — provision machine, execute task, teardown
- [ ] Health check and timeout handling (max 10 min per machine)

### Sprint 1.2 (Weeks 3-4): Automation & Integration
- [ ] Playwright-based LinkedIn Easy Apply handler (Camoufox anti-fingerprinting)
- [ ] Webhook callback module for progress reporting to Hatchet
- [ ] Resume upload + QA answer injection into form filler
- [ ] E2E test: API → Hatchet → Fly Machine → LinkedIn → result
- [ ] Error handling: machine crash, network timeout, Fly API failures
- [ ] Structured logging (JSON) to Fly log drain

### Deliverables
- Ephemeral Fly Machine sandbox running Camoufox + Playwright
- LinkedIn Easy Apply automation working end-to-end
- Auto-provisioning and teardown via Fly Machines API
- Cost: ~$0.004/machine-minute (pay only for active use)

### Risks
| Risk | Mitigation |
|------|------------|
| Fly Machine cold start latency (3-8s) | Pre-warm pool of 1-2 standby machines during peak hours |
| Camoufox detection on high-stealth platforms | Route to Tier 1 (AdsPower) for LinkedIn/Workday; Tier 3 for simpler boards |
| Fly Machines API reliability | Retry with exponential backoff, fallback to Tier 2 (Browserbase) |

---

## Phase 2 — Tier 2: Browserbase + Stagehand (Weeks 5–7)

**Goal**: Add managed browser infrastructure with AI-native DOM interaction for mid-complexity job boards. Reduces operational burden vs. self-hosted browsers.

### Sprint 2.1 (Week 5): Browserbase Integration
- [ ] `BrowserbaseClient` service: session creation, CDP connection, session teardown
- [ ] Browserbase proxy configuration for residential IP rotation
- [ ] Session recording and debug replay via Browserbase dashboard
- [ ] Hatchet workflow: `run-job-application-tier2` — create session, execute, teardown

### Sprint 2.2 (Week 6): Stagehand AI Agent
- [ ] Stagehand v3 integration for intelligent form analysis and filling
- [ ] Action primitives: `act()`, `extract()`, `observe()` for DOM interaction
- [ ] QA answer injection via Stagehand's structured form filling
- [ ] Greenhouse and Lever handler implementations

### Sprint 2.3 (Week 7): SandboxRouter & Tier Selection
- [ ] `SandboxRouter` service: selects tier based on platform, stealth needs, cost
- [ ] Tier routing rules engine (configurable per job board)
- [ ] Unified result schema across Tier 2 and Tier 3
- [ ] CAPTCHA detection and escalation (Tier 2 → human-in-the-loop)
- [ ] E2E test: API → Hatchet → Browserbase → Greenhouse → result

### Deliverables
- Browserbase + Stagehand sandbox for Greenhouse/Lever job boards
- `SandboxRouter` dynamically selects Tier 2 or Tier 3 per job
- Unified Hatchet workflow orchestration across tiers
- Session recording for debugging and audit

### Risks
| Risk | Mitigation |
|------|------------|
| Browserbase vendor lock-in | Abstract behind `SandboxProvider` interface; Tier 3 as fallback |
| Stagehand reliability on complex forms | Fallback to Playwright scripted approach within same Browserbase session |
| Browserbase pricing at scale | Monitor cost/session; route low-stealth jobs to Tier 3 (cheaper) |

---

## Phase 3 — Tier 1: EC2 Pool + AdsPower (Weeks 8–11)

**Goal**: Highest-stealth tier for platforms with aggressive bot detection. Persistent anti-detect profiles on reserved EC2 instances with VNC for human-in-the-loop.

### Sprint 3.1 (Weeks 8-9): EC2 Pool & AdsPower Integration
- [ ] Fork axon-browser-worker into `infra/ec2-worker/`
- [ ] Terraform config for EC2 pool (t3.medium instances + security groups + Elastic IPs)
- [ ] `EC2PoolManager` service: instance allocation, health checks, auto-scaling
- [ ] AdsPower profile management: creation, rotation, cooldown scheduling
- [ ] `ProfilePool` service with Redis distributed locks for profile allocation
- [ ] Hatchet workflow: `run-job-application-tier1` — lock profile, dispatch to EC2, release

### Sprint 3.2 (Week 10): VNC & Human-in-the-Loop
- [ ] x11vnc + websockify on EC2 instances (per-instance VNC)
- [ ] noVNC React component: `@novnc/novnc` viewer embedded in task detail page
- [ ] VNC token generation + validation in API (short-lived JWT)
- [ ] CAPTCHA detected → notification → user opens VNC → solves → bot resumes
- [ ] Hatchet `durableTask` + `waitFor("captcha-solved")` pause/resume

### Sprint 3.3 (Week 11): LinkedIn & Workday Handlers
- [ ] LinkedIn Easy Apply handler (Selenium + AdsPower anti-detect)
- [ ] Workday handler (complex multi-page forms)
- [ ] Cross-tier CAPTCHA escalation: Tier 2/3 CAPTCHA → route to Tier 1 VNC
- [ ] E2E test: Frontend → API → Hatchet → EC2 → LinkedIn → result

### Deliverables
- EC2 pool with AdsPower for highest-stealth automation
- VNC-based human-in-the-loop for CAPTCHA solving
- LinkedIn and Workday handlers on Tier 1
- Profile rotation and cooldown management

### Risks
| Risk | Mitigation |
|------|------------|
| AdsPower license activation requires GUI | VNC into EC2 for initial setup, then headless operation |
| EC2 pool cost at low utilization | Start with 1 instance, scale based on demand; reserved instances for cost |
| VNC latency to EC2 | websockify compression, same-region deployment, fallback to screenshot mode |
| Profile lock deadlocks | Redis TTL on locks (10 min), background cleanup job |

---

## Phase 4 — Tier 4: API-Direct & Cross-Tier Routing (Weeks 12–13)

**Goal**: Add zero-browser API integrations for boards with structured endpoints, and harden cross-tier routing, monitoring, and security.

### Sprint 4.1 (Week 12): API-Direct Tier
- [ ] `APIDirectClient` service: direct HTTP calls to ATS APIs (no browser)
- [ ] Job board API integrations: boards with public application APIs
- [ ] Hatchet workflow: `run-job-application-tier4` — API call, parse response, store result
- [ ] Rate limiting and retry logic per API endpoint
- [ ] Unified result schema shared with Tier 1/2/3

### Sprint 4.2 (Week 13): Cross-Tier Hardening & Monitoring
- [ ] `SandboxRouter` v2: cost optimization, automatic tier fallback on failure
- [ ] Cross-tier metrics dashboard: success rate, cost/application, latency per tier
- [ ] CloudWatch monitoring for EC2 pool + Fly Machine metrics
- [ ] Security hardening: SG lockdown, secrets rotation, Terraform state backend (S3)
- [ ] Alerting: tier health, CAPTCHA rate spikes, cost anomalies
- [ ] Runbook for cross-tier operational scenarios

### Deliverables
- API-Direct tier for zero-browser job applications
- `SandboxRouter` with automatic tier fallback and cost optimization
- Cross-tier monitoring dashboard with per-tier success/cost metrics
- Security hardening across all tiers

### Risks
| Risk | Mitigation |
|------|------------|
| ATS API changes without notice | Version pinning, schema validation, alerting on unexpected responses |
| Cross-tier consistency | Unified result schema, shared Hatchet post-processing step |
| Monitoring cost across 4 tiers | Aggregate metrics in shared dashboard; detailed per-tier only when debugging |

---

## Phase 5 — Pricing, Billing & Polish (Weeks 14–16)

**Goal**: Production-ready billing, usage tracking, and launch polish for the multi-tier platform.

### Sprint 5.1 (Week 14): Pricing & Billing
- [ ] Tiered pricing model: per-application pricing based on sandbox tier used
- [ ] Usage tracking: applications/month, tier breakdown, cost per application
- [ ] Stripe integration: subscription plans, overage billing, usage metering
- [ ] User dashboard: usage stats, cost breakdown, tier allocation visibility

### Sprint 5.2 (Week 15): Testing & Hardening
- [ ] Integration tests: full flow across all 4 tiers
- [ ] Error recovery tests: tier failover, network failures, timeout scenarios
- [ ] Hatchet workflow replay/retry validation across tiers
- [ ] Security audit: VNC auth, WebSocket auth, API auth, CORS, tier isolation
- [ ] Load testing: 100+ concurrent users across tiers

### Sprint 5.3 (Week 16): Launch
- [ ] Production Fly.io deployment (`setup-fly.sh prod`)
- [ ] Staging → Production promotion pipeline
- [ ] Launch checklist and runbook (per-tier operational procedures)
- [ ] Documentation: user guides, API docs, tier selection guide
- [ ] Onboarding flow polish and first-user experience

### Deliverables
- Stripe billing with tiered pricing and usage metering
- Production deployment with all 4 tiers operational
- 90%+ test coverage on critical paths
- Launch-ready with runbooks and documentation

### Future Enhancements
- **Magnitude fallback**: Vision-based browser agent for edge cases Stagehand cannot handle
- **Additional job boards**: expand handler coverage per tier
- **Auto-tier optimization**: ML-based tier selection based on historical success rates
- **Team/enterprise features**: shared profiles, bulk applications, admin dashboard

---

## Critical Path

```
Hatchet on Fly.io (0.1)
  └→ Fly Machine Sandbox + Camoufox (1.1)
       └→ Playwright Automation + E2E (1.2)          ← Tier 3 MVP ships here
            ├→ Browserbase + Stagehand (2.1-2.2)
            │    └→ SandboxRouter + Tier Selection (2.3)   ← Tier 2 + routing
            └→ EC2 Pool + AdsPower (3.1)
                 └→ VNC + Human-in-the-Loop (3.2)
                      └→ LinkedIn/Workday Handlers (3.3)   ← Tier 1 complete
                           └→ API-Direct Tier (4.1)
                                └→ Cross-Tier Hardening (4.2) ← All 4 tiers operational
                                     └→ Pricing & Billing (5.1)
                                          └→ Testing & Launch (5.2-5.3)
```

**Bottleneck**: Phase 1 (Tier 3 Fly Machines + Camoufox) blocks everything. Get an ephemeral sandbox running with Playwright + LinkedIn Easy Apply ASAP. Tiers 1 and 2 can be developed in parallel once the SandboxRouter interface is defined in Phase 2.

---

## Architecture Decision Log

| # | Decision | Date | Status | Context |
|---|----------|------|--------|---------|
| ADR-001 | Keep Hatchet for orchestration | Week 0 | Accepted | No sandbox platform (E2B, OpenHands, Daytona) replaces Hatchet's durable execution + human-in-the-loop `waitFor` |
| ADR-002 | AdsPower for browser management | Week 0 | Accepted | Anti-detect fingerprints, profile isolation, Local API, proxy binding — irreplaceable for job board automation |
| ADR-003 | Stagehand primary, Magnitude fallback | Week 0 | Accepted (Phase 2) | DOM-first is faster/cheaper; vision-first handles edge cases. Stagehand powers Tier 2 (Browserbase) in Phase 2; Magnitude deferred to future enhancements |
| ADR-004 | MVP: EC2 persistent instance | Week 0 | Superseded by ADR-008 | Originally "worker IS the sandbox" in Docker. Now EC2 t3.medium with Python worker |
| ADR-005 | 3-tier LLM routing | Week 0 | Accepted | Claude Sonnet 4.5 (complex) → GPT-4.1 mini (routine) → GPT-4.1 nano (trivial). ~$0.045-0.12/application |
| ADR-006 | Fly Machines for sandbox (production) | Week 0 | Accepted (Tier 3) | Now the MVP starting point — Tier 3 uses ephemeral Fly Machines + Camoufox as the default cost-efficient sandbox |
| ADR-007 | noVNC for browser-based VNC | Week 0 | Accepted | Zero-install, WebSocket transport, battle-tested. `@novnc/novnc` for React integration |
| ADR-008 | EC2 over Fly Machines for MVP browser worker | Week 3 | Superseded by ADR-009 | Originally accepted for MVP simplicity. Now incorporated as Tier 1 in the multi-tier architecture — EC2+AdsPower reserved for highest-stealth platforms only |
| ADR-009 | Multi-Tier Sandbox Architecture (4 tiers) | Week 5 | Accepted | **Chosen over single-tier EC2** for scalability to 100-1000+ users. 4 tiers: Tier 1 (EC2+AdsPower, highest stealth), Tier 2 (Browserbase+Stagehand, managed), Tier 3 (Fly Machines+Camoufox, cheapest/MVP), Tier 4 (API-Direct, no browser). `SandboxRouter` selects tier per job. **Trade-offs**: more operational complexity vs. cost optimization (75%+ gross margin target), stealth flexibility, and no single vendor lock-in. See [sandbox/04-multi-tier-sandbox-architecture.md](../sandbox/04-multi-tier-sandbox-architecture.md) |

---

## Risk Register

| # | Risk | Probability | Impact | Mitigation | Owner |
|---|------|-------------|--------|------------|-------|
| R1 | AdsPower Local API changes or breaks | Medium | High | Pin API version, abstract behind adapter interface. Only affects Tier 1 | Backend |
| R2 | Job boards detect automation | High | High | Multi-tier stealth: Tier 1 (AdsPower anti-detect), Tier 3 (Camoufox), human-like timing, proxy rotation, per-profile rate limits | Backend |
| R3 | Browserbase vendor lock-in | Medium | High | Abstract behind `SandboxProvider` interface; Tier 3 (Fly Machines) as full fallback. No Browserbase-specific logic in Hatchet workflows | Infra |
| R4 | LLM costs exceed budget | Medium | Medium | 3-tier routing, caching, token monitoring | Backend |
| R5 | Hatchet self-hosting instability | Low | High | CloudAMQP managed RabbitMQ, health monitoring, consider Hatchet Cloud if issues persist | DevOps |
| R6 | Fly Machine cold start latency (3-8s) | Medium | Medium | Pre-warm pool of 1-2 standby machines during peak hours; route latency-sensitive jobs to Tier 1 (always-on EC2) | Infra |
| R7 | CAPTCHA detection false positives | Medium | Low | Confidence threshold, human confirmation for ambiguous cases | Backend |
| R8 | Cross-tier consistency | Medium | High | Unified result schema, shared Hatchet post-processing step, `SandboxRouter` enforces interface contract | Full Stack |
| R9 | EC2 pool cost at low utilization | Medium | Medium | Start with 1 instance, scale based on demand; reserved instances for cost. Route to Tier 3 when Tier 1 not required | Infra |
| R10 | WebSocket reliability (long-running VNC sessions) | Medium | Medium | Heartbeat, auto-reconnect, sequence numbers, server-side buffering | Full Stack |
| R11 | Multi-tier operational complexity | Medium | Medium | Centralized monitoring dashboard, per-tier runbooks, `SandboxRouter` handles fallback automatically | DevOps |

---

## Team & Responsibilities

| Role | Scope |
|------|-------|
| Backend Engineer | Phases 1-3: Sandbox tier implementations (Fly Machines, Browserbase, EC2), Hatchet workflows, SandboxRouter |
| Infrastructure Engineer | Phases 0, 1, 3, 4: CI/CD, Fly.io, Terraform/Ansible EC2 pool, cross-tier monitoring |
| Frontend Engineer | Phase 3: noVNC viewer, CAPTCHA/copilot review UI. Phase 5: billing UI, usage dashboard |
| Full Stack | Phase 4-5: Cross-tier hardening, integration testing, pricing/billing, launch |

> **Note**: For a solo developer or small team, work phases sequentially following the critical path. Phase 1 (Tier 3 MVP) ships the fastest path to value. Phases 2 and 3 (Tier 2 and Tier 1) can overlap once the `SandboxRouter` interface is defined.

---

## Success Criteria

- [ ] **4-tier sandbox supporting 100+ concurrent users** across all tiers
- [ ] User uploads resume, selects job boards, clicks "Apply"
- [ ] `SandboxRouter` automatically selects optimal tier per job (stealth, cost, platform)
- [ ] Tier 3 (Fly Machines + Camoufox): ephemeral browser automation for standard job boards
- [ ] Tier 2 (Browserbase + Stagehand): AI-native form filling for Greenhouse/Lever
- [ ] Tier 1 (EC2 + AdsPower): highest-stealth automation for LinkedIn/Workday with VNC for CAPTCHA
- [ ] Tier 4 (API-Direct): zero-browser applications where APIs available
- [ ] When CAPTCHA appears, user gets notification and VNC access to solve it (Tier 1)
- [ ] Bot resumes after human intervention, completes application
- [ ] Dashboard shows progress, screenshots, and success/failure status
- [ ] Automatic tier fallback on failure (e.g., Tier 3 fail → retry on Tier 2)
- [ ] **75%+ gross margin** on per-application pricing
- [ ] **Break-even at 35 users** on monthly subscription model
- [ ] Cost per application: < $0.15 (LLM + compute) on Tier 3/4, < $0.30 on Tier 1/2
