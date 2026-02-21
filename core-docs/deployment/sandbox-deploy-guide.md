# Sandbox Management System - Deployment Guide

> Complete step-by-step instructions for deploying the EC2 sandbox management
> system to staging and production environments.

---

## Table of Contents

1. [Overview](#overview)
2. [What Gets Deployed](#what-gets-deployed)
3. [Prerequisites](#prerequisites)
4. [GitHub Secrets](#github-secrets)
5. [Fly.io Secrets](#flyio-secrets)
6. [Deploy to Staging](#deploy-to-staging)
7. [Deploy to Production](#deploy-to-production)
8. [Database Migrations](#database-migrations)
9. [Post-Deploy: Admin User Setup](#post-deploy-admin-user-setup)
10. [Post-Deploy: Register EC2 Sandbox](#post-deploy-register-ec2-sandbox)
11. [Testing Checklist](#testing-checklist)
12. [Rollback Procedures](#rollback-procedures)
13. [Troubleshooting](#troubleshooting)

---

## Overview

This deployment adds the sandbox management system to Valet, enabling:

- **Admin dashboard** for managing EC2 browser worker instances
- **EC2 start/stop controls** from the web UI (AWS SDK integration)
- **Sandbox health monitoring** with automatic periodic checks
- **Auto-stop** for idle EC2 instances to reduce AWS costs
- **GitHub Actions workflows** for provisioning, deploying, terminating, and
  syncing secrets to EC2 sandboxes
- **Role-based access control** (admin/superadmin/user roles on users table)
- **Action manuals** schema for self-learning workflow system

The system spans three deploy targets:

| Component | Where | What Changes |
|-----------|-------|--------------|
| API | Fly.io (`valet-api-stg`, `valet-api`) | Sandbox CRUD routes, EC2 service, health monitor, auto-stop monitor, admin middleware, AWS SDK |
| Web | Fly.io (`valet-web-stg`, `valet-web`) | Admin pages (sandbox list, detail), EC2 controls UI, sidebar admin nav |
| Worker | EC2 instances | New v2 workflow, AdsPower integration, engine orchestrator |
| Database | Supabase (shared) | 8 new migrations (0002-0009) |

---

## What Gets Deployed

### New Database Migrations (0002-0009)

| Migration | Description |
|-----------|-------------|
| `0002_add_external_status` | Adds `external_status` enum + column to tasks, FK constraints |
| `0003_add_action_manuals` | `action_manuals` + `manual_steps` tables for self-learning |
| `0004_add_sandboxes` | `sandboxes` table + `sandbox_status`, `sandbox_health_status`, `sandbox_environment` enums |
| `0005_add_user_roles` | `user_role` enum + `role` column on `users` table (default: `'user'`) |
| `0006_add_sandbox_secrets` | `sandbox_secrets` table (deprecated but kept for data) + `pgcrypto` extension |
| `0007_add_browser_config` | `browser_engine` enum + `browser_config` jsonb on sandboxes |
| `0008_add_performance_indexes` | Composite indexes on `sandboxes` for status+health and updated_at |
| `0009_add_ec2_controls` | `ec2_status` enum + EC2 control columns (last_started_at, auto_stop_enabled, etc.) |

### New API Routes (all admin-only)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/admin/sandboxes` | List sandboxes with pagination/filters |
| GET | `/api/v1/admin/sandboxes/:id` | Get sandbox by ID |
| POST | `/api/v1/admin/sandboxes` | Register a new sandbox |
| PATCH | `/api/v1/admin/sandboxes/:id` | Update sandbox |
| DELETE | `/api/v1/admin/sandboxes/:id` | Terminate sandbox |
| POST | `/api/v1/admin/sandboxes/:id/health-check` | Trigger health check |
| GET | `/api/v1/admin/sandboxes/:id/metrics` | Get sandbox metrics |
| POST | `/api/v1/admin/sandboxes/:id/restart` | Restart AdsPower |
| POST | `/api/v1/admin/sandboxes/:id/start` | Start EC2 instance |
| POST | `/api/v1/admin/sandboxes/:id/stop` | Stop EC2 instance |
| GET | `/api/v1/admin/sandboxes/:id/ec2-status` | Get live EC2 status |

### New GitHub Actions Workflows

| Workflow | File | Trigger |
|----------|------|---------|
| CD -> EC2 Worker | `cd-ec2.yml` | Push to staging/main (worker paths), manual dispatch |
| Provision Sandbox | `provision-sandbox.yml` | Manual dispatch |
| Terminate Sandbox | `terminate-sandbox.yml` | Manual dispatch |
| Secrets Sync | `secrets-sync.yml` | Manual dispatch |

---

## Prerequisites

Before deploying, ensure you have:

- [ ] AWS account with IAM user that has `AmazonEC2FullAccess` policy
- [ ] AWS CLI configured locally (`aws configure`)
- [ ] Fly.io CLI installed and authenticated (`fly auth login`)
- [ ] Access to GitHub repo settings (to set secrets)
- [ ] Access to Supabase dashboard (to verify migrations)
- [ ] Existing EC2 Key Pair named `valet-worker` in us-east-1 (or create one)

---

## GitHub Secrets

Go to **GitHub > Settings > Secrets and variables > Actions > Repository secrets**.

### Required Repository Secrets

| Secret | Description | How to Get |
|--------|-------------|------------|
| `FLY_API_TOKEN` | Fly.io deploy token | Already set (existing). `fly tokens create deploy` |
| `AWS_ACCESS_KEY_ID` | AWS IAM access key | AWS Console > IAM > Users > Security Credentials |
| `AWS_SECRET_ACCESS_KEY` | AWS IAM secret key | Same as above (shown once at creation) |
| `SANDBOX_SSH_KEY` | SSH private key (PEM) for EC2 | Contents of `~/.ssh/valet-worker.pem` |
| `VALET_API_TOKEN` | Admin JWT token for API | See [Admin User Setup](#post-deploy-admin-user-setup) below |

### Per-Environment Secrets (GitHub Environments)

These are set on GitHub **Environments** (staging / production), not repository-level:

| Secret | Description |
|--------|-------------|
| `SANDBOX_IPS` | JSON array of sandbox IPs, e.g. `["34.197.248.80"]` |
| `SANDBOX_WORKER_ENV` | Full `.env` file contents for EC2 worker service |

#### Example SANDBOX_WORKER_ENV

```bash
NODE_ENV=production
HATCHET_CLIENT_TOKEN=<token>
HATCHET_CLIENT_TLS_STRATEGY=tls
HATCHET_CLIENT_TLS_SERVER_NAME=valet-hatchet-stg.fly.dev
HATCHET_CLIENT_HOST_PORT=valet-hatchet-stg.fly.dev:443
HATCHET_CLIENT_API_URL=https://valet-hatchet-stg.fly.dev:8443
DATABASE_URL=postgresql://postgres.<ref>:<pass>@aws-1-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=5
REDIS_URL=rediss://default:<pass>@<endpoint>.upstash.io:6379
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
```

### Setting SANDBOX_SSH_KEY

```bash
# Copy the exact PEM file contents to your clipboard:
cat ~/.ssh/valet-worker.pem | pbcopy

# Then paste into GitHub > Settings > Secrets > New repository secret
# Name: SANDBOX_SSH_KEY
# Value: <paste>
```

### How to Set GitHub Secrets via CLI

```bash
# Repository-level secrets
gh secret set AWS_ACCESS_KEY_ID --body "AKIA..."
gh secret set AWS_SECRET_ACCESS_KEY --body "..."
gh secret set SANDBOX_SSH_KEY < ~/.ssh/valet-worker.pem
gh secret set VALET_API_TOKEN --body "eyJ..."

# Environment-level secrets (staging)
gh secret set SANDBOX_IPS --env staging --body '["34.197.248.80"]'
gh secret set SANDBOX_WORKER_ENV --env staging < /path/to/staging-worker.env

# Environment-level secrets (production)
gh secret set SANDBOX_IPS --env production --body '["<prod-ip>"]'
gh secret set SANDBOX_WORKER_ENV --env production < /path/to/prod-worker.env
```

---

## Fly.io Secrets

The API apps need AWS credentials to call the EC2 SDK for start/stop/status.

### Staging API (`valet-api-stg`)

```bash
fly secrets set -a valet-api-stg \
  AWS_ACCESS_KEY_ID="AKIA..." \
  AWS_SECRET_ACCESS_KEY="..." \
  AWS_REGION="us-east-1"
```

### Production API (`valet-api`)

```bash
fly secrets set -a valet-api \
  AWS_ACCESS_KEY_ID="AKIA..." \
  AWS_SECRET_ACCESS_KEY="..." \
  AWS_REGION="us-east-1"
```

### Verify Existing Secrets

Make sure these existing secrets are still set on both API apps:

```bash
# Check staging
fly secrets list -a valet-api-stg

# Expected output should include:
#   DATABASE_URL
#   DATABASE_DIRECT_URL
#   REDIS_URL
#   JWT_SECRET
#   JWT_REFRESH_SECRET
#   GOOGLE_CLIENT_ID
#   GOOGLE_CLIENT_SECRET
#   HATCHET_CLIENT_TOKEN
#   HATCHET_CLIENT_TLS_STRATEGY
#   HATCHET_CLIENT_TLS_SERVER_NAME
#   HATCHET_CLIENT_HOST_PORT
#   HATCHET_CLIENT_API_URL
#   S3_ENDPOINT
#   S3_ACCESS_KEY
#   S3_SECRET_KEY
#   ANTHROPIC_API_KEY
#   CORS_ORIGIN
#   AWS_ACCESS_KEY_ID          <-- NEW
#   AWS_SECRET_ACCESS_KEY      <-- NEW
#   AWS_REGION                 <-- NEW
```

### Worker Apps (No New Secrets)

The Fly.io worker apps (`valet-worker-stg`, `valet-worker`) do not need
new secrets. The EC2-based workers get their secrets via the `secrets-sync.yml`
workflow, not via Fly.io.

---

## Deploy to Staging

### Option A: Automated via CI/CD (Recommended)

```bash
# 1. Merge feature branch to staging
git checkout staging
git merge feature/adspower-ec2
git push origin staging

# 2. Monitor the deploy:
#    https://github.com/WeKruit/VALET/actions
#
#    The cd-staging.yml workflow will:
#    - Detect changes in all affected paths
#    - Deploy API (with migrations via release_command)
#    - Deploy Worker (Fly.io)
#    - Deploy Web (with build args)
```

### Option B: Manual Deploy

```bash
# Set Fly.io AWS secrets first (if not already done)
fly secrets set -a valet-api-stg \
  AWS_ACCESS_KEY_ID="AKIA..." \
  AWS_SECRET_ACCESS_KEY="..." \
  AWS_REGION="us-east-1"

# Deploy API (migrations run automatically via release_command)
cp fly/api.toml fly-deploy.toml && \
fly deploy --config fly-deploy.toml --app valet-api-stg --remote-only && \
rm fly-deploy.toml

# Deploy Web
cp fly/web.toml fly-deploy.toml && \
fly deploy --config fly-deploy.toml --app valet-web-stg --remote-only \
  --build-arg VITE_API_URL=https://valet-api-stg.fly.dev \
  --build-arg VITE_WS_URL=wss://valet-api-stg.fly.dev \
  --build-arg VITE_GOOGLE_CLIENT_ID=108153440133-8oorgsj5m7u67fg68bulpr1akrs6ttet.apps.googleusercontent.com && \
rm fly-deploy.toml

# Deploy Fly.io Worker (optional — this is the Hatchet workflow runner, not EC2)
cp fly/worker.toml fly-deploy.toml && \
fly deploy --config fly-deploy.toml --app valet-worker-stg --remote-only && \
rm fly-deploy.toml
```

### Verify Staging Deploy

```bash
# 1. API health check
curl -s https://valet-api-stg.fly.dev/api/v1/health | jq .
# Expected: {"status":"ok","timestamp":"...","version":"..."}

# 2. Check API logs for sandbox monitors starting
fly logs -a valet-api-stg | head -50
# Look for: "Sandbox health monitor started" / "Auto-stop monitor started"

# 3. Web is accessible
curl -s -o /dev/null -w "%{http_code}" https://valet-web-stg.fly.dev
# Expected: 200
```

---

## Deploy to Production

### Option A: Automated via CI/CD (Recommended)

```bash
# After staging is verified:
git checkout main
git merge staging
git push origin main

# cd-prod.yml will deploy ALL services to production.
# Monitor: https://github.com/WeKruit/VALET/actions
```

### Option B: Manual Deploy

```bash
# Set Fly.io AWS secrets first (if not already done)
fly secrets set -a valet-api \
  AWS_ACCESS_KEY_ID="AKIA..." \
  AWS_SECRET_ACCESS_KEY="..." \
  AWS_REGION="us-east-1"

# Deploy API
cp fly/api.toml fly-deploy.toml && \
fly deploy --config fly-deploy.toml --app valet-api --remote-only && \
rm fly-deploy.toml

# Deploy Web
cp fly/web.toml fly-deploy.toml && \
fly deploy --config fly-deploy.toml --app valet-web --remote-only \
  --build-arg VITE_API_URL=https://valet-api.fly.dev \
  --build-arg VITE_WS_URL=wss://valet-api.fly.dev \
  --build-arg VITE_GOOGLE_CLIENT_ID=108153440133-8oorgsj5m7u67fg68bulpr1akrs6ttet.apps.googleusercontent.com && \
rm fly-deploy.toml

# Deploy Fly.io Worker
cp fly/worker.toml fly-deploy.toml && \
fly deploy --config fly-deploy.toml --app valet-worker --remote-only && \
rm fly-deploy.toml
```

---

## Database Migrations

Migrations run **automatically** during API deploy via Fly.io's `release_command`.

### How It Works

1. `fly deploy` builds and pushes the new Docker image
2. Fly spins up a **temporary VM** with the new image
3. Runs: `node packages/db/dist/migrate.js`
4. If migration succeeds -> deploy continues, traffic swaps to new version
5. If migration fails -> deploy is **aborted**, old version keeps running

### Important Notes

- Migrations use `DATABASE_DIRECT_URL` (session pooler, port 5432) which must
  be set as a Fly secret on the API app
- **Staging and production share the same Supabase database** -- a migration
  applied to one environment affects both
- The 8 new migrations (0002-0009) are all idempotent (`IF NOT EXISTS`,
  `DO $$ BEGIN ... EXCEPTION ... END $$`)

### Verify Migrations Applied

```bash
# SSH into staging API to check
fly ssh console -a valet-api-stg -C "node -e \"
  const { drizzle } = require('drizzle-orm/node-postgres');
  // Quick check: the sandboxes table should exist
  console.log('Migrations verified if no error');
\""

# Or verify directly in Supabase SQL Editor:
# SELECT table_name FROM information_schema.tables
# WHERE table_schema = 'public'
# AND table_name IN ('sandboxes', 'action_manuals', 'manual_steps', 'sandbox_secrets');
```

### Manual Migration (Emergency Only)

```bash
fly ssh console -a valet-api-stg -C "node packages/db/dist/migrate.js"
```

---

## Post-Deploy: Admin User Setup

After the first deploy with the user roles migration, all existing users will
have `role = 'user'`. You need to promote at least one user to `admin`.

### Option 1: Direct SQL via Supabase Dashboard

Go to Supabase Dashboard > SQL Editor and run:

```sql
-- Find your user
SELECT id, email, name, role FROM users WHERE email = 'your-admin@email.com';

-- Promote to admin
UPDATE users SET role = 'admin', updated_at = now()
WHERE email = 'your-admin@email.com';

-- Verify
SELECT id, email, name, role FROM users WHERE role IN ('admin', 'superadmin');
```

### Option 2: Via psql

```bash
# Connect via session pooler
psql "postgresql://postgres.<ref>:<pass>@aws-1-us-east-1.pooler.supabase.com:5432/postgres"

# Run the same SQL as above
UPDATE users SET role = 'admin', updated_at = now()
WHERE email = 'your-admin@email.com';
```

### Getting the VALET_API_TOKEN

After promoting your user to admin, get a JWT token:

```bash
# Login via Google OAuth flow in the browser, then extract the token from
# the browser's localStorage or from the API response.

# Or, if you have email/password auth enabled:
curl -X POST https://valet-api-stg.fly.dev/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"your-admin@email.com","password":"..."}' \
  | jq -r '.body.accessToken'
```

**Note**: JWT access tokens expire in 15 minutes. For the `VALET_API_TOKEN`
GitHub secret used by CI/CD workflows, you may want to create a long-lived
service token or use the refresh token mechanism. Consider generating a
dedicated admin token:

```sql
-- Alternative: create a dedicated service account
INSERT INTO users (email, name, role, email_verified, is_active)
VALUES ('ci-bot@valet.dev', 'CI Bot', 'admin', true, true);
```

Then authenticate as this user to get the token.

---

## Post-Deploy: Register EC2 Sandbox

After the API is deployed and an admin user exists, register your existing EC2
instance as a sandbox.

### Option A: Via Provision Workflow (New Instance)

Go to GitHub > Actions > "Provision Sandbox" > Run workflow:

- Environment: `staging`
- Instance type: `t3.medium` or `t3.large`
- Browser engine: `adspower`
- Capacity: `5`

### Option B: Register Existing Instance via API

```bash
# Get your admin token
TOKEN="eyJ..."

# Register the existing staging EC2 instance
curl -X POST https://valet-api-stg.fly.dev/api/v1/admin/sandboxes \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "staging-sandbox-1",
    "environment": "staging",
    "instanceId": "i-0abc123def456",
    "instanceType": "t3.medium",
    "publicIp": "34.197.248.80",
    "browserEngine": "adspower",
    "capacity": 5,
    "novncUrl": "http://34.197.248.80:6080/vnc.html"
  }'
```

### Option C: Via Web UI

1. Login as admin at https://valet-web-stg.fly.dev
2. Navigate to **Admin > Sandboxes** in the sidebar
3. Click **Add Sandbox**
4. Fill in the form with EC2 instance details

---

## Testing Checklist

### Staging Verification

#### API

- [ ] `GET /api/v1/health` returns 200
- [ ] API logs show "Sandbox health monitor started"
- [ ] API logs show "Auto-stop monitor started"
- [ ] `GET /api/v1/admin/sandboxes` returns 200 for admin users
- [ ] `GET /api/v1/admin/sandboxes` returns 403 for non-admin users

#### Database

- [ ] `sandboxes` table exists with all columns (verify in Supabase SQL Editor)
- [ ] `action_manuals` and `manual_steps` tables exist
- [ ] `users.role` column exists with default `'user'`
- [ ] `sandbox_secrets` table exists (deprecated but present)
- [ ] All new enums exist: `sandbox_status`, `sandbox_health_status`,
      `sandbox_environment`, `user_role`, `ec2_status`, `browser_engine`,
      `external_status`, `secret_type`

#### Web UI

- [ ] Admin user sees "Sandboxes" link in sidebar
- [ ] Non-admin user does NOT see "Sandboxes" link in sidebar
- [ ] `/admin/sandboxes` page loads for admin users
- [ ] `/admin/sandboxes` shows 403 or redirects for non-admin users
- [ ] Sandbox list displays correctly (empty state or with data)

#### EC2 Controls (requires registered sandbox + AWS credentials)

- [ ] "Get EC2 Status" button works and shows current state
- [ ] "Start" button initiates EC2 start, status updates to "pending" then "running"
- [ ] "Stop" button initiates EC2 stop, status updates to "stopping" then "stopped"
- [ ] Health check skips non-running instances (no false "unhealthy")
- [ ] Sandbox detail page shows EC2 status, connection info, metrics

#### GitHub Actions

- [ ] `cd-ec2.yml` workflow file is committed and visible in Actions tab
- [ ] `provision-sandbox.yml` workflow file is visible
- [ ] `terminate-sandbox.yml` workflow file is visible
- [ ] `secrets-sync.yml` workflow file is visible
- [ ] Manual trigger of `cd-ec2.yml` with target IP works (after secrets set)

### Production Verification

Repeat the same checklist as staging, but targeting:

- API: `https://valet-api.fly.dev`
- Web: `https://valet-web.fly.dev`

---

## Rollback Procedures

### Rollback Fly.io Deployment

```bash
# List recent releases
fly releases -a valet-api-stg

# Rollback to a specific version
fly releases rollback v<N> -a valet-api-stg

# Same for web and worker
fly releases rollback v<N> -a valet-web-stg
fly releases rollback v<N> -a valet-worker-stg
```

### Rollback via Git

```bash
# Revert the merge commit on staging
git checkout staging
git revert HEAD --no-edit
git push origin staging
# CI will auto-deploy the reverted version
```

### Rollback Database Migrations

**WARNING**: The migrations are additive (ADD COLUMN, CREATE TABLE) and use
`IF NOT EXISTS`. They do not drop existing data. Rolling back the code without
reverting the database is safe -- the new columns/tables will simply be unused.

If you must revert the database:

```sql
-- DANGER: Only do this if you are certain no data has been written.

-- Revert 0009_add_ec2_controls
ALTER TABLE sandboxes
  DROP COLUMN IF EXISTS ec2_status,
  DROP COLUMN IF EXISTS last_started_at,
  DROP COLUMN IF EXISTS last_stopped_at,
  DROP COLUMN IF EXISTS auto_stop_enabled,
  DROP COLUMN IF EXISTS idle_minutes_before_stop;
DROP TYPE IF EXISTS ec2_status;

-- Revert 0008_add_performance_indexes
DROP INDEX IF EXISTS idx_sandboxes_status_health;
DROP INDEX IF EXISTS idx_sandboxes_updated_at;

-- Revert 0007_add_browser_config
ALTER TABLE sandboxes
  DROP COLUMN IF EXISTS browser_engine,
  DROP COLUMN IF EXISTS browser_config;
DROP TYPE IF EXISTS browser_engine;

-- Revert 0006_add_sandbox_secrets
DROP TABLE IF EXISTS sandbox_secrets;
DROP TYPE IF EXISTS secret_type;

-- Revert 0005_add_user_roles
ALTER TABLE users DROP COLUMN IF EXISTS role;
DROP TYPE IF EXISTS user_role;

-- Revert 0004_add_sandboxes
DROP TABLE IF EXISTS sandboxes;
DROP TYPE IF EXISTS sandbox_status;
DROP TYPE IF EXISTS sandbox_health_status;
DROP TYPE IF EXISTS sandbox_environment;

-- Revert 0003_add_action_manuals
DROP TABLE IF EXISTS manual_steps;
DROP TABLE IF EXISTS action_manuals;

-- Revert 0002_add_external_status
ALTER TABLE tasks DROP COLUMN IF EXISTS external_status;
DROP TYPE IF EXISTS external_status;
-- (FK constraints added in 0002 are safe to leave)
```

### Rollback EC2 Worker Deploy

The `cd-ec2.yml` workflow has automatic rollback built in. If a health check
fails after deploy, it restores from the backup at `/opt/valet/app-backup`.

Manual rollback:

```bash
ssh -i ~/.ssh/valet-worker.pem ubuntu@<EC2_IP> << 'EOF'
sudo rm -rf /opt/valet/app
sudo mv /opt/valet/app-backup /opt/valet/app
sudo systemctl restart valet-worker
EOF
```

---

## Troubleshooting

| Problem | Diagnosis | Solution |
|---------|-----------|----------|
| API deploy fails on migration | `fly releases -a valet-api-stg` shows failed release | Check migration SQL; fix and redeploy |
| "Admin access required" error | User role is `'user'`, not `'admin'` | Run `UPDATE users SET role = 'admin'` in Supabase |
| EC2 start/stop returns 500 | Missing AWS credentials on Fly.io | `fly secrets set -a valet-api-stg AWS_ACCESS_KEY_ID=...` |
| EC2 status shows "unhealthy" when stopped | Health monitor checks non-running instances | Fixed in this deploy (skips ec2_status != running) |
| Web shows blank admin page | Build missing new admin routes | Ensure web is redeployed after merge |
| cd-ec2.yml fails: "No sandbox IPs" | No `SANDBOX_IPS` or `VALET_API_TOKEN` set | Set GitHub secrets per instructions above |
| Sandbox health check times out | EC2 security group blocks port 8000 | Check SG allows inbound on port 8000 from API |
| Provision workflow fails at Terraform | AWS credentials missing or wrong region | Verify `AWS_ACCESS_KEY_ID/SECRET` in GitHub secrets |
| Worker on EC2 won't start | Missing `.env` secrets | Run `secrets-sync.yml` or `./infra/scripts/set-secrets.sh <IP>` |
| Migration: "relation already exists" | Migration already ran on shared DB | Safe to ignore -- `IF NOT EXISTS` handles this |

---

## Quick Reference: All Secrets Summary

### GitHub Repository Secrets

| Secret | Required By | Value |
|--------|-------------|-------|
| `FLY_API_TOKEN` | cd-staging, cd-prod, deploy | Fly.io deploy token |
| `AWS_ACCESS_KEY_ID` | provision-sandbox, terminate-sandbox | AWS IAM key |
| `AWS_SECRET_ACCESS_KEY` | provision-sandbox, terminate-sandbox | AWS IAM secret |
| `SANDBOX_SSH_KEY` | cd-ec2, provision-sandbox, terminate-sandbox, secrets-sync | PEM file contents |
| `VALET_API_TOKEN` | cd-ec2, provision-sandbox, terminate-sandbox | Admin JWT token |

### GitHub Environment Secrets (per environment)

| Secret | Required By | Value |
|--------|-------------|-------|
| `SANDBOX_IPS` | secrets-sync | JSON array: `["ip1", "ip2"]` |
| `SANDBOX_WORKER_ENV` | secrets-sync | Full `.env` file contents |

### Fly.io Secrets (NEW, added by this deploy)

| App | Secret | Value |
|-----|--------|-------|
| `valet-api-stg` | `AWS_ACCESS_KEY_ID` | AWS IAM key |
| `valet-api-stg` | `AWS_SECRET_ACCESS_KEY` | AWS IAM secret |
| `valet-api-stg` | `AWS_REGION` | `us-east-1` |
| `valet-api` | `AWS_ACCESS_KEY_ID` | AWS IAM key |
| `valet-api` | `AWS_SECRET_ACCESS_KEY` | AWS IAM secret |
| `valet-api` | `AWS_REGION` | `us-east-1` |
