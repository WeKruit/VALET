# VALET Regression Testing Plan

> **Last updated**: 2026-02-18
>
> This document defines the regression test suite for WeKruit VALET.
> Tests are organized by priority (P0/P1/P2) and layer (API, Frontend, Worker, Database, Integration).

## Test Infrastructure

| Tool                   | Purpose                        | Config                             |
| ---------------------- | ------------------------------ | ---------------------------------- |
| Vitest                 | Unit + API tests               | `vitest.config.ts` (root)          |
| Playwright             | E2E / frontend smoke           | `tests/e2e/playwright.config.ts`   |
| Fastify `app.inject()` | API route testing (no network) | `apps/api/tests/helpers/client.ts` |
| Test DB helpers        | DB reset between tests         | `apps/api/tests/helpers/db.ts`     |

### Running Tests

```bash
# All unit + API tests (Vitest)
pnpm test

# Specific workspace
pnpm test -- --project @valet/api

# E2E tests (Playwright)
npx playwright test --config tests/e2e/playwright.config.ts

# E2E with specific browser
npx playwright test --config tests/e2e/playwright.config.ts --project chromium

# Security tests only (currently excluded from default run -- enable per-suite)
pnpm vitest run apps/api/tests/security/
```

---

## 1. API Regression Tests (apps/api)

### P0 -- Must Pass Before Any Deploy

These tests gate every deployment. If any P0 test fails, the deploy is blocked.

#### 1.1 Authentication (auth.routes.ts, auth.service.ts)

| #    | Test Name                                                 | What It Tests                                | Expected Result                                                                   |
| ---- | --------------------------------------------------------- | -------------------------------------------- | --------------------------------------------------------------------------------- |
| A-01 | `POST /api/v1/auth/google` returns tokens with valid code | Google OAuth exchange (happy path)           | `200` with `{ accessToken, refreshToken }`, `Set-Cookie` header for refresh token |
| A-02 | `POST /api/v1/auth/google` rejects invalid code           | Bad OAuth code                               | `401` with `UNAUTHORIZED` error                                                   |
| A-03 | Protected routes return 401 without token                 | No `Authorization` header on `/api/v1/tasks` | `401` with `UNAUTHORIZED`                                                         |
| A-04 | Protected routes return 401 with expired token            | Expired JWT on `/api/v1/tasks`               | `401` with `UNAUTHORIZED`                                                         |
| A-05 | Protected routes return 401 with wrong-secret JWT         | JWT signed with different secret             | `401` with `UNAUTHORIZED`                                                         |
| A-06 | `POST /api/v1/auth/refresh` issues new access token       | Valid refresh token cookie                   | `200` with new `accessToken`, new `Set-Cookie`                                    |
| A-07 | `POST /api/v1/auth/refresh` rejects invalid refresh token | Tampered cookie value                        | `401`                                                                             |
| A-08 | `GET /api/v1/auth/me` returns current user profile        | Valid JWT                                    | `200` with `{ id, email, name }`                                                  |

**Example test code (Vitest + Fastify inject):**

```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildTestApp, createToken } from "./setup";
import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildTestApp();
});

afterAll(async () => {
  await app.close();
});

describe("P0: Auth", () => {
  it("A-03: returns 401 when no Authorization header is provided", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/tasks" });
    expect(res.statusCode).toBe(401);
    expect(res.json().error).toBe("UNAUTHORIZED");
  });

  it("A-04: returns 401 for expired JWT", async () => {
    const expiredToken = await createToken({ sub: randomUUID() }, "-1h");
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/tasks",
      headers: { authorization: `Bearer ${expiredToken}` },
    });
    expect(res.statusCode).toBe(401);
  });

  it("A-06: POST /api/v1/auth/refresh issues new access token", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/refresh",
      cookies: { refreshToken: "mock-refresh-token" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveProperty("accessToken");
    expect(res.headers["set-cookie"]).toBeDefined();
  });
});
```

#### 1.2 Tasks CRUD (task.routes.ts, task.service.ts)

| #    | Test Name                                                 | What It Tests                                      | Expected Result                                          |
| ---- | --------------------------------------------------------- | -------------------------------------------------- | -------------------------------------------------------- |
| T-01 | `POST /api/v1/tasks` creates task record                  | Task creation (happy path)                         | `201` with `{ id, status: "created", jobUrl, platform }` |
| T-02 | `POST /api/v1/tasks` validates jobUrl                     | Missing or invalid URL                             | `400` with `VALIDATION_ERROR`                            |
| T-03 | `POST /api/v1/tasks` rejects private IPs (SSRF)           | `jobUrl` pointing to `127.0.0.1`, `10.x.x.x`, etc. | `400` with `VALIDATION_ERROR`                            |
| T-04 | `GET /api/v1/tasks` lists user's tasks                    | Authenticated list                                 | `200` with `{ data: [...], pagination }`                 |
| T-05 | `GET /api/v1/tasks` does not show other users' tasks      | User A lists tasks; User B's tasks excluded        | `200` with empty or own tasks only                       |
| T-06 | `GET /api/v1/tasks/:id` returns task detail               | Valid task ID owned by user                        | `200` with full task object including `ghJob`            |
| T-07 | `GET /api/v1/tasks/:id` returns 404 for other user's task | Access another user's task                         | `404` (not `403` -- prevents info leak)                  |
| T-08 | `GET /api/v1/tasks/:id` returns 404 for nonexistent task  | Random UUID                                        | `404`                                                    |

**Example test code:**

```typescript
describe("P0: Tasks CRUD", () => {
  it("T-01: POST /api/v1/tasks creates a task record", async () => {
    const token = await createToken({ sub: "alice-user-id", email: "alice@test.com" });
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tasks",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      payload: JSON.stringify({
        jobUrl: "https://www.linkedin.com/jobs/view/1234567890",
        mode: "copilot",
        resumeId: "00000000-0000-0000-0000-000000000001",
      }),
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body).toHaveProperty("id");
    expect(body.jobUrl).toContain("linkedin.com");
    expect(body.platform).toBe("linkedin");
  });

  it("T-07: returns 404 (not 403) for another user's task", async () => {
    const bobToken = await createToken({ sub: "bob-user-id", email: "bob@test.com" });
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/tasks/task-owned-by-alice",
      headers: { authorization: `Bearer ${bobToken}` },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().message).not.toContain("forbidden");
  });
});
```

#### 1.3 GhostHands Webhook (ghosthands.webhook.ts)

| #    | Test Name                                                          | What It Tests                                              | Expected Result                                                    |
| ---- | ------------------------------------------------------------------ | ---------------------------------------------------------- | ------------------------------------------------------------------ |
| W-01 | `POST /api/v1/webhooks/ghosthands` updates task status             | Valid callback with `status: "completed"`                  | `200`, task status updated to `completed`                          |
| W-02 | `POST /api/v1/webhooks/ghosthands` returns 401 without service key | No `X-GH-Service-Key` header and no `?token=` param        | `401`                                                              |
| W-03 | `POST /api/v1/webhooks/ghosthands` returns 401 with wrong key      | Bad service key value                                      | `401`                                                              |
| W-04 | `POST /api/v1/webhooks/ghosthands` handles `needs_human` status    | Callback with `status: "needs_human"` and interaction data | `200`, task status set to `waiting_human`, interaction data stored |
| W-05 | `POST /api/v1/webhooks/ghosthands` handles `resumed` status        | Callback with `status: "resumed"`                          | `200`, task back to `in_progress`, interaction data cleared        |
| W-06 | `POST /api/v1/webhooks/ghosthands` rejects malformed payload       | Missing `job_id` or `status`                               | `400`                                                              |
| W-07 | `POST /api/v1/webhooks/ghosthands` stores cost data                | Callback with `cost` object                                | `200`, `task.llmUsage` fields populated                            |
| W-08 | `POST /api/v1/webhooks/ghosthands/deploy` verifies HMAC signature  | Valid HMAC-SHA256 in `X-GH-Webhook-Signature`              | `200`                                                              |
| W-09 | `POST /api/v1/webhooks/ghosthands/deploy` rejects bad signature    | Invalid HMAC                                               | `401`                                                              |

**Example test code:**

```typescript
describe("P0: GhostHands Webhook", () => {
  it("W-02: returns 401 without service key", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/webhooks/ghosthands",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({
        job_id: "gh-job-001",
        status: "completed",
        valet_task_id: "task-001",
      }),
    });
    expect(res.statusCode).toBe(401);
  });

  it("W-06: rejects payload missing required fields", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/webhooks/ghosthands",
      headers: {
        "content-type": "application/json",
        "x-gh-service-key": process.env.GH_SERVICE_SECRET!,
      },
      payload: JSON.stringify({ random: "data" }), // missing job_id and status
    });
    expect(res.statusCode).toBe(400);
  });
});
```

### P1 -- Should Pass

| #     | Test Name                                                       | What It Tests                                  | Expected Result                                             | Priority |
| ----- | --------------------------------------------------------------- | ---------------------------------------------- | ----------------------------------------------------------- | -------- |
| T-10  | `DELETE /api/v1/tasks/:id` cancels task                         | Cancel a `created`/`queued`/`in_progress` task | `204`, task status `cancelled`, GH `cancelJob()` called     | P1       |
| T-11  | `DELETE /api/v1/tasks/:id` rejects cancel on completed task     | Cancel a `completed` task                      | `409` `TaskNotCancellableError`                             | P1       |
| T-12  | `POST /api/v1/tasks/:id/retry` creates new attempt              | Retry a `failed` task                          | `200`, task status back to `queued`, GH `retryJob()` called | P1       |
| T-13  | `POST /api/v1/tasks/:id/retry` rejects non-failed task          | Retry a `completed` task                       | `409`                                                       | P1       |
| T-14  | `POST /api/v1/tasks/:id/approve` resumes waiting_human task     | User approves HITL blocker                     | `200`, GH `resumeJob()` called                              | P1       |
| T-15  | `POST /api/v1/tasks/:id/resolve-blocker` resolves HITL          | Resolve with `resolvedBy` and `notes`          | `200`, returns `{ message: "Resume request sent" }`         | P1       |
| T-16  | `PUT /api/v1/tasks/:id/external-status` updates external status | Set `externalStatus` to `interviewing`         | `200`, field persisted                                      | P1       |
| T-17  | `GET /api/v1/tasks/stats` returns task statistics               | User task count by status                      | `200` with stats object                                     | P1       |
| T-18  | `GET /api/v1/tasks/export` returns CSV                          | Download task CSV                              | `200`, `Content-Type: text/csv`                             | P1       |
| A-10  | `GET /api/v1/admin/tasks` requires admin role                   | Regular user access                            | `403` with `Admin access required`                          | P1       |
| A-11  | `GET /api/v1/admin/tasks` lists all users' tasks for admin      | Admin user access                              | `200` with cross-user tasks                                 | P1       |
| WS-01 | WebSocket connection with valid token succeeds                  | WS connect to `/api/v1/ws?token=<jwt>`         | Connection established, no `4001` close code                | P1       |
| WS-02 | WebSocket connection without token is rejected                  | WS connect to `/api/v1/ws` (no token)          | `4001` close code with "Missing token"                      | P1       |
| WS-03 | Task update message delivered via WebSocket                     | Webhook triggers `publishToUser()`             | Connected client receives `task_update` JSON message        | P1       |

### P2 -- Nice to Have

| #    | Test Name                                   | What It Tests                              | Expected Result                                             | Priority |
| ---- | ------------------------------------------- | ------------------------------------------ | ----------------------------------------------------------- | -------- |
| A-20 | Rate limiter blocks after threshold         | >100 requests in 1 minute                  | `429` with `RATE_LIMIT_EXCEEDED`                            | P2       |
| A-21 | Security headers present on all responses   | `helmet` middleware                        | CSP, HSTS, X-Content-Type-Options headers set               | P2       |
| A-22 | CORS rejects disallowed origins             | `Origin: https://evil.com`                 | No `Access-Control-Allow-Origin` header                     | P2       |
| T-20 | Input sanitization: XSS in task notes       | `<script>alert(1)</script>` in notes field | Stored without executing; response is escaped or plain text | P2       |
| T-21 | Input sanitization: SQL injection in search | `'; DROP TABLE tasks;--` in search query   | `200` with empty results (query parameterized)              | P2       |
| T-22 | SSRF: file:// protocol rejected             | `jobUrl: "file:///etc/passwd"`             | `400`                                                       | P2       |
| T-23 | SSRF: AWS metadata endpoint rejected        | `jobUrl: "http://169.254.169.254/latest/"` | `400`                                                       | P2       |
| T-24 | Path traversal in resume filename rejected  | `filename: "../../etc/passwd"`             | `400` with `Invalid filename`                               | P2       |

---

## 2. Frontend Smoke Tests (apps/web -- Playwright)

All E2E tests run against `http://localhost:5173` (web) + `http://localhost:8000` (API).
Tests use mock API routes via Playwright's `page.route()` to avoid dependency on live services.

### Existing E2E Suites

| File                                         | Covers                                                                      |
| -------------------------------------------- | --------------------------------------------------------------------------- |
| `tests/e2e/auth.spec.ts`                     | Login page render, Google OAuth redirect, auth guard, logout                |
| `tests/e2e/onboarding.spec.ts`               | 3-step onboarding: resume upload, profile review, disclaimer                |
| `tests/e2e/apply.spec.ts`                    | Apply page: URL input, platform detection, task creation, progress timeline |
| `apps/web/tests/e2e/admin-sandboxes.spec.ts` | Admin sandbox CRUD, role-based access                                       |

### P0 -- Smoke Tests

| #     | Test Name                                 | What It Tests                          | Expected Result            |
| ----- | ----------------------------------------- | -------------------------------------- | -------------------------- |
| FE-01 | Login page renders                        | `/login` shows Google OAuth button     | Button visible and enabled |
| FE-02 | Unauthenticated user redirected to /login | Navigate to `/dashboard` without auth  | URL changes to `/login`    |
| FE-03 | Dashboard loads after auth                | Authenticated user visits `/dashboard` | Page renders without error |
| FE-04 | Task list shows tasks                     | `/dashboard` with mocked task list API | Task cards/rows visible    |
| FE-05 | Apply page form submits                   | Fill URL, click Start Application      | Navigates to `/tasks/:id`  |

### P1 -- Feature Smoke Tests

| #     | Test Name                        | What It Tests                             | Expected Result                                    |
| ----- | -------------------------------- | ----------------------------------------- | -------------------------------------------------- |
| FE-10 | Task detail page shows progress  | `/tasks/:id` with mocked in-progress task | Progress bar, timeline steps, status badge visible |
| FE-11 | Onboarding completes within 90s  | Full 3-step onboarding flow               | Ends at `/dashboard` in under 90s                  |
| FE-12 | Platform detection: LinkedIn     | Paste LinkedIn URL                        | "LinkedIn" badge + "Easy Apply detected"           |
| FE-13 | Platform detection: Greenhouse   | Paste Greenhouse URL                      | "Greenhouse" badge                                 |
| FE-14 | Platform detection: Lever        | Paste Lever URL                           | "Lever" badge                                      |
| FE-15 | Logout clears session            | Click sign out                            | Redirected to `/login`                             |
| FE-16 | Admin sandbox page: admin access | Admin role user                           | Sandbox list visible                               |
| FE-17 | Admin sandbox page: user denied  | Regular user                              | "Access denied" message                            |

**Example Playwright test:**

```typescript
import { test, expect } from "@playwright/test";
import { authenticate, createTestUser, mockAuthMe } from "./helpers/auth";

test.describe("P0: Frontend Smoke", () => {
  test("FE-01: login page renders with Google OAuth button", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByText("WeKruit Valet")).toBeVisible();
    const googleButton = page.getByRole("button", { name: /sign in with google/i });
    await expect(googleButton).toBeVisible();
    await expect(googleButton).toBeEnabled();
  });

  test("FE-03: dashboard loads after auth", async ({ page }) => {
    const user = createTestUser();
    await authenticate(page.context(), user);
    await mockAuthMe(page, user);
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test("FE-05: apply form submits and navigates to task detail", async ({ page }) => {
    const user = createTestUser();
    await authenticate(page.context(), user);
    await mockAuthMe(page, user);

    await page.route("**/api/v1/tasks", async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({
            id: "00000000-0000-0000-0000-000000000099",
            status: "created",
          }),
        });
      }
    });

    await page.goto("/apply");
    await page
      .getByPlaceholder(/paste a job url/i)
      .fill("https://www.linkedin.com/jobs/view/1234567890");
    await page.getByRole("button", { name: /start application/i }).click();
    await expect(page).toHaveURL(/\/tasks\/00000000-0000-0000-0000-000000000099/);
  });
});
```

---

## 3. Worker Regression Tests (apps/worker)

The worker is a GhostHands browser automation client. It dispatches jobs via HTTP POST to GH and handles callbacks. Tests mock the GhostHands API.

### P0

| #     | Test Name                                    | What It Tests                                                       | Expected Result                                                          |
| ----- | -------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| WK-01 | Job dispatch sends correct payload to GH API | `TaskService.create()` calls `GhostHandsClient.submitApplication()` | POST to GH with `valet_task_id`, `target_url`, `callback_url`, `profile` |
| WK-02 | Job dispatch stores `workflowRunId` on task  | GH returns `{ job_id }`                                             | `task.workflowRunId` updated to GH job ID                                |
| WK-03 | GH API unavailable marks task as failed      | `submitApplication()` throws                                        | Task status `failed`, error `GH_SUBMIT_FAILED`                           |

### P1

| #     | Test Name                                   | What It Tests                                      | Expected Result                                                             |
| ----- | ------------------------------------------- | -------------------------------------------------- | --------------------------------------------------------------------------- |
| WK-10 | Callback URL includes service token         | `buildCallbackUrl()` logic                         | URL ends with `?token=<GH_SERVICE_SECRET>`                                  |
| WK-11 | Profile builder extracts resume fields      | `buildGhosthandsProfile()` with parsed resume data | Returns `{ first_name, last_name, email, education, work_history, skills }` |
| WK-12 | Profile builder handles null parsed data    | `buildGhosthandsProfile(null)`                     | Returns `{ first_name: "", last_name: "", email: "" }`                      |
| WK-13 | QA bank answers included in dispatch        | User has QA entries with `usageMode: "always_use"` | `qa_answers` field populated in GH request                                  |
| WK-14 | Retry calls `ghosthandsClient.retryJob()`   | `TaskService.retry()` on failed task               | GH `retryJob()` called with correct job ID                                  |
| WK-15 | Cancel calls `ghosthandsClient.cancelJob()` | `TaskService.cancel()` on in-progress task         | GH `cancelJob()` called; if GH errors, warning logged but cancel proceeds   |

**Example test code:**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { TaskService } from "../task.service";

describe("P0: Worker / Job Dispatch", () => {
  let service: TaskService;
  let mockGhClient: { submitApplication: ReturnType<typeof vi.fn> };
  let mockTaskRepo: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    mockGhClient = {
      submitApplication: vi.fn().mockResolvedValue({ job_id: "gh-job-123" }),
    };
    mockTaskRepo = {
      create: vi.fn().mockResolvedValue({
        id: "task-001",
        jobUrl: "https://linkedin.com/jobs/view/123",
        platform: "linkedin",
        status: "created",
      }),
      updateWorkflowRunId: vi.fn(),
      updateStatus: vi.fn(),
      updateGhosthandsResult: vi.fn(),
    };
    // ... construct service with mocks
  });

  it("WK-03: GH API unavailable marks task as failed", async () => {
    mockGhClient.submitApplication.mockRejectedValue(new Error("ECONNREFUSED"));

    await service.create(
      { jobUrl: "https://linkedin.com/jobs/view/123", mode: "copilot", resumeId: "r-1" },
      "user-001",
    );

    expect(mockTaskRepo.updateStatus).toHaveBeenCalledWith("task-001", "failed");
    expect(mockTaskRepo.updateGhosthandsResult).toHaveBeenCalledWith(
      "task-001",
      expect.objectContaining({
        error: expect.objectContaining({ code: "GH_SUBMIT_FAILED" }),
      }),
    );
  });
});
```

---

## 4. Database Regression (packages/db)

### P0

| #     | Test Name                                | What It Tests                                   | Expected Result                                   |
| ----- | ---------------------------------------- | ----------------------------------------------- | ------------------------------------------------- |
| DB-01 | All migrations apply cleanly on empty DB | Run `pnpm db:migrate` against empty Postgres    | All 12 migrations (0000-0011) apply without error |
| DB-02 | TypeScript schema types compile          | `pnpm typecheck --filter @valet/db`             | Exit code 0                                       |
| DB-03 | `resetDatabase()` truncates all tables   | Call helper from `apps/api/tests/helpers/db.ts` | All tables in `TABLES_TO_TRUNCATE` have 0 rows    |

### P1

| #     | Test Name                        | What It Tests                                     | Expected Result                                    |
| ----- | -------------------------------- | ------------------------------------------------- | -------------------------------------------------- |
| DB-10 | CRUD: users table                | Insert, select, update, delete                    | All operations succeed; constraints enforced       |
| DB-11 | CRUD: tasks table                | Insert with FK to users                           | Task created with proper userId FK                 |
| DB-12 | CRUD: resumes table              | Insert and select by userId                       | Resume record accessible                           |
| DB-13 | CRUD: consent_records table      | Insert consent record                             | Record stored with version and timestamp           |
| DB-14 | CRUD: sandboxes table            | Insert sandbox with instance_id unique constraint | Duplicate `instanceId` raises constraint violation |
| DB-15 | CRUD: gh_automation_jobs table   | Insert and update status                          | Status transitions work; timestamps populated      |
| DB-16 | CRUD: task_events table          | Insert event linked to task                       | FK constraint enforced                             |
| DB-17 | CRUD: qa_bank (qa_entries) table | Insert QA entry                                   | Stored with `question`, `answer`, `usageMode`      |
| DB-18 | CRUD: notifications table        | Insert notification                               | Record with userId, type, read status              |
| DB-19 | Migration idempotency            | Run `pnpm db:migrate` twice                       | Second run is a no-op (no errors)                  |

**Migrations to verify** (in order):

```
0000_friendly_hitman.sql      -- Initial schema (users, tasks, resumes, etc.)
0001_add_auth_columns.sql     -- Auth columns on users
0002_add_external_status.sql  -- externalStatus on tasks
0003_add_action_manuals.sql   -- action_manuals table
0004_add_sandboxes.sql        -- sandboxes table
0005_add_user_roles.sql       -- role column on users
0006_add_sandbox_secrets.sql  -- sandbox_secrets table
0007_add_browser_config.sql   -- browserConfig on sandboxes
0008_add_performance_indexes.sql -- Query performance indexes
0009_add_ec2_controls.sql     -- EC2 control columns on sandboxes
0010_add_hitl_interaction.sql -- HITL interaction columns on tasks
0011_add_task_sandbox_id.sql  -- sandboxId FK on tasks
```

---

## 5. Integration Regression

End-to-end flows that cross service boundaries. These require a running API, database, and mock GhostHands service.

### P0

| #      | Test Name                                                                  | What It Tests                                                            | Expected Result                                                                                     |
| ------ | -------------------------------------------------------------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| INT-01 | Full flow: create task -> GH job dispatched -> callback -> task completed  | User creates task; GH returns `completed` callback                       | Task status transitions: `created` -> `queued` -> `in_progress` -> `completed`                      |
| INT-02 | HITL flow: callback `needs_human` -> `waiting_human` -> resolve -> resumed | GH sends `needs_human` with interaction data; user resolves              | Task: `in_progress` -> `waiting_human`; interaction data stored; after resolve: `in_progress` again |
| INT-03 | Cost tracking: GH callback with cost data -> task.llmUsage updated         | Callback includes `cost: { total_cost_usd, action_count, total_tokens }` | `task.llmUsage` fields populated; `gh_automation_jobs.llmCostCents` synced                          |

### P1

| #      | Test Name                                                   | What It Tests                               | Expected Result                                          |
| ------ | ----------------------------------------------------------- | ------------------------------------------- | -------------------------------------------------------- |
| INT-10 | Failure flow: GH callback `failed` -> task marked failed    | Error callback with `error_code`            | Task status `failed`, error stored in `ghResult`         |
| INT-11 | Cancel flow: user cancels -> GH cancelJob called            | Cancel in-progress task                     | Task `cancelled`; GH notified                            |
| INT-12 | Retry flow: user retries failed task -> GH retryJob called  | Retry failed task                           | Task back to `queued`; GH retry initiated                |
| INT-13 | WebSocket delivery: webhook -> Redis pub/sub -> WS client   | Webhook updates task; WS client subscribed  | Client receives real-time `task_update` message          |
| INT-14 | Self-healing reconciliation: task terminal but GH job stale | Task `completed` but GH job still `running` | `fetchGhJobData()` corrects GH job status to `completed` |
| INT-15 | Admin sync: `syncGhJobStatus()` pulls from GH API           | Admin triggers sync on stuck task           | Both `tasks` and `gh_automation_jobs` tables updated     |

**Example integration test:**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

describe("INT-01: Full application flow", () => {
  it("transitions task through complete lifecycle", async () => {
    // 1. Create task
    const createRes = await client.post("/api/v1/tasks", {
      jobUrl: "https://www.linkedin.com/jobs/view/123",
      mode: "copilot",
      resumeId: testResumeId,
    });
    expect(createRes.status).toBe(201);
    const taskId = createRes.body.id;

    // 2. Verify task is queued (GH accepted the job)
    const queuedTask = await client.get(`/api/v1/tasks/${taskId}`);
    expect(queuedTask.body.status).toBe("queued");

    // 3. Simulate GH "running" callback
    await webhookClient.post("/api/v1/webhooks/ghosthands", {
      job_id: "gh-job-001",
      valet_task_id: taskId,
      status: "running",
      progress: 25,
      result_summary: "Navigating to job page",
    });

    const runningTask = await client.get(`/api/v1/tasks/${taskId}`);
    expect(runningTask.body.status).toBe("in_progress");
    expect(runningTask.body.progress).toBe(25);

    // 4. Simulate GH "completed" callback
    await webhookClient.post("/api/v1/webhooks/ghosthands", {
      job_id: "gh-job-001",
      valet_task_id: taskId,
      status: "completed",
      result_summary: "Application submitted successfully",
      cost: { total_cost_usd: 0.15, action_count: 12, total_tokens: 5000 },
    });

    const completedTask = await client.get(`/api/v1/tasks/${taskId}`);
    expect(completedTask.body.status).toBe("completed");
    expect(completedTask.body.progress).toBe(100);
  });
});
```

---

## 6. Security Regression Tests

Existing security test suites in `apps/api/tests/security/` (currently excluded from default `pnpm test` run):

| File                         | Covers                                                                  | Status |
| ---------------------------- | ----------------------------------------------------------------------- | ------ |
| `auth-bypass.test.ts`        | Missing/malformed JWTs, expired tokens, wrong secret, cross-user access | Active |
| `ssrf.test.ts`               | Private IP blocking, dangerous protocols, AWS metadata endpoint         | Active |
| `input-sanitization.test.ts` | XSS in notes, SQL injection in search, path traversal                   | Active |
| `rate-limit.test.ts`         | Rate limiter threshold and error response                               | Active |
| `security-headers.test.ts`   | Helmet CSP, HSTS, X-Content-Type-Options                                | Active |
| `cookie-security.test.ts`    | HttpOnly, Secure, SameSite flags on refresh token cookie                | Active |
| `security-logger.test.ts`    | Security event logging for auth failures                                | Active |

To enable in CI, remove the exclusion from `apps/api/vitest.config.ts`:

```diff
  exclude: [
    "**/node_modules/**",
    "**/dist/**",
-   "**/tests/security/**",
  ],
```

---

## 7. CI Integration

### GitHub Actions Workflow

Create `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [main, staging]
  pull_request:
    branches: [main, staging]

env:
  NODE_ENV: test
  DATABASE_URL: postgresql://test:test@localhost:5432/valet_test
  JWT_SECRET: test-jwt-secret-do-not-use-in-production
  GH_SERVICE_SECRET: test-service-secret
  REDIS_URL: redis://localhost:6379

jobs:
  lint-typecheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm typecheck

  unit-tests:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_USER: test
          POSTGRES_PASSWORD: test
          POSTGRES_DB: valet_test
        ports: ["5432:5432"]
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
      redis:
        image: redis:7
        ports: ["6379:6379"]
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm db:migrate
      - run: pnpm test -- --reporter=github-actions

  e2e-tests:
    runs-on: ubuntu-latest
    needs: unit-tests
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_USER: test
          POSTGRES_PASSWORD: test
          POSTGRES_DB: valet_test
        ports: ["5432:5432"]
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
      redis:
        image: redis:7
        ports: ["6379:6379"]
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: npx playwright install --with-deps chromium
      - run: pnpm db:migrate
      - run: npx playwright test --config tests/e2e/playwright.config.ts --project chromium
        env:
          CI: true
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report
          path: tests/e2e/playwright-report/
          retention-days: 7
```

### CI Gates

| Gate                    | Required For               | Command                                    |
| ----------------------- | -------------------------- | ------------------------------------------ |
| Lint                    | All PRs                    | `pnpm lint`                                |
| Type check              | All PRs                    | `pnpm typecheck`                           |
| Unit tests (P0)         | All PRs                    | `pnpm test`                                |
| E2E smoke (P0)          | PRs to `main` or `staging` | `npx playwright test --project chromium`   |
| Security tests          | PRs to `main`              | `pnpm vitest run apps/api/tests/security/` |
| Full E2E (all browsers) | Release to `main`          | `npx playwright test` (all 4 projects)     |

---

## 8. Rollback Procedures

### 8.1 Fly.io Rollback (API + Web)

Fly.io keeps recent releases. To roll back:

```bash
# 1. List recent releases
fly releases --app valet-api          # or valet-api-stg
fly releases --app valet-web          # or valet-web-stg

# 2. Roll back to previous release (N = release version number)
fly deploy --app valet-api --image registry.fly.io/valet-api:deployment-<N>

# 3. Verify health
fly status --app valet-api
curl https://valet-api.fly.dev/api/v1/health
```

**Step-by-step**:

1. Identify the broken release version from `fly releases`
2. Find the last known good version (the one before the broken release)
3. Re-deploy the good version's image: `fly deploy --app <app> --image <good-image>`
4. Verify: `curl <api-url>/api/v1/health` returns `{"status":"ok"}`
5. Notify team in Slack/Discord with rollback reason

### 8.2 EC2 Sandbox Rollback (GhostHands Workers)

GhostHands workers run on EC2 instances managed via the sandbox system.

```bash
# 1. Check current deploy status
ssh -i ~/.ssh/valet-worker.pem ubuntu@<sandbox-ip> "cat /opt/ghost-hands/DEPLOY_VERSION"

# 2. If the latest deploy broke things, roll back the Docker image
ssh -i ~/.ssh/valet-worker.pem ubuntu@<sandbox-ip> \
  "cd /opt/ghost-hands && docker compose down && \
   docker tag ghost-hands:latest ghost-hands:broken && \
   docker tag ghost-hands:previous ghost-hands:latest && \
   docker compose up -d"

# 3. Verify worker health
curl http://<sandbox-ip>:3001/health
```

**Alternative: use the admin API to stop/start sandboxes**:

```bash
# Stop the broken sandbox
curl -X POST https://valet-api.fly.dev/api/v1/admin/sandboxes/<id>/stop \
  -H "Authorization: Bearer <admin-token>"

# Start a known-good sandbox or wait for fix
curl -X POST https://valet-api.fly.dev/api/v1/admin/sandboxes/<id>/start \
  -H "Authorization: Bearer <admin-token>"
```

### 8.3 Database Rollback

Drizzle does not auto-generate "down" migrations. For database rollback:

**Option A: Restore from Supabase backup (preferred for data-loss scenarios)**:

1. Go to Supabase Dashboard > Project > Backups
2. Select the backup from before the bad migration
3. Restore to a new project (test first) or to the same project

**Option B: Manual reverse migration**:

```bash
# 1. Write a reverse SQL script
# Example: if 0011_add_task_sandbox_id.sql added a column
cat <<'SQL' > packages/db/drizzle/rollback_0011.sql
ALTER TABLE tasks DROP COLUMN IF EXISTS sandbox_id;
SQL

# 2. Apply via direct connection (bypasses pgbouncer)
psql "$DATABASE_DIRECT_URL" -f packages/db/drizzle/rollback_0011.sql

# 3. Remove the migration from the journal
# Edit packages/db/drizzle/meta/_journal.json: remove the entry for 0011

# 4. Verify
psql "$DATABASE_DIRECT_URL" -c "\d tasks"
```

**Option C: Fly.io release_command failure (automatic)**:

If a migration fails during deploy, Fly.io's `release_command` exits non-zero and the deploy is automatically aborted. The old version keeps running. No manual rollback needed.

### Rollback Decision Matrix

| Symptom                             | Action                                    | Who                 |
| ----------------------------------- | ----------------------------------------- | ------------------- |
| API returns 500s after deploy       | Fly.io rollback (8.1)                     | On-call engineer    |
| Frontend blank page after deploy    | Fly.io rollback web app (8.1)             | On-call engineer    |
| Worker jobs failing after GH deploy | EC2 rollback (8.2) + pause task queue     | On-call + GH team   |
| Data corruption after migration     | DB restore from backup (8.3 Option A)     | DBA / lead engineer |
| New column breaks queries           | Reverse migration (8.3 Option B)          | Lead engineer       |
| Deploy hangs / migration timeout    | Fly.io auto-aborts; investigate migration | Lead engineer       |

---

## 9. Test Coverage Targets

| Layer           | Current                            | Target                      | Notes                             |
| --------------- | ---------------------------------- | --------------------------- | --------------------------------- |
| API routes (P0) | Partial (security tests)           | 100% of P0 tests            | Add happy-path CRUD tests         |
| API routes (P1) | None                               | 80%                         | Cancel, retry, approve, admin     |
| Frontend E2E    | 3 suites (auth, onboarding, apply) | 5+ suites                   | Add dashboard, task detail        |
| Worker dispatch | None                               | P0 covered                  | Mock GH client tests              |
| Database        | None                               | Migrations + schema compile | CI migration check                |
| Integration     | None                               | P0 flows                    | Requires mock GH service          |
| Security        | 6 suites (excluded)                | All enabled in CI           | Remove exclusion in vitest config |

---

## 10. Test Data Management

### Fixtures

- **Test users**: Created via `UserFactory.create()` or `createTestUser()` helper
- **Test JWT**: `createTestToken()` / `createToken()` with `test-jwt-secret-do-not-use-in-production`
- **Test resume**: `tests/fixtures/test-resume.pdf` (used in onboarding E2E)
- **Database reset**: `resetDatabase(pool)` truncates all tables between tests

### Environment Variables for Tests

```bash
NODE_ENV=test
DATABASE_URL=postgresql://test:test@localhost:5432/valet_test
JWT_SECRET=test-jwt-secret-do-not-use-in-production
GH_SERVICE_SECRET=test-service-secret
REDIS_URL=redis://localhost:6379
VALET_DEPLOY_WEBHOOK_SECRET=test-webhook-secret
```

### Seeding Test Data

```bash
# Seed admin user + sample data for E2E
pnpm --filter @valet/db exec tsx src/seed-test-data.ts
```
