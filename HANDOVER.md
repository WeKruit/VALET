# PROD INCIDENT HANDOVER: Early Access 500 Regression

> **Status**: Fix merged, CI/CD failing post-merge. Needs debugging.
> **Branch**: `claude/fix-early-access-regression-RqOX2` → merged to `main`
> **Priority**: Production issue
> **Date**: 2026-03-05

---

## 1. The Bug

`POST /api/v1/early-access` was returning **500 Internal Server Error** in production.

**Root causes (2 issues fixed):**

1. **`early-access.repository.ts`** — Bare `.select()` and `.returning()` calls were pulling all columns from `earlyAccessSubmissions`, including columns added by recent migrations (referral/credit system — migration `0025`). This caused runtime failures when the ORM tried to map columns that didn't match expected types or when downstream code received unexpected shape.

2. **`email.service.ts`** — Template name mismatch: code referenced `"early_access"` but the actual template is `"early_access_confirmation"`. This caused email send failures after early access signup.

## 2. What Was Changed

**Commit**: `27d756c` — `fix(early-access): resolve 500 on POST /api/v1/early-access`

### Files changed (3):

#### `apps/api/src/modules/early-access/early-access.repository.ts`

- `findByEmail()` — Changed `.select()` → explicit `.select({ id, email, name, emailStatus })`
- `create()` — Removed `.returning()` (return value wasn't used)
- `getById()` — Changed `.select()` → explicit column selection
- `getAll()` (paginated list) — Changed `.select()` → explicit column selection
- `updateEmailStatus()` — Changed `.returning()` → `.returning({ id, emailStatus })`
- `deleteById()` — Changed `.returning()` → `.returning({ id })`

#### `apps/api/src/services/email.service.ts`

- Line 239: `"early_access"` → `"early_access_confirmation"` (correct template name)

#### `apps/web/src/features/auth/components/login-page.test.tsx`

- Added mock for `api.referrals.claim.useMutation` (was missing, caused test failure)
- Formatting fixes (trailing commas for Prettier compliance)

## 3. Local Verification (ALL PASSING)

| Check     | Command          | Result                                       |
| --------- | ---------------- | -------------------------------------------- |
| Build     | `pnpm build`     | All 7 workspaces pass                        |
| Typecheck | `pnpm typecheck` | Clean across all workspaces                  |
| Lint      | `pnpm lint`      | 0 errors                                     |
| Tests     | `pnpm test`      | **960 passed**, 48 skipped (e2e), 0 failures |

## 4. CI/CD Architecture

### CI Pipeline (`.github/workflows/ci.yml`)

Triggers on push/PR to `main` and `staging`. Runs:

1. `pnpm install --frozen-lockfile`
2. `pnpm turbo lint`
3. `pnpm turbo typecheck`
4. `pnpm test` (with CI Postgres: `postgresql://test:test@localhost:5432/valet_test`)
5. `pnpm turbo build`
6. Security audit + frontend bundle secret scan

### CD Pipeline

- `cd-prod.yml` triggers on push to `main`
- Uses `deploy.yml` reusable workflow
- Deploys to Fly.io (`fly/api.toml`, `fly/web.toml`)

### Migrations

- **Run automatically** via Fly.io `release_command = "node packages/db/dist/migrate.js"` in `fly/api.toml`
- **NOT** run in CI — CI uses a bare `valet_test` Postgres with no migrations applied
- Migration script prefers `DATABASE_DIRECT_URL` (port 5432) over `DATABASE_URL` (port 6543)
- **26 migrations** tracked in `packages/db/drizzle/meta/_journal.json` (0000–0025)
- Staging and prod **share the same Supabase DB** — migrations are idempotent

## 5. Debugging the CI Failure

### Step 1: Get the failure logs

```bash
gh run list --limit 5
gh run view <run-id> --log-failed
```

### Step 2: Common failure causes

| Symptom                                | Likely Cause                                                          | Fix                                                     |
| -------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------- |
| Test failures referencing DB           | CI Postgres has no migrations applied; tests hitting real schema fail | Tests should mock DB or CI needs migration step         |
| `Cannot find module` or import errors  | Build order issue in Turborepo                                        | Check `turbo.json` dependency graph                     |
| `pnpm install --frozen-lockfile` fails | `pnpm-lock.yaml` out of sync                                          | Run `pnpm install` locally and commit lockfile          |
| Lint/typecheck fails                   | Env-specific TS config                                                | Run `pnpm typecheck` and `pnpm lint` locally to compare |
| Bundle secret scan fails               | False positive in minified output                                     | Check the grep patterns in CI config                    |

### Step 3: If tests fail in CI but pass locally

The CI sets only one env var for tests: `DATABASE_URL=postgresql://test:test@localhost:5432/valet_test`. If any test depends on other env vars (Redis, API keys, etc.), it will fail in CI. Check:

```bash
# See what env vars tests might need
grep -r "process.env" apps/api/src --include="*.ts" -l
grep -r "import.meta.env" apps/web/src --include="*.ts" -l
```

### Step 4: Re-run locally to confirm

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

## 6. Key Project Context

- **Monorepo**: Turborepo + pnpm, 7 workspaces
- **API**: Fastify + awilix DI + ts-rest + Drizzle ORM
- **Web**: React + Vite + React Router + ts-rest React Query v5
- **DB**: Supabase Postgres (shared between staging/prod)
- **Schema files**: `packages/db/src/schema/*.ts`
- **Contract definitions**: `packages/contracts/src/**/*.ts`
- **Tests**: Vitest (`.test.ts` / `.test.tsx` files colocated with source)

## 7. Rollback Plan

If the fix itself is causing issues:

```bash
# Revert the commit on main
git revert 27d756c
git push origin main
```

The schema changes (migrations 0024/0025) are **not** part of this fix — they were already deployed. This fix only changes how the app queries those tables (explicit column selection instead of `SELECT *`).

## 8. Files to Watch

```
apps/api/src/modules/early-access/     # Repository, service, routes
apps/api/src/services/email.service.ts  # Email template rendering
packages/db/src/schema/                 # Drizzle schema definitions
packages/db/drizzle/                    # SQL migrations + journal
.github/workflows/ci.yml               # CI pipeline config
fly/api.toml                            # Fly deploy + release_command
```
