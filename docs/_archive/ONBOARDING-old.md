# WeKruit Valet - Onboarding Guide

Welcome to the Valet monorepo. This guide walks you through everything you need to get your local environment running and understand the cloud infrastructure.

## What is Valet?

Valet is a dual-mode AI job application automation system. Users upload resumes, and Valet either auto-fills applications (autopilot) or assists with human-in-the-loop review (copilot). It uses browser automation orchestrated through Hatchet workflows, backed by LLM-powered resume parsing and form filling.

## Prerequisites

| Tool    | Version | Install                                                     |
| ------- | ------- | ----------------------------------------------------------- |
| Node.js | 20+     | https://nodejs.org                                          |
| pnpm    | 10+     | `npm install -g pnpm`                                       |
| Fly CLI | latest  | `brew install flyctl` or https://fly.io/docs/flyctl/install |
| Git     | any     | https://git-scm.com                                         |

No Docker is needed. All backing services (Postgres, Redis, Hatchet, RabbitMQ) are cloud-hosted.

## 1. Local Setup (5 minutes)

```bash
git clone https://github.com/WeKruit/VALET.git
cd VALET
cp .env.example .env    # Then fill in values (see "Environment Variables" below)
./scripts/setup.sh      # Installs deps, validates env, runs migrations, builds packages
pnpm dev                # Starts API (8000), Web (5173), and Worker
```

Open:

- **Web app**: http://localhost:5173
- **API server**: http://localhost:8000
- **DB studio**: `pnpm --filter @valet/db db:studio`

## 2. Environment Variables

Copy `.env.example` to `.env`. Every variable is documented in that file. Here's where to get each value:

### Supabase (Postgres + Storage)

1. Go to https://supabase.com/dashboard/project/unistzvhgvgjyzotwzxr
2. **Database URL**: Settings -> Database -> Connection string -> URI
   - Use the **transaction pooler** (port 6543) for `DATABASE_URL`
   - Use the **session pooler** (port 5432) for `DATABASE_DIRECT_URL`
3. **Storage keys**: Storage -> S3 Connection -> Create access keys
4. Create three buckets if they don't exist: `resumes`, `screenshots`, `artifacts`

### Upstash (Redis)

1. Go to https://console.upstash.com
2. Copy the Redis URL (starts with `rediss://`)

### Google OAuth

1. Go to https://console.cloud.google.com -> APIs & Services -> Credentials
2. Copy the OAuth 2.0 Client ID and Secret
3. Add these authorized redirect URIs:
   ```
   http://localhost:8000/api/v1/auth/google/callback
   https://valet-api-dev.fly.dev/api/v1/auth/google/callback
   https://valet-api-stg.fly.dev/api/v1/auth/google/callback
   https://valet-api.fly.dev/api/v1/auth/google/callback
   ```
4. Set `VITE_GOOGLE_CLIENT_ID` to the same Client ID (needed by the frontend)

### JWT Secrets

Generate two random secrets:

```bash
openssl rand -base64 48   # -> JWT_SECRET
openssl rand -base64 48   # -> JWT_REFRESH_SECRET
```

### CloudAMQP (RabbitMQ)

1. Go to https://customer.cloudamqp.com
2. Copy the AMQPS URL from your instance

### Hatchet (Workflow Engine)

1. Go to https://valet-hatchet-dev.fly.dev
2. Log in (or register if first time)
3. Navigate to **Settings -> API Tokens** -> Generate new token
4. Paste into `HATCHET_CLIENT_TOKEN` in `.env`
5. Keep `HATCHET_CLIENT_TLS_STRATEGY=tls`

### LLM Providers

Set at least one of:

- `ANTHROPIC_API_KEY` from https://console.anthropic.com
- `OPENAI_API_KEY` from https://platform.openai.com

## 3. Project Structure

```
packages/
  shared/       Zod schemas, types, constants (source of truth)
  contracts/    ts-rest API contract definitions
  db/           Drizzle ORM schema, migrations
  ui/           Radix + Tailwind component library
  llm/          LLM provider abstraction (Anthropic, OpenAI)
apps/
  api/          Fastify API server (port 8000)
  worker/       Hatchet workflow worker (browser automation)
  web/          React SPA (Vite + TanStack Router, port 5173)
fly/            Fly.io deployment configs (hatchet.toml, api.toml, etc.)
scripts/        Setup and health check scripts
.github/        CI/CD workflows
```

## 4. Common Commands

```bash
pnpm dev              # Start all apps in dev mode (turbo)
pnpm build            # Build everything
pnpm typecheck        # TypeScript strict check across all workspaces
pnpm test             # Run all tests
pnpm lint             # ESLint across monorepo
pnpm --filter @valet/db db:push      # Push schema changes to Supabase
pnpm --filter @valet/db db:generate  # Generate Drizzle migration files
pnpm --filter @valet/db db:studio    # Open Drizzle Studio (DB browser)
```

## 5. Cloud Infrastructure

All services are cloud-hosted. Here's the full map:

| Service       | Provider          | Dashboard                                                   |
| ------------- | ----------------- | ----------------------------------------------------------- |
| Database      | Supabase Postgres | https://supabase.com/dashboard/project/unistzvhgvgjyzotwzxr |
| Redis         | Upstash           | https://console.upstash.com                                 |
| Object Store  | Supabase Storage  | Supabase Dashboard -> Storage                               |
| Auth          | Google OAuth 2.0  | https://console.cloud.google.com -> Credentials             |
| Workflows     | Hatchet (Fly.io)  | https://valet-hatchet-dev.fly.dev                           |
| Message Queue | CloudAMQP         | https://customer.cloudamqp.com                              |
| Hosting       | Fly.io            | https://fly.io/dashboard                                    |

### Environments

| Env        | Branch  | API                           | Web                           | Hatchet                            |
| ---------- | ------- | ----------------------------- | ----------------------------- | ---------------------------------- |
| Local      | any     | http://localhost:8000         | http://localhost:5173         | https://valet-hatchet-dev.fly.dev  |
| Dev        | develop | https://valet-api-dev.fly.dev | https://valet-web-dev.fly.dev | https://valet-hatchet-dev.fly.dev  |
| Staging    | staging | https://valet-api-stg.fly.dev | https://valet-web-stg.fly.dev | https://valet-hatchet-stg.fly.dev  |
| Production | main    | https://valet-api.fly.dev     | https://valet-web.fly.dev     | https://valet-hatchet-prod.fly.dev |

## 6. Hatchet Administration

Hatchet is our workflow orchestration engine, self-hosted on Fly.io as `hatchet-lite`.

### Accessing the Dashboard

- **Dev**: https://valet-hatchet-dev.fly.dev
- **Stg**: https://valet-hatchet-stg.fly.dev
- **Prod**: https://valet-hatchet-prod.fly.dev

### Managing Users

Once logged in as admin: **Settings -> Team Members** to invite/manage users.

### Email Verification Issue

If a user registers and gets stuck on "Verify your email", fix it via the **Supabase SQL Editor** (https://supabase.com/dashboard -> SQL Editor):

```sql
-- Verify a specific user's email
UPDATE "User" SET "emailVerified" = true WHERE email = 'someone@example.com';

-- Or verify all unverified users
UPDATE "User" SET "emailVerified" = true WHERE "emailVerified" = false;
```

This is needed because hatchet-lite has no email server configured. New registrations are auto-verified (via `SERVER_AUTH_SET_EMAIL_VERIFIED=true`), but if a user registered before that flag was set, manual verification is required.

### Generating API Tokens

1. Log into the Hatchet dashboard
2. Go to **Settings -> API Tokens**
3. Click **Create API Token**
4. Copy the token and add it to your `.env` as `HATCHET_CLIENT_TOKEN`

### Connection Limits (Important)

Supabase free tier has **60 max Postgres connections**. Hatchet uses ~10-20 connections. Key settings on Fly.io secrets:

```
DATABASE_MAX_CONNS=5          # Max connections per Hatchet pool
DATABASE_MIN_CONNS=1          # Min connections per Hatchet pool
DATABASE_MAX_QUEUE_CONNS=5    # Max queue pool connections
DATABASE_MIN_QUEUE_CONNS=1    # Min queue pool connections
```

Use the **session pooler** (port 5432) for Hatchet's `DATABASE_URL`, NOT:

- Transaction pooler (port 6543) -- advisory locks fail
- Direct connection (`db.*.supabase.co`) -- IPv6 timeout from Fly.io

### Restarting Hatchet

```bash
# Check status
fly status -a valet-hatchet-dev

# View logs
fly logs -a valet-hatchet-dev

# If Hatchet is crash-looping due to DB connection exhaustion:
# 1. Stop the machine
fly machines stop <machine-id> -a valet-hatchet-dev

# 2. Kill zombie DB connections via Supabase SQL Editor:
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE usename = 'postgres' AND pid != pg_backend_pid();

# 3. Wait 30 seconds, then restart
fly machines start <machine-id> -a valet-hatchet-dev
```

### Updating Hatchet Secrets

```bash
# Set/update a secret (auto-restarts the machine)
fly secrets set -a valet-hatchet-dev KEY="value"

# Stage secrets without restarting (applied on next deploy)
fly secrets set -a valet-hatchet-dev --stage KEY="value"

# List current secrets
fly secrets list -a valet-hatchet-dev
```

## 7. CI/CD Pipeline

We use four GitHub Actions workflows. CI gates every push/PR; CD deploys automatically per branch.

### 7.1. Workflow Overview

| Workflow          | File             | Trigger                                 | What it does                                              |
| ----------------- | ---------------- | --------------------------------------- | --------------------------------------------------------- |
| **CI**            | `ci.yml`         | Push/PR to `main`, `develop`, `staging` | Lint, typecheck, test, build, security scan               |
| **CD Staging**    | `cd-staging.yml` | Push to `staging`                       | Selective deploy (only changed services)                  |
| **CD Production** | `cd-prod.yml`    | Push to `main`                          | Full deploy (all services, migrations conditional)        |
| **Deploy**        | `deploy.yml`     | Called by CD workflows                  | Reusable deploy job (validate, migrate, deploy to Fly.io) |

### 7.2. CI Pipeline (`ci.yml`)

Runs on every push and pull request to `main`, `develop`, or `staging`.

```
Lint -> Typecheck -> Unit Tests -> Build -> Security Audit -> Bundle Secret Scan
```

**Steps:**

1. **Lint** (`pnpm turbo lint`) — ESLint across all workspaces
2. **Typecheck** (`pnpm turbo typecheck`) — Strict TypeScript checks
3. **Unit tests** (`pnpm turbo test`) — Vitest with ephemeral PostgreSQL service container
4. **Build** (`pnpm turbo build`) — Full production build
5. **Security audit** (`pnpm audit --audit-level=high`) — Dependency vulnerability scan (non-blocking warning)
6. **Bundle secret scan** — Greps the built frontend bundle for leaked API keys, connection strings, JWTs

**CI must pass before merging any PR.** The CI job uses a PostgreSQL 16 service container for tests — no external DB needed.

### 7.3. Selective Deploys (`cd-staging.yml`)

Staging uses **smart selective deploys** via [`dorny/paths-filter`](https://github.com/dorny/paths-filter). Only changed services get deployed:

```
detect-changes -> deploy (only affected targets)
```

**Dependency graph encoded in CI:**

| Service        | Deploys when these change                                                                       |
| -------------- | ----------------------------------------------------------------------------------------------- |
| **API**        | `apps/api`, `packages/shared`, `packages/contracts`, `packages/db`, `packages/llm`, `fly/**`    |
| **Worker**     | `apps/worker`, `packages/shared`, `packages/contracts`, `packages/db`, `packages/llm`, `fly/**` |
| **Web**        | `apps/web`, `packages/shared`, `packages/contracts`, `packages/ui`, `fly/**`                    |
| **Migrations** | `packages/db/drizzle/**` only                                                                   |

The `detect-changes` job produces a **Deploy Targets** summary table in the GitHub Actions UI showing exactly what will deploy.

### 7.4. Production Deploys (`cd-prod.yml`)

Production **always deploys all services** for safety. Only migrations are conditional (run when `packages/db/drizzle/**` changes).

Production deploys also support `workflow_dispatch` for manual triggering from the GitHub Actions UI.

**Concurrency:** Production uses `cancel-in-progress: false` (never cancel a running production deploy). Staging uses `cancel-in-progress: true` (supersede stale deploys).

### 7.5. Reusable Deploy Workflow (`deploy.yml`)

Both CD workflows call this shared workflow. It accepts boolean inputs:

| Input            | Type    | Description                                 |
| ---------------- | ------- | ------------------------------------------- |
| `deploy-api`     | boolean | Deploy API to Fly.io                        |
| `deploy-worker`  | boolean | Deploy Worker to Fly.io                     |
| `deploy-web`     | boolean | Deploy Web SPA to Fly.io                    |
| `run-migrations` | boolean | Run `drizzle-kit migrate` against target DB |
| `deploy-hatchet` | boolean | Deploy Hatchet engine (rarely needed)       |

**Deploy order:**

```
validate (typecheck + build)
  ├── migrate (if run-migrations=true)
  │     ├── deploy-api (if deploy-api=true)
  │     └── deploy-worker (if deploy-worker=true)
  └── deploy-web (if deploy-web=true, no migration dependency)
```

API and Worker wait for migrations to complete. Web deploys in parallel (static SPA, no DB dependency). When `run-migrations` is false, the migration job is skipped, and API/Worker proceed directly after validation.

### 7.6. Database Migrations in CI/CD

**Local development:** Use `drizzle-kit push` (applies schema directly, no migration files).

**CI/CD deployments:** Use `drizzle-kit migrate` (applies SQL migration files from `packages/db/drizzle/`).

**When adding a new migration:**

```bash
# 1. Make schema changes in packages/db/src/schema/
# 2. Generate migration SQL
pnpm --filter @valet/db db:generate

# 3. Commit the generated files in packages/db/drizzle/
git add packages/db/drizzle/
git commit -m "db: add migration for ..."
```

The migration files in `packages/db/drizzle/` must be committed to git. The `meta/_journal.json` file tracks migration order and is also committed.

**Important:** The initial schema was applied via `drizzle-kit push`, not `migrate`. When adding the first new migration after initial setup, you may need to seed the `__drizzle_migrations` table so Drizzle knows the baseline is already applied:

```sql
-- Run in Supabase SQL Editor for each environment
INSERT INTO __drizzle_migrations (hash, created_at)
VALUES ('<hash-from-0000-migration-sql>', NOW());
```

### 7.7. GitHub Actions Secrets & Variables

**Per-environment secrets** (set in GitHub repo -> Settings -> Environments -> [environment]):

| Secret                | Used by         | Description                            |
| --------------------- | --------------- | -------------------------------------- |
| `FLY_API_TOKEN`       | Deploy workflow | Fly.io auth token for deployments      |
| `DATABASE_DIRECT_URL` | Migration job   | Session pooler URL (port 5432) for DDL |

**Repository variables** (set in GitHub repo -> Settings -> Actions -> Variables):

| Variable                | Used by     | Description                                |
| ----------------------- | ----------- | ------------------------------------------ |
| `TURBO_TEAM`            | CI & Deploy | Turborepo remote cache team                |
| `VITE_GOOGLE_CLIENT_ID` | Web deploy  | Google OAuth client ID (injected at build) |

**Repository secrets:**

| Secret        | Used by     | Description                  |
| ------------- | ----------- | ---------------------------- |
| `TURBO_TOKEN` | CI & Deploy | Turborepo remote cache token |

## 8. Deploying

### Automatic (CI/CD)

- Push to `develop` -> auto-deploys to dev (selective)
- Push to `staging` -> auto-deploys to staging (selective)
- Push to `main` -> auto-deploys to production (all services)

### Manual Deploy

```bash
# Hatchet engine
fly deploy --config fly/hatchet.toml --app valet-hatchet-dev --remote-only

# API server
fly deploy --config fly/api.toml --app valet-api-dev --remote-only

# Worker
fly deploy --config fly/worker.toml --app valet-worker-dev --remote-only

# Web (needs build args)
fly deploy --config fly/web.toml --app valet-web-dev --remote-only \
  --build-arg VITE_API_URL=https://valet-api-dev.fly.dev \
  --build-arg VITE_WS_URL=wss://valet-api-dev.fly.dev
```

### Manual Deploy via GitHub Actions

For production, you can trigger a deploy from the GitHub Actions UI:

1. Go to **Actions** -> **CD -> Production**
2. Click **Run workflow** -> select `main` branch -> **Run**

### Setting Fly.io Secrets for New Environments

```bash
fly secrets set -a valet-api-dev \
  DATABASE_URL="postgresql://..." \
  REDIS_URL="rediss://..." \
  JWT_SECRET="$(openssl rand -base64 48)" \
  JWT_REFRESH_SECRET="$(openssl rand -base64 48)"
```

## 9. Git Workflow

```
main        <- production (auto-deploys all)
staging     <- staging environment (auto-deploys changed services)
develop     <- integration branch (auto-deploys to dev)
feature/*   <- feature branches (branch from develop)
fix/*       <- bug fixes (branch from develop)
hotfix/*    <- urgent prod fixes (branch from main)
```

### Feature Development

1. Create a feature branch: `git checkout -b feature/my-feature develop`
2. Open PR: `feature/*` -> `develop` (CI runs automatically)
3. After merge to `develop`: auto-deploys to dev
4. Promote to staging: PR `develop` -> `staging`
5. Promote to production: PR `staging` -> `main`

### Hotfixes

1. Branch from main: `git checkout -b hotfix/fix-name main`
2. PR directly into `main` (requires review + CI pass)
3. After merge: auto-deploys to production
4. Backport to develop: `git checkout develop && git merge main`

### Branch Protection (GitHub Settings -> Branches)

| Branch    | Rules                                             |
| --------- | ------------------------------------------------- |
| `main`    | Require PR review, require CI pass, no force push |
| `staging` | Require CI pass, no force push                    |
| `develop` | Require CI pass                                   |

## 10. Security

### 10.1. CI Security Checks

Every CI run includes two automated security checks:

**Dependency audit** (`pnpm audit --audit-level=high`):

- Scans all dependencies for known CVEs
- Currently a **non-blocking warning** — logs vulnerabilities but doesn't fail the build
- Review warnings regularly and upgrade affected packages

**Frontend bundle secret scan**:

- Greps the built `apps/web/dist/` for leaked secret patterns:
  - `sk-ant-` (Anthropic API keys)
  - `sk-proj-` (OpenAI API keys)
  - `GOCSPX-` (Google OAuth secrets)
  - `eyJhbG` (JWT tokens)
  - `postgresql://` (Database URLs)
  - `rediss://` (Redis URLs)
  - `amqps://` (RabbitMQ URLs)
- This is a **hard failure** — build stops if any pattern is found

### 10.2. Secret Management Rules

**Never commit secrets.** Follow these rules:

| Do                                            | Don't                                                       |
| --------------------------------------------- | ----------------------------------------------------------- |
| Use `.env` locally (gitignored)               | Commit `.env` files                                         |
| Use Fly.io secrets for deployed apps          | Hard-code secrets in source                                 |
| Use GitHub environment secrets for CI/CD      | Put secrets in `VITE_*` env vars (leaks to frontend bundle) |
| Use `openssl rand -base64 48` for JWT secrets | Use weak/guessable secrets                                  |
| Rotate secrets after any suspected leak       | Share secrets in Slack/email                                |

**Frontend env vars** (`VITE_*`) are embedded in the built JS bundle and visible to anyone. Only put public values here:

- `VITE_API_URL` — Public API endpoint
- `VITE_WS_URL` — Public WebSocket endpoint
- `VITE_GOOGLE_CLIENT_ID` — OAuth client ID (public by design)

### 10.3. Authentication Security

**Current implementation:**

- Google OAuth 2.0 for user login
- JWT access tokens (short-lived) + refresh tokens (long-lived)
- Tokens stored in `localStorage` on the frontend

**Security considerations:**

- JWT secrets must be at least 32 characters (use `openssl rand -base64 48`)
- Use different secrets for `JWT_SECRET` and `JWT_REFRESH_SECRET`
- Each environment (dev/staging/prod) must have unique JWT secrets
- Access tokens should have short expiry (15-30 minutes)
- Refresh tokens should have longer expiry (7-30 days)

**Future improvements (planned):**

- Move token storage from `localStorage` to `httpOnly` cookies (prevents XSS token theft)
- Add token revocation via Redis blocklist (for logout/password change)

### 10.4. Network Security

**Database connections:**

- Always use Supabase pooler endpoints (never direct `db.*.supabase.co`)
- Transaction pooler (port 6543) for app runtime — enforces connection limits
- Session pooler (port 5432) for migrations/DDL — needed for advisory locks
- Connection strings use SSL by default (Supabase enforces this)

**Hatchet gRPC:**

- Uses TLS via Fly.io's edge proxy (`h2_backend=true`)
- Worker connects with `TLS_STRATEGY=tls` + SNI server name
- Dashboard served over HTTPS on port 8443

**CORS:**

- API only accepts requests from `CORS_ORIGIN` (set per environment)
- Local: `http://localhost:5173`
- Production: `https://valet-web.fly.dev`

### 10.5. ESLint Security Rules

Our ESLint config enforces several security-adjacent rules:

| Rule                      | What it catches                                               |
| ------------------------- | ------------------------------------------------------------- |
| `no-console`              | Prevents `console.log` in production (allows `warn`/`error`)  |
| `consistent-type-imports` | Ensures `import type` for type-only imports (smaller bundles) |
| `no-unused-vars`          | Dead code that could hide security issues                     |
| `no-explicit-any`         | Warns on untyped code (weaker type safety)                    |

### 10.6. Dependency Security

- **Lock file integrity**: CI uses `pnpm install --frozen-lockfile` — fails if `pnpm-lock.yaml` is out of sync
- **No phantom dependencies**: pnpm's strict module resolution prevents importing unlisted packages
- **Audit on every CI run**: `pnpm audit --audit-level=high` flags known vulnerabilities
- **Review before upgrading**: Always check changelogs before major version bumps

### 10.7. Secret Rotation Checklist

If a secret is compromised, rotate it immediately:

```bash
# 1. Generate new secret
NEW_SECRET=$(openssl rand -base64 48)

# 2. Update in Fly.io (auto-restarts the app)
fly secrets set -a valet-api-dev JWT_SECRET="$NEW_SECRET"
fly secrets set -a valet-api-stg JWT_SECRET="$NEW_SECRET"
fly secrets set -a valet-api     JWT_SECRET="$NEW_SECRET"

# 3. Update local .env
# 4. Update GitHub environment secrets if applicable
# 5. Note: rotating JWT_SECRET invalidates all existing user sessions
```

## 11. Troubleshooting

### CI Failures

**Lint fails with unused variable:**
Prefix unused function parameters with `_` (e.g., `_ctx`, `_reply`). ESLint is configured to ignore `_`-prefixed names.

**Tests fail with "No test files found":**
Each package's `vitest.config.ts` has `passWithNoTests: true`. If this still happens, check that the vitest config exists in the failing package.

**Build fails with "Cannot find module":**
Run `pnpm install` then build shared packages first:

```bash
pnpm turbo build --filter=@valet/shared --filter=@valet/contracts --filter=@valet/db
```

### CD Failures

**Deploy skipped unexpectedly (staging):**
The selective deploy didn't detect changes in your service's dependency tree. Check the **Deploy Targets** summary in the GitHub Actions run. If infra files changed (`fly/**`, `pnpm-lock.yaml`, `turbo.json`), all services deploy.

**Migration fails with "type already exists":**
The migration is trying to replay an already-applied schema change. This happens when the schema was applied via `drizzle-kit push` but the migration tracking table doesn't know about it. Seed `__drizzle_migrations` manually (see [section 7.6](#76-database-migrations-in-cicd)).

**flyctl deploy fails with Dockerfile not found:**
The deploy workflow copies `fly/*.toml` to the repo root before deploying. If you see path issues, check that `[build].dockerfile` in your toml file is relative to the repo root (e.g., `apps/api/Dockerfile`).

### Local Development

**"VITE_GOOGLE_CLIENT_ID is not set":**
Set `VITE_GOOGLE_CLIENT_ID` in `.env` to the same value as `GOOGLE_CLIENT_ID`.

**"MaxClientsInSessionMode" in Hatchet logs:**
Too many database connections. See [Hatchet Connection Limits](#connection-limits-important) above.

**Hatchet crash loop after DB connection exhaustion:**
Kill zombie connections via Supabase SQL Editor, then restart. See [Restarting Hatchet](#restarting-hatchet) above.

**`drizzle-kit push` fails with ECONNREFUSED:**
Make sure your `.env` is loaded. Run with env vars explicitly:

```bash
DATABASE_DIRECT_URL="postgresql://..." pnpm --filter @valet/db db:push
```

**Worker won't start:**
Check that `HATCHET_CLIENT_TOKEN` is set in `.env`. Get it from the Hatchet dashboard -> Settings -> API Tokens.

**TypeScript errors after pulling:**

```bash
pnpm install
pnpm turbo build --filter=@valet/shared --filter=@valet/contracts --filter=@valet/db
pnpm typecheck
```

## 12. Best Practices

### Code Quality

- **Run CI locally before pushing**: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`
- **Keep PRs small**: One feature or fix per PR. Easier to review and debug.
- **Zod schemas are source of truth**: Never hand-write TypeScript types that should come from `z.infer<>`.
- **Use type imports**: `import type { Foo }` for type-only imports (enforced by ESLint).
- **Prefix unused params**: Use `_ctx` not `ctx` for unused function parameters.

### Testing

- **Per-package vitest configs**: `packages/ui` and `apps/web` use `jsdom` environment; everything else uses `node`.
- **passWithNoTests**: All vitest configs set this to `true` — packages without tests don't block CI.
- **Tests run against ephemeral DB**: CI spins up a PostgreSQL 16 service container. No external DB needed.
- **Skipped tests are OK**: Use `it.skip()` for known-broken tests with a comment explaining why. Don't delete tests.

### Deployment

- **Never force-push to `main` or `staging`**: Branch protection rules prevent this.
- **Test in staging first**: Always merge to `staging` and verify before promoting to `main`.
- **Check deploy targets**: For staging deploys, review the **Deploy Targets** summary in GitHub Actions.
- **Manual production deploy**: Use `workflow_dispatch` from the GitHub Actions UI if needed.
- **Hatchet deploys are manual**: Hatchet uses a pre-built Docker image and rarely changes. Deploy only when updating Hatchet itself.

### Secrets

- **One secret per purpose**: Don't reuse JWT_SECRET for other signing needs.
- **Environment isolation**: Dev/staging/prod must have different secrets, different DB credentials, different OAuth apps.
- **Rotate after incidents**: If any secret may have leaked, rotate immediately (see [section 10.7](#107-secret-rotation-checklist)).

## 13. Key Technical Decisions

For deeper technical context, see `CLAUDE.md`. Highlights:

- **Contract-first API**: Zod schemas in `packages/shared` -> ts-rest contracts in `packages/contracts` -> Fastify routes
- **DI Container**: Fastify + awilix with `AppCradle` pattern
- **Hatchet v1 SDK**: `workflow.task()` builder pattern with parent/child task dependencies
- **LLM Router**: 3-tier fallback (Claude Sonnet -> GPT-4.1 mini -> GPT-4.1 nano) with per-task budgeting
- **Database**: Drizzle ORM + Supabase Postgres (transaction pooler for app, session pooler for Hatchet)
- **Storage**: Supabase Storage S3 protocol with `@aws-sdk/client-s3`
- **Selective deploys**: `dorny/paths-filter` encodes the monorepo dependency graph in CI to avoid unnecessary deploys
- **Ephemeral test DB**: CI uses a PostgreSQL service container — no shared test database, no flaky state
