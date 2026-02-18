# WeKruit Valet — Security Architecture

**Version:** 1.0
**Date:** 2026-02-12
**Status:** Active
**Audience:** Engineering, Security, Compliance

---

## 1. OWASP Top 10 Coverage

### 1.1 A01:2021 — Broken Access Control

**Risk:** Unauthorized users accessing other users' data or performing actions beyond their authorization level.

**Mitigations:**

- All database queries are scoped to the authenticated `userId`. Every repository method accepts `userId` as a mandatory parameter and includes it in the WHERE clause. This is an RLS-style pattern enforced at the application layer.
- JWT tokens (RS256) encode the user's identity. Tokens are validated on every request by the auth middleware (`apps/api/src/common/middleware/auth.ts`).
- Autopilot actions are bound to the authenticated user's consent records. The system verifies active consent before executing any Autopilot workflow.
- No horizontal privilege escalation: users cannot modify their JWT claims client-side (RS256 asymmetric signing).
- No vertical privilege escalation: admin endpoints (future) will require a separate role claim verified server-side.

**Implementation locations:**

- `apps/api/src/common/middleware/auth.ts` — JWT validation
- All `*.repository.ts` files — userId-scoped queries
- `apps/api/src/modules/gdpr/gdpr.service.ts` — userId-scoped data export/deletion

### 1.2 A02:2021 — Cryptographic Failures

**Risk:** Exposure of sensitive data due to weak or absent encryption.

**Mitigations:**

- **In transit:** All communication uses TLS 1.2+ (HTTPS for REST, WSS for WebSocket). HSTS header enforced with max-age of 1 year, includeSubDomains, and preload.
- **At rest:** Resume files and screenshots stored in S3/MinIO use server-side encryption (SSE-S3, AES-256). Database connections use TLS.
- **JWT tokens:** Signed with RS256 (asymmetric). Private key stored in environment variables (Infisical in production). Access tokens expire in 15 minutes; refresh tokens in 7 days.
- **Cookies:** Authentication tokens stored in httpOnly, Secure, SameSite=Strict cookies. Not accessible to client-side JavaScript.
- **Password storage:** N/A — Google OAuth only, no password storage.
- **PII in logs:** Personally identifiable information is redacted from error tracking (Sentry) and application logs (pino) before transmission to external services.

### 1.3 A03:2021 — Injection

**Risk:** SQL injection, NoSQL injection, command injection through user-controlled input.

**Mitigations:**

- **SQL injection:** Drizzle ORM generates parameterized queries. No raw SQL strings with user input concatenation. Drizzle's query builder uses prepared statements.
- **Command injection:** The Service does not execute shell commands based on user input. Browser automation is handled through structured CDP (Chrome DevTools Protocol) messages, not shell commands.
- **LLM prompt injection:** User-provided text (resume content, Q&A answers) is inserted into LLM prompts using structured templates with clear delimiters. System prompts are separated from user content. LLM output is validated against expected schemas (Zod) before use.
- **Zod validation:** All API request bodies, query parameters, and path parameters are validated using Zod schemas before reaching service logic. Invalid input is rejected with a 400 response.

**Implementation locations:**

- `packages/db/` — Drizzle ORM (parameterized queries)
- `packages/shared/src/schemas/` — Zod validation schemas
- ts-rest contract definitions enforce validation at the API boundary

### 1.4 A04:2021 — Insecure Design

**Risk:** Architecture-level design flaws that enable attacks.

**Mitigations:**

- **Threat modeling:** This document serves as the threat model. Each OWASP category maps to specific controls.
- **Progressive consent:** 5-layer consent model prevents users from accessing high-risk features (Autopilot) without informed authorization.
- **Quality gates:** 9 mandatory quality gates for Autopilot prevent runaway autonomous submissions.
- **Kill switch:** Sub-2-second emergency stop for all automation.
- **Rate limiting:** Per-user, per-platform rate limits enforced server-side (not client-side).
- **Separation of concerns:** Feature-based module architecture isolates domain logic. DI via @fastify/awilix prevents tight coupling.

### 1.5 A05:2021 — Security Misconfiguration

**Risk:** Default credentials, unnecessary features, missing security headers.

**Mitigations:**

- **Security headers:** @fastify/helmet configures comprehensive HTTP security headers:
  - `Content-Security-Policy`: Restrictive CSP (self-only for scripts, no inline scripts)
  - `Strict-Transport-Security`: 1 year, includeSubDomains, preload
  - `X-Content-Type-Options`: nosniff
  - `X-Frame-Options`: DENY (via CSP frame-ancestors)
  - `Referrer-Policy`: strict-origin-when-cross-origin
  - `X-XSS-Protection`: Enabled (legacy header, defense-in-depth)
  - `X-Powered-By`: Hidden
- **CORS:** Restricted to the specific frontend origin. Credentials mode enabled only for the dashboard domain.
- **Environment validation:** `packages/shared/src/env.ts` validates all environment variables on application startup. Missing or invalid configuration causes immediate process exit.
- **No default credentials:** Docker Compose development environment uses non-default passwords. Production credentials are managed via Infisical (secret management).

**Implementation locations:**

- `apps/api/src/plugins/security.ts` — Helmet + CORS configuration
- `packages/shared/src/env.ts` — Environment validation

### 1.6 A06:2021 — Vulnerable and Outdated Components

**Risk:** Known vulnerabilities in third-party dependencies.

**Mitigations:**

- **Automated scanning:** `pnpm audit` runs in the CI pipeline on every pull request. Builds fail on high/critical vulnerabilities.
- **Dependency updates:** Renovate or Dependabot configured for automated dependency update PRs.
- **Frontend bundle scanning:** CI verifies no API keys or secrets are present in the frontend build output.
- **Lock file:** `pnpm-lock.yaml` ensures reproducible builds. No floating dependency versions.
- **Minimal dependencies:** Architecture favors standard library and well-maintained packages. Avoided heavy framework dependencies where simpler alternatives exist.

### 1.7 A07:2021 — Identification and Authentication Failures

**Risk:** Broken authentication allowing unauthorized access.

**Mitigations:**

- **Google OAuth 2.0:** Authentication delegated to Google. No password management, no password reset flows, no brute-force risk on our side.
- **JWT RS256:** Access tokens signed with RSA-256 (asymmetric). Cannot be forged without the private key.
- **Token rotation:** Short-lived access tokens (15 minutes) with longer-lived refresh tokens (7 days). Refresh tokens are rotated on use (one-time use).
- **httpOnly cookies:** Tokens stored in httpOnly cookies, preventing XSS-based token theft.
- **Session invalidation:** Account deletion immediately invalidates all refresh tokens. Password changes at Google propagate on next token refresh.
- **WebSocket authentication:** WS connections require a valid JWT token as a query parameter on the initial handshake. Token is validated before the connection is upgraded.

### 1.8 A08:2021 — Software and Data Integrity Failures

**Risk:** Tampered dependencies, unsigned code, insecure deserialization.

**Mitigations:**

- **Zod validation on all inputs:** Every external input (API request, WebSocket message, webhook payload) is validated through Zod schemas. Invalid data is rejected before it reaches application logic. This prevents deserialization attacks.
- **Lock file integrity:** pnpm's lock file ensures dependency integrity. CI runs `pnpm install --frozen-lockfile` to prevent unexpected dependency changes.
- **No eval or dynamic code execution:** The codebase does not use `eval()`, `Function()`, or other dynamic code execution on user-provided data.
- **Consent versioning:** Consent records are append-only (immutable). Consent cannot be retroactively modified.

### 1.9 A09:2021 — Security Logging and Monitoring Failures

**Risk:** Attacks go undetected due to insufficient logging.

**Mitigations:**

- **Structured logging:** pino JSON-structured logs for all application events. Log levels: fatal, error, warn, info, debug, trace.
- **Audit trail:** Every state transition, field fill, LLM decision, and user action is recorded in the `audit_trail` and `task_events` tables with timestamps, actor, and metadata. Audit records are immutable (append-only).
- **Error tracking:** Sentry captures all unhandled exceptions with stack traces, request context, and breadcrumbs. PII is scrubbed before transmission.
- **Uptime monitoring:** Better Stack monitors API and web health endpoints every 60 seconds. Alerts via phone, SMS, and email.
- **Metrics dashboards:** Grafana Cloud for application metrics, request latency, error rates, and resource utilization.
- **Security events logged:** Failed authentication attempts, rate limit hits, kill switch activations, consent changes, and GDPR requests are all logged with structured metadata.

**Log retention:** Application logs retained for 30 days (Better Stack / Grafana Cloud). Audit trail retained for 730 days (database). Consent records retained for account lifetime + 730 days.

### 1.10 A10:2021 — Server-Side Request Forgery (SSRF)

**Risk:** Attacker tricks the server into making requests to internal resources.

**Mitigations:**

- **URL validation:** Job URLs provided by users are validated against expected patterns (known platform domains: linkedin.com, greenhouse.io, lever.co, myworkdayjobs.com). Arbitrary URLs are rejected.
- **No open redirects:** The Service does not follow user-provided redirect URLs.
- **Network segmentation:** In production, the API server does not have direct access to internal infrastructure services (database, Redis) from user-controllable code paths. Database connections are established via connection strings at startup, not per-request.
- **Browser automation isolation:** Browser automation runs in isolated AdsPower profiles. The automation worker connects to AdsPower via a well-defined local API, not via arbitrary user-controlled URLs.

---

## 2. Authentication Architecture

### 2.1 Auth Flow

```
User                    Frontend (SPA)              API Server              Google OAuth
  |                         |                          |                       |
  |--- Click "Sign In" ---->|                          |                       |
  |                         |--- Redirect to Google -->|                       |
  |                         |                          |--- Auth request ----->|
  |                         |                          |                       |
  |<--------- Google consent screen ----------------------------------------->|
  |                         |                          |                       |
  |--- Approve consent ---->|                          |                       |
  |                         |<-- Redirect with code ---|                       |
  |                         |--- POST /auth/google --->|                       |
  |                         |                          |--- Exchange code ---->|
  |                         |                          |<-- ID token + profile-|
  |                         |                          |                       |
  |                         |                          |--- Create/find user   |
  |                         |                          |--- Generate JWT pair  |
  |                         |                          |                       |
  |                         |<-- Set httpOnly cookies --|                       |
  |                         |--- Redirect /dashboard ->|                       |
```

### 2.2 Token Lifecycle

| Token         | Type      | Storage                           | Expiry     | Rotation                          |
| ------------- | --------- | --------------------------------- | ---------- | --------------------------------- |
| Access token  | JWT RS256 | httpOnly cookie                   | 15 minutes | Automatic via refresh             |
| Refresh token | JWT RS256 | httpOnly cookie (Strict SameSite) | 7 days     | One-time use (rotated on refresh) |

### 2.3 Token Claims

```json
{
  "sub": "user-uuid",
  "email": "user@example.com",
  "name": "User Name",
  "iat": 1707700800,
  "exp": 1707701700,
  "iss": "wekruit-valet",
  "aud": "wekruit-valet-api"
}
```

---

## 3. PII Inventory

| Data Element            | Classification   | Storage            | Encrypted at Rest | Retention               | GDPR Basis       |
| ----------------------- | ---------------- | ------------------ | ----------------- | ----------------------- | ---------------- |
| Email address           | PII              | PostgreSQL         | Database-level    | Account lifetime        | Contract         |
| Full name               | PII              | PostgreSQL         | Database-level    | Account lifetime        | Contract         |
| Phone number            | PII              | PostgreSQL         | Database-level    | Account lifetime        | Contract         |
| Physical address        | PII              | PostgreSQL         | Database-level    | Account lifetime        | Contract         |
| Resume content          | Sensitive PII    | S3 (SSE-S3)        | AES-256           | Account lifetime        | Contract         |
| Work history            | PII              | PostgreSQL (JSONB) | Database-level    | Account lifetime        | Contract         |
| Education history       | PII              | PostgreSQL (JSONB) | Database-level    | Account lifetime        | Contract         |
| Salary expectations     | Sensitive PII    | PostgreSQL         | Database-level    | Account lifetime        | Consent          |
| EEO responses           | Special category | PostgreSQL         | Database-level    | Account lifetime        | Explicit consent |
| Application screenshots | Contains PII     | S3 (SSE-S3)        | AES-256           | 30-90 days              | Consent          |
| LLM prompts/responses   | Contains PII     | PostgreSQL (JSONB) | Database-level    | 90 days                 | Consent          |
| IP address              | PII              | PostgreSQL         | Database-level    | Consent record lifetime | Legal obligation |

---

## 4. Data Flow Diagram

### 4.1 Copilot Mode Data Flow

```
User Browser
    |
    v
[Frontend SPA] --(HTTPS)--> [Fastify API] --(TLS)--> [PostgreSQL]
    |                            |                         |
    |                            |--- (TLS) --> [Redis]    |
    |                            |                         |
    |                            |--- (HTTPS) --> [LLM APIs]
    |                            |    (Anthropic / OpenAI)
    |                            |
    |                            |--- (S3 API) --> [MinIO/R2]
    |                            |    (Resume + Screenshot storage)
    |                            |
    |<--(WSS)--- [WebSocket] <---|
    |
    v
[User reviews fields, approves submission]
    |
    v
[Fastify API] --> [GhostHands API] --> [AdsPower Browser]
                                          |
                                          v
                                    [Platform ATS]
                                    (LinkedIn, Greenhouse, etc.)
```

### 4.2 Autopilot Mode Data Flow

```
[User starts session with parameters]
    |
    v
[Fastify API] --> [GhostHands API] --> [Quality Gate Check (9 gates)]
                      |                       |
                      |              [PASS]    |    [FAIL]
                      |                |       |      |
                      |                v       |      v
                      |         [Submit via    |  [Queue for
                      |          AdsPower]     |   user review]
                      |                |       |
                      |                v       |
                      |         [Log audit     |
                      |          trail]        |
                      |                |       |
                      v                v       |
               [Redis Pub/Sub] --> [WebSocket] --> [Frontend]
                                                       |
                                                       v
                                               [Post-session summary]
```

---

## 5. Rate Limiting Strategy

| Scope                            | Limit | Window     | Implementation       |
| -------------------------------- | ----- | ---------- | -------------------- |
| API requests per user            | 100   | 1 minute   | Redis sliding window |
| Login attempts per IP            | 10    | 15 minutes | Redis fixed window   |
| Resume uploads per user          | 10    | 1 hour     | Redis sliding window |
| Task creation per user           | 30    | 1 hour     | Redis sliding window |
| WebSocket connections per user   | 3     | Concurrent | In-memory counter    |
| Autopilot: LinkedIn per day      | 10    | 24 hours   | Redis + database     |
| Autopilot: Greenhouse per day    | 15    | 24 hours   | Redis + database     |
| Autopilot: All platforms per day | 25    | 24 hours   | Redis + database     |
| GDPR export requests             | 3     | 24 hours   | Redis sliding window |

Rate limit headers returned on every response:

- `X-RateLimit-Remaining`: Remaining requests in current window
- `Retry-After`: Seconds until rate limit resets (on 429 responses)

---

## 6. Incident Response

### 6.1 Security Incident Classification

| Severity | Example                                       | Response Time        | Notification                                     |
| -------- | --------------------------------------------- | -------------------- | ------------------------------------------------ |
| Critical | Data breach, unauthorized data access         | Immediate (< 1 hour) | Phone call to on-call, email to all stakeholders |
| High     | Authentication bypass, privilege escalation   | < 4 hours            | SMS + email to engineering leads                 |
| Medium   | Rate limit bypass, XSS vulnerability found    | < 24 hours           | Email to engineering team                        |
| Low      | Minor CSP violation, dependency vulnerability | < 1 week             | Ticket created in issue tracker                  |

### 6.2 Data Breach Response (GDPR Article 33/34)

1. **Detection:** Sentry alerts, log anomalies, user reports, or automated monitoring.
2. **Containment:** Immediately disable affected feature or service. Revoke compromised credentials.
3. **Assessment:** Determine scope (number of affected users, data categories exposed).
4. **Notification — Supervisory Authority:** Within 72 hours of becoming aware (GDPR Article 33). Include: nature of breach, categories of data, approximate number of affected individuals, consequences, measures taken.
5. **Notification — Affected Users:** Without undue delay if high risk to rights and freedoms (GDPR Article 34). Include: plain language description, DPO contact, likely consequences, remediation measures.
6. **Remediation:** Fix root cause, deploy patches, update security controls.
7. **Post-mortem:** Document incident, root cause, timeline, and preventive measures in a GitHub Issue with the `incident` label.

---

## 7. Dependency Security

### 7.1 CI Pipeline Security Checks

```yaml
# Runs on every PR (excerpt from .github/workflows/ci.yml)
- name: Security scan
  run: |
    pnpm audit --audit-level=high || true
    # Verify no secrets in frontend bundle
    if grep -r "sk-" apps/web/dist/ 2>/dev/null; then
      echo "FATAL: API key found in frontend bundle"
      exit 1
    fi
```

### 7.2 Secret Management

| Environment | Secret Storage                | Rotation                                 |
| ----------- | ----------------------------- | ---------------------------------------- |
| Development | `.env` file (gitignored)      | Manual                                   |
| Staging     | Coolify environment variables | Manual                                   |
| Production  | Infisical (self-hosted)       | Automated (90-day rotation for API keys) |

Secrets that must never appear in:

- Git history
- Frontend bundle
- Application logs
- Error tracking (Sentry)
- Client-side JavaScript

---

_This document is maintained by the engineering team and updated with each security-relevant architecture change. Last reviewed: 2026-02-12._
