# Sandbox Management System - Validation Checklist

> Last updated: 2026-02-14
> Companion document to: [sandbox-management-requirements.md](./sandbox-management-requirements.md)

---

## Legend

- :white_check_mark: Complete -- implemented and working
- :warning: Partial -- partially implemented, needs work
- :x: Missing -- not implemented
- :construction: In progress -- being worked on by team

---

## Functional Requirements

### FR-1: Sandbox CRUD Operations

| # | Criteria | Status | Implementation | Test |
|---|----------|--------|----------------|------|
| 1.1 | Create sandbox via API | :white_check_mark: | `sandbox.service.ts:create` | :x: |
| 1.2 | Create sandbox via UI modal | :white_check_mark: | `sandbox-form.tsx` | :x: |
| 1.3 | List sandboxes with pagination | :white_check_mark: | `sandbox.repository.ts:findMany` | :x: |
| 1.4 | Filter by environment/status/health | :white_check_mark: | `sandbox.repository.ts` (SQL conditions) | :x: |
| 1.5 | Search by name/IP/instanceId | :white_check_mark: | `sandbox.repository.ts` (ilike) | :x: |
| 1.6 | Sort by createdAt/updatedAt/name/status | :white_check_mark: | `sandbox.repository.ts` (sortColumnMap) | :x: |
| 1.7 | View sandbox details | :white_check_mark: | `sandbox-detail-page.tsx` | :x: |
| 1.8 | Update sandbox configuration | :white_check_mark: | `sandbox.service.ts:update` | :x: |
| 1.9 | Soft-delete (terminate) sandbox | :white_check_mark: | `sandbox.service.ts:terminate` | :x: |
| 1.10 | Duplicate instance ID prevention | :white_check_mark: | `sandbox.service.ts:create` + DB unique constraint | :x: |
| 1.11 | Admin-only access (RBAC) | :x: | Not implemented | :x: |

### FR-2: Health Monitoring

| # | Criteria | Status | Implementation | Test |
|---|----------|--------|----------------|------|
| 2.1 | Scheduled health checks (5 min) | :white_check_mark: | `sandbox-health-monitor.ts` | :x: |
| 2.2 | On-demand health check API | :white_check_mark: | `sandbox.service.ts:healthCheck` | :x: |
| 2.3 | Health check contacts worker | :white_check_mark: | Fetches `http://{ip}:8000/health` | :x: |
| 2.4 | Detect healthy/degraded/unhealthy | :white_check_mark: | Checks AdsPower + Hatchet status | :x: |
| 2.5 | Update DB with health status | :white_check_mark: | `sandbox.repository.ts:updateHealthStatus` | :x: |
| 2.6 | Health check UI button | :white_check_mark: | `sandboxes-page.tsx`, `sandbox-detail-page.tsx` | :x: |
| 2.7 | Worker health endpoint | :white_check_mark: | `health-server.ts` (GET /health) | :x: |
| 2.8 | Health check timeout (3s) | :white_check_mark: | `sandbox.service.ts` (AbortController) | :x: |
| 2.9 | Batch check all active sandboxes | :white_check_mark: | `sandbox.service.ts:checkAllSandboxes` | :x: |
| 2.10 | Alerting on unhealthy status | :x: | Not implemented | :x: |

### FR-3: Secrets Management

| # | Criteria | Status | Implementation | Test |
|---|----------|--------|----------------|------|
| 3.1 | Secrets sync via GitHub Actions | :white_check_mark: | `secrets-sync.yml` | :x: |
| 3.2 | Interactive set-secrets script | :white_check_mark: | `infra/scripts/set-secrets.sh` | :x: |
| 3.3 | .env template on first deploy | :white_check_mark: | `deploy-worker.sh` | :x: |
| 3.4 | sandbox_secrets DB table | :x: | Not implemented | :x: |
| 3.5 | Secrets service with encryption | :x: | Not implemented | :x: |
| 3.6 | Secrets API endpoints | :x: | Not implemented | :x: |
| 3.7 | Secret rotation tracking | :x: | Not implemented | :x: |
| 3.8 | Secrets UI in admin panel | :x: | Not implemented | :x: |

### FR-4: Browser Configuration

| # | Criteria | Status | Implementation | Test |
|---|----------|--------|----------------|------|
| 4.1 | browser_engine DB column | :x: | Not implemented | :x: |
| 4.2 | browser_config jsonb column | :x: | Not implemented | :x: |
| 4.3 | Zod schemas for browser config | :x: | Not implemented | :x: |
| 4.4 | API validation for browser config | :x: | Not implemented | :x: |
| 4.5 | Worker engine detection | :x: | Not implemented | :x: |
| 4.6 | Job workflow engine selection | :x: | Not implemented | :x: |

### FR-5: CI/CD Automation

| # | Criteria | Status | Implementation | Test |
|---|----------|--------|----------------|------|
| 5.1 | Auto-deploy on push to staging/main | :white_check_mark: | `cd-ec2.yml` | :x: |
| 5.2 | Matrix strategy (parallel deploy) | :white_check_mark: | `cd-ec2.yml` (max 5 parallel) | :x: |
| 5.3 | Health check with retry | :white_check_mark: | `cd-ec2.yml` (3 retries, exponential backoff) | :x: |
| 5.4 | Automatic rollback on failure | :white_check_mark: | `cd-ec2.yml` (restore from backup) | :x: |
| 5.5 | Manual dispatch (specific IPs) | :white_check_mark: | `cd-ec2.yml` (workflow_dispatch) | :x: |
| 5.6 | Secrets sync workflow | :white_check_mark: | `secrets-sync.yml` | :x: |
| 5.7 | Backward compat (legacy secrets) | :white_check_mark: | `cd-ec2.yml` (EC2_IP_STG/PROD fallback) | :x: |
| 5.8 | Per-instance concurrency | :white_check_mark: | `cd-ec2.yml` (concurrency group per IP) | :x: |
| 5.9 | Provisioning workflow | :x: | Not implemented | :x: |
| 5.10 | Termination workflow | :x: | Not implemented | :x: |
| 5.11 | Dynamic sandbox discovery from API | :x: | Not implemented | :x: |

### FR-6: Admin Access Control

| # | Criteria | Status | Implementation | Test |
|---|----------|--------|----------------|------|
| 6.1 | user_role enum in DB | :white_check_mark: | `users.ts` (user/admin/superadmin) | :x: |
| 6.2 | role column on users table | :white_check_mark: | `users.ts` (default: 'user') | :x: |
| 6.3 | Admin middleware | :construction: | Task #1 (backend-specialist) | :x: |
| 6.4 | Middleware applied to sandbox routes | :construction: | Task #1 | :x: |
| 6.5 | Role in JWT payload | :construction: | Task #1 | :x: |
| 6.6 | Role in auth response | :construction: | Task #1 | :x: |
| 6.7 | Frontend admin guard | :construction: | Task #1 | :x: |
| 6.8 | Admin seed script | :construction: | Task #1 | :x: |

### FR-7: noVNC Monitoring

| # | Criteria | Status | Implementation | Test |
|---|----------|--------|----------------|------|
| 7.1 | noVNC iframe in detail page | :white_check_mark: | `sandbox-detail-page.tsx` + `live-view.tsx` | :x: |
| 7.2 | Toggle visibility | :white_check_mark: | `sandbox-detail-page.tsx` (showLiveView state) | :x: |
| 7.3 | noVNC URL in DB | :white_check_mark: | `sandboxes.ts` (novnc_url column) | :x: |
| 7.4 | External link to VNC | :white_check_mark: | `sandbox-detail-page.tsx` (ExternalLink) | :x: |
| 7.5 | Authenticated noVNC proxy | :x: | Not implemented | :x: |

### FR-8: Real-Time Metrics

| # | Criteria | Status | Implementation | Test |
|---|----------|--------|----------------|------|
| 8.1 | Metrics API endpoint | :white_check_mark: | `sandbox.service.ts:getMetrics` | :x: |
| 8.2 | CPU metrics | :white_check_mark: | `health-server.ts` (os.cpus) | :x: |
| 8.3 | Memory metrics | :white_check_mark: | `health-server.ts` (os.totalmem/freemem) | :x: |
| 8.4 | Disk metrics | :x: | Stub returns null | :x: |
| 8.5 | Active profiles count | :white_check_mark: | `health-server.ts` (getActiveProfiles) | :x: |
| 8.6 | AdsPower status | :white_check_mark: | `health-server.ts` (getAdspowerStatus) | :x: |
| 8.7 | Hatchet connection status | :white_check_mark: | `health-server.ts` (getHatchetConnected) | :x: |
| 8.8 | Frontend metric cards | :white_check_mark: | `sandbox-detail-page.tsx` (MetricCard) | :x: |
| 8.9 | Auto-refresh (15s) | :white_check_mark: | `use-sandboxes.ts` (refetchInterval: 15000) | :x: |

### FR-9: AdsPower Service Management

| # | Criteria | Status | Implementation | Test |
|---|----------|--------|----------------|------|
| 9.1 | Restart API endpoint | :white_check_mark: | `sandbox.service.ts:restartAdspower` | :x: |
| 9.2 | Worker restart handler | :warning: | `health-server.ts` (stub -- returns success without restarting) | :x: |
| 9.3 | Frontend restart button | :white_check_mark: | `sandbox-detail-page.tsx` (handleRestart) | :x: |

---

## Non-Functional Requirements

| # | Requirement | Status | Notes |
|---|-------------|--------|-------|
| NFR-1 | 20 concurrent browser sessions | :x: Not validated | Performance testing task #6 in progress |
| NFR-2 | Scale to 50 sandboxes | :warning: Partial | DB and CI/CD scale; health monitor needs parallelization |
| NFR-3 | 99.9% uptime | :warning: Partial | Single-region, no HA for API |
| NFR-4 | Security (RBAC, encryption, audit) | :warning: Partial | DB schema exists, enforcement missing |
| NFR-5 | Maintainability | :warning: Partial | Good code quality, missing runbooks |

---

## Security Requirements

| # | Requirement | Status | Notes |
|---|-------------|--------|-------|
| SEC-1 | RBAC on sandbox routes | :x: Not enforced | DB has roles, no middleware |
| SEC-2 | Secrets encrypted at rest | :warning: Partial | EBS encrypted, no app-level encryption |
| SEC-3 | Audit trail for admin actions | :warning: Partial | Table exists, not populated |
| SEC-4 | No secrets in logs | :white_check_mark: | Verified in code review |
| SEC-5 | HTTPS/TLS everywhere | :warning: Partial | noVNC and health endpoint are HTTP |

---

## Infrastructure

| # | Check | Status | Notes |
|---|-------|--------|-------|
| INF-1 | Terraform manages EC2 | :white_check_mark: | `infra/terraform/main.tf` |
| INF-2 | EBS encryption enabled | :white_check_mark: | `encrypted = true` in Terraform |
| INF-3 | Security group configured | :white_check_mark: | Ports 22, 6080, 8080 |
| INF-4 | Cloud-init provisioning | :white_check_mark: | `cloud-init.yaml` |
| INF-5 | Elastic IPs assigned | :white_check_mark: | Per-instance EIP |
| INF-6 | IMDSv2 enforced | :x: | Not configured in Terraform |
| INF-7 | SSM Session Manager | :x: | Not implemented (SSH still used) |
| INF-8 | VPC private subnets | :x: | Using default VPC public subnets |
| INF-9 | CloudWatch Agent | :x: | Not installed |
| INF-10 | Golden AMI | :x: | Documented but not created |

---

## Test Coverage Summary

| Area | Unit Tests | Integration Tests | E2E Tests |
|------|-----------|-------------------|-----------|
| Sandbox CRUD API | :x: | :x: | :x: |
| Health Monitoring | :x: | :x: | :x: |
| Secrets Management | :x: | :x: | :x: |
| Browser Configuration | :x: | :x: | :x: |
| Admin Access Control | :x: | :x: | :x: |
| Frontend Sandbox Pages | :x: | N/A | :x: |
| CI/CD Workflows | N/A | N/A | N/A |
| Deploy Scripts | N/A | N/A | :x: |
| Health Check Script | N/A | N/A | :x: |

**Overall Test Coverage: 0%** (no tests exist for sandbox management)

---

## Documentation Status

| Document | Status | Location |
|----------|--------|----------|
| EC2 Fleet Management | :white_check_mark: | `core-docs/architecture/05-ec2-fleet-management.md` |
| Sandbox Fleet Best Practices | :white_check_mark: | `core-docs/architecture/06-sandbox-fleet-best-practices.md` |
| Browser Engines Reference | :white_check_mark: | `core-docs/architecture/04-browser-engines-reference.md` |
| Deployment Guide | :white_check_mark: | `core-docs/architecture/09-deployment-guide.md` |
| Requirements Specification | :white_check_mark: | `core-docs/requirements/sandbox-management-requirements.md` |
| Validation Checklist | :white_check_mark: | `core-docs/requirements/validation-checklist.md` |
| CI/CD Workflows Documentation | :x: | Not created |
| Runbooks (incident response) | :x: | Not created |
| API Reference (admin endpoints) | :x: | Not created |
| Cost Optimization Guide | :construction: | Task #5 (devops-specialist) |

---

## Summary Statistics

| Category | Total | Complete | Partial | Missing |
|----------|-------|----------|---------|---------|
| Functional Requirements | 9 | 0 | 8 | 1 (FR-4) |
| Non-Functional Requirements | 5 | 0 | 4 | 1 (NFR-1) |
| Security Requirements | 5 | 1 | 3 | 1 (SEC-1) |
| Individual Criteria | 73 | 38 | 3 | 32 |
| Test Coverage | -- | 0% | -- | 100% |
| Gaps Identified | 23 | -- | -- | -- |
| P0 Gaps (Critical) | 3 | -- | -- | -- |
| P1 Gaps (Important) | 8 | -- | -- | -- |
| P2 Gaps (Backlog) | 12 | -- | -- | -- |
