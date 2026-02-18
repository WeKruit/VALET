# Rollout and Deployment Guide

**Last updated:** 2026-02-18

Operations reference for deploying VALET and GHOST-HANDS across all environments. Every command and config snippet in this document is sourced from the actual CI/CD workflow files, Fly.io toml configs, Dockerfiles, and infrastructure scripts in the repository.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Architecture](#2-architecture)
3. [CI Pipeline](#3-ci-pipeline)
4. [Staging Deployment](#4-staging-deployment)
5. [Production Deployment](#5-production-deployment)
6. [EC2 VALET Worker Deployment](#6-ec2-worker-deployment)
7. [GHOST-HANDS Docker Deployment (on VALET EC2)](#7-ghost-hands-docker-deployment-on-valet-ec2)
8. [Manual Deployment](#8-manual-deployment)
9. [Database Migrations](#9-database-migrations)
10. [Rollback Procedures](#10-rollback-procedures)
11. [Health Checks](#11-health-checks)
12. [Secrets Management](#12-secrets-management)
13. [Sandbox Lifecycle](#13-sandbox-lifecycle)
14. [Known Gaps](#14-known-gaps)

---

## 1. Overview

The system consists of two codebases deployed to two different infrastructure platforms:

| Component       | Codebase       | Platform     | Services                                                               |
| --------------- | -------------- | ------------ | ---------------------------------------------------------------------- |
| **VALET**       | `VALET/`       | Fly.io       | `web` (React SPA on nginx), `api` (Fastify), `worker` (job dispatcher) |
| **GHOST-HANDS** | `GHOST-HANDS/` | EC2 (Docker) | `api` (Hono), `worker` (browser automation)                            |

**Deployment triggers:**

- **Fly.io services** -- push to `staging` branch (selective deploy) or `main` branch (full deploy)
- **EC2 workers** -- push to `staging`/`main` when worker-relevant paths change, or manual `workflow_dispatch`
- **Sandbox provisioning/termination** -- manual `workflow_dispatch` via GitHub Actions

### Workflow files

| Workflow          | File                    | Purpose                                               |
| ----------------- | ----------------------- | ----------------------------------------------------- |
| CI                | `ci.yml`                | Lint, typecheck, test, build, security scan           |
| CD Staging        | `cd-staging.yml`        | Selective deploy to Fly.io staging                    |
| CD Production     | `cd-prod.yml`           | Full deploy to Fly.io production                      |
| Deploy (reusable) | `deploy.yml`            | Shared Fly.io deploy logic (called by staging + prod) |
| EC2 Worker        | `cd-ec2.yml`            | Deploy worker tarball to EC2 sandbox fleet            |
| Provision Sandbox | `provision-sandbox.yml` | Create new EC2 instance via Terraform                 |
| Terminate Sandbox | `terminate-sandbox.yml` | Destroy EC2 instance via Terraform                    |
| Secrets Sync      | `secrets-sync.yml`      | Push `.env` to all EC2 sandboxes                      |

### Branch-to-environment mapping

| Branch    | Environment | Fly.io Apps                                          | EC2 Target           |
| --------- | ----------- | ---------------------------------------------------- | -------------------- |
| `staging` | staging     | `valet-api-stg`, `valet-worker-stg`, `valet-web-stg` | Staging sandboxes    |
| `main`    | production  | `valet-api`, `valet-worker`, `valet-web`             | Production sandboxes |

### Environment URLs

| Env        | API                           | Web                           | Health                                      |
| ---------- | ----------------------------- | ----------------------------- | ------------------------------------------- |
| Staging    | https://valet-api-stg.fly.dev | https://valet-web-stg.fly.dev | https://valet-api-stg.fly.dev/api/v1/health |
| Production | https://valet-api.fly.dev     | https://valet-web.fly.dev     | https://valet-api.fly.dev/api/v1/health     |

---

## 2. Architecture

### VALET on Fly.io

Three independent Fly.io apps, all in the `iad` (us-east-1) region:

| App                  | Fly Config        | Dockerfile               | Internal Port | VM Spec          |
| -------------------- | ----------------- | ------------------------ | ------------- | ---------------- |
| `valet-api[-stg]`    | `fly/api.toml`    | `apps/api/Dockerfile`    | 3000          | shared-1x, 512MB |
| `valet-worker[-stg]` | `fly/worker.toml` | `apps/worker/Dockerfile` | N/A (process) | shared-1x, 1GB   |
| `valet-web[-stg]`    | `fly/web.toml`    | `apps/web/Dockerfile`    | 8080          | shared-1x, 256MB |

**API config** (from `fly/api.toml`):

```toml
primary_region = "iad"
kill_timeout = 30

[build]
  dockerfile = "../apps/api/Dockerfile"
  context = ".."

[deploy]
  release_command = "node packages/db/dist/migrate.js"

[http_service]
  internal_port = 3000
  force_https = true
  auto_stop_machines = "stop"
  auto_start_machines = true
  min_machines_running = 1

  [http_service.concurrency]
    type = "requests"
    hard_limit = 250
    soft_limit = 200

  [[http_service.checks]]
    interval = "15s"
    timeout = "5s"
    grace_period = "10s"
    method = "GET"
    path = "/api/v1/health"

[[vm]]
  memory = "512mb"
  cpu_kind = "shared"
  cpus = 1
```

**Worker config** (from `fly/worker.toml`):

```toml
primary_region = "iad"
kill_timeout = 60

[build]
  dockerfile = "../apps/worker/Dockerfile"
  context = ".."

[processes]
  worker = "node apps/worker/dist/main.js"

# No auto-stop -- workers must stay running to poll for tasks
[[vm]]
  memory = "1gb"
  cpu_kind = "shared"
  cpus = 1
  processes = ["worker"]
```

**Web config** (from `fly/web.toml`):

```toml
primary_region = "iad"
kill_timeout = 10

[build]
  dockerfile = "../apps/web/Dockerfile"
  context = ".."

[http_service]
  internal_port = 8080
  force_https = true
  auto_stop_machines = "stop"
  auto_start_machines = true
  min_machines_running = 1

  [http_service.concurrency]
    type = "requests"
    hard_limit = 500
    soft_limit = 400

  [[http_service.checks]]
    interval = "30s"
    timeout = "5s"
    grace_period = "5s"
    method = "GET"
    path = "/health"

[[vm]]
  memory = "256mb"
  cpu_kind = "shared"
  cpus = 1
```

### Dockerfiles

**API** (`apps/api/Dockerfile`) -- multi-stage Node.js 20 build:

```
builder: pnpm install, turbo build --filter=@valet/api
runtime: node:20-slim + tini, non-root 'valet' user, port 3000
CMD: node apps/api/dist/server.js
```

**Worker** (`apps/worker/Dockerfile`) -- multi-stage Node.js 20 build with browser deps:

```
builder: pnpm install, turbo build --filter=@valet/worker
runtime: node:20-slim + tini + Chromium system libraries, non-root 'valet' user
CMD: node apps/worker/dist/main.js
```

**Web** (`apps/web/Dockerfile`) -- multi-stage build to nginx:

```
builder: pnpm install, Vite build with VITE_API_URL/VITE_WS_URL/VITE_GOOGLE_CLIENT_ID args
runtime: nginx:1.27-alpine, serves static SPA, port 8080
CMD: nginx -g "daemon off;"
```

### GHOST-HANDS on EC2

Each EC2 sandbox instance runs:

| Service        | Runtime           | Port                  | Config                                               |
| -------------- | ----------------- | --------------------- | ---------------------------------------------------- |
| GH API         | Docker (bun)      | 3100 (localhost only) | `docker-compose.prod.yml`                            |
| GH Worker      | Docker (bun)      | 3101 (localhost only) | `docker-compose.prod.yml` or standalone `docker run` |
| Health Server  | Node.js (systemd) | 8000                  | `infra/scripts/health-server.js`                     |
| VALET Worker   | Node.js (systemd) | N/A                   | `/opt/valet/app/apps/worker/dist/main.js`            |
| Xvfb           | systemd           | N/A                   | Virtual display `:99` for headed browser             |
| x11vnc + noVNC | systemd           | 6080                  | Remote desktop access                                |
| AdsPower       | systemd           | 50325                 | Anti-detect browser engine                           |

**GH Docker image** (`GHOST-HANDS/Dockerfile`) -- multi-stage bun build:

```dockerfile
FROM oven/bun:1.2-debian AS deps      # Install dependencies
FROM deps AS build                      # Build TypeScript
FROM oven/bun:1.2-debian AS runtime    # Production: Chromium system libs, Patchright browser
# Same image serves both API and Worker (different CMD)
# API:    bun packages/ghosthands/src/api/server.ts
# Worker: bun packages/ghosthands/src/workers/main.ts
```

**Production compose** (`docker-compose.prod.yml`):

```yaml
services:
  api:
    image: ${ECR_IMAGE:-ghosthands:latest}
    command: ["bun", "packages/ghosthands/src/api/server.ts"]
    ports: ["127.0.0.1:${GH_API_PORT:-3100}:3100"]
    deploy:
      resources:
        limits: { memory: 512m, cpus: "1.0" }
    healthcheck:
      test: ["CMD", "curl", "-sf", "http://localhost:3100/health"]
      interval: 15s
      retries: 3
    restart: unless-stopped

  worker:
    image: ${ECR_IMAGE:-ghosthands:latest}
    command: ["bun", "packages/ghosthands/src/workers/main.ts"]
    ports: ["127.0.0.1:${GH_WORKER_PORT:-3101}:3101"]
    environment:
      - DISPLAY=:99
      - MAX_CONCURRENT_JOBS=${MAX_CONCURRENT_JOBS:-2}
    volumes:
      - /tmp/.X11-unix:/tmp/.X11-unix:rw
    deploy:
      resources:
        limits: { memory: 2g, cpus: "2.0" }
    depends_on:
      api: { condition: service_healthy }
    restart: unless-stopped
```

---

## 3. CI Pipeline

**Workflow:** `.github/workflows/ci.yml`
**Trigger:** Push or PR to `main` or `staging`
**Timeout:** 15 minutes

### What runs on every push/PR

```yaml
steps:
  - pnpm install --frozen-lockfile
  - pnpm turbo lint # ESLint across monorepo
  - pnpm turbo typecheck # TypeScript strict mode
  - pnpm test # Unit tests (with Postgres service container)
  - pnpm turbo build # Full monorepo build
  - pnpm audit --audit-level=high # Security audit (non-blocking warning)
  -  # Frontend secret scan             # Grep apps/web/dist/ for leaked secrets
```

**Postgres test service:**

```yaml
services:
  postgres:
    image: postgres:16
    env:
      POSTGRES_USER: test
      POSTGRES_PASSWORD: test
      POSTGRES_DB: valet_test
    ports: ["5432:5432"]
```

**Frontend secret scan** -- the CI job scans `apps/web/dist/` for these patterns and **fails the build** if any are found:

| Pattern                                  | What it catches               |
| ---------------------------------------- | ----------------------------- |
| `sk-ant-`, `sk-proj-`                    | Anthropic/OpenAI API keys     |
| `sk_live_`, `sk_test_`                   | Stripe keys                   |
| `GOCSPX-`                                | Google OAuth client secret    |
| `eyJhbG`                                 | JWT tokens                    |
| `postgresql://`, `rediss://`, `amqps://` | Connection strings            |
| `AKIA[0-9A-Z]{16}`                       | AWS access key IDs            |
| `ghp_[a-zA-Z0-9]{36}`                    | GitHub personal access tokens |
| `glpat-`                                 | GitLab tokens                 |

**Environment variables for CI:**

```yaml
env:
  TURBO_TOKEN: ${{ secrets.TURBO_TOKEN }} # Turborepo remote cache
  TURBO_TEAM: ${{ vars.TURBO_TEAM }}
  DATABASE_URL: postgresql://test:test@localhost:5432/valet_test # for tests
```

---

## 4. Staging Deployment

**Workflow:** `.github/workflows/cd-staging.yml`
**Trigger:** Push to `staging` branch
**Concurrency:** `deploy-staging` group, `cancel-in-progress: true` (stale deploys are superseded)

### Change detection

Staging uses `dorny/paths-filter` to selectively deploy only affected services:

| Deploy Target | Triggers on changes to                                                                                                             |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **API**       | `apps/api/`, `packages/shared/`, `packages/contracts/`, `packages/db/`, `packages/llm/`, `fly/`, `pnpm-lock.yaml`, `turbo.json`    |
| **Worker**    | `apps/worker/`, `packages/shared/`, `packages/contracts/`, `packages/db/`, `packages/llm/`, `fly/`, `pnpm-lock.yaml`, `turbo.json` |
| **Web**       | `apps/web/`, `packages/shared/`, `packages/contracts/`, `packages/ui/`, `fly/`, `pnpm-lock.yaml`, `turbo.json`                     |

If no deployable changes are detected, the deploy job is skipped entirely. A **Deploy Targets** summary table is written to the GitHub Actions step summary.

### Deploy flow

The staging workflow calls the reusable `.github/workflows/deploy.yml` with these inputs:

```yaml
uses: ./.github/workflows/deploy.yml
with:
  environment: staging
  api-app: valet-api-stg
  worker-app: valet-worker-stg
  web-app: valet-web-stg
  api-url: https://valet-api-stg.fly.dev
  google-client-id: "108153440133-8oorgsj5m7u67fg68bulpr1akrs6ttet.apps.googleusercontent.com"
  deploy-api: ${{ needs.detect-changes.outputs.deploy-api == 'true' }}
  deploy-worker: ${{ needs.detect-changes.outputs.deploy-worker == 'true' }}
  deploy-web: ${{ needs.detect-changes.outputs.deploy-web == 'true' }}
secrets:
  FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }}
```

### Reusable deploy pipeline (`deploy.yml`)

```
validate (pnpm install --frozen-lockfile, typecheck, build)
  |
  +-- deploy-api (if enabled, timeout: 20min)
  |     flyctl deploy --config fly/api.toml --app valet-api-stg --remote-only --wait-timeout 300
  |     Post-deploy health check: GET /api/v1/health (5 retries, 10s apart)
  |
  +-- deploy-worker (if enabled, timeout: 15min)
  |     flyctl deploy --config fly/worker.toml --app valet-worker-stg --remote-only --wait-timeout 300
  |
  +-- deploy-web (if enabled, timeout: 15min)
        WS_URL derived from API URL: sed 's|^https://|wss://|'/api/v1/ws
        flyctl deploy --config fly/web.toml --app valet-web-stg --remote-only --wait-timeout 300
          --build-arg VITE_API_URL=https://valet-api-stg.fly.dev
          --build-arg VITE_WS_URL=wss://valet-api-stg.fly.dev/api/v1/ws
          --build-arg VITE_GOOGLE_CLIENT_ID=108153440133-...
```

All three deploy jobs run **in parallel** after the validate step passes. DB migrations run automatically during the API deploy via `release_command` (see section 8).

---

## 5. Production Deployment

**Workflow:** `.github/workflows/cd-prod.yml`
**Trigger:** Push to `main` branch OR manual `workflow_dispatch`
**Concurrency:** `deploy-production` group, `cancel-in-progress: false` (production deploys queue, never cancel)

### Differences from staging

| Aspect             | Staging                  | Production                          |
| ------------------ | ------------------------ | ----------------------------------- |
| Change detection   | Selective (paths-filter) | None -- always deploys all services |
| Cancel in-progress | Yes                      | No -- queues instead                |
| Manual trigger     | No                       | Yes (`workflow_dispatch`)           |

### Deploy configuration

```yaml
uses: ./.github/workflows/deploy.yml
with:
  environment: production
  api-app: valet-api
  worker-app: valet-worker
  web-app: valet-web
  api-url: https://valet-api.fly.dev
  google-client-id: "108153440133-8oorgsj5m7u67fg68bulpr1akrs6ttet.apps.googleusercontent.com"
  # deploy-api, deploy-worker, deploy-web all default to true
secrets:
  FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }}
```

Uses the same reusable `deploy.yml` pipeline described in section 4.

---

## 6. EC2 Worker Deployment

**Workflow:** `.github/workflows/cd-ec2.yml`
**Trigger:** Push to `staging`/`main` when worker-related paths change, or manual `workflow_dispatch`
**Concurrency:** Fleet-level (`deploy-ec2-fleet-<env>`) + per-instance (`deploy-ec2-instance-<ip>`)

### Trigger paths

```yaml
paths:
  - "apps/worker/**"
  - "packages/shared/**"
  - "packages/contracts/**"
  - "packages/db/**"
  - "packages/llm/**"
  - "pnpm-lock.yaml"
```

### Manual dispatch inputs

| Input         | Description                                                  |
| ------------- | ------------------------------------------------------------ |
| `target_ips`  | Comma-separated IPs (empty = deploy to all active sandboxes) |
| `environment` | `staging` or `production`                                    |

### Fleet discovery (3-tier fallback)

```
1. Manual target IPs  (from workflow_dispatch input)
       |
       v (if empty)
2. API fleet discovery (GET /api/v1/admin/sandboxes?status=active&environment=<env>)
       |
       v (if API fails)
3. SANDBOX_IPS secret  (JSON array in GitHub environment secret)
       |
       v (if empty)
4. Skip deployment     (warning, no targets)
```

### Build phase

```bash
# Build worker and all dependencies
pnpm --filter @valet/shared build
pnpm --filter @valet/contracts build
pnpm --filter @valet/db build
pnpm --filter @valet/llm build
pnpm --filter @valet/worker build

# Create deployment tarball
tar -czf /tmp/valet-worker.tar.gz \
  apps/worker/dist/ \
  apps/worker/package.json \
  packages/shared/dist/ \
  packages/shared/package.json \
  packages/db/dist/ \
  packages/db/package.json \
  packages/contracts/dist/ \
  packages/contracts/package.json \
  packages/llm/dist/ \
  packages/llm/package.json \
  package.json \
  pnpm-workspace.yaml \
  pnpm-lock.yaml
```

The tarball is uploaded as a GitHub Actions artifact with 3-day retention.

### Per-instance deploy (matrix strategy)

Deploys in parallel to up to 5 instances (`max-parallel: 5`, `fail-fast: false`). For each sandbox:

**Step 1: Mark deploying**

```bash
curl -sf -X PATCH "$API_URL/api/v1/admin/sandboxes/$SANDBOX_ID" \
  -H "Authorization: Bearer $VALET_API_TOKEN" \
  -d '{"status": "deploying"}'
```

**Step 2: Upload and deploy**

```bash
# SCP tarball to instance
scp -i ~/.ssh/ec2_key /tmp/valet-worker.tar.gz ubuntu@$IP:/tmp/

# On instance:
# 1. Backup current deployment
sudo cp -a /opt/valet/app /opt/valet/app-backup

# 2. Extract tarball
sudo tar -xzf /tmp/valet-worker.tar.gz -C /opt/valet/app

# 3. Install production dependencies
cd /opt/valet/app && pnpm install --prod --frozen-lockfile

# 4. Restart service
sudo systemctl daemon-reload
sudo systemctl restart valet-worker
```

**Step 3: Health check** (3 attempts with exponential backoff: 10s, 20s, 40s)

- Check `systemctl is-active valet-worker` equals "active"
- Check restart count < 3 (crash loop detection)

**Step 4: Update status**

- On success: `PATCH {"status": "active"}`
- On failure: `PATCH {"status": "unhealthy"}`

**Step 5: Automatic rollback on failure**

```bash
# Restore from backup
sudo rm -rf /opt/valet/app
sudo mv /opt/valet/app-backup /opt/valet/app
sudo systemctl restart valet-worker
```

### systemd service unit

Created by `deploy-worker.sh` on the instance at `/etc/systemd/system/valet-worker.service`:

```ini
[Unit]
Description=Valet Browser Worker
After=network.target xvfb.service
Requires=xvfb.service

[Service]
Type=simple
User=valet
WorkingDirectory=/opt/valet/app
EnvironmentFile=/opt/valet/.env
ExecStart=/usr/bin/node apps/worker/dist/main.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

---

## 7. GHOST-HANDS Docker Deployment (on VALET EC2)

GHOST-HANDS runs as Docker containers on the same EC2 instances managed by VALET. The GH deployment pipeline is separate from the VALET worker tarball deployment.

### End-to-end flow

```
┌─────────────────────────────────────────────────────────────────┐
│  GHOST-HANDS Repo (.github/workflows/ci.yml)                    │
│                                                                  │
│  push to main → typecheck → unit tests → integration tests      │
│       │                                                          │
│       └──→ Docker Build & Push to ECR                            │
│            (tags: <commit-sha> + latest)                         │
│                │                                                 │
│                └──→ deploy-staging job                            │
│                      │                                           │
│                      └──→ HMAC-signed webhook to VALET API       │
│                           POST /api/v1/webhooks/ghosthands/deploy│
│                           X-GH-Webhook-Signature: sha256=...     │
│                           X-GH-Event: deploy_ready               │
│                           X-GH-Environment: staging              │
│                                │                                 │
│                                └──→ deploy-production job        │
│                                      (same webhook, env=prod)    │
└─────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────┐
│  VALET API — DeployService (deploy.service.ts)                   │
│                                                                  │
│  1. Webhook handler validates HMAC signature                     │
│  2. Creates DeployRecord in Redis (24h TTL)                      │
│  3. Notifies admin users via WebSocket (deploy_ready event)      │
│  4. If auto-deploy enabled → triggers rolling deploy immediately │
│     Otherwise → admin triggers manually from dashboard           │
│                                                                  │
│  Rolling deploy (executeRollingDeploy):                          │
│  ┌──────────────────────────────────────────────────────┐        │
│  │  For each active sandbox in target environment:      │        │
│  │                                                      │        │
│  │  Phase 1: DRAIN                                      │        │
│  │    GET http://<ec2-ip>:8000/health → activeWorkers   │        │
│  │    If busy → poll every 5s, wait up to 5 minutes     │        │
│  │                                                      │        │
│  │  Phase 2: DEPLOY                                     │        │
│  │    POST http://<ec2-ip>:8000/deploy                  │        │
│  │    body: { image_tag: "<commit-sha>" }               │        │
│  │                                                      │        │
│  │  Phase 3: BROADCAST                                  │        │
│  │    WebSocket push to admins with per-sandbox status   │        │
│  └──────────────────────────────────────────────────────┘        │
└─────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────┐
│  EC2 Instance — health-server.js (port 8000)                     │
│                                                                  │
│  POST /deploy → spawns: gh-deploy.sh deploy <image_tag>          │
│                                                                  │
│  gh-deploy.sh (or deploy.sh from GH repo):                       │
│  1. Save current GH_IMAGE_TAG for rollback                       │
│  2. Update GH_IMAGE_TAG in /opt/ghosthands/.env                  │
│  3. ECR login (aws ecr get-login-password)                       │
│  4. docker compose -f docker-compose.prod.yml pull               │
│  5. Graceful drain: POST http://localhost:3101/worker/drain      │
│     Wait up to 60s for active jobs to finish                     │
│  6. docker compose stop -t 35 worker                             │
│  7. docker compose up -d --remove-orphans                        │
│  8. Restart any targeted workers (standalone containers)          │
│  9. Health check: curl http://localhost:3100/health (30 retries)  │
│  10. On failure → rollback to previous image tag                  │
└─────────────────────────────────────────────────────────────────┘
```

### GH CI/CD pipeline (in GHOST-HANDS repo)

**Workflow:** `GHOST-HANDS/.github/workflows/ci.yml`
**Trigger:** Push to `main` or PR to `main`

```
PR/push → typecheck (bun run build)
        → unit tests (bun run test:unit)
        → integration tests (needs typecheck, uses Supabase secrets)
        │
        └─ On push to main only:
           → Docker Build & Push (needs typecheck + unit tests)
             - AWS ECR login
             - docker build -t <registry>/<repo>:<sha> -t <registry>/<repo>:latest .
             - docker push both tags
             │
             └─ deploy-staging (needs docker + integration)
                - HMAC-signed POST to VALET_DEPLOY_WEBHOOK_URL
                - Payload includes: image, image_tag, commit_sha, commit_message, environment
                │
                └─ deploy-production (needs deploy-staging, uses production environment)
                   - Same HMAC-signed POST, environment=production
```

### GH deployment secrets (in GHOST-HANDS repo)

| Secret                        | Scope              | Purpose                |
| ----------------------------- | ------------------ | ---------------------- |
| `AWS_ACCESS_KEY_ID`           | Repository         | ECR authentication     |
| `AWS_SECRET_ACCESS_KEY`       | Repository         | ECR authentication     |
| `AWS_REGION`                  | Repository         | ECR region             |
| `ECR_REPOSITORY`              | Repository         | ECR repository name    |
| `ECR_REGISTRY`                | Env (staging/prod) | Full ECR registry URL  |
| `VALET_DEPLOY_WEBHOOK_URL`    | Env (staging/prod) | VALET webhook endpoint |
| `VALET_DEPLOY_WEBHOOK_SECRET` | Env (staging/prod) | HMAC signing secret    |
| `SUPABASE_URL`                | Repository         | Integration tests      |
| `SUPABASE_SERVICE_KEY`        | Repository         | Integration tests      |
| `GH_SERVICE_SECRET`           | Repository         | Integration tests      |

### VALET webhook handler

VALET receives the deploy notification at `POST /api/v1/webhooks/ghosthands/deploy`:

1. Validates `X-GH-Webhook-Signature` header (HMAC-SHA256)
2. Calls `DeployService.createFromWebhook()` which:
   - Creates a `DeployRecord` in Redis (24h TTL, last 50 deploys tracked)
   - Notifies admin users via WebSocket (`deploy_ready` event)
   - If `config:auto_deploy:<env>` is `"true"` in Redis → auto-triggers rolling deploy
3. Admin can trigger manually from VALET dashboard if auto-deploy is off

### Rolling deploy mechanics

`DeployService.triggerDeploy()` performs a sequential rolling deploy:

1. Query all active sandboxes for the target environment from DB
2. For each sandbox (sequentially, not parallel):
   - **Drain phase**: Check `GET http://<ip>:8000/health` for `activeWorkers` count. If > 0, poll every 5s for up to 5 minutes.
   - **Deploy phase**: `POST http://<ip>:8000/deploy` with `{ image_tag }`. The health server triggers `gh-deploy.sh` asynchronously.
   - **Status broadcast**: Push `deploy_update` WebSocket event to all admin users with per-sandbox progress.
3. Final status: `completed` (all succeeded) or `failed` (any sandbox failed)

### What happens on the EC2 instance

When `POST /deploy` hits the health server (`infra/scripts/health-server.js`), it spawns `gh-deploy.sh`:

```bash
# 1. Update image tag in .env
sed -i "s|^GH_IMAGE_TAG=.*|GH_IMAGE_TAG=${image_tag}|" /opt/ghosthands/.env

# 2. Pull from ECR
docker compose -f docker-compose.prod.yml pull

# 3. Graceful drain via HTTP
curl -sf -X POST http://localhost:3101/worker/drain
# Wait up to 60s for deploy_safe: true

# 4. Stop worker with 35s SIGTERM timeout
docker compose -f docker-compose.prod.yml stop -t 35 worker

# 5. Start all services (API + default worker)
docker compose -f docker-compose.prod.yml up -d --remove-orphans

# 6. Restart targeted workers (standalone containers)
# Discovers workers by Docker label gh.role=targeted-worker
# Stops each, starts new container with updated image

# 7. Health check (30 attempts, 2s apart)
curl -sf http://localhost:3100/health

# 8. On failure: rollback
# Reverts GH_IMAGE_TAG in .env, pulls previous image, restarts compose
```

### Targeted worker management

VALET can start/stop individual GH worker containers on each EC2 instance for sandbox-specific routing:

```bash
# On EC2 instance:
./scripts/deploy.sh start-worker <worker-id>    # Starts container with GH_WORKER_ID
./scripts/deploy.sh stop-worker <worker-id>     # Stops container gracefully (35s)
./scripts/deploy.sh list-workers                 # Lists all targeted workers

# Each targeted worker:
# - Gets a unique status port (3110 + hash-based offset)
# - Labeled gh.role=targeted-worker, gh.worker_id=<id>
# - 2GB memory limit, 2 CPUs
# - Shares .env from /opt/ghosthands/.env
# - Auto-restarted during image deploys
```

### Manual GH deploy (without CI)

```bash
# SSH into instance
ssh -i ~/.ssh/valet-worker.pem ubuntu@<instance-ip>

# Full deploy from GH repo's deploy.sh
cd /opt/ghosthands
./scripts/deploy.sh deploy <image-tag>

# Or from VALET's gh-deploy.sh
bash /opt/valet/scripts/gh-deploy.sh deploy <image-tag>

# Check status
./scripts/deploy.sh status

# Drain (finish active jobs, stop worker)
./scripts/deploy.sh drain

# Rollback
./scripts/deploy.sh rollback

# Worker management
./scripts/deploy.sh start-worker abc123
./scripts/deploy.sh stop-worker abc123
./scripts/deploy.sh list-workers
./scripts/deploy.sh worker-status
```

### GH deploy auto-deploy config

```bash
# Enable auto-deploy for staging (VALET API side)
# Set via Redis: config:auto_deploy:staging = "true"
# When enabled, GH webhook triggers deploy automatically
# When disabled, admin must trigger from dashboard
```

---

## 8. Manual Deployment

### VALET on Fly.io (without CI/CD)

```bash
# Prerequisites
brew install flyctl
fly auth login

# ── Staging ──
fly deploy --config fly/api.toml --app valet-api-stg --remote-only
fly deploy --config fly/worker.toml --app valet-worker-stg --remote-only
fly deploy --config fly/web.toml --app valet-web-stg --remote-only \
  --build-arg VITE_API_URL=https://valet-api-stg.fly.dev \
  --build-arg VITE_WS_URL=wss://valet-api-stg.fly.dev/api/v1/ws \
  --build-arg VITE_GOOGLE_CLIENT_ID=108153440133-8oorgsj5m7u67fg68bulpr1akrs6ttet.apps.googleusercontent.com

# ── Production ──
fly deploy --config fly/api.toml --app valet-api --remote-only
fly deploy --config fly/worker.toml --app valet-worker --remote-only
fly deploy --config fly/web.toml --app valet-web --remote-only \
  --build-arg VITE_API_URL=https://valet-api.fly.dev \
  --build-arg VITE_WS_URL=wss://valet-api.fly.dev/api/v1/ws \
  --build-arg VITE_GOOGLE_CLIENT_ID=108153440133-8oorgsj5m7u67fg68bulpr1akrs6ttet.apps.googleusercontent.com
```

> **Note:** `flyctl` resolves Dockerfile paths relative to the toml file directory. The toml files reference `../apps/<service>/Dockerfile` with `context = ".."`, so `fly deploy` must be run from the VALET repo root.

### VALET Worker on EC2 (interactive script)

```bash
# Full deploy with build
./infra/scripts/deploy-worker.sh --host 54.123.45.67 --key ~/.ssh/valet-worker.pem

# Skip local build (reuse existing dist/ artifacts)
./infra/scripts/deploy-worker.sh --host 54.123.45.67 --key ~/.ssh/valet-worker.pem --skip-build

# Auto-rollback on health check failure (no interactive prompt)
./infra/scripts/deploy-worker.sh --host 54.123.45.67 --key ~/.ssh/valet-worker.pem --rollback-on-failure

# Positional arg shorthand
./infra/scripts/deploy-worker.sh 54.123.45.67 ~/.ssh/valet-worker.pem
```

The script performs: SSH test, local build, tarball creation, SCP upload, backup, extract, `pnpm install --prod`, systemd restart, health check (3 retries with exponential backoff), and interactive rollback on failure.

### GHOST-HANDS on EC2

```bash
# SSH into instance
ssh -i ~/.ssh/valet-worker.pem ubuntu@<instance-ip>

# Deploy a specific Docker image tag
cd /opt/ghosthands
./scripts/deploy.sh deploy <image-tag>

# Deploy latest
./scripts/deploy.sh deploy latest

# Check status
./scripts/deploy.sh status

# Drain worker (finish active jobs, stop new pickup)
./scripts/deploy.sh drain

# Rollback to previous image
./scripts/deploy.sh rollback

# Targeted worker management
./scripts/deploy.sh start-worker <worker-id>
./scripts/deploy.sh stop-worker <worker-id>
./scripts/deploy.sh list-workers
./scripts/deploy.sh worker-status
```

**Remote deploy via health server** (used by VALET's DeployService):

The health server on port 8000 (`infra/scripts/health-server.js`) accepts deploy requests:

```bash
curl -X POST http://<instance-ip>:8000/deploy \
  -H "Content-Type: application/json" \
  -d '{"image_tag": "v1.2.3"}'
```

This responds immediately with `{"success": true, "message": "Deploy of v1.2.3 initiated"}` and triggers `scripts/deploy.sh deploy v1.2.3` asynchronously on the instance.

### Manual production deploy via GitHub Actions

```bash
# Via gh CLI
gh workflow run cd-prod.yml

# EC2 worker to specific instances
gh workflow run cd-ec2.yml \
  -f environment=staging \
  -f target_ips="34.197.248.80,35.123.45.67"

# Provision a new sandbox
gh workflow run provision-sandbox.yml \
  -f environment=staging \
  -f instance_type=t3.medium \
  -f browser_engine=chromium \
  -f capacity=5

# Terminate a sandbox
gh workflow run terminate-sandbox.yml \
  -f sandbox_id=<uuid> \
  -f environment=staging

# Sync secrets to sandboxes
gh workflow run secrets-sync.yml \
  -f environment=staging \
  -f target_ips="34.197.248.80"
```

---

## 9. Database Migrations

### How migrations run

Migrations execute automatically on every API deploy via Fly.io's `release_command`, configured in `fly/api.toml`:

```toml
[deploy]
  release_command = "node packages/db/dist/migrate.js"
```

**Flow:**

1. `fly deploy` builds and pushes the new Docker image to Fly.io
2. Fly spins up a **temporary VM** with the new image
3. The temporary VM runs `node packages/db/dist/migrate.js`
4. `migrate.js` connects using `DATABASE_DIRECT_URL` (direct connection, port 5432) -- NOT the transaction pooler (port 6543)
5. If migration **succeeds**: Fly swaps traffic to the new version
6. If migration **fails**: the deploy is **aborted** and the old version keeps running

### Adding a new migration

```bash
# 1. Update schema in packages/db/src/schema/*.ts
# 2. Write the migration SQL:
#    packages/db/drizzle/NNNN_description.sql
# 3. Add entry to packages/db/drizzle/meta/_journal.json
# 4. Commit and push -- CD handles the rest
```

Or use the generator:

```bash
pnpm --filter @valet/db db:generate
git add packages/db/drizzle/
git commit -m "db: add migration for ..."
```

### Important notes

- `DATABASE_DIRECT_URL` (session pooler, port 5432) **must** be set as a Fly secret on the API app. `migrate.js` prefers it over `DATABASE_URL` (transaction pooler, port 6543).
- The `_journal.json` file **must** be tracked in git -- the Docker image needs it at runtime.
- **Staging and production share the same Supabase database.** A migration applied to one environment immediately affects the other.

### Running migrations manually

```bash
# From local machine (requires DATABASE_DIRECT_URL in .env)
pnpm db:migrate

# Via Fly.io (triggers release_command on a temporary VM)
fly deploy --config fly/api.toml --app valet-api-stg --remote-only
```

---

## 10. Rollback Procedures

### Fly.io rollback (VALET services)

**Option 1: Fly.io release rollback**

```bash
# List recent releases
fly releases --app valet-api-stg

# Rollback to the previous release
fly releases rollback --app valet-api-stg

# Rollback to a specific version
fly releases rollback v42 --app valet-api-stg
```

Repeat for each affected app (`valet-worker-stg`, `valet-web-stg`). For production, drop the `-stg` suffix.

**Option 2: Redeploy from a known-good commit**

```bash
git checkout <known-good-sha>
fly deploy --config fly/api.toml --app valet-api --remote-only
```

**Option 3: Manual production deploy trigger**

1. Go to Actions > "CD -> Production"
2. Click "Run workflow" > select `main` branch at the desired commit

**Migration failure** -- if the `release_command` fails, Fly automatically aborts the deploy. The old version keeps running. No manual action is needed.

### EC2 VALET Worker rollback

**Automatic** (built into `cd-ec2.yml`): if the health check fails after a successful deploy, the workflow automatically restores from backup:

```bash
sudo rm -rf /opt/valet/app
sudo mv /opt/valet/app-backup /opt/valet/app
sudo systemctl restart valet-worker
```

**Manual rollback:**

```bash
ssh -i ~/.ssh/valet-worker.pem ubuntu@<instance-ip>

# Check backup exists
ls /opt/valet/app-backup/apps/

# Restore
sudo systemctl stop valet-worker
sudo rm -rf /opt/valet/app
sudo mv /opt/valet/app-backup /opt/valet/app
sudo systemctl start valet-worker

# Verify
sudo systemctl is-active valet-worker
sudo journalctl -u valet-worker -n 50 --no-pager
```

### GHOST-HANDS Docker rollback

**Automatic** (built into `scripts/deploy.sh`): if the health check fails after deploy, the script reverts `GH_IMAGE_TAG` in `.env`, pulls the previous image, and restarts compose services.

**Manual rollback:**

```bash
ssh -i ~/.ssh/valet-worker.pem ubuntu@<instance-ip>
cd /opt/ghosthands
./scripts/deploy.sh rollback
```

This pulls the `:latest` tag as the rollback target, restarts `docker compose`, and runs a health check.

### Database rollback

There is **no automated database rollback**. Because the `release_command` runs in a temporary VM before the deploy completes, a failed migration aborts the deploy. For a migration that succeeded but introduced bugs:

1. Write a new reverse-migration SQL file
2. Place it in `packages/db/drizzle/` with the next sequence number
3. Update `_journal.json`
4. Deploy to trigger the corrective migration

**Emergency direct SQL:**

```bash
psql "$DATABASE_DIRECT_URL" -c "-- your rollback SQL here"
```

---

## 11. Health Checks

### Fly.io health checks (automatic, continuous)

Configured in the Fly.io toml files, executed by Fly.io infrastructure:

| Service | Endpoint                      | Interval | Timeout | Grace Period |
| ------- | ----------------------------- | -------- | ------- | ------------ |
| API     | `GET /api/v1/health`          | 15s      | 5s      | 10s          |
| Web     | `GET /health`                 | 30s      | 5s      | 5s           |
| Worker  | None (process group, no HTTP) | --       | --      | --           |

### Post-deploy health check (API only)

After deploying the API to Fly.io, the `deploy.yml` workflow runs:

```bash
sleep 10
for i in 1 2 3 4 5; do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
    "https://<app>.fly.dev/api/v1/health")
  if [ "$STATUS" = "200" ]; then exit 0; fi
  sleep 10
done
exit 1
```

### EC2 health check -- CI/CD (cd-ec2.yml)

After deploying to each sandbox, 3 retries with exponential backoff (10s, 20s, 40s):

- `systemctl is-active valet-worker` must return "active"
- Restart count (`NRestarts`) must be < 3 (crash loop detection)

### EC2 health check -- comprehensive script

```bash
./infra/scripts/health-check.sh <ec2-ip> [ssh-key-path]
```

Performs 10 checks (from `infra/scripts/health-check.sh`):

| #   | Check                  | Pass                 | Warn                                | Fail                    |
| --- | ---------------------- | -------------------- | ----------------------------------- | ----------------------- |
| 1   | SSH connectivity       | Can connect          | --                                  | Cannot connect (aborts) |
| 2   | Xvfb (virtual display) | systemctl active     | --                                  | Not active              |
| 3   | x11vnc (VNC server)    | Active process       | --                                  | Not active              |
| 4   | noVNC (port 6080)      | HTTP 200/301/302     | --                                  | Other HTTP status       |
| 5   | AdsPower (port 50325)  | API responds         | Service running, API not responding | Service not running     |
| 6   | Valet worker           | Active, restarts < 5 | Active, restarts >= 5               | Not active              |
| 7   | Node.js                | v20+                 | < v20                               | Not installed           |
| 8   | Disk space             | < 80%                | 80-90%                              | >= 90%                  |
| 9   | Memory                 | < 80%                | 80-90%                              | >= 90%                  |
| 10  | Uptime                 | Always passes        | --                                  | --                      |

### EC2 health server (metrics API)

The health server (`infra/scripts/health-server.js`) runs on port 8000 on each sandbox:

```
GET  /health  -- System metrics + service status (JSON)
POST /deploy  -- Trigger GH image deploy (body: { image_tag })
```

`GET /health` response:

```json
{
  "status": "ok",
  "cpu": 15.2,
  "memoryTotalMb": 8192,
  "memoryUsedMb": 3456,
  "diskTotalGb": 40,
  "diskUsedGb": 12,
  "adspowerStatus": "running",
  "activeProfiles": 2,
  "activeWorkers": 3,
  "uptime": 86400
}
```

### GHOST-HANDS health checks

```bash
# Quick health check (exit code 0 or 1)
./scripts/deploy.sh health

# Direct API health
curl -sf http://localhost:3100/health

# Worker busy/idle status
./scripts/deploy.sh worker-status
# Returns JSON with deploy_safe: true/false
```

---

## 12. Secrets Management

### Where secrets live

| Location                | Secrets                                                            | How to set                                             |
| ----------------------- | ------------------------------------------------------------------ | ------------------------------------------------------ |
| **Local dev**           | All env vars                                                       | `.env` file (gitignored)                               |
| **Fly.io apps**         | DATABASE_URL, DATABASE_DIRECT_URL, REDIS_URL, JWT_SECRET, API keys | `fly secrets set -a <app-name> KEY=value`              |
| **GitHub Actions**      | FLY_API_TOKEN, VALET_API_TOKEN, SANDBOX_SSH_KEY, AWS keys          | Settings > Secrets and variables > Actions             |
| **GitHub Environments** | SANDBOX_WORKER_ENV, SANDBOX_IPS                                    | Settings > Environments > staging/production           |
| **EC2 sandboxes**       | Worker .env (DB, Redis, LLM keys, etc.)                            | `secrets-sync.yml` workflow or `set-secrets.sh` script |

### GitHub secrets reference

| Secret                  | Scope       | Used by                                                        |
| ----------------------- | ----------- | -------------------------------------------------------------- |
| `FLY_API_TOKEN`         | Repository  | `cd-staging.yml`, `cd-prod.yml` (Fly.io deploys)               |
| `VALET_API_TOKEN`       | Repository  | `cd-ec2.yml`, `provision-sandbox.yml`, `terminate-sandbox.yml` |
| `SANDBOX_SSH_KEY`       | Repository  | `cd-ec2.yml`, `secrets-sync.yml`, `provision-sandbox.yml`      |
| `AWS_ACCESS_KEY_ID`     | Repository  | `provision-sandbox.yml`, `terminate-sandbox.yml`               |
| `AWS_SECRET_ACCESS_KEY` | Repository  | `provision-sandbox.yml`, `terminate-sandbox.yml`               |
| `TURBO_TOKEN`           | Repository  | CI/CD (Turborepo remote cache)                                 |
| `SANDBOX_IPS`           | Environment | `secrets-sync.yml` (JSON array of IPs, fallback)               |
| `SANDBOX_WORKER_ENV`    | Environment | `secrets-sync.yml` (full `.env` file contents)                 |

### Setting Fly.io secrets

```bash
# Set secrets for staging API
fly secrets set -a valet-api-stg \
  DATABASE_URL="postgresql://..." \
  DATABASE_DIRECT_URL="postgresql://..." \
  REDIS_URL="rediss://..." \
  JWT_SECRET="$(openssl rand -base64 48)"

# List current secrets
fly secrets list -a valet-api-stg
```

### EC2 secrets -- interactive script

```bash
./infra/scripts/set-secrets.sh <ec2-ip> [ssh-key-path]
```

Prompts interactively for each secret, shows masked current values, writes to `/opt/valet/.env` with `600` permissions, and restarts the worker. Required secrets: `HATCHET_CLIENT_TOKEN`, `DATABASE_URL`, `REDIS_URL`. Optional: `ADSPOWER_API_KEY`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `S3_ENDPOINT`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `SENTRY_DSN`, `LOG_LEVEL`.

### EC2 secrets -- bulk sync workflow

**Workflow:** `.github/workflows/secrets-sync.yml` (manual dispatch only)

Pushes the `SANDBOX_WORKER_ENV` GitHub environment secret to all sandbox instances:

```
GitHub Environments > staging/production > SANDBOX_WORKER_ENV
  -->  /opt/valet/.env on each EC2 instance (sudo tee, chmod 600)
  -->  sudo systemctl restart valet-worker
  -->  Verify service health
```

Target resolution: manual IPs > `SANDBOX_IPS` secret > legacy `EC2_IP_STG`/`EC2_IP_PROD` secrets.

```bash
# Sync to all sandboxes in staging
gh workflow run secrets-sync.yml -f environment=staging

# Sync to specific IPs only
gh workflow run secrets-sync.yml \
  -f environment=staging \
  -f target_ips="34.197.248.80,35.123.45.67"
```

---

## 13. Sandbox Lifecycle

### Provisioning a new sandbox

**Workflow:** `.github/workflows/provision-sandbox.yml` (manual dispatch only)

| Input            | Options                          | Default |
| ---------------- | -------------------------------- | ------- |
| `environment`    | dev, staging, prod               | --      |
| `instance_type`  | t3.medium, t3.large, t3.xlarge   | --      |
| `browser_engine` | chromium, adspower               | --      |
| `capacity`       | Number (max concurrent sessions) | 5       |

**Steps:**

1. **Terraform apply** -- creates EC2 instance in `us-east-1` with specified type
2. **Wait for SSH** (5-minute timeout, 15s polling)
3. **Wait for cloud-init** completion
4. **Install browser engine:**
   - Chromium: `sudo apt-get install -y chromium-browser`
   - AdsPower: uploads and runs `infra/scripts/install-adspower.sh`
5. **Build and deploy** VALET worker (same tarball approach as `cd-ec2.yml`)
6. **Register sandbox** via `POST /api/v1/admin/sandboxes` with metadata (name, instance_id, public_ip, instance_type, browser_engine, capacity, environment)
7. **Health check** (3 retries)

**Post-provisioning manual steps:**

```bash
# 1. Configure secrets
./infra/scripts/set-secrets.sh <instance-ip>

# 2. If AdsPower: activate license via noVNC
open http://<instance-ip>:6080/vnc.html

# 3. Run comprehensive health check
./infra/scripts/health-check.sh <instance-ip>
```

### Terminating a sandbox

**Workflow:** `.github/workflows/terminate-sandbox.yml` (manual dispatch only)

| Input         | Description                           |
| ------------- | ------------------------------------- |
| `sandbox_id`  | Sandbox ID from the API               |
| `environment` | dev, staging, prod                    |
| `force`       | Skip drain, force terminate (boolean) |

**Steps:**

1. Fetch sandbox details from API (`GET /api/v1/admin/sandboxes/<id>`)
2. Mark sandbox as `terminating` via API PATCH
3. Stop `valet-worker` service via SSH
4. **Terraform destroy** (`instance_count=0`)
5. Mark sandbox as `terminated` via API PATCH

### Sandbox state machine

```
provisioning --> active --> deploying --> active (normal cycle)
                        --> unhealthy (failed deploy or health check)
                        --> terminating --> terminated
```

### Cost estimation

```bash
./infra/scripts/cost-calculator.sh <num_instances> [instance_type] [spot_percentage]

# Examples
./infra/scripts/cost-calculator.sh 5                     # 5x t3.large on-demand
./infra/scripts/cost-calculator.sh 10 t3.large 70        # 10x t3.large, 70% spot
./infra/scripts/cost-calculator.sh 20 t3.xlarge 70       # 20x t3.xlarge, 70% spot
```

Pricing (us-east-1, Feb 2026):

| Instance Type | On-Demand/hr | Spot/hr | vCPU | RAM  |
| ------------- | ------------ | ------- | ---- | ---- |
| t3.medium     | $0.0416      | $0.0160 | 2    | 4GB  |
| t3.large      | $0.0832      | $0.0340 | 2    | 8GB  |
| t3.xlarge     | $0.1664      | $0.0650 | 4    | 16GB |

Additional per-instance costs: 40GB gp3 EBS ($3.20/mo), Elastic IP ($3.65/mo), ~10GB data transfer ($0.90/mo).

---

## 14. Known Gaps

### Missing infrastructure

| Gap                             | Impact                                               | Mitigation                                                         |
| ------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------ |
| No canary/blue-green deployment | Cannot test with partial traffic before full rollout | Fly.io rolling updates are atomic; staging branch serves as canary |
| No deployment dashboard         | All deploys via git push or GitHub Actions UI        | GitHub Actions provides run history and step summaries             |
| No automated load testing       | No perf regression detection pre-deploy              | Manual testing in staging                                          |
| No centralized logging          | EC2 logs via `journalctl` and Docker JSON-file only  | SSH into instances, or add ELK/Datadog later                       |
| No alerting pipeline            | Deploy failures only visible in GitHub Actions       | Sentry DSN is optional; no PagerDuty/OpsGenie                      |
| No deploy notifications         | No Slack/Discord/email on success or failure         | Monitor GitHub Actions manually                                    |

### Architectural limitations

| Limitation                                  | Detail                                                                                                                              |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| **Shared staging/production database**      | Same Supabase instance. A migration to staging immediately affects production. Need separate DB per environment for true isolation. |
| **No automated DB rollback**                | Failed migrations abort the deploy, but there is no reverse-migration tooling. Must write and deploy corrective SQL manually.       |
| **Stale Hatchet references in EC2 scripts** | `set-secrets.sh` and `deploy-worker.sh` still reference `HATCHET_CLIENT_TOKEN` in their `.env` templates. Should be updated.        |
| **No graceful drain for Fly.io worker**     | The Fly.io worker gets `SIGTERM` with 60s timeout, but no drain endpoint or in-progress job protection.                             |
| **Single SSH key across all sandboxes**     | All instances share `SANDBOX_SSH_KEY`. Key rotation requires updating the secret and reprovisioning SSH access.                     |
| **EC2 fleet discovery requires API**        | If the VALET API is down, `cd-ec2.yml` falls back to `SANDBOX_IPS` secret which must be manually maintained.                        |
| **No SPA versioning**                       | Web app rollback means redeploying a previous commit. No built-in version tracking for the static SPA bundle.                       |
