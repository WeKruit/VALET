# WeKruit Valet - Developer Guide

> **BEFORE YOU START:** Read the following docs to understand the project architecture, current state, and integration points. Do not make changes until you have reviewed them.
>
> **Required reading:**
>
> 1. `docs/CURRENT-STATE.md` — Full technical reference (architecture, DB schema, frontend, backend, worker)
> 2. `docs/ROLLOUT-AND-DEPLOYMENT.md` — Deployment operations (Fly.io, EC2, GH Docker pipeline)
> 3. `docs/REGRESSION-TESTING.md` — Regression test plans and rollback procedures
> 4. `core-docs/ghost-hands-integration/VALET-INTEGRATION-CONTRACT.md` — GH API contract
>
> **Cross-project references:**
>
> - `../INTEGRATION.md` — Unified VALET + GHOST-HANDS integration doc (cross-team sync, known issues)
> - `../PRODUCT-STATUS-AND-ROADMAP.md` — Product status, roadmap, prioritized backlog
> - Sibling project: `../GHOST-HANDS/CLAUDE.md` — GHOST-HANDS development guide
>
> **Additional references:**
>
> - `docs/production-checklist.md` — Pre-launch readiness checklist
> - `docs/security-architecture.md` — Security architecture and threat model
> - `docs/ec2-worker-guide.md` — EC2 worker setup and management
>
> This file is the quick-reference dev guide.

## Quick Start

```bash
git clone https://github.com/WeKruit/VALET.git
cd VALET
cp .env.example .env       # Fill in your values (see below)
./scripts/setup.sh         # Install deps, validate env, run migrations
pnpm dev                   # Start all apps
```

Open: http://localhost:5173 (web) / http://localhost:8000 (api)

## Project Structure

Turborepo + pnpm monorepo with 8 workspaces:

```
packages/shared    - Zod schemas, types, constants
packages/contracts - ts-rest API contract definitions
packages/db        - Drizzle ORM, migrations, seed
packages/ui        - Radix + Tailwind component library
packages/llm       - LLM provider abstraction (Anthropic, OpenAI)
apps/api           - Fastify API server (port 8000)
apps/worker        - GhostHands browser automation worker (dispatches jobs via REST)
apps/web           - React SPA (Vite + React Router, port 5173)
```

## Service Stack

All services are cloud-hosted. No Docker needed for local development.

| Service       | Provider          | Dashboard                                                   |
| ------------- | ----------------- | ----------------------------------------------------------- |
| Database      | Supabase Postgres | https://supabase.com/dashboard/project/unistzvhgvgjyzotwzxr |
| Redis         | Upstash           | https://console.upstash.com                                 |
| Object Store  | Supabase Storage  | Supabase Dashboard > Storage                                |
| Auth          | Google OAuth 2.0  | https://console.cloud.google.com > Credentials              |
| Message Queue | CloudAMQP         | https://customer.cloudamqp.com                              |
| Hosting       | Fly.io            | https://fly.io/dashboard                                    |

### Database Connections

- **Transaction pooler** (port 6543): `DATABASE_URL` -- used by the app at runtime (pgbouncer)
- **Direct connection** (port 5432): `DATABASE_DIRECT_URL` -- used for migrations/DDL (bypasses pgbouncer)

### Supabase Storage S3

Uses S3-compatible protocol. Create access keys at:
Supabase Dashboard > Storage > S3 Connection > New access key

Three buckets needed: `resumes`, `screenshots`, `artifacts`

## GhostHands Integration

VALET delegates browser automation to **GhostHands (GH)**, a separate service running on EC2.

- **Job dispatch**: `TaskService.create()` calls `GhostHandsClient.submitApplication()` via HTTP POST
- **Callback**: GH sends status updates to `POST /api/v1/webhooks/ghosthands` with service key auth
- **Status mapping**: GH statuses (running/completed/failed/needs_human/resumed/cancelled) map to VALET task statuses
- **HITL flow**: When GH returns `needs_human`, VALET sets task to `waiting_human` and publishes WebSocket event. User resolves via UI, VALET calls `GhostHandsClient.resumeJob()`
- **Shared DB tables**: `gh_automation_jobs`, `gh_browser_sessions`, `gh_job_events` are owned by GH but read/written by VALET for sync
- **Deploy webhook**: `POST /api/v1/webhooks/ghosthands/deploy` receives HMAC-signed deploy notifications

## Commands

```bash
pnpm install          # Install all dependencies
pnpm dev              # Start all apps in dev mode
pnpm build            # Build everything
pnpm typecheck        # TypeScript strict check (all workspaces)
pnpm test             # Run all tests
pnpm lint             # ESLint across monorepo
pnpm db:generate      # Generate Drizzle migrations
pnpm db:migrate       # Run migrations
```

## Scripts

```bash
./scripts/setup.sh           # First-time local dev setup
./scripts/setup-fly.sh stg   # Create Fly.io apps for staging
./scripts/setup-fly.sh prod  # Create Fly.io apps for production
./scripts/health-check.sh    # Check service connectivity
```

## Git Branching Strategy

```
main        <- production (auto-deploys to Fly.io prod)
staging     <- staging / integration branch (auto-deploys to Fly.io stg)
feature/*   <- feature branches (branch from staging)
fix/*       <- bug fixes (branch from staging)
hotfix/*    <- urgent prod fixes (branch from main)
```

### Workflow

1. **New feature**: `git checkout -b feature/my-feature staging`
2. **Open PR**: feature/\* -> staging (CI runs lint + typecheck + test + build)
3. **After merge to staging**: auto-deploys to staging environment
4. **Promote to production**: PR staging -> main (requires approval)
5. **Hotfix**: `git checkout -b hotfix/fix-name main`, PR -> main, then backport to staging

### Branch Protection Rules (set in GitHub Settings > Branches)

- `main`: Require PR review, require CI pass, no force push
- `staging`: Require CI pass, no force push

## Environments

| Env        | Branch  | API URL                       | Web URL                       |
| ---------- | ------- | ----------------------------- | ----------------------------- |
| Local      | any     | http://localhost:8000         | http://localhost:5173         |
| Staging    | staging | https://valet-api-stg.fly.dev | https://valet-web-stg.fly.dev |
| Production | main    | https://valet-api.fly.dev     | https://valet-web.fly.dev     |

### Google OAuth Redirect URIs

The frontend uses client-side OAuth flow (`window.location.origin + "/login"`).
Add ALL of these to Google Cloud Console > Credentials > OAuth 2.0 Client > **Authorized redirect URIs**:

```
http://localhost:5173/login
https://valet-web-stg.fly.dev/login
https://valet-web.fly.dev/login
```

Also add these to **Authorized JavaScript origins**:

```
http://localhost:5173
https://valet-web-stg.fly.dev
https://valet-web.fly.dev
```

Note: The OAuth flow redirects back to the **frontend** `/login` page (not an API callback).
The frontend then exchanges the code with the API via `POST /api/v1/auth/google`.

## Secrets Management

| Where          | What                                                | How                                        |
| -------------- | --------------------------------------------------- | ------------------------------------------ |
| Local          | All env vars                                        | `.env` file (gitignored)                   |
| Fly.io apps    | DATABASE_URL, REDIS_URL, JWT_SECRET, API keys, etc. | `fly secrets set -a <app-name> KEY=value`  |
| GitHub Actions | FLY_API_TOKEN, DATABASE_DIRECT_URL                  | Settings > Secrets and variables > Actions |
| EC2 Sandboxes  | Worker .env (DB, Redis, GH keys, etc.)              | `secrets-sync.yml` workflow                |

### Setting Fly.io Secrets

```bash
# Example: set secrets for staging API
fly secrets set -a valet-api-stg \
  DATABASE_URL="postgresql://..." \
  REDIS_URL="rediss://..." \
  JWT_SECRET="$(openssl rand -base64 48)"

# List current secrets
fly secrets list -a valet-api-stg
```

### Manual Deploy (without CI)

Note: flyctl resolves Dockerfile paths relative to the toml file directory.

```bash
# Staging
fly deploy --config fly/api.toml --app valet-api-stg --remote-only
fly deploy --config fly/worker.toml --app valet-worker-stg --remote-only
fly deploy --config fly/web.toml --app valet-web-stg --remote-only \
  --build-arg VITE_API_URL=https://valet-api-stg.fly.dev \
  --build-arg VITE_WS_URL=wss://valet-api-stg.fly.dev \
  --build-arg VITE_GOOGLE_CLIENT_ID=108153440133-8oorgsj5m7u67fg68bulpr1akrs6ttet.apps.googleusercontent.com

# Production
fly deploy --config fly/api.toml --app valet-api --remote-only
fly deploy --config fly/worker.toml --app valet-worker --remote-only
fly deploy --config fly/web.toml --app valet-web --remote-only \
  --build-arg VITE_API_URL=https://valet-api.fly.dev \
  --build-arg VITE_WS_URL=wss://valet-api.fly.dev \
  --build-arg VITE_GOOGLE_CLIENT_ID=108153440133-8oorgsj5m7u67fg68bulpr1akrs6ttet.apps.googleusercontent.com
```

## Database Migrations

Migrations run automatically during every API deploy via Fly.io's `release_command`. The flow:

1. `fly deploy` builds and pushes the new Docker image
2. Fly spins up a **temporary VM** with the new image and runs `node packages/db/dist/migrate.js`
3. If the migration succeeds, Fly swaps traffic to the new version
4. If the migration fails, the deploy is **aborted** and the old version keeps running

### Adding a new migration

```bash
# 1. Update the schema in packages/db/src/schema/*.ts
# 2. Write the migration SQL:
#    packages/db/drizzle/NNNN_description.sql
# 3. Add entry to packages/db/drizzle/meta/_journal.json
# 4. Commit and push -- CD handles the rest
```

### Important notes

- `migrate.ts` prefers `DATABASE_DIRECT_URL` (session pooler, port 5432) over `DATABASE_URL` (transaction pooler, port 6543). Both must be set as Fly secrets on the API app.
- The `_journal.json` file MUST be tracked in git (not gitignored) -- the Docker image needs it.
- Staging and production currently share the same Supabase database. A migration applied to one environment affects both.

## Key Technical Decisions

- **ts-rest React Query v5**: Use `initTsrReactQuery` from `@ts-rest/react-query/v5` with single options object `{ queryKey, queryData, ...options }`
- **DI Container**: Fastify + awilix, module augmentation uses `AppCradle` pattern (not recursive `Cradle extends Cradle`)
- **TypeScript strict**: `noUncheckedIndexedAccess`, `verbatimModuleSyntax`, literal union types from Zod schemas
- **Database**: Supabase Postgres with dual connections (pooler + direct)
- **Storage**: Supabase Storage S3 protocol (not MinIO/R2)
- **Browser automation**: Delegated to GhostHands via HTTP API (not in-process Playwright)
- **Job dispatch**: Worker dispatches jobs to GhostHands API via POST /api/v1/gh/valet/apply (X-GH-Service-Key auth), receives callbacks at /webhook/gh
- **Real-time**: Redis pub/sub -> WebSocket relay for task progress updates
