# Sandbox Management System - Optimization Summary

## Overview

This document summarizes the optimizations made to simplify the sandbox management system and add cost-saving features.

## Changes Made

### 1. Simplified Secrets Management

**Before:**
- Per-sandbox encrypted secrets stored in database (`sandbox_secrets` table)
- `SANDBOX_SECRETS_KEY` environment variable required for PGP encryption
- Complex secrets API (store, rotate, delete endpoints)
- `SandboxSecretsService` with full CRUD + DI registration
- Per-sandbox SSH keys (`EC2_SSH_KEY_STG`, `EC2_SSH_KEY_PROD`)

**After:**
- Single `SANDBOX_SSH_KEY` in GitHub secrets for all sandboxes
- Environment variables stored in `.env` files on EC2 instances
- No database encryption layer
- No secrets API endpoints

**Why:**
- For <50 sandboxes, a single shared SSH key is sufficient
- Reduces complexity in CI/CD workflows
- Easier to troubleshoot and onboard new developers
- No security compromise at current scale

**Files removed:**
- `apps/api/src/modules/sandboxes/sandbox-secrets.service.ts`
- Secrets routes from `sandbox.routes.ts`
- Secrets contract endpoints from `@valet/contracts`
- DI registration for `SandboxSecretsService`

**Files deprecated (kept for data safety):**
- `packages/db/src/schema/sandbox-secrets.ts` (marked `@deprecated`)
- `packages/shared/src/schemas/sandbox-secret.schema.ts` (marked `@deprecated`)
- `sandbox_secrets` database table (not dropped)

### 2. EC2 Start/Stop Feature

**New capabilities:**
- Start/stop EC2 instances via API (`POST /admin/sandboxes/:id/start`, `POST /admin/sandboxes/:id/stop`)
- Real-time EC2 status polling (`GET /admin/sandboxes/:id/ec2-status`)
- Background status polling after start/stop (non-blocking API response)
- Auto-stop when idle (configurable per sandbox)
- Connection instructions UI (SSH command, noVNC URL, health endpoint)
- EC2 status badges with transitional state animations

**New files:**
- `apps/api/src/modules/sandboxes/ec2.service.ts` - AWS SDK EC2 client wrapper
- `apps/api/src/modules/sandboxes/auto-stop-monitor.ts` - Scheduled idle detection
- `apps/web/src/features/admin/components/ec2-status-badge.tsx` - Status badge component
- `apps/web/src/features/admin/components/sandbox-connection-info.tsx` - Connection info card

**Modified files:**
- `packages/shared/src/schemas/sandbox.schema.ts` - Added `ec2Status`, `autoStopEnabled`, `idleMinutesBeforeStop` fields
- `packages/db/src/schema/sandboxes.ts` - Added `ec2_status`, `auto_stop_enabled`, `idle_minutes_before_stop` columns
- `packages/contracts/src/sandbox.ts` - Added `startSandbox`, `stopSandbox`, `getEc2Status` endpoints
- `apps/api/src/modules/sandboxes/sandbox.service.ts` - Added EC2 start/stop/status methods
- `apps/api/src/modules/sandboxes/sandbox.repository.ts` - Added `updateEc2Status`, `findAutoStopCandidates`
- `apps/api/src/modules/sandboxes/sandbox.routes.ts` - Added EC2 route handlers
- `apps/api/src/plugins/container.ts` - Registered `EC2Service` and `AutoStopMonitor`

**Cost savings:**
- t3.medium: $0.042/hr running, $0/hr stopped (EBS: ~$3.44/mo)
- t3.large: $0.0832/hr running, $0/hr stopped (EBS: ~$3.44/mo)
- Stopping 12 hours/day: ~42% compute savings
- Stopping weekends: additional ~28% savings

### 3. Simplified Deployment

**Before:**
- Per-sandbox SSH keys in GitHub secrets
- Complex key rotation and lookup logic
- Multiple environment-specific key secrets (`EC2_SSH_KEY_STG`, `EC2_SSH_KEY_PROD`)

**After:**
- Single `SANDBOX_SSH_KEY` for all environments and sandboxes
- `deploy-worker.sh` accepts `--key` parameter (defaults to `~/.ssh/valet-worker.pem`)
- All GitHub Actions workflows use the same key
- API-driven fleet discovery for deployment targets

**Updated workflows:**
- `cd-ec2.yml` - Uses `SANDBOX_SSH_KEY`, API-driven fleet discovery
- `provision-sandbox.yml` - Uses `SANDBOX_SSH_KEY` for all setup steps
- `terminate-sandbox.yml` - Uses `SANDBOX_SSH_KEY` for cleanup

## Migration Guide

### From Old System to New

1. **Remove SANDBOX_SECRETS_KEY**:
   - Delete from `.env` (local development)
   - Delete from GitHub secrets
   - Delete from Fly.io secrets
   - System no longer requires it

2. **Set up single SSH key**:
   ```bash
   # Generate (if you don't have one)
   ssh-keygen -t rsa -b 4096 -f ~/.ssh/valet-worker.pem -N ""

   # Upload to AWS
   aws ec2 import-key-pair --key-name valet-worker \
     --public-key-material fileb://~/.ssh/valet-worker.pem.pub \
     --region us-east-1

   # Add to GitHub secrets
   # Settings -> Secrets -> SANDBOX_SSH_KEY = contents of ~/.ssh/valet-worker.pem
   ```

3. **Update existing sandboxes**:
   ```bash
   for IP in 34.197.248.80; do
     ssh-copy-id -i ~/.ssh/valet-worker.pem ubuntu@$IP
   done
   ```

4. **Set AWS credentials** (for EC2 start/stop):
   - Local: Add `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION` to `.env`
   - CI/CD: Add to GitHub secrets

5. **Clean up deprecated secrets**:
   - Delete `EC2_SSH_KEY_STG`, `EC2_SSH_KEY_PROD` from GitHub
   - Delete `SANDBOX_IPS` from GitHub (replaced by API fleet discovery)

## Cost Impact

### Before Optimization
- 5x t3.large running 24/7: $347/month

### After Optimization (with auto-stop)
- 5x t3.large running 12hr/day weekdays: ~$200/month
- **Savings: $147/month (42%)**

### Scaling Example
- 20x t3.large running 24/7: $1,389/month
- 20x t3.large running 12hr/day: ~$800/month
- **Savings: $589/month (42%)**

## When to Re-introduce Secrets Encryption

- SOC2/compliance requirements mandate encrypted-at-rest secrets
- Fleet size exceeds 100 instances with distinct credential requirements
- Multiple teams need different access levels to different sandboxes
- Regulatory requirements (HIPAA, PCI-DSS)

At that point, use AWS Secrets Manager or HashiCorp Vault instead of custom database encryption.
