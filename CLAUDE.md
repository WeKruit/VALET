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
| Workflows    | Hatchet (Fly.io)  | https://valet-hatchet-dev.fly.dev                            |
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
./scripts/setup-fly.sh dev   # Create Fly.io apps for dev environment
./scripts/setup-fly.sh stg   # Create Fly.io apps for staging
./scripts/setup-fly.sh prod  # Create Fly.io apps for production
./scripts/health-check.sh    # Check service connectivity
```

## Git Branching Strategy

```
main        ← production (auto-deploys to Fly.io prod)
staging     ← staging environment (auto-deploys to Fly.io stg)
develop     ← integration branch (auto-deploys to Fly.io dev)
feature/*   ← feature branches (branch from develop)
fix/*       ← bug fixes (branch from develop)
hotfix/*    ← urgent prod fixes (branch from main)
```

### Workflow

1. **New feature**: `git checkout -b feature/my-feature develop`
2. **Open PR**: feature/* → develop (CI runs lint + typecheck + test + build)
3. **After merge to develop**: auto-deploys to dev environment
4. **Promote to staging**: PR develop → staging
5. **Promote to production**: PR staging → main (requires approval)
6. **Hotfix**: `git checkout -b hotfix/fix-name main`, PR → main, then backport to develop

### Branch Protection Rules (set in GitHub Settings → Branches)

- `main`: Require PR review, require CI pass, no force push
- `staging`: Require CI pass, no force push
- `develop`: Require CI pass

## Environments

| Env        | Branch    | API URL                           | Web URL                          | Hatchet URL                          |
|------------|-----------|-----------------------------------|----------------------------------|--------------------------------------|
| Local      | any       | http://localhost:8000             | http://localhost:5173            | https://valet-hatchet-dev.fly.dev    |
| Dev        | develop   | https://valet-api-dev.fly.dev     | https://valet-web-dev.fly.dev    | https://valet-hatchet-dev.fly.dev    |
| Staging    | staging   | https://valet-api-stg.fly.dev     | https://valet-web-stg.fly.dev    | https://valet-hatchet-stg.fly.dev    |
| Production | main      | https://valet-api.fly.dev         | https://valet-web.fly.dev        | https://valet-hatchet-prod.fly.dev   |

### Google OAuth Callback URLs

Add ALL of these to Google Cloud Console → Credentials → OAuth 2.0 Client:

```
http://localhost:8000/api/v1/auth/google/callback
https://valet-api-dev.fly.dev/api/v1/auth/google/callback
https://valet-api-stg.fly.dev/api/v1/auth/google/callback
https://valet-api.fly.dev/api/v1/auth/google/callback
```

## Secrets Management

| Where          | What                                                | How                                              |
|----------------|-----------------------------------------------------|--------------------------------------------------|
| Local          | All env vars                                        | `.env` file (gitignored)                         |
| Fly.io apps    | DATABASE_URL, REDIS_URL, JWT_SECRET, API keys, etc. | `fly secrets set -a <app-name> KEY=value`        |
| GitHub Actions | FLY_API_TOKEN (one per environment)                 | Settings → Environments → [env] → Secrets        |

### Setting Fly.io Secrets

```bash
# Example: set secrets for dev API
fly secrets set -a valet-api-dev \
  DATABASE_URL="postgresql://..." \
  REDIS_URL="rediss://..." \
  JWT_SECRET="$(openssl rand -base64 48)"

# List current secrets
fly secrets list -a valet-api-dev
```

### Manual Deploy (without CI)

```bash
fly deploy --config fly/hatchet.toml --app valet-hatchet-dev --remote-only
fly deploy --config fly/api.toml --app valet-api-dev --remote-only
fly deploy --config fly/worker.toml --app valet-worker-dev --remote-only
fly deploy --config fly/web.toml --app valet-web-dev --remote-only \
  --build-arg VITE_API_URL=https://valet-api-dev.fly.dev \
  --build-arg VITE_WS_URL=wss://valet-api-dev.fly.dev
```

## Key Technical Decisions

- **ts-rest React Query v5**: Use `initTsrReactQuery` from `@ts-rest/react-query/v5` with single options object `{ queryKey, queryData, ...options }`
- **DI Container**: Fastify + awilix, module augmentation uses `AppCradle` pattern (not recursive `Cradle extends Cradle`)
- **Hatchet v1 SDK**: `workflow.task()` / `workflow.durableTask()` builder pattern with `Context<I>` / `DurableContext<I>`
- **TypeScript strict**: `noUncheckedIndexedAccess`, `verbatimModuleSyntax`, literal union types from Zod schemas
- **Database**: Supabase Postgres with dual connections (pooler + direct)
- **Storage**: Supabase Storage S3 protocol (not MinIO/R2)
