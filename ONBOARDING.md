# WeKruit Valet - Onboarding Guide

Welcome to the Valet monorepo. This guide walks you through everything you need to get your local environment running and understand the cloud infrastructure.

## What is Valet?

Valet is a dual-mode AI job application automation system. Users upload resumes, and Valet either auto-fills applications (autopilot) or assists with human-in-the-loop review (copilot). It uses browser automation orchestrated through Hatchet workflows, backed by LLM-powered resume parsing and form filling.

## Prerequisites

| Tool       | Version | Install                                    |
|------------|---------|--------------------------------------------|
| Node.js    | 20+     | https://nodejs.org                         |
| pnpm       | 10+     | `npm install -g pnpm`                      |
| Fly CLI    | latest  | `brew install flyctl` or https://fly.io/docs/flyctl/install |
| Git        | any     | https://git-scm.com                        |

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

| Service       | Provider           | Dashboard                                                     |
|---------------|--------------------|---------------------------------------------------------------|
| Database      | Supabase Postgres  | https://supabase.com/dashboard/project/unistzvhgvgjyzotwzxr  |
| Redis         | Upstash            | https://console.upstash.com                                   |
| Object Store  | Supabase Storage   | Supabase Dashboard -> Storage                                 |
| Auth          | Google OAuth 2.0   | https://console.cloud.google.com -> Credentials               |
| Workflows     | Hatchet (Fly.io)   | https://valet-hatchet-dev.fly.dev                             |
| Message Queue | CloudAMQP          | https://customer.cloudamqp.com                                |
| Hosting       | Fly.io             | https://fly.io/dashboard                                      |

### Environments

| Env        | Branch    | API                               | Web                              | Hatchet                              |
|------------|-----------|-----------------------------------|----------------------------------|--------------------------------------|
| Local      | any       | http://localhost:8000             | http://localhost:5173            | https://valet-hatchet-dev.fly.dev    |
| Dev        | develop   | https://valet-api-dev.fly.dev     | https://valet-web-dev.fly.dev    | https://valet-hatchet-dev.fly.dev    |
| Staging    | staging   | https://valet-api-stg.fly.dev     | https://valet-web-stg.fly.dev    | https://valet-hatchet-stg.fly.dev    |
| Production | main      | https://valet-api.fly.dev         | https://valet-web.fly.dev        | https://valet-hatchet-prod.fly.dev   |

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

## 7. Deploying

### Automatic (CI/CD)

- Push to `develop` -> deploys to dev
- Push to `staging` -> deploys to staging
- Push to `main` -> deploys to production (requires approval)

CI runs: lint -> typecheck -> build -> deploy (Hatchet -> API -> Worker -> Web)

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

### Setting Fly.io Secrets for New Environments

```bash
fly secrets set -a valet-api-dev \
  DATABASE_URL="postgresql://..." \
  REDIS_URL="rediss://..." \
  JWT_SECRET="$(openssl rand -base64 48)" \
  JWT_REFRESH_SECRET="$(openssl rand -base64 48)"
```

### GitHub Actions Setup

Add `FLY_API_TOKEN` as a secret in GitHub repo settings -> Environments -> [dev/staging/production].

## 8. Git Workflow

```
main        <- production (auto-deploys)
staging     <- staging environment (auto-deploys)
develop     <- integration branch (auto-deploys to dev)
feature/*   <- feature branches (branch from develop)
fix/*       <- bug fixes (branch from develop)
hotfix/*    <- urgent prod fixes (branch from main)
```

1. Create a feature branch: `git checkout -b feature/my-feature develop`
2. Open PR: `feature/*` -> `develop` (CI runs automatically)
3. After merge to `develop`: auto-deploys to dev
4. Promote: PR `develop` -> `staging` -> `main`

## 9. Troubleshooting

### "VITE_GOOGLE_CLIENT_ID is not set"

Your `.env` is missing `VITE_GOOGLE_CLIENT_ID`. Set it to the same value as `GOOGLE_CLIENT_ID`.

### "MaxClientsInSessionMode" in Hatchet logs

Too many database connections. See [Hatchet Connection Limits](#connection-limits-important) above.

### Hatchet crash loop after DB connection exhaustion

Kill zombie connections via Supabase SQL Editor, then restart. See [Restarting Hatchet](#restarting-hatchet) above.

### `drizzle-kit push` fails with ECONNREFUSED

Make sure your `.env` is loaded. Run with the env vars explicitly:

```bash
DATABASE_DIRECT_URL="postgresql://..." pnpm --filter @valet/db db:push
```

### Worker won't start

Check that `HATCHET_CLIENT_TOKEN` is set in `.env`. Get it from the Hatchet dashboard -> Settings -> API Tokens.

### TypeScript errors after pulling

```bash
pnpm install          # Install any new dependencies
pnpm turbo build --filter=@valet/shared --filter=@valet/contracts --filter=@valet/db
pnpm typecheck        # Should pass now
```

## 10. Key Technical Decisions

For deeper technical context, see `CLAUDE.md`. Highlights:

- **Contract-first API**: Zod schemas in `packages/shared` -> ts-rest contracts in `packages/contracts` -> Fastify routes
- **DI Container**: Fastify + awilix with `AppCradle` pattern
- **Hatchet v1 SDK**: `workflow.task()` builder pattern with parent/child task dependencies
- **LLM Router**: 3-tier fallback (Claude Sonnet -> GPT-4.1 mini -> GPT-4.1 nano) with per-task budgeting
- **Database**: Drizzle ORM + Supabase Postgres (transaction pooler for app, session pooler for Hatchet)
- **Storage**: Supabase Storage S3 protocol with `@aws-sdk/client-s3`
