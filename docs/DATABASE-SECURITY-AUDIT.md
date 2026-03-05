# Database Security Audit Report

**Date:** 2026-02-25
**Scope:** Production (`wekruit-prod` / `ugidjvgzyeiiktnqstro`) vs Staging (`unistzvhgvgjyzotwzxr`)
**Related:** WEK-139 (DB Split), WEK-186 (Mailgun)

---

## Executive Summary

Production and staging databases are now separate Supabase projects. This audit compares their state, identifies security gaps, and provides actionable recommendations.

**Key Findings:**

1. Schema is identical (28 tables, all columns match)
2. RLS is enabled on all prod tables (Supabase default) but off on most staging tables -- **not a problem** since VALET connects as `postgres` (bypasses RLS)
3. ~~`gh_pickup_next_job` function was missing worker affinity logic on prod~~ -- **FIXED during audit**
4. ~~`gh_browser_sessions` had a dangerous RLS policy granting public role full access~~ -- **FIXED on both environments**
5. Network Restrictions are **not enabled** -- highest-impact action remaining
6. No frontend-to-Supabase path exists -- RLS is defense-in-depth only

---

## 1. Prod vs Staging Gap Analysis

### 1.1 Schema Comparison

| Category               | Status | Details                                           |
| ---------------------- | ------ | ------------------------------------------------- |
| Tables (28 app tables) | MATCH  | Identical in both environments                    |
| Columns                | MATCH  | All names, types, defaults, nullability identical |
| Indexes                | MATCH  | All index definitions identical                   |
| Triggers (9)           | MATCH  | All trigger definitions identical                 |
| Functions (8 of 9)     | MATCH  | All identical except `gh_pickup_next_job`         |
| pgboss schema          | MATCH  | All 8 tables present in both                      |
| drizzle schema         | MATCH  | `__drizzle_migrations` in both                    |

### 1.2 Differences Found

#### Function Drift: `gh_pickup_next_job` -- FIXED

Prod had the older version without worker affinity logic. Staging had the correct version with `worker_affinity` (`any`/`preferred`/`strict`) and `target_worker_id` matching.

**Status:** Fixed during this audit. Both environments now have the worker affinity version.

#### RLS Enabled Status

| Tables               | Staging | Prod | Notes                                             |
| -------------------- | ------- | ---- | ------------------------------------------------- |
| 6 `gh_*` tables      | ON      | ON   | Match                                             |
| `gh_worker_registry` | OFF     | ON   | Different                                         |
| 21 other app tables  | OFF     | ON   | Different (Supabase auto-enables on new projects) |

**Impact:** None for VALET. The `postgres` role has `BYPASSRLS` -- all RLS is skipped. This is defense-in-depth only.

#### Realtime Publication

| Table                | Staging        | Prod               |
| -------------------- | -------------- | ------------------ |
| `gh_automation_jobs` | In publication | NOT in publication |
| `gh_job_events`      | In publication | NOT in publication |

**Impact:** Low. VALET uses SSE for real-time updates, not Supabase Realtime. If Realtime is needed on prod in the future, run:

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE gh_automation_jobs;
ALTER PUBLICATION supabase_realtime ADD TABLE gh_job_events;
```

#### Staging-Only Tables (harmless)

5 Hatchet underscore tables exist only on staging: `_ActionToWorker`, `_ServiceToWorker`, `_StepOrder`, `_StepRunOrder`, `_WorkflowToWorkflowTag`. These are legacy artifacts and can be dropped from staging when convenient.

### 1.3 RLS Policies (Both Environments)

Existing policies on `gh_*` tables are **identical** in both environments:

| Table                 | Policies                                                           |
| --------------------- | ------------------------------------------------------------------ |
| `gh_action_manuals`   | Allow all for authenticated users; Allow all for service role      |
| `gh_automation_jobs`  | Service role full access (x2); Users can create/read own jobs (x3) |
| `gh_browser_sessions` | Service role full access; Users CRUD own sessions                  |
| `gh_job_events`       | Service role full access (x2); Users can read own events (x2)      |
| `gh_user_credentials` | Service role only for credentials                                  |
| `gh_user_usage`       | Service role full access; Users can read own usage                 |

**Non-GH tables:** RLS is enabled in prod with **zero policies** = deny-all for `anon`/`authenticated` roles. This is the correct configuration for VALET's architecture.

---

## 2. Architecture & Access Patterns

### 2.1 How VALET Accesses the Database

| Component           | Connection Method                          | Role                   | RLS Effect   |
| ------------------- | ------------------------------------------ | ---------------------- | ------------ |
| VALET API (Fastify) | Drizzle ORM via `DATABASE_URL`             | `postgres` (superuser) | **Bypassed** |
| VALET Worker        | Drizzle ORM via `DATABASE_URL`             | `postgres` (superuser) | **Bypassed** |
| VALET Web Frontend  | Does NOT access Supabase directly          | N/A                    | N/A          |
| GH Worker           | `@supabase/supabase-js` with `sb_secret_*` | `service_role`         | **Bypassed** |

**Critical insight:** No client-side code uses the Supabase client SDK or anon/publishable key. All database access is server-side through the `postgres` or `service_role` roles, both of which bypass RLS entirely.

### 2.2 Per-Table Access Analysis

#### User-Scoped Tables (application layer enforces userId filtering)

| Table                 | Accessed By                                        | User Scoping                                        |
| --------------------- | -------------------------------------------------- | --------------------------------------------------- |
| `users`               | API (user.repository, auth.service, billing, GDPR) | Own profile only; admin for admin queries           |
| `tasks`               | API (task.repository, dashboard), Worker           | `userId` filter on all user queries; admin bypasses |
| `task_events`         | API (task-event.repository), Worker                | Indirect via task ownership                         |
| `resumes`             | API (resume.repository, GDPR)                      | `userId` filter                                     |
| `notifications`       | API (notification.repository)                      | `userId` filter                                     |
| `consent_records`     | API (consent.service, GDPR)                        | `userId` filter                                     |
| `qa_bank`             | API (qa-bank.repository, GDPR)                     | `userId` filter                                     |
| `gh_automation_jobs`  | API + GH Worker                                    | `userId` filter in API; service_role in GH          |
| `gh_job_events`       | API + GH Worker                                    | Indirect via job ownership                          |
| `gh_user_usage`       | GH Worker (costControl)                            | `userId` scoped                                     |
| `gh_user_credentials` | GH Worker (JobExecutor)                            | `userId` + platform scoped                          |
| `gh_browser_sessions` | API + GH Worker                                    | `userId` filter in both                             |
| `browser_profiles`    | Schema only (unused in active code)                | Has `userId` FK                                     |

#### Admin/Infrastructure Tables (no user access)

| Table                      | Accessed By                                      | Notes                                |
| -------------------------- | ------------------------------------------------ | ------------------------------------ |
| `sandboxes`                | API (sandbox.repository, health monitor, deploy) | Admin/infrastructure only, no userId |
| `sandbox_audit_logs`       | API (audit-log.repository)                       | Admin read; service write            |
| `sandbox_deploy_history`   | API (deploy-history.repository)                  | Admin only                           |
| `sandbox_secrets`          | **DEPRECATED** -- schema says no longer used     | Should be deny-all                   |
| `email_templates`          | No code references found                         | DB-only, seeded by migration         |
| `early_access_submissions` | API (early-access.repository)                    | Public insert; admin read            |
| `action_manuals`           | Worker (manual-manager)                          | Global automation data               |
| `manual_steps`             | Worker (manual-manager)                          | Child of action_manuals              |
| `audit_trail`              | API (secrets-sync.service)                       | Admin audit logging                  |
| `application_fields`       | Schema only (unused)                             | Future use                           |
| `application_results`      | Schema only (unused)                             | Future use                           |
| `proxy_bindings`           | Schema only (unused)                             | Infrastructure                       |
| `gh_action_manuals`        | GH Worker (ManualStore)                          | Global cookbooks                     |
| `gh_worker_registry`       | API + GH Worker (raw SQL)                        | Infrastructure metadata              |

---

## 3. Security Recommendations

### 3.1 CRITICAL: Enable Network Restrictions

**This is the single highest-impact security action.**

Supabase Network Restrictions limit which IP addresses can connect to the database. Without this, anyone with the database password can connect from anywhere.

**Action:** Go to Supabase Dashboard > Settings > Network > Network Restrictions

Add allowed CIDRs:

- Fly.io app IPs (get from `fly ips list -a valet-api` and `fly ips list -a valet-worker`)
- CI/CD runner IPs (GitHub Actions runners if migrations run in CI)
- Developer IPs (for emergency direct access -- consider using a VPN)

### 3.2 Key Management

| Key                                           | Needed? | Where                     | Notes                                               |
| --------------------------------------------- | ------- | ------------------------- | --------------------------------------------------- |
| `DATABASE_URL` (postgres password)            | YES     | Fly.io secrets            | Primary credential for all DB access                |
| `DATABASE_DIRECT_URL`                         | YES     | Fly.io secrets (API only) | For migrations only                                 |
| `sb_secret_*` (SUPABASE_SECRET_KEY)           | YES     | Fly.io secrets            | Needed for Supabase Storage API (resume uploads)    |
| `sb_publishable_*` (SUPABASE_PUBLISHABLE_KEY) | NO      | Can remove                | VALET doesn't use Supabase client SDK from frontend |
| `SUPABASE_URL`                                | YES     | Fly.io secrets            | For Supabase Storage API endpoint                   |

**Recommendation:** Remove `SUPABASE_PUBLISHABLE_KEY` from production secrets and `.env.production`. It's not used and its exposure would be the only way someone could try to access PostgREST.

### 3.3 Connection Pooling

Current setup is correct:

| Component  | Should Use            | Port | Why                                   |
| ---------- | --------------------- | ---- | ------------------------------------- |
| API server | Transaction pooler    | 6543 | High concurrency, short-lived queries |
| Worker     | Transaction pooler    | 6543 | Same as API                           |
| Migrations | Direct/Session pooler | 5432 | DDL needs session state               |

**Verify:** Drizzle config disables prepared statements when using transaction pooler (required).

### 3.4 RLS Strategy

**Current state is acceptable.** Keep:

- RLS **enabled** on all tables in prod (defense-in-depth)
- **No policies** on non-GH tables (deny-all for anon/authenticated)
- Existing policies on GH tables (user-scoped + service_role)

**Do NOT** add complex RLS policies unless you plan to expose Supabase directly to the frontend. The `postgres` and `service_role` connections bypass all RLS.

**If you ever add frontend Supabase client access**, you'll need real policies. The recommended patterns per table are in the access analysis above (Section 2.2).

### 3.5 Storage/S3 Security

Resume uploads use Supabase Storage with S3-compatible API.

**Recommendations:**

- Ensure all buckets (`resumes`, `screenshots`, `artifacts`) are **private** (no public URL access)
- Use **signed URLs** with short expiration (60-300 seconds for downloads)
- Validate file types and sizes in the API before accepting uploads
- Use path convention: `{user_id}/{filename}` for organization

### 3.6 Supabase Pro Plan Features

| Feature                         | Status             | Recommendation                                              |
| ------------------------------- | ------------------ | ----------------------------------------------------------- |
| Daily backups (7-day retention) | Enabled by default | Keep enabled                                                |
| PITR (Point-in-Time Recovery)   | Paid add-on        | Enable when DB > 4GB or for critical data                   |
| Network Restrictions            | **NOT enabled**    | **Enable immediately** (see 3.1)                            |
| SSL enforcement                 | Enabled by default | Verify `sslmode=require` in connection strings              |
| MFA on dashboard                | Optional           | Enable for all team members                                 |
| pg_graphql                      | Likely enabled     | **Disable** -- reduces attack surface, VALET doesn't use it |
| Realtime                        | Enabled            | Disable if not used; low priority                           |

### 3.7 Migration Strategy Going Forward

Both environments now have separate `__drizzle_migrations` and `goose_db_version` tables tracking applied migrations.

**Workflow:**

1. Develop schema changes locally
2. `drizzle-kit generate` to create migration SQL
3. Apply to staging via `DATABASE_DIRECT_URL` (session pooler, port 5432)
4. Test on staging
5. Apply to prod via same migration (CI/CD `release_command` or manual)

**Rules:**

- Never use `drizzle-kit push` in production
- Always use direct/session connection for migrations (not transaction pooler)
- GH migrations (goose) follow the same pattern: staging first, then prod
- Both databases must receive every migration -- track in deployment docs

---

## 4. Issues Fixed During This Audit

### 4.1 gh_browser_sessions Dangerous RLS Policy -- FIXED

**Found:** Policy `service_role_full_access` on `gh_browser_sessions` granted ALL access to `{public}` role (anonymous access). This was present on **both** environments.

**Fixed:** Dropped the bad policy and recreated it correctly with `TO service_role` on both prod and staging.

```sql
-- Applied to both environments
DROP POLICY "service_role_full_access" ON gh_browser_sessions;
CREATE POLICY "service_role_full_access" ON gh_browser_sessions
  FOR ALL TO service_role USING (true) WITH CHECK (true);
```

### 4.2 gh_pickup_next_job Function Drift -- FIXED

**Found:** Prod had the older version without worker affinity logic (`worker_affinity`, `target_worker_id`).

**Fixed:** Applied the staging version to prod. Both environments now have identical function logic.

---

## 5. Action Items

### Immediate (do now)

- [ ] **Enable Network Restrictions** on both Supabase projects (Section 3.1)
- [ ] **Enable MFA** on Supabase dashboard for all team members
- [ ] **Remove `SUPABASE_PUBLISHABLE_KEY`** from prod Fly.io secrets (not needed)

### Short-term (this sprint)

- [ ] **Disable pg_graphql** extension on both Supabase projects
- [ ] **Verify SSL enforcement** in connection strings
- [ ] **Audit S3 bucket access** -- confirm all buckets are private
- [ ] **Drop deprecated `sandbox_secrets` table** (schema says no longer used)
- [ ] **Drop 5 Hatchet underscore tables** from staging (legacy artifacts)

### Medium-term (next sprint)

- [ ] **Enable PITR** on prod when DB grows past 4GB
- [ ] **Set up monitoring** -- Prometheus metrics export + alerting on connection count, slow queries, disk usage
- [ ] **Add Supabase Realtime** tables on prod if SSE migration is planned
- [ ] **Create migration CI step** that applies to both environments in sequence

---

## Appendix A: Existing RLS Policies (Complete)

```sql
-- gh_action_manuals
CREATE POLICY "Allow all for authenticated users" ON gh_action_manuals FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for service role" ON gh_action_manuals FOR ALL TO service_role USING (true) WITH CHECK (true);

-- gh_automation_jobs
CREATE POLICY "Service role full access on gh_automation_jobs" ON gh_automation_jobs FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access to jobs" ON gh_automation_jobs FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Users can create own jobs" ON gh_automation_jobs FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can read own automation jobs" ON gh_automation_jobs FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can view own jobs" ON gh_automation_jobs FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- gh_browser_sessions
CREATE POLICY "Service role full access on gh_browser_sessions" ON gh_browser_sessions FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Users can delete own sessions" ON gh_browser_sessions FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can read own sessions" ON gh_browser_sessions FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "service_role_full_access" ON gh_browser_sessions FOR ALL TO service_role USING (true) WITH CHECK (true);

-- gh_job_events
CREATE POLICY "Service role full access on gh_job_events" ON gh_job_events FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access to events" ON gh_job_events FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Users can read own job events" ON gh_job_events FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM gh_automation_jobs WHERE id = gh_job_events.job_id AND user_id = auth.uid()));
CREATE POLICY "Users can view events for own jobs" ON gh_job_events FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM gh_automation_jobs WHERE id = gh_job_events.job_id AND user_id = auth.uid()));

-- gh_user_credentials
CREATE POLICY "Service role only for credentials" ON gh_user_credentials FOR ALL TO service_role USING (true) WITH CHECK (true);

-- gh_user_usage
CREATE POLICY "Service role full access on gh_user_usage" ON gh_user_usage FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Users can read own usage" ON gh_user_usage FOR SELECT TO authenticated USING (auth.uid() = user_id);
```

## Appendix B: Duplicate Policies to Clean Up

Several tables have **duplicate policies** doing the same thing with different names:

| Table                 | Duplicate Policies                                                                                               | Action   |
| --------------------- | ---------------------------------------------------------------------------------------------------------------- | -------- |
| `gh_automation_jobs`  | "Service role full access on gh_automation_jobs" + "Service role full access to jobs" (both ALL to service_role) | Drop one |
| `gh_automation_jobs`  | "Users can read own automation jobs" + "Users can view own jobs" (both SELECT to authenticated)                  | Drop one |
| `gh_browser_sessions` | "Service role full access on gh_browser_sessions" + "service_role_full_access" (both ALL to service_role)        | Drop one |
| `gh_job_events`       | "Service role full access on gh_job_events" + "Service role full access to events" (both ALL to service_role)    | Drop one |
| `gh_job_events`       | "Users can read own job events" + "Users can view events for own jobs" (both SELECT to authenticated)            | Drop one |

**Cleanup SQL (apply to both environments):**

```sql
-- Remove duplicate service_role policies
DROP POLICY "Service role full access to jobs" ON gh_automation_jobs;
DROP POLICY "service_role_full_access" ON gh_browser_sessions;
DROP POLICY "Service role full access to events" ON gh_job_events;

-- Remove duplicate user SELECT policies
DROP POLICY "Users can view own jobs" ON gh_automation_jobs;
DROP POLICY "Users can view events for own jobs" ON gh_job_events;
```
