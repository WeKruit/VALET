# Sandbox Management System Requirements

> Last updated: 2026-02-14
> Author: Requirements Analyst, sandbox-validation team

---

## 1. Executive Summary

### Purpose

The Sandbox Management System provides centralized management of EC2-based browser automation instances ("sandboxes") for the Valet job application platform. Each sandbox runs AdsPower (anti-detect browser) + Stagehand (AI-powered automation) on Ubuntu 22.04, orchestrated by Hatchet workflow engine. The system enables admins to provision, monitor, deploy to, and terminate EC2 instances through a unified API and web interface.

### Key Stakeholders

| Stakeholder | Role | Primary Concern |
|-------------|------|-----------------|
| Platform Admin | Manages fleet lifecycle | Operational visibility, cost control |
| Developer | Builds & debugs workflows | Fast iteration, reliable local testing |
| Operator (DevOps) | Responds to incidents, scales fleet | Runbooks, alerting, automated recovery |
| End User | Submits job applications | Reliable, fast task execution |

### Success Criteria

1. Admin can manage full sandbox lifecycle (create, monitor, update, terminate) via UI and API
2. Health monitoring detects and reports degraded/unhealthy sandboxes within 5 minutes
3. CI/CD pipeline deploys worker code to all active sandboxes in parallel with rollback
4. System scales to 50 sandboxes without architectural changes
5. Monthly cost for a 5-sandbox fleet stays under $300 (on-demand) or $150 (mixed spot)

---

## 2. Functional Requirements

### FR-1: Sandbox CRUD Operations

**Requirement:** Admin users must be able to create, read, update, and delete EC2 sandbox instances through both API and web UI.

**Acceptance Criteria:**
- [x] Admin can create (register) a sandbox via API (`POST /api/v1/admin/sandboxes`)
- [x] Admin can create a sandbox via UI modal (SandboxForm component)
- [x] Admin can list all sandboxes with pagination, filtering, and sorting
- [x] Admin can view sandbox details (dedicated detail page)
- [x] Admin can update sandbox configuration (`PATCH /api/v1/admin/sandboxes/:id`)
- [x] Admin can soft-delete sandbox (sets status=terminated) via API and UI
- [ ] Non-admin users cannot access these features (RBAC not yet enforced -- see FR-6)

**Implementation Status:** :warning: Partial (CRUD complete, RBAC missing)

**Test Coverage:** 0% unit, 0% integration, 0% E2E (no tests written yet)

**Implementation Locations:**
- Schema: `packages/db/src/schema/sandboxes.ts`
- Zod schemas: `packages/shared/src/schemas/sandbox.schema.ts`
- Contract: `packages/contracts/src/sandbox.ts`
- Repository: `apps/api/src/modules/sandboxes/sandbox.repository.ts`
- Service: `apps/api/src/modules/sandboxes/sandbox.service.ts`
- Routes: `apps/api/src/modules/sandboxes/sandbox.routes.ts`
- Error classes: `apps/api/src/modules/sandboxes/sandbox.errors.ts`
- Frontend list: `apps/web/src/features/admin/pages/sandboxes-page.tsx`
- Frontend detail: `apps/web/src/features/admin/pages/sandbox-detail-page.tsx`
- Frontend form: `apps/web/src/features/admin/components/sandbox-form.tsx`
- Frontend hooks: `apps/web/src/features/admin/hooks/use-sandboxes.ts`
- Seed script: `packages/db/src/seed-sandboxes.ts`

**Notes:**
- Sandbox entity includes: id, name, environment (dev/staging/prod), instanceId, instanceType, publicIp, privateIp, status, healthStatus, capacity, currentLoad, sshKeyName, novncUrl, adspowerVersion, tags
- Status enum: provisioning, active, stopping, stopped, terminated, unhealthy
- Health status enum: healthy, degraded, unhealthy
- Duplicate instance ID prevention via unique constraint + service-level check
- DB indexes on: environment, status, health_status, (environment, status) composite

---

### FR-2: Health Monitoring

**Requirement:** System must continuously monitor sandbox health and provide on-demand health checks with degraded/unhealthy detection.

**Acceptance Criteria:**
- [x] Automated health checks run every 5 minutes for all active sandboxes
- [x] On-demand health check via API (`POST /api/v1/admin/sandboxes/:id/health-check`)
- [x] Health check contacts worker health endpoint (`http://{ip}:8000/health`)
- [x] Health status distinguishes healthy, degraded (AdsPower down or Hatchet disconnected), unhealthy (unreachable)
- [x] Health check results update the sandbox record (healthStatus + lastHealthCheckAt)
- [x] Health check button in UI (both list and detail page)
- [x] Worker exposes health endpoint with CPU, memory, AdsPower status, Hatchet connection, active profiles
- [ ] Alerting when sandbox goes unhealthy (no notification system connected)
- [ ] Health history/timeline (only latest status stored)

**Implementation Status:** :warning: Partial (core monitoring works, no alerting)

**Test Coverage:** 0% (no tests)

**Implementation Locations:**
- Health monitor: `apps/api/src/modules/sandboxes/sandbox-health-monitor.ts`
- Health check logic: `apps/api/src/modules/sandboxes/sandbox.service.ts` (healthCheck, checkAllSandboxes methods)
- Worker health server: `apps/worker/src/health-server.ts`
- Health script: `infra/scripts/health-check.sh`
- Auto-start: `apps/api/src/app.ts` (onReady/onClose hooks)

**Notes:**
- SandboxHealthMonitor runs on a 5-minute interval, started when API server is ready
- Health check timeout: 3 seconds
- Batch `checkAllSandboxes` iterates sequentially (not parallel) over active sandboxes
- Worker health server reports: CPU %, memory MB, disk (stub -- null), active profiles count, AdsPower status, Hatchet connection, uptime
- Health check script (`health-check.sh`) checks 10 aspects: SSH, Xvfb, x11vnc, noVNC, AdsPower API, worker service, Node.js version, disk, memory, uptime

---

### FR-3: Secrets Management

**Requirement:** System must provide secure storage, retrieval, and rotation of secrets (SSH keys, API tokens, environment variables) for EC2 sandboxes.

**Acceptance Criteria:**
- [ ] Secrets stored encrypted at rest in database
- [ ] API endpoints for CRUD on sandbox secrets (admin only)
- [ ] Secrets listed by type only (values never exposed in list)
- [ ] Secret rotation (update value) with audit trail
- [ ] Secrets sync workflow pushes .env to sandboxes via SSH

**Implementation Status:** :warning: Partial

**What exists:**
- `secrets-sync.yml` workflow: manually triggered, writes `SANDBOX_WORKER_ENV` secret to `/opt/valet/.env` on each sandbox via SSH, restarts worker
- `infra/scripts/set-secrets.sh`: interactive script to set secrets on a single instance
- `.env` template created by `deploy-worker.sh` with all required environment variables

**What is missing:**
- No `sandbox_secrets` database table
- No secrets service or API endpoints
- No encryption at rest for individual secrets
- No secret rotation tracking
- No UI for secrets management
- Currently relies on GitHub Actions environment secrets + manual SSH

**Implementation Locations:**
- Secrets sync: `.github/workflows/secrets-sync.yml`
- Set secrets script: `infra/scripts/set-secrets.sh`
- Env template: `infra/scripts/deploy-worker.sh` (embedded)
- Best practices doc: `core-docs/architecture/06-sandbox-fleet-best-practices.md` (Section 1)

---

### FR-4: Browser Configuration (Chromium vs AdsPower)

**Requirement:** System must support configurable browser engines (AdsPower anti-detect browser and standard Chromium) per sandbox.

**Acceptance Criteria:**
- [ ] `browser_engine` enum (chromium, adspower) added to sandboxes table
- [ ] `browser_config` jsonb column for engine-specific configuration
- [ ] API validates browser config structure based on selected engine
- [ ] Worker detects which browser engine to use from sandbox record or env var
- [ ] Job workflow selects appropriate engine (StagehandEngine vs AdsPowerEngine)
- [ ] Browser engine info included in health check response

**Implementation Status:** :x: Missing (database and API changes not implemented)

**What exists (partial infrastructure):**
- Worker has AdsPower integration: `apps/worker/src/providers/adspower-ec2.ts`
- Worker has Browserbase integration: `apps/worker/src/providers/browserbase.ts`
- Worker has provider index: `apps/worker/src/providers/index.ts`
- Sandbox controller: `apps/worker/src/services/sandbox-controller.ts`
- Architecture reference: `core-docs/architecture/04-browser-engines-reference.md`
- Type definitions: `packages/shared/src/types/sandbox.ts` (EngineType, ISandboxProvider, IBrowserEngine interfaces)

**What is missing:**
- No `browser_engine` column in sandboxes schema
- No `browser_config` jsonb column
- No Zod schemas for browser configuration
- No API validation for browser config
- No BROWSER_ENGINE env var check in worker main
- No engine selection in job-application-v2 workflow based on sandbox record

---

### FR-5: CI/CD Automation

**Requirement:** GitHub Actions workflows must automate code deployment and secrets management across the sandbox fleet.

**Acceptance Criteria:**
- [x] Worker code deployed to all sandboxes on push to staging/main
- [x] Matrix strategy deploys to multiple sandboxes in parallel
- [x] Health check with retry after deployment
- [x] Automatic rollback on health check failure
- [x] Manual workflow dispatch for targeted deployment (specific IPs)
- [x] Secrets sync workflow pushes .env to sandboxes
- [x] Backward compatible with legacy single-instance secrets
- [x] Per-instance concurrency prevents overlapping deploys
- [x] Build once, deploy many (artifact upload/download)
- [ ] Provisioning workflow to create new EC2 instances (Terraform + GitHub Actions)
- [ ] Termination workflow to destroy EC2 instances + update API
- [ ] Dynamic sandbox discovery from API (currently uses static SANDBOX_IPS secret)

**Implementation Status:** :warning: Partial (deploy + secrets sync complete, provisioning/termination missing)

**Test Coverage:** N/A (infrastructure workflows)

**Implementation Locations:**
- Code deploy: `.github/workflows/cd-ec2.yml`
- Secrets sync: `.github/workflows/secrets-sync.yml`
- Deploy script: `infra/scripts/deploy-worker.sh`
- Health check script: `infra/scripts/health-check.sh`
- Set secrets script: `infra/scripts/set-secrets.sh`
- Install AdsPower: `infra/scripts/install-adspower.sh`
- Terraform config: `infra/terraform/main.tf`, `variables.tf`, `outputs.tf`, `cloud-init.yaml`

**Notes:**
- `cd-ec2.yml`: Builds tarball, uploads as artifact, deploys via SSH/SCP to each IP in matrix, verifies health, rolls back on failure
- `secrets-sync.yml`: Manual trigger, writes full .env contents via SSH, restarts worker
- Deploy script has: `--skip-build`, `--rollback-on-failure` flags, backup/restore logic
- Terraform provisions: EC2 instances (count-based), security group, elastic IPs, using default VPC

---

### FR-6: Admin Access Control

**Requirement:** Sandbox management features must be restricted to admin and superadmin users only.

**Acceptance Criteria:**
- [x] User role enum exists in database (user, admin, superadmin)
- [x] Role column added to users table with default 'user'
- [ ] Admin middleware checks user role on sandbox routes
- [ ] Non-admin users receive 403 Forbidden
- [ ] Role included in JWT payload
- [ ] Role included in user response schemas
- [ ] Frontend guard redirects non-admin users from /admin routes
- [ ] Admin seed script to create test admin user

**Implementation Status:** :warning: Partial (DB schema exists, middleware not wired)

**What exists:**
- `packages/db/src/schema/users.ts`: `userRoleEnum` with ["user", "admin", "superadmin"], `role` column with default "user"
- `packages/db/src/schema/audit-trail.ts`: audit_trail table (userId, action, details, createdAt)

**What is missing:**
- No admin middleware (`apps/api/src/middleware/admin.middleware.ts`)
- Sandbox routes do not check user role -- any authenticated user can access admin endpoints
- No role in JWT payload or auth response
- No frontend admin guard component
- No admin seed script
- Audit trail table exists but is not used by sandbox routes

---

### FR-7: noVNC Monitoring (Live View)

**Requirement:** Admins must be able to view live browser sessions via noVNC embedded in the web UI.

**Acceptance Criteria:**
- [x] Sandbox detail page shows noVNC iframe when novncUrl is set
- [x] LiveView component with toggle visibility
- [x] noVNC URL stored per sandbox in database
- [x] External link to open VNC in new tab
- [ ] noVNC proxied through API with authentication (currently direct IP access)
- [ ] Task-level live view (route to specific worker by task assignment)

**Implementation Status:** :warning: Partial (basic iframe works, no auth proxy)

**Implementation Locations:**
- Live view component: `apps/web/src/features/tasks/components/live-view.tsx`
- Detail page integration: `apps/web/src/features/admin/pages/sandbox-detail-page.tsx`
- noVNC port exposed: `infra/terraform/main.tf` (port 6080 in security group)

**Notes:**
- noVNC accessible to anyone who knows the IP (security concern for production)
- No authentication on noVNC connection
- Architecture doc recommends proxying through API with auth

---

### FR-8: Real-Time Metrics

**Requirement:** System must provide real-time system metrics (CPU, memory, disk, active profiles) for each sandbox.

**Acceptance Criteria:**
- [x] Metrics API endpoint (`GET /api/v1/admin/sandboxes/:id/metrics`)
- [x] Worker health server reports CPU, memory, active profiles, AdsPower status, Hatchet connection
- [x] Frontend displays metrics with progress bars and color coding
- [x] Metrics auto-refresh every 15 seconds on detail page
- [ ] Disk metrics (currently null -- not implemented in worker)
- [ ] Historical metrics storage (only real-time snapshot)
- [ ] Fleet-wide metrics dashboard

**Implementation Status:** :warning: Partial (real-time metrics work, no disk or history)

**Implementation Locations:**
- Metrics endpoint: `apps/api/src/modules/sandboxes/sandbox.service.ts` (getMetrics)
- Metrics response schema: `packages/shared/src/schemas/sandbox.schema.ts` (sandboxMetricsResponse)
- Worker health server: `apps/worker/src/health-server.ts`
- Frontend metrics display: `apps/web/src/features/admin/pages/sandbox-detail-page.tsx` (MetricCard)

---

### FR-9: AdsPower Service Management

**Requirement:** Admins must be able to restart the AdsPower service on a sandbox remotely.

**Acceptance Criteria:**
- [x] Restart API endpoint (`POST /api/v1/admin/sandboxes/:id/restart`)
- [x] Worker health server accepts restart signal (`POST /restart-adspower`)
- [x] Frontend restart button on sandbox detail page
- [ ] Actual AdsPower restart logic (currently a stub that returns success)

**Implementation Status:** :warning: Partial (API chain works, restart is a stub)

**Implementation Locations:**
- Service: `apps/api/src/modules/sandboxes/sandbox.service.ts` (restartAdspower)
- Worker: `apps/worker/src/health-server.ts` (POST /restart-adspower handler)
- UI: `apps/web/src/features/admin/pages/sandbox-detail-page.tsx` (handleRestart)

---

## 3. Non-Functional Requirements

### NFR-1: Performance

**Requirement:** System must handle 20 concurrent browser sessions on a single sandbox without degradation.

**Acceptance Criteria:**
- [ ] Single t3.large sandbox (8 GB) handles 20 concurrent browsers
- [ ] API response time < 200ms for P95
- [ ] Database queries < 50ms for P95
- [ ] Health checks complete in < 5s (current timeout: 3s)
- [ ] No memory leaks during sustained load

**Metrics:** Not yet measured (performance testing task #6 in progress)

**Estimated capacity (from documentation):**
- t3.medium (4 GB): 2-3 concurrent browsers
- t3.large (8 GB): 4-5 concurrent browsers
- t3.xlarge (16 GB): 8-10 concurrent browsers
- Formula: max_browsers = (total_RAM - 800 MB) / 500 MB (CPU-limited below formula)

**Implementation Status:** :x: Not validated

---

### NFR-2: Scalability

**Requirement:** System architecture must support up to 50 EC2 sandboxes without major refactoring.

**Acceptance Criteria:**
- [x] Database schema supports unlimited sandboxes with proper indexing
- [x] CI/CD pipeline uses matrix strategy for parallel deployment (max 5 concurrent)
- [x] Health monitor iterates over all active sandboxes
- [ ] Health monitor checks sandboxes in parallel (currently sequential)
- [ ] ASG-based auto-scaling (currently manual Terraform `count`)
- [ ] Worker labels for capacity-based task routing in Hatchet

**Implementation Status:** :warning: Partial (DB and CI/CD scale, monitoring is sequential)

---

### NFR-3: Availability

**Requirement:** System must achieve 99.9% uptime for the sandbox management API.

**Acceptance Criteria:**
- [x] API deployed on Fly.io with auto-restart
- [x] Health monitor auto-starts/stops with API lifecycle
- [x] Worker has systemd Restart=always
- [ ] Multi-region or multi-AZ deployment for API
- [ ] Graceful worker draining on spot interruption
- [ ] Automatic sandbox replacement on failure

**Implementation Status:** :warning: Partial

---

### NFR-4: Security

**Requirement:** System must enforce authentication, authorization, encryption, and audit logging for all admin operations.

**Acceptance Criteria:**
- [x] All API endpoints behind authentication middleware
- [x] Database supports user roles (user/admin/superadmin)
- [x] EBS volumes encrypted at rest (Terraform: `encrypted = true`)
- [x] Audit trail table exists in database
- [ ] Admin middleware enforces role checks on sandbox routes
- [ ] Audit trail populated on sandbox CRUD operations
- [ ] noVNC proxied through authenticated API
- [ ] SSH replaced with SSM Session Manager
- [ ] IMDSv2 required on instances
- [ ] Secrets stored in SSM Parameter Store (currently .env files via SSH)

**Implementation Status:** :warning: Partial (infrastructure exists, enforcement missing)

---

### NFR-5: Maintainability

**Requirement:** Codebase must be well-documented, typed, and follow established patterns.

**Acceptance Criteria:**
- [x] TypeScript strict mode with Zod schemas as source of truth
- [x] Types derived via z.infer (never hand-written)
- [x] ts-rest contracts define API surface
- [x] Architecture documentation exists (11 docs in core-docs/architecture/)
- [x] Deployment guide with step-by-step instructions
- [x] Infrastructure as code (Terraform)
- [x] Scripts for common operations (deploy, health check, set secrets, install AdsPower)
- [ ] API reference documentation (Swagger exists but may not cover admin endpoints)
- [ ] Runbooks for incident response

**Implementation Status:** :warning: Partial (good code quality, missing runbooks)

---

## 4. Security Requirements

### SEC-1: Role-Based Access Control (RBAC)

**Status:** :warning: Partial

- Database has `user_role` enum and `role` column on users table
- No middleware enforcement on sandbox routes
- Any authenticated user can currently access all admin endpoints

### SEC-2: Secrets Encryption

**Status:** :warning: Partial

- EBS encrypted at rest
- `.env` files have `chmod 600` permissions
- No application-level encryption for secrets in database
- Secrets transferred via SSH (encrypted in transit)

### SEC-3: Audit Trail

**Status:** :warning: Partial

- `audit_trail` table exists with userId, action, details columns
- Indexes on userId and action
- NOT currently populated by any sandbox operations

### SEC-4: No Secrets in Logs

**Status:** :white_check_mark: Implemented

- Worker health server does not log secrets
- Service layer does not log request bodies containing secrets
- `chmod 600` on .env files prevents world-readable access

### SEC-5: HTTPS/TLS

**Status:** :warning: Partial

- API on Fly.io uses HTTPS automatically
- Hatchet gRPC uses TLS
- noVNC on port 6080 is HTTP (not encrypted)
- Health check endpoint on port 8000 is HTTP

---

## 5. Scalability Requirements

### SCALE-1: Support 50 EC2 Sandboxes

**Status:** :warning: Partial

- Database schema supports it (proper indexes)
- CI/CD pipeline supports matrix deployment (max 5 parallel)
- Health monitor would need parallel checks for 50 sandboxes
- Terraform uses `count` variable (scales to N)

### SCALE-2: Support 100 Concurrent Tasks

**Status:** :x: Not validated

- Depends on number of sandboxes and per-sandbox capacity
- Hatchet handles task distribution
- No load testing performed yet

### SCALE-3: Handle 1000 API Requests/Minute

**Status:** :x: Not validated

- Fastify is capable but no load testing done
- Rate limiting configured globally
- Database connection pooling via Supabase transaction pooler

### SCALE-4: Database Scales to 10k Records

**Status:** :white_check_mark: Likely sufficient

- Indexes on key filter columns (environment, status, health_status)
- Composite index on (environment, status)
- Pagination built into list API
- Supabase Pro plan with 200 max connections

### SCALE-5: Health Monitoring Scales to 50 Sandboxes

**Status:** :warning: Needs improvement

- Sequential health checks with 3s timeout each = 150s worst case for 50 sandboxes
- 5-minute interval gives enough headroom but barely
- Recommendation: parallelize health checks (Promise.all with concurrency limit)

---

## 6. Cost Requirements

### COST-1: Monthly Cost for 5 Sandboxes

**Estimated:**
- 5x t3.large on-demand: ~$300/month
- 1 OD + 4 Spot (mixed fleet): ~$150/month
- All Spot: ~$90/month

### COST-2: Cost Per Task Execution

**Status:** :x: Not calculated (depends on task duration, concurrent tasks, instance type)

### COST-3: 50-60% Savings with Spot Instances

**Status:** :white_check_mark: Documented in architecture

- Mixed fleet approach documented in `core-docs/architecture/06-sandbox-fleet-best-practices.md`
- Spot interruption handler pattern documented
- Terraform ASG configuration example provided

### COST-4: Cost Monitoring and Alerts

**Status:** :x: Not implemented

- No AWS Cost Explorer alerts configured
- No CloudWatch billing alarms
- No cost allocation tags beyond Project/Environment

---

## 7. User Personas

### Admin User
- **Needs:** Manage fleet, monitor health, rotate secrets, provision new sandboxes
- **Pain Points:** Manual provisioning via Terraform CLI, no centralized secret management, no alerting for unhealthy sandboxes
- **Goals:** Automate operations, reduce downtime, optimize costs
- **Current workflow:** Terraform apply -> deploy-worker.sh -> set-secrets.sh -> register in API

### Developer
- **Needs:** Test locally, debug workflows, understand browser automation behavior
- **Pain Points:** AdsPower requires GUI login via noVNC, complex multi-service setup, stale dist files cause phantom errors
- **Goals:** Fast iteration, reliable local testing, clear error messages
- **Current workflow:** SSH to EC2 -> watch noVNC -> check worker logs

### Operator (DevOps)
- **Needs:** Respond to failures, scale fleet, deploy updates, sync secrets
- **Pain Points:** No alerting (must check dashboard manually), no runbooks, rollback is manual
- **Goals:** Fast incident resolution, zero-downtime deploys, automated recovery
- **Current workflow:** GitHub Actions dispatch -> monitor workflow run -> SSH for troubleshooting

---

## 8. User Flows

### Flow 1: Register New Sandbox

1. Admin provisions EC2 via Terraform (`terraform apply` with `instance_count`)
2. Admin runs `deploy-worker.sh <ip>` to bootstrap instance
3. Admin runs `set-secrets.sh <ip>` to configure environment
4. Admin opens noVNC (`http://<ip>:6080/vnc.html`) to activate AdsPower
5. Admin navigates to Admin > Sandboxes in web UI
6. Admin clicks "Register Sandbox"
7. Admin fills form: name, instance ID, environment, instance type, capacity, noVNC URL
8. Submit -> POST /api/v1/admin/sandboxes -> sandbox appears in list
9. Admin clicks "Health Check" -> status updates to healthy/degraded/unhealthy
10. Admin adds IP to SANDBOX_IPS GitHub secret for CI/CD

**Gap:** Steps 1-4 are manual. No automated provisioning workflow connects Terraform to API registration.

### Flow 2: Monitor Sandbox Health

1. Health monitor runs automatically every 5 minutes
2. For each active sandbox: GET http://{ip}:8000/health
3. Parse response: check AdsPower status, Hatchet connection
4. Update sandbox healthStatus and lastHealthCheckAt
5. Log summary: X healthy, Y degraded, Z unhealthy

**OR (on-demand):**
1. Admin clicks "Health Check" button on sandbox list or detail page
2. POST /api/v1/admin/sandboxes/:id/health-check
3. Result displayed via toast notification
4. Sandbox list auto-refreshes (30s refetch interval)

**Gap:** No alerting when sandbox goes unhealthy. Admin must check dashboard manually.

### Flow 3: Deploy Worker Update

1. Developer pushes to `staging` or `main` branch
2. `cd-ec2.yml` workflow triggers on path match (apps/worker/**, packages/**)
3. Build job: checkout, install deps, build all packages, create tarball, upload artifact
4. Deploy job (per sandbox): download artifact, SCP to EC2, backup current, extract, install deps, restart service
5. Health check with 3 retries (10s, 20s, 40s backoff)
6. On failure: automatic rollback from backup
7. Summary step reports results

**Gap:** No pre-deploy API status update, no post-deploy API health status update.

### Flow 4: Sync Secrets

1. Admin triggers `secrets-sync.yml` workflow manually
2. Select environment (staging/production) and optionally specific IPs
3. Workflow writes SANDBOX_WORKER_ENV secret to /opt/valet/.env on each sandbox
4. Restarts valet-worker service
5. Verifies service health

**Gap:** No audit trail of when secrets were synced. No rollback if new secrets break the worker.

---

## 9. Gap Analysis

### P0: Critical -- Blocks Production Safety

| # | Gap | Impact | Recommendation |
|---|-----|--------|----------------|
| 1 | **No admin middleware on sandbox routes** | Any authenticated user can access admin endpoints, create/delete sandboxes | Implement `adminOnly` middleware, apply to all sandbox routes |
| 2 | **No audit trail for admin actions** | Audit trail table exists but is not populated; no record of who created/deleted sandboxes | Add audit logging to sandbox service CRUD methods |
| 3 | **noVNC accessible without authentication** | Anyone who knows the IP can view live browser sessions | Proxy noVNC through API with auth, or restrict port 6080 to VPN/internal IPs |

### P1: Important -- Should Have for Production

| # | Gap | Impact | Recommendation |
|---|-----|--------|----------------|
| 4 | **No secrets management API** | Secrets managed via SSH scripts and GitHub Actions; no centralized view or rotation | Implement sandbox_secrets table, encrypted storage, API endpoints |
| 5 | **No browser engine configuration** | All sandboxes assumed to run AdsPower; no Chromium fallback | Add browser_engine and browser_config columns, validate in API |
| 6 | **No alerting for unhealthy sandboxes** | Admin must manually check dashboard; outages go unnoticed | Integrate with Slack/email for health status changes |
| 7 | **No automated provisioning workflow** | EC2 provisioning requires manual Terraform + script execution | Create provision-sandbox.yml workflow combining Terraform + API registration |
| 8 | **No automated termination workflow** | Termination requires manual Terraform destroy + API update | Create terminate-sandbox.yml workflow |
| 9 | **AdsPower restart is a stub** | Restart button sends signal but worker does not actually restart AdsPower | Implement systemctl restart adspower via SSH or SSM |
| 10 | **Health checks are sequential** | 50 sandboxes * 3s timeout = 150s per cycle | Parallelize with concurrency limit (e.g., Promise.allSettled with p-limit) |
| 11 | **No role in JWT or auth response** | Frontend cannot determine user role for admin guard | Include role in JWT claims and auth response schema |

### P2: Nice to Have -- Backlog

| # | Gap | Impact | Recommendation |
|---|-----|--------|----------------|
| 12 | **No disk metrics** | Worker health server returns null for disk usage | Implement disk usage collection (e.g., `statvfs`) |
| 13 | **No historical metrics** | Only current snapshot available; no trend analysis | Store metrics in time-series (CloudWatch custom metrics or DB) |
| 14 | **No fleet-wide dashboard** | No aggregate view of fleet health, total capacity, cost | Add dashboard page with fleet summary cards |
| 15 | **No cost monitoring** | No AWS Cost Explorer alerts or billing alarms | Configure CloudWatch billing alarms, add cost estimates to UI |
| 16 | **No SSH -> SSM migration** | Still using PEM files for SSH access | Migrate to SSM Session Manager, close port 22 |
| 17 | **No IMDSv2 enforcement** | Instance metadata accessible without session tokens | Add metadata_options to Terraform launch template |
| 18 | **No spot instance support** | All instances on-demand | Implement mixed fleet with ASG and spot interruption handler |
| 19 | **No backup/disaster recovery** | No AMI snapshots, no data backup | Create Golden AMI pipeline, schedule EBS snapshots |
| 20 | **No load testing** | System capacity unknown | Run load tests with k6 or Artillery on admin API + worker |
| 21 | **No E2E tests** | No automated UI testing | Create Playwright test suite for admin sandbox management |
| 22 | **No integration tests** | No automated API testing | Create integration tests for sandbox CRUD + health check |
| 23 | **Dynamic sandbox discovery** | CI/CD uses static SANDBOX_IPS secret | Query API for active sandboxes in deploy workflow |

---

## 10. Requirements Traceability Matrix

| Requirement | Implementation Files | Test Files | Status |
|-------------|---------------------|------------|--------|
| FR-1: CRUD | sandbox.{routes,service,repository}.ts, sandboxes-page.tsx, sandbox-detail-page.tsx, sandbox-form.tsx | None | :warning: Partial |
| FR-2: Health Monitoring | sandbox-health-monitor.ts, sandbox.service.ts (healthCheck), health-server.ts, health-check.sh | None | :warning: Partial |
| FR-3: Secrets Management | secrets-sync.yml, set-secrets.sh, deploy-worker.sh | None | :warning: Partial |
| FR-4: Browser Config | adspower-ec2.ts, browserbase.ts, sandbox-controller.ts | None | :x: Missing |
| FR-5: CI/CD | cd-ec2.yml, secrets-sync.yml, deploy-worker.sh, health-check.sh | None | :warning: Partial |
| FR-6: Admin Access | users.ts (role column), audit-trail.ts | None | :warning: Partial |
| FR-7: noVNC | live-view.tsx, sandbox-detail-page.tsx | None | :warning: Partial |
| FR-8: Metrics | sandbox.service.ts (getMetrics), health-server.ts, sandbox-detail-page.tsx | None | :warning: Partial |
| FR-9: Restart | sandbox.service.ts (restartAdspower), health-server.ts | None | :warning: Partial |
| NFR-1: Performance | N/A | None | :x: Not validated |
| NFR-2: Scalability | sandboxes.ts (indexes), cd-ec2.yml (matrix) | None | :warning: Partial |
| NFR-3: Availability | Fly.io deployment, systemd Restart=always | None | :warning: Partial |
| NFR-4: Security | auth middleware, EBS encryption, user roles | None | :warning: Partial |
| NFR-5: Maintainability | TypeScript strict, Zod, ts-rest, Drizzle, docs | None | :warning: Partial |
| SEC-1: RBAC | userRoleEnum, role column | None | :warning: Partial |
| SEC-2: Secrets Encryption | EBS encryption, chmod 600 | None | :warning: Partial |
| SEC-3: Audit Trail | audit_trail table | None | :warning: Partial |
| SEC-4: No Secrets in Logs | Code review | None | :white_check_mark: Implemented |
| SEC-5: HTTPS/TLS | Fly.io HTTPS, Hatchet TLS | None | :warning: Partial |

---

## 11. Acceptance Criteria

**System is production-ready when:**

- [ ] **P0-1:** Admin middleware enforces role checks on all sandbox routes
- [ ] **P0-2:** Audit trail populated on all sandbox CRUD operations
- [ ] **P0-3:** noVNC access restricted to authenticated admin users
- [ ] **P1-4:** Secrets management API with encrypted storage
- [ ] **P1-5:** Browser engine configuration (chromium/adspower) per sandbox
- [ ] **P1-6:** Alerting for unhealthy sandboxes (Slack or email)
- [ ] **P1-7:** Automated provisioning workflow (GitHub Actions + Terraform)
- [ ] **P1-8:** Automated termination workflow
- [ ] All P0 requirements tested (>80% coverage)
- [ ] Performance benchmarks met (20 concurrent sessions on t3.large)
- [ ] Security audit passed (RBAC, encryption, audit trail)
- [ ] Documentation complete (runbooks, API reference)
- [ ] Cost estimates validated against actual AWS billing
- [ ] Load testing passed (100 req/s for 1 minute on admin API)

---

## 12. Architecture Summary

### Tech Stack

| Layer | Technology |
|-------|------------|
| Database | Supabase Postgres (Drizzle ORM) |
| API | Fastify + ts-rest + awilix DI |
| Frontend | React + Vite + TanStack Router + TanStack Query |
| Worker | Node.js + Hatchet SDK |
| Browser | AdsPower (anti-detect) + Stagehand (AI automation) |
| Infrastructure | Terraform (EC2, SG, EIP) |
| CI/CD | GitHub Actions |
| Hosting | Fly.io (API, Web, Hatchet) + AWS EC2 (Workers) |
| Monitoring | Custom health server + API health monitor |

### Data Flow

```
User -> Web UI -> API (Fly.io) -> Database (Supabase)
                      |
                      v
              Hatchet (Fly.io) -> Worker (EC2)
                                     |
                                     v
                              AdsPower -> Browser
                                     |
                              noVNC (port 6080)
```

### Current Infrastructure

| Resource | Count | Location |
|----------|-------|----------|
| EC2 Instances | 1 (dev) | us-east-1, t3.medium |
| Elastic IPs | 1 | us-east-1 |
| Security Group | 1 | Ports 22, 6080, 8080 open |
| API Server | 1 | Fly.io (valet-api-stg) |
| Web Server | 1 | Fly.io (valet-web-stg) |
| Hatchet | 1 | Fly.io (valet-hatchet-stg) |
| Database | 1 | Supabase Pro |
