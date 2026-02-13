# WeKruit Valet — Production Readiness Checklist

**Version:** 1.0
**Date:** 2026-02-12
**Aligned with:** `product-research/15_deployment_sre_plan.md` Section 5

This checklist must be completed before the Service is made available to production users. Each item should be signed off by the responsible engineer.

---

## 1. Infrastructure

- [ ] **VPS provisioned** — Hetzner CX32 minimum (4 vCPU, 8GB RAM, 80GB SSD)
- [ ] **Coolify installed** — Self-hosted PaaS on VPS, Docker Compose native
- [ ] **Domain configured** — DNS pointed to Cloudflare, then proxied to Hetzner VPS
- [ ] **SSL/TLS** — Cloudflare Full (Strict) mode enabled; Let's Encrypt via Coolify as backup
- [ ] **CDN + DDoS protection** — Cloudflare free tier active (caching, WAF, rate limiting)
- [ ] **Database provisioned** — Neon Postgres Pro plan (managed, point-in-time recovery)
- [ ] **Redis deployed** — Self-hosted on VPS (staging) or Upstash (production scaling)
- [ ] **Object storage** — Cloudflare R2 bucket created for resumes and screenshots
- [ ] **Secret management** — Infisical self-hosted on VPS for secrets rotation
- [ ] **Environment variables** — All production values set in Coolify (NOT in git repository)

## 2. Security

### Headers and Transport

- [ ] **Helmet security headers** — CSP, HSTS, X-Content-Type-Options, X-Frame-Options, Referrer-Policy all configured via `apps/api/src/plugins/security.ts`
- [ ] **CORS** — Restricted to production domain only (not `localhost`)
- [ ] **HSTS preload** — Submitted to HSTS preload list
- [ ] **TLS version** — Minimum TLS 1.2 enforced at Cloudflare

### Authentication

- [ ] **JWT RS256** — Asymmetric signing verified; private key in Infisical, not in code
- [ ] **httpOnly cookies** — Access and refresh tokens stored in httpOnly, Secure, SameSite cookies
- [ ] **Token expiry** — Access: 15 min, Refresh: 7 days
- [ ] **Token rotation** — Refresh tokens are one-time-use (rotated on each refresh)
- [ ] **Google OAuth** — Client ID and secret are production values (not development)
- [ ] **OAuth redirect URI** — Set to production domain only

### Data Protection

- [ ] **Encryption at rest** — SSE-S3 (AES-256) enabled for all S3/R2 buckets
- [ ] **Database encryption** — TLS for database connections; Neon encrypts at rest
- [ ] **PII redaction** — Verified that Sentry, Better Stack, and Grafana Cloud do not receive raw PII
- [ ] **No secrets in frontend bundle** — CI checks for API keys in `apps/web/dist/`

### Access Control

- [ ] **userId-scoped queries** — All repository methods verified to include userId in WHERE clause
- [ ] **Rate limiting** — Per-user and per-IP rate limits configured and tested
- [ ] **WebSocket auth** — JWT validation on WebSocket handshake verified
- [ ] **GDPR endpoints** — Data export and deletion endpoints tested end-to-end

### Vulnerability Management

- [ ] **npm audit** — Zero high/critical vulnerabilities in `pnpm audit`
- [ ] **Dependency updates** — All dependencies at latest patch version
- [ ] **OWASP review** — Security architecture document (`docs/security-architecture.md`) reviewed by team

## 3. Application

### API Server

- [ ] **Health endpoint** — `GET /api/v1/health` returns 200 with service status
- [ ] **Error handling** — Global error handler catches all unhandled exceptions; no stack traces in production responses
- [ ] **Request validation** — All endpoints validated with Zod schemas via ts-rest contracts
- [ ] **Structured logging** — pino JSON logging configured with appropriate log level (info in production)
- [ ] **Graceful shutdown** — Fastify closes connections gracefully on SIGTERM
- [ ] **Request ID** — Every request has a unique `X-Request-ID` header for tracing

### Frontend

- [ ] **Production build** — `pnpm build` completes without errors or warnings
- [ ] **Asset optimization** — Static assets served with cache headers via Cloudflare
- [ ] **Error boundary** — React error boundary catches and reports rendering errors to Sentry
- [ ] **Environment config** — `VITE_API_URL` points to production API domain
- [ ] **No console.log** — ESLint rule prevents console.log in production builds

### Worker

- [ ] **Hatchet connection** — Worker connects to Hatchet engine and registers all workflows
- [ ] **Workflow health** — Hello-world workflow completes successfully
- [ ] **Graceful shutdown** — Worker completes in-progress steps before shutting down

## 4. Database

- [ ] **Migrations applied** — All Drizzle migrations run successfully against production database
- [ ] **Indexes verified** — All performance-critical indexes exist (user_id+status on tasks, etc.)
- [ ] **Connection pooling** — Connection pool size appropriate for VPS tier (default: 10-20)
- [ ] **Backup automated** — Neon point-in-time recovery enabled; OR pg_dump cron to R2 (daily at 3am UTC)
- [ ] **Backup tested** — Restore from backup verified within last 30 days
- [ ] **Seed data removed** — No test/seed data present in production database

## 5. Monitoring and Alerting

- [ ] **Sentry project** — Created, DSN configured in production environment
- [ ] **Error rate baseline** — Initial error rate documented after soft launch
- [ ] **Better Stack monitors** — Active for:
  - [ ] API health (`GET /api/v1/health`) — every 60s
  - [ ] Web health (`GET /`) — every 60s
  - [ ] Database connection — every 60s
- [ ] **Alerting configured:**
  - [ ] API down (2x consecutive failures) — phone call
  - [ ] High error rate (>50 errors/5min) — SMS + email
  - [ ] High memory usage (>90% for 5min) — SMS
  - [ ] Disk space low (>80% used) — email
  - [ ] SSL certificate expiring (<14 days) — email
- [ ] **Grafana Cloud** — Connected for pino logs via Loki; dashboard created for:
  - [ ] Request latency (p50, p95, p99)
  - [ ] Error rate by endpoint
  - [ ] Active WebSocket connections
  - [ ] Hatchet workflow success/failure rate

## 6. CI/CD Pipeline

- [ ] **GitHub Actions** — CI passing on main branch: lint, typecheck, test, build
- [ ] **Coolify auto-deploy** — GitHub webhook triggers build on push to main
- [ ] **Zero-downtime deploys** — Rolling restarts configured in Coolify
- [ ] **Rollback tested** — One-click rollback in Coolify verified
- [ ] **Build time** — CI completes in under 10 minutes
- [ ] **Turborepo cache** — Remote cache configured (Vercel free tier)

## 7. Backup and Disaster Recovery

- [ ] **Database backups** — Automated daily (Neon PITR or pg_dump to R2)
- [ ] **VPS snapshots** — Weekly Hetzner snapshots configured (4 retained)
- [ ] **Recovery time tested:**
  - [ ] Database restore: < 30 minutes
  - [ ] VPS snapshot restore: < 15 minutes
  - [ ] Application redeploy from git: < 5 minutes
- [ ] **Backup verification** — Monthly restore test scheduled

## 8. Legal and Compliance

- [ ] **Terms of Service** — v1.0 reviewed and approved by outside counsel
- [ ] **Privacy Policy** — v1.0 reviewed and approved by outside counsel
- [ ] **Copilot legal disclaimer** — Text approved, versioned, integrated in UI
- [ ] **Consent records** — Consent API recording type, version, timestamp, IP address
- [ ] **Data retention** — Automated cleanup job configured per `packages/shared/src/constants/retention.ts`
- [ ] **GDPR data export** — `GET /api/v1/gdpr/export` returns complete user data as JSON
- [ ] **GDPR account deletion** — `DELETE /api/v1/gdpr/delete-account` initiates 30-day soft delete
- [ ] **Cookie policy** — Only essential cookies used; no third-party tracking
- [ ] **Sub-processor DPAs** — Signed with Anthropic, OpenAI, and all data sub-processors

## 9. Performance

- [ ] **Onboarding time** — < 90 seconds (Google login through dashboard)
- [ ] **Application time** — < 3 minutes per application (Copilot mode)
- [ ] **WebSocket latency** — < 2 seconds for state updates
- [ ] **API response time** — p95 < 500ms for standard endpoints
- [ ] **Kill switch response** — < 2 seconds to halt all automation

## 10. Launch Day

- [ ] **Feature flags** — Kill switch per platform ready (can disable any platform instantly)
- [ ] **Rollback plan** — Documented: who, how, and decision criteria
- [ ] **On-call rotation** — At least one engineer available for first 48 hours
- [ ] **Monitoring dashboards** — Open and visible to the team
- [ ] **Communication plan** — User support email, status page URL, known issues documented

---

## Sign-Off

| Area | Engineer | Date | Status |
|------|----------|------|--------|
| Infrastructure | | | |
| Security | | | |
| API | | | |
| Frontend | | | |
| Worker | | | |
| Database | | | |
| Monitoring | | | |
| CI/CD | | | |
| Legal | | | |
| Performance | | | |

**Launch approval:** All sections must be signed off before production launch.

---

*This checklist is a living document. Update it as requirements evolve and new checks are identified.*
