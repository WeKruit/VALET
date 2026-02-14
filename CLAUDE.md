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
./scripts/setup-fly.sh stg   # Create Fly.io apps for staging
./scripts/setup-fly.sh prod  # Create Fly.io apps for production
./scripts/health-check.sh    # Check service connectivity
```

## Git Branching Strategy

```
main        ← production (auto-deploys to Fly.io prod)
staging     ← staging / integration branch (auto-deploys to Fly.io stg)
feature/*   ← feature branches (branch from staging)
fix/*       ← bug fixes (branch from staging)
hotfix/*    ← urgent prod fixes (branch from main)
```

### Workflow

1. **New feature**: `git checkout -b feature/my-feature staging`
2. **Open PR**: feature/* → staging (CI runs lint + typecheck + test + build)
3. **After merge to staging**: auto-deploys to staging environment
4. **Promote to production**: PR staging → main (requires approval)
5. **Hotfix**: `git checkout -b hotfix/fix-name main`, PR → main, then backport to staging

### Branch Protection Rules (set in GitHub Settings → Branches)

- `main`: Require PR review, require CI pass, no force push
- `staging`: Require CI pass, no force push

## Environments

| Env        | Branch    | API URL                           | Web URL                          | Hatchet URL                          |
|------------|-----------|-----------------------------------|----------------------------------|--------------------------------------|
| Local      | any       | http://localhost:8000             | http://localhost:5173            | https://valet-hatchet-dev.fly.dev    |
| Staging    | staging   | https://valet-api-stg.fly.dev     | https://valet-web-stg.fly.dev    | https://valet-hatchet-stg.fly.dev    |
| Production | main      | https://valet-api.fly.dev         | https://valet-web.fly.dev        | https://valet-hatchet-prod.fly.dev   |

### Google OAuth Redirect URIs

The frontend uses client-side OAuth flow (`window.location.origin + "/login"`).
Add ALL of these to Google Cloud Console → Credentials → OAuth 2.0 Client → **Authorized redirect URIs**:

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

## Secrets Management

| Where          | What                                                | How                                              |
|----------------|-----------------------------------------------------|--------------------------------------------------|
| Local          | All env vars                                        | `.env` file (gitignored)                         |
| Fly.io apps    | DATABASE_URL, REDIS_URL, JWT_SECRET, API keys, etc. | `fly secrets set -a <app-name> KEY=value`        |
| GitHub Actions | FLY_API_TOKEN (one per environment)                 | Settings → Environments → [env] → Secrets        |

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

```bash
# Staging
fly deploy --config fly/hatchet.toml --app valet-hatchet-stg --remote-only
fly deploy --config fly/api.toml --app valet-api-stg --remote-only
fly deploy --config fly/worker.toml --app valet-worker-stg --remote-only
fly deploy --config fly/web.toml --app valet-web-stg --remote-only \
  --build-arg VITE_API_URL=https://valet-api-stg.fly.dev \
  --build-arg VITE_WS_URL=wss://valet-api-stg.fly.dev

# Production
fly deploy --config fly/hatchet.toml --app valet-hatchet-prod --remote-only
fly deploy --config fly/api.toml --app valet-api --remote-only
fly deploy --config fly/worker.toml --app valet-worker --remote-only
fly deploy --config fly/web.toml --app valet-web --remote-only \
  --build-arg VITE_API_URL=https://valet-api.fly.dev \
  --build-arg VITE_WS_URL=wss://valet-api.fly.dev
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
# 4. Commit and push — CD handles the rest
```

### Important notes

- `migrate.ts` prefers `DATABASE_DIRECT_URL` (session pooler, port 5432) over `DATABASE_URL` (transaction pooler, port 6543). Both must be set as Fly secrets on the API app.
- The `_journal.json` file MUST be tracked in git (not gitignored) — the Docker image needs it.
- Staging and production currently share the same Supabase database. A migration applied to one environment affects both.

## Key Technical Decisions

- **ts-rest React Query v5**: Use `initTsrReactQuery` from `@ts-rest/react-query/v5` with single options object `{ queryKey, queryData, ...options }`
- **DI Container**: Fastify + awilix, module augmentation uses `AppCradle` pattern (not recursive `Cradle extends Cradle`)
- **Hatchet v1 SDK**: `workflow.task()` / `workflow.durableTask()` builder pattern with `Context<I>` / `DurableContext<I>`
- **TypeScript strict**: `noUncheckedIndexedAccess`, `verbatimModuleSyntax`, literal union types from Zod schemas
- **Database**: Supabase Postgres with dual connections (pooler + direct)
- **Storage**: Supabase Storage S3 protocol (not MinIO/R2)
