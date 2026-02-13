# WeKruit Valet - Developer Guide

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
apps/worker        - Hatchet workflow worker (browser automation)
apps/web           - React SPA (Vite + TanStack Router, port 5173)
```

## Service Stack

All services are cloud-hosted. No Docker needed for local development.

| Service      | Provider          | Dashboard                                                    |
|--------------|-------------------|--------------------------------------------------------------|
| Database     | Supabase Postgres | https://supabase.com/dashboard/project/unistzvhgvgjyzotwzxr |
| Redis        | Upstash           | https://console.upstash.com                                  |
| Object Store | Supabase Storage  | Supabase Dashboard → Storage                                 |
| Auth         | Google OAuth 2.0  | https://console.cloud.google.com → Credentials               |
| Workflows    | Hatchet (Fly.io)  | https://valet-hatchet-stg.fly.dev                            |
| Message Queue| CloudAMQP         | https://customer.cloudamqp.com                               |
| Hosting      | Fly.io            | https://fly.io/dashboard                                     |

### Database Connections

- **Transaction pooler** (port 6543): `DATABASE_URL` — used by the app at runtime (pgbouncer)
- **Direct connection** (port 5432): `DATABASE_DIRECT_URL` — used for migrations/DDL (bypasses pgbouncer)

### Supabase Storage S3

Uses S3-compatible protocol. Create access keys at:
Supabase Dashboard → Storage → S3 Connection → New access key

Three buckets needed: `resumes`, `screenshots`, `artifacts`

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
main        ← production (auto-deploys to Fly.io prod)
staging     ← staging environment (auto-deploys to Fly.io stg)
develop     ← integration branch (CI only, no auto-deploy)
feature/*   ← feature branches (branch from develop)
fix/*       ← bug fixes (branch from develop)
hotfix/*    ← urgent prod fixes (branch from main)
```

### Workflow

1. **New feature**: `git checkout -b feature/my-feature develop`
2. **Open PR**: feature/* → develop (CI runs lint + typecheck + test + build)
3. **Promote to staging**: PR develop → staging (auto-deploys to stg)
4. **Promote to production**: PR staging → main (auto-deploys to prod, requires approval)
5. **Hotfix**: `git checkout -b hotfix/fix-name main`, PR → main, then backport to develop

### Branch Protection Rules (set in GitHub Settings → Branches)

- `main`: Require PR review, require CI pass, no force push
- `staging`: Require CI pass, no force push
- `develop`: Require CI pass

## Environments

| Env        | Branch    | API URL                           | Web URL                          | Hatchet URL                          |
|------------|-----------|-----------------------------------|----------------------------------|--------------------------------------|
| Local      | any       | http://localhost:8000             | http://localhost:5173            | https://valet-hatchet-stg.fly.dev    |
| Staging    | staging   | https://valet-api-stg.fly.dev     | https://valet-web-stg.fly.dev    | https://valet-hatchet-stg.fly.dev    |
| Production | main      | https://valet-api.fly.dev         | https://valet-web.fly.dev        | https://valet-hatchet-prod.fly.dev   |

### Google OAuth Redirect URIs

Add ALL of these to Google Cloud Console → Credentials → OAuth 2.0 Client → Authorized redirect URIs:

```
http://localhost:5173/login
https://valet-web-stg.fly.dev/login
https://valet-web.fly.dev/login
```

Note: The OAuth flow redirects back to the **frontend** `/login` page (not an API callback).
The frontend then exchanges the code with the API via `POST /api/v1/auth/google`.

## Secrets Management

| Where          | What                                                | How                                              |
|----------------|-----------------------------------------------------|--------------------------------------------------|
| Local          | All env vars                                        | `.env` file (gitignored)                         |
| Fly.io apps    | DATABASE_URL, REDIS_URL, JWT_SECRET, API keys, etc. | `fly secrets set -a <app-name> KEY=value`        |
| GitHub Actions | FLY_API_TOKEN, DATABASE_DIRECT_URL                  | Settings → Secrets and variables → Actions        |

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
Copy the toml to the repo root before deploying.

```bash
# Staging
cp fly/api.toml fly-deploy.toml && fly deploy --config fly-deploy.toml --app valet-api-stg --remote-only
cp fly/worker.toml fly-deploy.toml && fly deploy --config fly-deploy.toml --app valet-worker-stg --remote-only
cp fly/web.toml fly-deploy.toml && fly deploy --config fly-deploy.toml --app valet-web-stg --remote-only \
  --build-arg VITE_API_URL=https://valet-api-stg.fly.dev \
  --build-arg VITE_WS_URL=wss://valet-api-stg.fly.dev \
  --build-arg VITE_GOOGLE_CLIENT_ID=108153440133-8oorgsj5m7u67fg68bulpr1akrs6ttet.apps.googleusercontent.com

# Production
cp fly/api.toml fly-deploy.toml && fly deploy --config fly-deploy.toml --app valet-api --remote-only
cp fly/worker.toml fly-deploy.toml && fly deploy --config fly-deploy.toml --app valet-worker --remote-only
cp fly/web.toml fly-deploy.toml && fly deploy --config fly-deploy.toml --app valet-web --remote-only \
  --build-arg VITE_API_URL=https://valet-api.fly.dev \
  --build-arg VITE_WS_URL=wss://valet-api.fly.dev \
  --build-arg VITE_GOOGLE_CLIENT_ID=108153440133-8oorgsj5m7u67fg68bulpr1akrs6ttet.apps.googleusercontent.com
```

## Key Technical Decisions

- **ts-rest React Query v5**: Use `initTsrReactQuery` from `@ts-rest/react-query/v5` with single options object `{ queryKey, queryData, ...options }`
- **DI Container**: Fastify + awilix, module augmentation uses `AppCradle` pattern (not recursive `Cradle extends Cradle`)
- **Hatchet v1 SDK**: `workflow.task()` / `workflow.durableTask()` builder pattern with `Context<I>` / `DurableContext<I>`
- **TypeScript strict**: `noUncheckedIndexedAccess`, `verbatimModuleSyntax`, literal union types from Zod schemas
- **Database**: Supabase Postgres with dual connections (pooler + direct)
- **Storage**: Supabase Storage S3 protocol (not MinIO/R2)
