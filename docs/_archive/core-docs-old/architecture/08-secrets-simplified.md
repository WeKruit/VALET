# Secrets Management - Simplified Approach

## Overview

The sandbox secrets management system has been simplified. The original approach
used a `sandbox_secrets` database table with PGP encryption (pgcrypto) to store
per-sandbox encrypted secrets (SSH keys, env vars, API keys). This was
over-engineered for our current scale.

## Current Approach

Secrets are managed through two mechanisms:

### 1. Shared SSH Key (GitHub Secrets)

A single SSH key pair is shared across all sandbox EC2 instances:

- **Private key**: Stored as `EC2_SSH_KEY_STG` / `EC2_SSH_KEY_PROD` in GitHub
  Actions secrets
- **Public key**: Injected into EC2 instances via Terraform `cloud-init.yaml`
- **Usage**: CI/CD pipelines use the key for deployment (`deploy-worker.sh`)
  and operational scripts (`health-check.sh`, `set-secrets.sh`)

### 2. Environment Variables (Fly.io Secrets / GitHub Secrets)

Application secrets (API keys, database URLs, etc.) are stored in:

- **Fly.io secrets**: For API, Worker, and Web apps deployed on Fly.io
- **GitHub Actions secrets**: For CI/CD pipelines and EC2 deployment
- **EC2 `.env` file**: Deployed via `set-secrets.sh` script to `/opt/valet/.env`

## What Was Removed

- `SandboxSecretsService` (API service class)
- Secret CRUD API endpoints (store, list, rotate, delete)
- Secret contract definitions in `@valet/contracts`
- DI registration for `SandboxSecretsService`
- `SANDBOX_SECRETS_KEY` environment variable requirement

## What Was Kept (Deprecated)

- `sandbox_secrets` database table (data preservation)
- `sandbox-secrets.ts` Drizzle schema (marked `@deprecated`)
- `sandbox-secret.schema.ts` Zod schemas (marked `@deprecated`)

These are kept to avoid destructive migrations and preserve any existing data.
The table is excluded from `drizzle.config.ts` `tablesFilter` so drizzle-kit
will not attempt to manage it.

## When to Re-introduce Encryption

Consider re-implementing per-sandbox secret management when:

- **SOC2 compliance** requires audit trails for secret access
- **Multi-tenant isolation** is needed (different keys per customer)
- **Scale** reaches 10+ sandboxes with distinct credential requirements
- **Regulatory requirements** mandate encrypted-at-rest secrets with rotation

At that point, consider using AWS Secrets Manager or HashiCorp Vault instead
of rolling custom PGP encryption.
