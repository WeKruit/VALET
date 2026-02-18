# WeKruit Valet -- Deployment, CI/CD & SRE Plan

> **VALET** — Verified Automation. Limitless Execution. Trust.

**Version:** 1.0
**Date:** 2026-02-12
**Status:** Ready for Implementation

---

## 1. Recommended Infrastructure Stack

### Decision: Hetzner + Coolify + Cloudflare

| Layer                        | Service                                                 | Why                                                                                         |
| ---------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| **VPS**                      | Hetzner Cloud                                           | EUR 3.79-14.40/mo, 20TB traffic included, EU data centers                                   |
| **PaaS**                     | Coolify (self-hosted)                                   | Free, open-source Vercel alternative, Docker Compose native, auto-deploy, Let's Encrypt SSL |
| **DNS + CDN + SSL**          | Cloudflare (free)                                       | Free DNS, CDN, DDoS protection, SSL, WAF                                                    |
| **Database**                 | Neon (serverless Postgres)                              | Free tier: 0.5GB + 100 compute hours. Branching for dev/staging. Prod: $19/mo               |
| **Redis**                    | Self-hosted on VPS (dev/staging), Upstash (prod option) | Upstash free: 256MB + 500K commands/mo                                                      |
| **Object Storage**           | Cloudflare R2                                           | Free: 10GB + 1M writes/mo. $0 egress. S3-compatible API                                     |
| **Secrets**                  | Infisical (self-hosted)                                 | Free, open-source, self-host on same VPS via Coolify                                        |
| **Error Tracking**           | Sentry                                                  | Free: 5,000 errors/mo                                                                       |
| **Uptime + Alerting + Logs** | Better Stack                                            | Free: 10 monitors + 3GB logs + unlimited phone/SMS alerts                                   |
| **Metrics Dashboards**       | Grafana Cloud                                           | Free: 10K metrics series + 50GB logs + 14-day retention                                     |
| **CI/CD**                    | GitHub Actions + Coolify auto-deploy                    | GHA free: 2,000 min/mo (private repos). Coolify: webhook deploy                             |
| **Build Cache**              | Turborepo Remote Cache (Vercel)                         | Free on all Vercel plans                                                                    |

---

## 2. Cost by Environment

### Development: $0/month

| Component    | Service                |   Cost |
| ------------ | ---------------------- | -----: |
| Everything   | Docker Compose locally |     $0 |
| DB branching | Neon free tier         |     $0 |
| Build cache  | Turborepo + Vercel     |     $0 |
| Secrets      | Infisical (local)      |     $0 |
| **Total**    |                        | **$0** |

### Staging: ~$5/month

| Component        | Service                                  |    Cost |
| ---------------- | ---------------------------------------- | ------: |
| VPS              | Hetzner CX22 (2 vCPU, 4GB RAM, 40GB SSD) |     ~$4 |
| PaaS             | Coolify (self-hosted)                    |      $0 |
| Postgres + Redis | Self-hosted on VPS via Coolify           |      $0 |
| Object Storage   | Cloudflare R2 free                       |      $0 |
| CDN + DNS + SSL  | Cloudflare free                          |      $0 |
| CI/CD            | GitHub Actions + Coolify                 |      $0 |
| Monitoring       | Better Stack + Sentry free               |      $0 |
| Domain           | Cloudflare registrar (~$10/yr)           |     ~$1 |
| **Total**        |                                          | **~$5** |

### Production MVP (100 users, 50 apps/day): ~$25/month

| Component       | Service                                          |     Cost |
| --------------- | ------------------------------------------------ | -------: |
| VPS             | Hetzner CX32 (4 vCPU, 8GB RAM, 80GB SSD)         |   ~$7.50 |
| PaaS            | Coolify                                          |       $0 |
| Postgres        | Neon Pro (managed, point-in-time recovery)       |      $19 |
| Redis           | Self-hosted on VPS                               |       $0 |
| Object Storage  | Cloudflare R2 (~5GB)                             |       $0 |
| CDN + DNS + SSL | Cloudflare free                                  |       $0 |
| Monitoring      | Better Stack + Sentry + Grafana Cloud free tiers |       $0 |
| Backups         | Hetzner Snapshots (weekly)                       |   ~$1.50 |
| Domain          | Cloudflare                                       |      ~$1 |
| **Total**       |                                                  | **~$29** |

### Production Growth (1,000 users, 500 apps/day): ~$80/month

| Component      | Service                                      |     Cost |
| -------------- | -------------------------------------------- | -------: |
| VPS (App)      | Hetzner CX42 (8 vCPU, 16GB RAM)              |     ~$16 |
| VPS (DB)       | Hetzner CX22 (dedicated DB)                  |      ~$4 |
| PaaS           | Coolify                                      |       $0 |
| Postgres       | Neon Scale                                   |      $39 |
| Redis          | Upstash Pay-as-you-go                        |      ~$5 |
| Object Storage | Cloudflare R2 (~100GB)                       |      ~$2 |
| CDN + DNS      | Cloudflare free                              |       $0 |
| Monitoring     | Better Stack paid ($21) + Grafana Cloud free |      $21 |
| Backups        | Hetzner Snapshots                            |      ~$3 |
| **Total**      |                                              | **~$90** |

---

## 3. CI/CD Pipeline

### Architecture

```
Push to GitHub
    │
    ▼
GitHub Actions (test + lint + typecheck + build)
    │
    ▼ (on success + main branch)
Coolify Webhook (auto-deploy)
    │
    ▼
Hetzner VPS (Docker containers via Coolify)
```

### GitHub Actions Workflow: `ci.yml`

```yaml
name: CI
on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

env:
  TURBO_TOKEN: ${{ secrets.TURBO_TOKEN }}
  TURBO_TEAM: ${{ vars.TURBO_TEAM }}

jobs:
  ci:
    runs-on: ubuntu-latest
    timeout-minutes: 15

    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_USER: test
          POSTGRES_PASSWORD: test
          POSTGRES_DB: valet_test
        ports: ["5432:5432"]
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: "pnpm"

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Lint
        run: pnpm turbo lint

      - name: Type check
        run: pnpm turbo typecheck

      - name: Unit tests
        run: pnpm turbo test
        env:
          DATABASE_URL: postgresql://test:test@localhost:5432/valet_test

      - name: Build
        run: pnpm turbo build

      - name: Security scan
        run: |
          pnpm audit --audit-level=high || true
          # Check no secrets in frontend bundle
          if grep -r "sk-" apps/web/dist/ 2>/dev/null; then
            echo "FATAL: API key found in frontend bundle"
            exit 1
          fi
```

### Coolify Auto-Deploy

- GitHub App webhook triggers build on push to `main`
- Coolify builds Docker images from `docker/docker-compose.yml`
- Zero-downtime rolling restarts
- One-click rollback to previous deployment
- Let's Encrypt SSL auto-renewal

### Target: CI completes in < 10 minutes

- Turborepo Remote Cache (free via Vercel) skips unchanged packages
- PostgreSQL service container for integration tests
- Parallel lint + typecheck + test via Turborepo

---

## 4. SRE Runbook

### 4.1 Health Checks

| Service    | Check      | Endpoint/Command     | Frequency          |
| ---------- | ---------- | -------------------- | ------------------ |
| API        | HTTP 200   | `GET /api/v1/health` | 60s (Better Stack) |
| Web        | HTTP 200   | `GET /`              | 60s (Better Stack) |
| PostgreSQL | Connection | `pg_isready`         | 60s (Coolify)      |
| Redis      | PING/PONG  | `redis-cli ping`     | 60s (Coolify)      |
| Hatchet    | Dashboard  | `GET :8888/health`   | 60s (Better Stack) |

### 4.2 Alerting Rules

| Alert                         | Condition                         | Severity | Notification                |
| ----------------------------- | --------------------------------- | -------- | --------------------------- |
| API down                      | Health check fails 2x consecutive | CRITICAL | Phone call (Better Stack)   |
| High error rate               | >50 errors/5min in Sentry         | HIGH     | SMS + email                 |
| DB connection pool exhaustion | Active connections > 80% max      | HIGH     | Slack webhook               |
| Disk space low                | VPS disk > 80% used               | MEDIUM   | Email                       |
| SSL certificate expiring      | < 14 days to expiry               | MEDIUM   | Email (Coolify auto-renews) |
| High memory usage             | VPS RAM > 90% for 5min            | HIGH     | SMS                         |

### 4.3 Backup Strategy

| What                     | How                            | Frequency     | Retention                     | Recovery Time      |
| ------------------------ | ------------------------------ | ------------- | ----------------------------- | ------------------ |
| PostgreSQL (Neon)        | Neon point-in-time recovery    | Continuous    | 7 days (free) / 30 days (pro) | < 5 min            |
| PostgreSQL (self-hosted) | `pg_dump` cron → Cloudflare R2 | Daily 3am UTC | 30 days                       | < 30 min           |
| VPS full snapshot        | Hetzner Snapshots              | Weekly        | 4 snapshots                   | < 15 min (restore) |
| Object storage (R2)      | Cloudflare built-in durability | N/A           | 99.999999999% durability      | N/A                |
| Application code         | Git (GitHub)                   | Every push    | Infinite                      | < 5 min (redeploy) |

### 4.4 Incident Response

1. **Detect**: Better Stack alerts via phone/SMS/email
2. **Acknowledge**: Better Stack on-call schedule (1 responder free)
3. **Diagnose**: Check Sentry errors → Grafana Cloud logs → Coolify deployment history
4. **Fix**: Rollback via Coolify (one-click) or hotfix → push → auto-deploy
5. **Post-mortem**: Document in GitHub Issue with `incident` label

### 4.5 Scaling Playbook

| Trigger                       | Action                                                | Command                        |
| ----------------------------- | ----------------------------------------------------- | ------------------------------ |
| API response time > 500ms avg | Upgrade Hetzner VPS tier                              | Hetzner Cloud Console → Resize |
| Worker queue depth > 100      | Add second worker container in Coolify                | Coolify → Add service          |
| DB connections > 80%          | Enable Neon autoscaling or add pgBouncer              | Neon dashboard / Docker        |
| Redis memory > 80%            | Increase Redis maxmemory or switch to Upstash         | Docker env / Upstash dashboard |
| Storage > 70% VPS disk        | Move object storage to Cloudflare R2 (if not already) | Update S3_ENDPOINT env         |

---

## 5. Production Readiness Checklist

### Pre-Launch (Phase 3, Week 9-10)

- [ ] Hetzner VPS provisioned (CX32 minimum)
- [ ] Coolify installed and configured
- [ ] Domain pointed to Cloudflare → Hetzner
- [ ] SSL/TLS via Cloudflare (Full Strict mode)
- [ ] Neon Postgres provisioned (Pro plan)
- [ ] Cloudflare R2 bucket created (resumes, screenshots)
- [ ] Sentry project created, DSN configured
- [ ] Better Stack monitors active (API + Web + DB)
- [ ] Grafana Cloud connected (pino logs via Loki)
- [ ] GitHub Actions CI passing on main
- [ ] Coolify auto-deploy configured (main branch → production)
- [ ] `.env` production values set in Coolify (not in repo)
- [ ] Infisical self-hosted on VPS for secrets rotation
- [ ] Backup cron job verified (pg_dump → R2)
- [ ] VPS snapshot schedule configured (weekly)
- [ ] Rate limiting tuned for production
- [ ] CORS configured for production domain only
- [ ] Feature flags ready (kill switch per platform)

### Post-Launch Monitoring

- [ ] Error rate baseline established in Sentry
- [ ] Response time baseline in Better Stack
- [ ] Daily backup verification (restore test monthly)
- [ ] Weekly VPS resource review (CPU, RAM, disk)
- [ ] Monthly cost review vs budget
