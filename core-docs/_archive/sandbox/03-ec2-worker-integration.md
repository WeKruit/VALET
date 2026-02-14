# EC2 Browser Worker Integration

> How the Hatchet orchestrator (VALET worker on Fly.io) dispatches browser automation
> tasks to a Python FastAPI worker running on EC2 with AdsPower.
>
> Replaces the Fly Machines sandbox model from `02-sandbox-deployment.md` with an
> EC2 persistent-VM pool model. Reference implementation:
> [axon-browser-worker](https://github.com/Shluo03/axon-browser-worker).

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [EC2 Worker API Contract (MVP)](#2-ec2-worker-api-contract-mvp)
3. [Hatchet Workflow (MVP 2-Step)](#3-hatchet-workflow-mvp-2-step)
4. [Task Lifecycle](#4-task-lifecycle)
5. [VALET TypeScript Integration](#5-valet-typescript-integration)
6. [Webhook Handler](#6-webhook-handler)
7. [Human-in-the-Loop](#7-human-in-the-loop)
8. [Profile & Pool Management](#8-profile--pool-management)
9. [Circuit Breaker & Error Handling](#9-circuit-breaker--error-handling)
10. [AdsPower on Linux](#10-adspower-on-linux)
11. [EC2 Infrastructure (from axon-browser-worker)](#11-ec2-infrastructure-from-axon-browser-worker)
12. [Networking & Security](#12-networking--security)
13. [Cost Model](#13-cost-model)
14. [axon-browser-worker → VALET Integration Map](#14-axon-browser-worker--valet-integration-map)
15. [Implementation Phases (Concrete)](#15-implementation-phases-concrete)
16. [V2: Session-Based Model + Browser Agents](#16-v2-session-based-model--browser-agents)

---

## 1. Architecture Overview

### Current State (All Mocked)

```
Frontend → API (task.service) → Hatchet event "task:created"
  → VALET Worker (Fly.io)
    → job-application workflow (7 steps, ALL MOCKED)
    → LinkedInMockAdapter, AdsPowerMockClient, BrowserAgentMock, etc.
```

### MVP Target State

```
Frontend → API (task.service) → Hatchet event "task:created"
  → VALET Worker (Fly.io)
    → job-application workflow (2 steps)
      ↓ Single HTTP call
    → EC2 Browser Worker (Python FastAPI)
      → AdsPower Local API (headless, port 50325)
      → Selenium (via debuggerAddress from AdsPower)
      → VNC (x11vnc + websockify for human takeover)
      ↓ Webhooks (progress updates)
    → VALET API (real-time progress → WebSocket → frontend)
```

### EC2 Instance Architecture

```
                         Internet / VPC
                              |
                         [ nginx :443 ]
                        /              \
              /api/* proxy         /vnc/ proxy (WebSocket)
                  |                     |
        [ uvicorn :8080 ]      [ websockify :6901 ]
          (FastAPI worker)              |
                |                [ x11vnc :5900 ]
                |                     |
          [ AdsPower ]  <------> [ Xvfb :99 ]
         (--headless=true,        (1920x1080x24)
          Local API :50325)
```

### Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| EC2 instance type | t3.medium (2 vCPU / 4 GB) | Sufficient for Xvfb + Chromium + AdsPower; burstable for 2-3 min sessions |
| Pricing model | 1-year Reserved Instance | $22/mo vs $30/mo on-demand |
| **MVP task model** | **Stateless (one call = full task)** | Matches axon-browser-worker; simplest to build |
| Communication | HTTP REST + Webhooks | Simple, debuggable |
| Worker language | Python (FastAPI) | Matches reference repo |
| MVP automation | Selenium + AdsPower | Works now; Stagehand/Magnitude added in V2 |
| AdsPower mode | `--headless=true` + `headless=1` on browser start | No GUI needed; Xvfb only for VNC takeover |
| Profile assignment | Pool manager in VALET worker with Redis distributed lock | Prevents concurrent use of same profile |

---

## 2. EC2 Worker API Contract (MVP)

The MVP follows axon-browser-worker's **stateless model**: one HTTP call sends the
full task, EC2 worker opens AdsPower browser, runs the entire application flow,
closes browser, and returns the result.

### Base URL

```
https://{ec2-ip}:443/api/  (nginx TLS termination → uvicorn :8080)
```

### Authentication

```
Authorization: Bearer {EC2_WORKER_API_KEY}
```

### Endpoints

#### `POST /api/v1/tasks` — Execute Full Application Task

Single call: open browser → navigate → detect platform → fill form → upload resume → submit → verify → close.

```jsonc
// Request
{
  "task_id": "uuid",
  "profile_id": "ads-power-profile-id",
  "job_url": "https://linkedin.com/jobs/view/123",
  "user_data": {
    "first_name": "Adam",
    "last_name": "Smith",
    "email": "adam@example.com",
    "phone": "+1234567890",
    "location": "San Francisco, CA",
    "skills": ["TypeScript", "React"],
    "years_experience": 5,
    "education": "BS Computer Science"
  },
  "qa_answers": {
    "Are you authorized to work in the US?": "Yes",
    "Desired salary": "150000"
  },
  "resume_file_url": "https://storage.supabase.co/resumes/xyz.pdf",
  "mode": "autopilot",
  "callback_url": "https://valet-api.fly.dev/api/v1/webhooks/worker",
  "callback_token": "jwt-token",
  "policy": {
    "timeout_seconds": 180,
    "save_artifacts": true
  }
}

// Response 200 (synchronous — blocks until done, ~2-3 min)
{
  "task_id": "uuid",
  "success": true,
  "blocked": false,
  "platform": "linkedin",
  "confirmation_id": "APP-12345",
  "confirmation_message": "Your application has been submitted",
  "filled_fields": [
    { "name": "firstName", "value": "Adam", "source": "user_data" }
  ],
  "screenshots": {
    "form_filled": "s3://artifacts/{task_id}/form-filled.png",
    "confirmation": "s3://artifacts/{task_id}/confirmation.png"
  },
  "timing": {
    "browser_start_ms": 3200,
    "navigate_ms": 1500,
    "fill_ms": 15000,
    "submit_ms": 2000,
    "total_ms": 145000
  },
  "next_action": "continue",
  "profile_status": {
    "state": "healthy",
    "consecutive_blocks": 0,
    "total_tasks": 42
  },
  "error": null
}

// Response 200 (blocked)
{
  "task_id": "uuid",
  "success": false,
  "blocked": true,
  "block_reason": "captcha_detected",
  "next_action": "needs_human",
  "vnc_url": "wss://{ec2-ip}/vnc/?task={task_id}",
  "screenshots": {
    "blocked": "s3://artifacts/{task_id}/blocked.png"
  },
  "error": null
}
```

#### `GET /health` — Health Check

```jsonc
{
  "status": "healthy",
  "adspower": "connected",
  "active_tasks": 0,
  "max_concurrent": 1,
  "uptime_seconds": 86400,
  "version": "1.0.0"
}
```

#### `GET /api/v1/profiles` — List Profile Status

```jsonc
{
  "profiles": [
    {
      "profile_id": "abc123",
      "status": "idle",
      "consecutive_blocks": 0,
      "consecutive_failures": 0,
      "total_tasks": 42,
      "last_used_at": "2026-02-13T10:00:00Z"
    }
  ]
}
```

#### `POST /api/v1/profiles/{id}/resolve` — Reset From Error State

Resets profile from NEEDS_HUMAN or COOLING → HEALTHY.

#### `POST /api/v1/profiles/{id}/disable` — Manually Disable Profile

#### `POST /api/v1/profiles/{id}/enable` — Re-enable Disabled Profile

### Python Data Models

```python
# src/models.py

@dataclass
class Task:
    task_id: str
    profile_id: str
    job_url: str
    user_data: dict
    qa_answers: dict
    resume_file_url: str
    mode: str  # "copilot" | "autopilot"
    callback_url: str
    callback_token: str
    policy: TaskPolicy

@dataclass
class TaskPolicy:
    timeout_seconds: int = 180
    save_artifacts: bool = True

@dataclass
class TaskResult:
    task_id: str
    success: bool
    blocked: bool = False
    block_reason: str | None = None
    next_action: str = "continue"  # continue | cooldown | needs_human | disable_profile
    platform: str | None = None
    confirmation_id: str | None = None
    filled_fields: list[dict] = field(default_factory=list)
    screenshots: dict[str, str] = field(default_factory=dict)
    timing: dict[str, int] = field(default_factory=dict)
    profile_status: dict | None = None
    error: str | None = None
    started_at: str = ""
    finished_at: str = ""
    duration_ms: int = 0
```

### Execution Flow Inside EC2 Worker

Based on axon-browser-worker's `TaskRunner` pattern:

```python
# src/worker/runner.py

class TaskRunner:
    def run(self, task: Task) -> TaskResult:
        # 1. Check circuit breaker
        can_run, reason = self.circuit_breaker.can_run(task.profile_id)
        if not can_run:
            return TaskResult.blocked_result(task.task_id, reason)

        # 2. Create artifact directory
        artifact_path = Path(f"artifacts/{task.profile_id}/{datetime.now().isoformat()}")
        artifact_path.mkdir(parents=True, exist_ok=True)

        # 3. Lookup handler by platform (auto-detected or from URL)
        handler = self.get_handler(task.job_url)

        # 4. Open browser via AdsPower
        with BrowserSession(task.profile_id, self.adspower) as session:
            try:
                # 5. Run handler
                metrics, artifacts = handler(
                    session.driver, task, artifact_path
                )

                # 6. Update circuit breaker
                if metrics.get("blocked"):
                    self.circuit_breaker.record_block(
                        task.profile_id, metrics["block_reason"]
                    )
                    return TaskResult(blocked=True, ...)
                else:
                    self.circuit_breaker.record_success(task.profile_id)
                    return TaskResult(success=True, ...)

            except Exception as e:
                self.circuit_breaker.record_failure(task.profile_id, str(e))
                return TaskResult(success=False, error=str(e), ...)
```

### Humanization (from axon-browser-worker)

All browser interactions use humanized timing:

```python
# src/browser/humanize.py

class HumanizedActions:
    def type_text(self, element, text, typo_rate=0.02):
        """50-180ms per char, 2% typo rate with backspace correction"""

    def click(self, element):
        """Scroll into view, random offset within element, 50-150ms pause"""

    def scroll(self, pixels):
        """80-180px steps, 80-250ms between, 10% chance of 1-3s 'reading' pause"""
```

---

## 3. Hatchet Workflow (MVP 2-Step)

### Current 7-Step → MVP 2-Step

```
BEFORE (mocked, 7 steps):          MVP (real, 2 steps):
─────────────────────────           ────────────────────
start-browser                  ─┐
analyze-form                    │
fill-fields                     ├─►  run-job-application (single EC2 call)
upload-resume                   │
check-captcha                   │
submit                         ─┘
verify                         ─►    post-processing (durable, handles CAPTCHA/review)
```

### Conditional Registration

```typescript
// apps/worker/src/main.ts

const ec2Client = process.env.EC2_WORKER_URL
  ? new EC2WorkerClient({
      baseUrl: process.env.EC2_WORKER_URL,
      apiKey: process.env.EC2_WORKER_API_KEY ?? "",
      timeout: 300_000,
      maxRetries: 3,
    })
  : null;

const profilePool = ec2Client && db
  ? new ProfilePool({ redis, db })
  : null;

await ec2Client?.initialize();

// Register EC2 workflow if configured, otherwise use mock workflow
let jobApplicationWorkflow;
if (ec2Client && profilePool) {
  logger.info("Registering EC2-based job application workflow");
  jobApplicationWorkflow = registerJobApplicationWorkflowEC2(
    hatchet, redis, eventLogger, ec2Client, profilePool, db
  );
} else {
  logger.info("Registering mock-based job application workflow");
  jobApplicationWorkflow = registerJobApplicationWorkflow(
    hatchet, redis, eventLogger, db
  );
}
```

### Full Workflow Code

```typescript
// apps/worker/src/workflows/job-application-ec2.ts

export function registerJobApplicationWorkflowEC2(
  hatchet: Hatchet,
  redis: Redis,
  eventLogger: EventLogger,
  ec2Client: EC2WorkerClient,
  profilePool: ProfilePool,
  db?: Database,
) {
  const workflow = hatchet.workflow<WorkflowInput>({
    name: "job-application",  // same event name for seamless swap
    onEvents: ["task:created"],
  });

  // ── Step 1: Acquire profile + dispatch to EC2 ──────────────────────
  const runJobApplication = workflow.task({
    name: "run-job-application",
    executionTimeout: "600s",
    fn: async (input: WorkflowInput, ctx: Context<WorkflowInput>) => {
      logger.info({ taskId: input.taskId }, "Starting job application on EC2");

      await eventLogger.log(input.taskId, "checkpoint", {
        subType: "workflow_started",
        jobUrl: input.jobUrl,
        mode: input.mode,
      });

      await publishProgress(redis, input.userId, {
        type: "state_change",
        taskId: input.taskId,
        from: "created",
        to: "in_progress",
        timestamp: new Date().toISOString(),
      });

      let profileLease: ProfileLease | null = null;

      try {
        // 1. Acquire profile
        await publishProgress(redis, input.userId, {
          type: "progress",
          taskId: input.taskId,
          step: "acquire-profile",
          pct: 5,
          message: "Acquiring browser profile...",
        });

        const platform = input.jobUrl.includes("linkedin")
          ? "linkedin"
          : input.jobUrl.includes("greenhouse")
            ? "greenhouse"
            : "unknown";

        profileLease = await profilePool.acquireProfile({
          userId: input.userId,
          platform,
          maxWaitMs: 60_000,
          preferHealthy: true,
        });

        if (!profileLease) {
          throw new Error("No available browser profiles (timeout)");
        }

        // 2. Build user data from resume
        const userData = await buildUserDataFromResume(
          db, input.userId, input.resumeId
        );

        // 3. Call EC2 worker (blocks ~2-3 min)
        await publishProgress(redis, input.userId, {
          type: "progress",
          taskId: input.taskId,
          step: "running-automation",
          pct: 15,
          message: "Browser automation started...",
        });

        const result = await ec2Client.runTask({
          taskId: input.taskId,
          profileId: profileLease.adspowerProfileId,
          jobUrl: input.jobUrl,
          userData,
          qaAnswers: {},  // TODO: load from user's QA bank
          resumeFileUrl: userData.resumeUrl ?? "",
          mode: input.mode,
          callbackUrl: `${process.env.API_URL}/api/v1/webhooks/worker`,
          callbackToken: signWebhookToken(input.taskId),
          policy: { timeoutSeconds: 180, saveArtifacts: true },
        });

        // 4. Release profile
        await profilePool.releaseProfile(profileLease, {
          succeeded: result.success && !result.blocked,
          errorMessage: result.error ?? undefined,
        });

        return {
          success: result.success,
          blocked: result.blocked,
          blockReason: result.block_reason,
          ec2Response: result,
          profileId: profileLease.adspowerProfileId,
        };
      } catch (err) {
        if (profileLease) {
          await profilePool.releaseProfile(profileLease, {
            succeeded: false,
            errorMessage: (err as Error).message,
          });
        }
        throw err;
      }
    },
  });

  // ── Step 2: Post-processing (CAPTCHA, review, completion) ──────────
  workflow.durableTask({
    name: "post-processing",
    executionTimeout: "300s",
    parents: [runJobApplication],
    fn: async (input: WorkflowInput, ctx: DurableContext<WorkflowInput>) => {
      const prev = (await ctx.parentOutput(runJobApplication)) as {
        success: boolean;
        blocked: boolean;
        blockReason?: string;
        ec2Response: any;
      };

      // Handle blocked (CAPTCHA)
      if (prev.blocked && prev.blockReason === "captcha_detected") {
        await publishProgress(redis, input.userId, {
          type: "human_needed",
          taskId: input.taskId,
          reason: "CAPTCHA detected",
          vncUrl: prev.ec2Response.vnc_url,
        });

        await ctx.waitFor({ eventKey: "captcha_solved" });

        await eventLogger.log(input.taskId, "checkpoint", {
          subType: "captcha_solved",
          solvedBy: "user",
        });
      }

      // Handle copilot review
      if (
        input.mode === "copilot" &&
        prev.ec2Response.filled_fields?.length > 0
      ) {
        await publishProgress(redis, input.userId, {
          type: "field_review",
          taskId: input.taskId,
          fields: prev.ec2Response.filled_fields,
        });

        await ctx.waitFor({ eventKey: "review_approved" });

        await eventLogger.log(input.taskId, "checkpoint", {
          subType: "review_approved",
        });
      }

      // Final status
      const finalType = prev.success ? "completed" : "failed";

      await publishProgress(redis, input.userId, {
        type: finalType,
        taskId: input.taskId,
        confirmationId: prev.ec2Response.confirmation_id,
        screenshotUrl: prev.ec2Response.screenshots?.confirmation,
      });

      await eventLogger.log(input.taskId, "checkpoint", {
        subType: `workflow_${finalType}`,
        confirmationId: prev.ec2Response.confirmation_id,
      });

      return {
        success: prev.success,
        confirmationId: prev.ec2Response.confirmation_id,
      };
    },
  });

  return workflow;
}
```

---

## 4. Task Lifecycle

```
          VALET Worker                    EC2 Worker
          ────────────                    ──────────
               │
               │  POST /api/v1/tasks
               │  { profile_id, job_url,
               │    user_data, resume_url }
               ├────────────────────────────►│
               │                             │ AdsPower: start(profile_id, headless=1)
               │                             │ Selenium: connect via debuggerAddress
               │                             │ Navigate to job_url
               │  callback: progress 10%     │
               │◄─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┤
               │                             │ detect_block() — check URL/title/body
               │                             │ Detect platform (LinkedIn/Greenhouse/etc)
               │                             │ Analyze form fields
               │  callback: progress 30%     │
               │◄─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┤
               │                             │ HumanizedActions: fill fields
               │                             │ Upload resume file
               │  callback: progress 60%     │
               │◄─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┤
               │                             │ Submit application
               │                             │ Wait for confirmation page
               │  callback: progress 90%     │
               │◄─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┤
               │                             │ Verify submission
               │                             │ Screenshot confirmation
               │                             │ AdsPower: stop(profile_id)
               │◄────────────────────────────┤
               │  TaskResult { success,      │
               │    confirmation_id,         │
               │    screenshots, timing,     │
               │    next_action }            │
```

### If CAPTCHA Detected

```
               │                             │ ... filling form ...
               │                             │ detect_block() → CAPTCHA!
               │◄────────────────────────────┤
               │  TaskResult {               │  (HTTP response returned immediately)
               │    blocked: true,           │
               │    block_reason: "captcha", │  Browser stays open for VNC
               │    vnc_url: "wss://..." }   │
               │                             │
               │  (Hatchet durableTask       │
               │   waitFor "captcha_solved") │
               │  (User solves via VNC)      │
               │                             │
               │  POST /api/v1/tasks         │  (retry with same profile)
               ├────────────────────────────►│
               │◄────────────────────────────┤
               │  TaskResult { success }     │
```

---

## 5. VALET TypeScript Integration

### EC2WorkerClient

```typescript
// apps/worker/src/services/ec2-client.ts

export interface EC2ClientConfig {
  baseUrl: string;   // env: EC2_WORKER_URL
  apiKey: string;    // env: EC2_WORKER_API_KEY
  timeout: number;   // default 300_000ms (5 min)
  maxRetries: number; // default 3
  retryBaseDelayMs: number; // default 1_000ms
}

export class EC2WorkerClient {
  private baseUrl: string;
  private apiKey: string;
  private timeout: number;
  private maxRetries: number;
  private retryBaseDelayMs: number;
  private isHealthy = true;
  private healthCheckInterval?: NodeJS.Timer;

  constructor(config: EC2ClientConfig) { ... }

  async initialize(): Promise<void> {
    await this.healthCheck();
    this.startHealthCheckLoop(); // every 60s
  }

  async shutdown(): Promise<void> {
    if (this.healthCheckInterval) clearInterval(this.healthCheckInterval);
  }

  /**
   * Send full task to EC2 worker. Blocks until response.
   * Retries on 5xx/timeout with exponential backoff (1s, 2s, 4s).
   * Does NOT retry on 4xx (except 408, 429).
   */
  async runTask(request: RunTaskRequest): Promise<TaskResult> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      if (attempt > 0) {
        const delay = this.retryBaseDelayMs * Math.pow(2, attempt - 1);
        await new Promise((r) => setTimeout(r, delay));
      }

      try {
        return await this.makeRequest<TaskResult>(
          "POST", "/api/v1/tasks", request, this.timeout
        );
      } catch (err) {
        lastError = err as Error;
        if (this.isNonRecoverable(err)) throw err;
      }
    }

    throw new Error(
      `EC2 worker failed after ${this.maxRetries + 1} attempts: ${lastError?.message}`
    );
  }

  async healthCheck(): Promise<HealthCheckResponse> {
    const resp = await this.makeRequest<HealthCheckResponse>(
      "GET", "/health", undefined, 5_000
    );
    this.isHealthy = resp.status === "healthy";
    return resp;
  }

  isWorkerHealthy(): boolean { return this.isHealthy; }

  private async makeRequest<T>(
    method: string, path: string, body?: unknown, timeoutMs?: number
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const res = await fetch(url, {
      method,
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeoutMs ?? this.timeout),
    });

    if (!res.ok) {
      const err = await res.text();
      const error = new Error(`EC2 API ${res.status}: ${err}`);
      (error as any).statusCode = res.status;
      throw error;
    }

    return res.json() as T;
  }

  private isNonRecoverable(err: unknown): boolean {
    const code = (err as any)?.statusCode;
    return code >= 400 && code < 500 && code !== 408 && code !== 429;
  }
}
```

### Environment Variables

```bash
# Worker (.env)
EC2_WORKER_URL=https://10.0.1.42        # EC2 instance (via nginx :443)
EC2_WORKER_API_KEY=sk-ec2-worker-...     # shared secret

# API (.env)
EC2_WEBHOOK_SECRET=sk-webhook-...        # JWT signing for callbacks
```

---

## 6. Webhook Handler

### Why Webhooks?

During the synchronous `POST /api/v1/tasks` call, the EC2 worker fires **non-blocking
webhook callbacks** for real-time frontend progress. The HTTP response only comes
when the full task completes.

### Callback Payload

```jsonc
// POST {callback_url}
// Authorization: Bearer {callback_token}
{
  "task_id": "uuid",
  "type": "progress" | "captcha_detected" | "error" | "screenshot",
  "data": {
    "step": "navigating" | "analyzing" | "filling" | "uploading" | "submitting" | "verifying",
    "pct": 45,
    "message": "Filling page 2 of 3",
    "screenshot_url": "s3://artifacts/..."
  },
  "timestamp": "2026-02-13T10:05:30Z"
}
```

### VALET API Route

Registered as a **standalone Fastify route** (outside ts-rest, same pattern as
`resumeUploadRoute` — see ts-rest + multipart conflict in MEMORY.md):

```typescript
// apps/api/src/modules/webhooks/worker-webhook.routes.ts

export async function registerWebhookRoutes(fastify: FastifyInstance) {
  fastify.post("/api/v1/webhooks/worker", async (request, reply) => {
    const payload = request.body as WebhookPayload;

    // 1. Verify JWT callback_token
    try {
      await jose.jwtVerify(
        payload.callbackToken,
        new TextEncoder().encode(process.env.EC2_WEBHOOK_SECRET),
        { algorithms: ["HS256"] }
      );
    } catch {
      return reply.code(401).send({ error: "Invalid signature" });
    }

    // 2. Log to task_events table
    await db.insert(taskEvents).values({
      taskId: payload.task_id,
      eventType: `webhook_${payload.type}`,
      eventData: payload.data,
    });

    // 3. Publish to Redis → WebSocket → frontend
    await redis.publish(
      `tasks:${payload.userId}`,
      JSON.stringify(convertToWSMessage(payload))
    );

    // 4. Handle side effects
    if (payload.type === "captcha_detected") {
      await hatchet.event.push("captcha_detected", {
        taskId: payload.task_id,
      });
    }

    return reply.code(202).send({ status: "accepted" });
  });
}
```

Register in `app.ts` **before** ts-rest routers:

```typescript
await registerWebhookRoutes(fastify);
```

---

## 7. Human-in-the-Loop

### CAPTCHA Flow

```
 1. EC2 worker detects CAPTCHA during form fill (detect_block())
 2. EC2 returns immediately: { blocked: true, block_reason: "captcha", vnc_url }
    Browser stays open for VNC access
 3. Hatchet step receives blocked response
 4. Publishes "human_needed" to frontend via Redis/WebSocket
 5. Hatchet durableTask: ctx.waitFor({ eventKey: "captcha_solved" })
 6. User opens VNC in frontend (@novnc/novnc component), solves CAPTCHA
 7. User clicks "Done" → frontend calls: POST /api/v1/tasks/{id}/captcha-solved
 8. API pushes Hatchet event "captcha_solved" → durableTask resumes
 9. Hatchet retries POST /api/v1/tasks (EC2 re-opens browser, retries)
```

### Copilot Review Flow

```
 1. POST /api/v1/tasks { mode: "copilot" }
 2. EC2 worker fills form, takes screenshot, returns:
    { blocked: true, block_reason: "review_required", filled_fields, vnc_url }
 3. Hatchet publishes field_review to frontend
 4. ctx.waitFor({ eventKey: "review_approved" })
 5. User reviews fields + VNC, clicks "Approve"
 6. Hatchet retries POST /api/v1/tasks { action: "submit_only", profile_id }
 7. EC2 worker submits, returns result
```

### VNC Access

- Xvfb :99 (1920x1080x24) → x11vnc :5900 → websockify :6901 → nginx /vnc/ (WSS)
- VNC URL: `wss://{ec2-ip}/vnc/?task={task_id}&token={vnc-token}`
- Task-scoped tokens, expire after 30 min
- Frontend: `@novnc/novnc` React component (design from `01-vnc-stack.md`)

---

## 8. Profile & Pool Management

### Database Table

```typescript
// packages/db/src/schema/ec2-profiles.ts

export const ec2ProfileStatusEnum = pgEnum("ec2_profile_status", [
  "available",
  "in_use",
  "cooling",
  "needs_human",
  "disabled",
  "retired",
]);

export const ec2Profiles = pgTable(
  "ec2_profiles",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    adspowerProfileId: varchar("adspower_profile_id", { length: 100 })
      .notNull().unique(),
    adspowerGroupId: varchar("adspower_group_id", { length: 100 }),
    platform: varchar("platform", { length: 50 }).notNull(),
    ec2InstanceId: varchar("ec2_instance_id", { length: 50 }),
    status: ec2ProfileStatusEnum("status").default("available").notNull(),
    fingerprintConfig: jsonb("fingerprint_config").default({}),
    proxyHost: varchar("proxy_host", { length: 255 }),
    proxyPort: integer("proxy_port"),
    consecutiveBlocks: integer("consecutive_blocks").default(0).notNull(),
    consecutiveFailures: integer("consecutive_failures").default(0).notNull(),
    totalTasks: integer("total_tasks").default(0).notNull(),
    cooldownUntil: timestamp("cooldown_until", { withTimezone: true }),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    lastErrorAt: timestamp("last_error_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_ec2_profiles_user_platform").on(table.userId, table.platform),
    index("idx_ec2_profiles_status").on(table.status),
  ],
);
```

Add to `drizzle.config.ts` `tablesFilter` whitelist.

### ProfilePool Service

```typescript
// apps/worker/src/services/profile-pool.ts

export interface ProfileLease {
  profileId: string;          // DB id
  adspowerProfileId: string;  // AdsPower Local API id
  lockKey: string;            // Redis lock key
  acquiredAt: Date;
}

export class ProfilePool {
  constructor(private deps: { redis: Redis; db: Database }) {}

  async acquireProfile(opts: {
    userId: string;
    platform: string;
    maxWaitMs?: number;
  }): Promise<ProfileLease | null> {
    const maxWait = opts.maxWaitMs ?? 30_000;
    const start = Date.now();

    while (Date.now() - start < maxWait) {
      // Query available profiles (LRU order)
      const candidates = await this.deps.db
        .select()
        .from(ec2Profiles)
        .where(and(
          eq(ec2Profiles.userId, opts.userId),
          eq(ec2Profiles.platform, opts.platform),
          eq(ec2Profiles.status, "available"),
          or(
            isNull(ec2Profiles.cooldownUntil),
            lt(ec2Profiles.cooldownUntil, new Date())
          ),
        ))
        .orderBy(ec2Profiles.lastUsedAt)
        .limit(5);

      for (const profile of candidates) {
        const lockKey = `ec2:profile-lock:${profile.id}`;

        // Redis NX lock (10 min TTL)
        const locked = await this.deps.redis.set(
          lockKey, "1", "PX", 600_000, "NX"
        );

        if (locked === "OK") {
          await this.deps.db.update(ec2Profiles)
            .set({ status: "in_use", lastUsedAt: new Date(), updatedAt: new Date() })
            .where(eq(ec2Profiles.id, profile.id));

          return {
            profileId: profile.id,
            adspowerProfileId: profile.adspowerProfileId,
            lockKey,
            acquiredAt: new Date(),
          };
        }
      }

      await new Promise((r) => setTimeout(r, 500));
    }

    return null; // timeout
  }

  async releaseProfile(
    lease: ProfileLease,
    opts: { succeeded: boolean; errorMessage?: string } = { succeeded: true },
  ): Promise<void> {
    await this.deps.redis.del(lease.lockKey);

    if (opts.succeeded) {
      await this.deps.db.update(ec2Profiles)
        .set({
          status: "available",
          consecutiveFailures: 0,
          updatedAt: new Date(),
        })
        .where(eq(ec2Profiles.id, lease.profileId));
    } else {
      // Increment failure counter
      const profile = await this.deps.db.select()
        .from(ec2Profiles)
        .where(eq(ec2Profiles.id, lease.profileId))
        .limit(1)
        .then((r) => r[0]);

      const failures = (profile?.consecutiveFailures ?? 0) + 1;
      const newStatus = failures >= 5 ? "disabled" : "available";

      await this.deps.db.update(ec2Profiles)
        .set({
          status: newStatus,
          consecutiveFailures: failures,
          lastErrorAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(ec2Profiles.id, lease.profileId));
    }
  }
}
```

---

## 9. Circuit Breaker & Error Handling

### State Machine (on EC2 worker, from axon-browser-worker)

```
States: HEALTHY → COOLING → NEEDS_HUMAN → DISABLED

Transitions:
  record_block(reason):
    consecutive_blocks++
    if blocks >= 3 → NEEDS_HUMAN
    else → COOLING (exponential backoff)

  record_failure(error):
    consecutive_failures++
    if failures >= 5 → DISABLED

  record_success():
    consecutive_failures = 0
    consecutive_blocks = max(0, blocks - 1)
    if COOLING → HEALTHY

  can_run():
    DISABLED → false
    NEEDS_HUMAN → false
    COOLING + now < cooldown_until → false
    COOLING + now >= cooldown_until → HEALTHY, true
    HEALTHY → true
```

### Cooldown Tiers

| Consecutive Blocks | Cooldown | Action |
|---|---|---|
| 1 | 15-30 min (random + ±20% jitter) | COOLING |
| 2 | 2-6 hours (random + ±20% jitter) | COOLING |
| 3+ | -- | NEEDS_HUMAN (manual resolution) |

### Block Detection (detect_block)

Multi-stage detection from axon-browser-worker, adapted for job platforms:

1. **URL patterns**: `/verify`, `/captcha`, `/challenge`, `/security-check`, `/blocked`
2. **Redirect detection**: Different domain with login/verify in final URL
3. **Title keywords** (EN + ZH): "verify", "captcha", "blocked", "access denied", "验证", "安全验证"
4. **Body text** (lightweight, only if <10 elements): "complete the captcha", "unusual traffic", "too many requests"
5. **Empty page + redirect**: 0 elements + different domain = blocked

### Hatchet Error Recovery

```
EC2 network error / timeout:
  → EC2WorkerClient retries (3x with backoff)
  → If still fails: release profile (mark failed), task → "failed"

EC2 returns { next_action: "cooldown" }:
  → Release profile with cooldown
  → Retry with different profile if available

EC2 returns { next_action: "needs_human" }:
  → Publish to frontend, durableTask waitFor

EC2 returns { next_action: "disable_profile" }:
  → Mark profile disabled, retry with different profile, alert admin
```

---

## 10. AdsPower on Linux

### Installation

```bash
# Ubuntu 24.04 x86_64
ADSPOWER_VERSION="7.12.29"
wget -O /tmp/adspower.deb \
  "https://version.adspower.net/software/linux-x64-global/${ADSPOWER_VERSION}/AdsPower-Global-${ADSPOWER_VERSION}-x64.deb"
sudo gdebi -n /tmp/adspower.deb
# Installs to /opt/AdsPower Global/adspower_global (note: space in path)
ln -sf "/opt/AdsPower Global" /opt/adspower
```

### System Dependencies

Required libs (installed by `install-system.sh`):

```
libgtk-3-0 libnss3 libgbm1 libasound2t64 libatk-bridge2.0-0
libatk1.0-0 libcups2 libdrm2 libxcomposite1 libxdamage1 libxfixes3
libxrandr2 libpango-1.0-0 libnspr4 libxss1 libappindicator3-1
fonts-liberation xfonts-base
```

### Headless Mode

**Two layers of headless:**

| Layer | Option | Display Required? |
|-------|--------|---|
| AdsPower app | `--headless=true` CLI flag | NO (API-only, no GUI) |
| Browser profiles | `headless=1` on `/api/v1/browser/start` | NO |
| Browser profiles | `headless=0` (default, visible) | YES (needs Xvfb) |

For MVP: run AdsPower with `--headless=true`. Launch browsers with `headless=0` (visible on Xvfb) so VNC takeover works. If VNC is not needed for a task, use `headless=1`.

### Pricing

| Plan | Local API | Profiles | Price |
|------|-----------|----------|-------|
| Free | **NO** | 2 | $0 |
| Professional | YES | 10+ | $9/mo |
| Business | YES | configurable | ~$22/mo (annual) |

**Paid plan required for API access.** API key generated from GUI (one-time).

### Selenium Connection

```python
# 1. Start browser via AdsPower API
resp = requests.get(
    "http://localhost:50325/api/v1/browser/start",
    params={"user_id": profile_id, "headless": 0},
    headers={"Authorization": f"Bearer {api_key}"},
).json()

# 2. Extract connection details
selenium_address = resp["data"]["ws"]["selenium"]  # "127.0.0.1:XXXXX"
chromedriver_path = resp["data"]["webdriver"]       # bundled, version-matched

# 3. Connect Selenium
options = Options()
options.add_experimental_option("debuggerAddress", selenium_address)
service = Service(executable_path=chromedriver_path)
driver = webdriver.Chrome(service=service, options=options)
```

### Capacity on t3.medium

| Config | Concurrent Profiles |
|--------|---|
| Headless Chromium (`headless=1`) | 5-8 |
| Visible on Xvfb (`headless=0`) | 3-5 |

Each profile: ~300-500 MB RAM (lightweight pages), ~500-800 MB (heavy SPAs).
With 4 GB total, ~3 GB usable → **limit to 3 concurrent visible profiles**.

### Profile Data Location

```
~/.config/adspower_global/cwd_global/   # config, API port
~/.config/adspower_global/...           # per-profile browser data
```

Cookies, localStorage, IndexedDB **persist across browser restarts** automatically.

---

## 11. EC2 Infrastructure (from axon-browser-worker)

> Based on [axon-browser-worker/deploy](https://github.com/Shluo03/axon-browser-worker/tree/main/deploy).
> Uses **systemd** (not supervisord) — proven pattern from axon. Simpler, native to Ubuntu.

### 11.1 Process Management (systemd)

axon uses 4 systemd units. We add 2 more (websockify, nginx) for VALET:

```ini
# /etc/systemd/system/xvfb.service
[Unit]
Description=X Virtual Frame Buffer
After=network.target

[Service]
Type=simple
User=valet
ExecStart=/usr/bin/Xvfb :99 -screen 0 1920x1080x24 -ac
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```ini
# /etc/systemd/system/adspower.service
[Unit]
Description=AdsPower Browser
After=network.target xvfb.service
Requires=xvfb.service

[Service]
Type=simple
User=valet
Group=valet
Environment=DISPLAY=:99
WorkingDirectory=/opt/adspower
ExecStart=/opt/adspower/adspower_global --headless=true --api-key=%I --api-port=50325
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

```ini
# /etc/systemd/system/x11vnc.service
[Unit]
Description=x11vnc VNC Server
After=xvfb.service
Requires=xvfb.service

[Service]
Type=simple
User=valet
Environment=DISPLAY=:99
ExecStart=/usr/bin/x11vnc -display :99 -forever -shared -rfbport 5900 -rfbauth /home/valet/.vnc/passwd -localhost
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```ini
# /etc/systemd/system/websockify.service  (VALET addition — not in axon)
[Unit]
Description=Websockify VNC proxy
After=x11vnc.service
Requires=x11vnc.service

[Service]
Type=simple
User=valet
ExecStart=/usr/bin/websockify --web /usr/share/novnc 6901 localhost:5900
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```ini
# /etc/systemd/system/browser-worker.service
[Unit]
Description=VALET Browser Worker
After=network.target xvfb.service adspower.service
Wants=xvfb.service adspower.service

[Service]
Type=simple
User=valet
Group=valet
WorkingDirectory=/opt/worker
Environment=DISPLAY=:99
Environment=PATH=/opt/worker/.venv/bin:/usr/local/bin:/usr/bin:/bin
EnvironmentFile=/opt/worker/.env
ExecStart=/opt/worker/.venv/bin/uvicorn src.server:app --host 127.0.0.1 --port 8080
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Service start order: `xvfb → adspower → x11vnc → websockify → browser-worker`

```bash
# Enable all at once
sudo systemctl enable xvfb adspower x11vnc websockify browser-worker
sudo systemctl start xvfb adspower x11vnc websockify browser-worker

# Check status
sudo systemctl status browser-worker
journalctl -u browser-worker -f
journalctl -u adspower -f
```

### 11.2 Cloud-init (VM Bootstrap)

Based on axon's `deploy/terraform/cloud-init.yaml`. Runs on first EC2 boot:

```yaml
#cloud-config
package_update: true
package_upgrade: true

packages:
  # Basic utilities
  - curl
  - wget
  - git
  - vim
  - htop
  - jq
  - unzip
  # Python
  - python3
  - python3-pip
  - python3-venv
  # X11 / Virtual display
  - xvfb
  - x11vnc
  - fluxbox
  - websockify           # VALET addition
  # Chrome/AdsPower dependencies
  - libnss3
  - libatk1.0-0
  - libatk-bridge2.0-0
  - libcups2
  - libdrm2
  - libxkbcommon0
  - libxcomposite1
  - libxdamage1
  - libxfixes3
  - libxrandr2
  - libgbm1
  - libasound2
  - libpango-1.0-0
  - libcairo2
  - libgtk-3-0
  - libnotify4
  - libxss1
  # Fonts (important for CJK + web rendering)
  - fonts-noto-cjk
  - fonts-noto-color-emoji
  - fonts-liberation
  - xfonts-base
  # Networking
  - nginx                # VALET addition: TLS termination

users:
  - name: valet
    groups: [sudo]
    shell: /bin/bash
    sudo: ['ALL=(ALL) NOPASSWD:ALL']

runcmd:
  # Setup directories
  - mkdir -p /opt/worker /opt/adspower /data/artifacts
  - chown -R valet:valet /opt/worker /opt/adspower /data

  # Install noVNC (VALET addition)
  - git clone --depth 1 --branch v1.5.0 https://github.com/novnc/noVNC /usr/share/novnc

  # Create systemd services (xvfb, x11vnc, fluxbox)
  - |
    cat > /etc/systemd/system/xvfb.service << 'EOF'
    [Unit]
    Description=X Virtual Frame Buffer
    After=network.target
    [Service]
    Type=simple
    User=valet
    ExecStart=/usr/bin/Xvfb :99 -screen 0 1920x1080x24 -ac
    Restart=always
    RestartSec=5
    [Install]
    WantedBy=multi-user.target
    EOF
  # ... (x11vnc, websockify, fluxbox services same pattern)

  - systemctl daemon-reload
  - systemctl enable xvfb x11vnc fluxbox
  - systemctl start xvfb x11vnc fluxbox

  # Environment
  - |
    cat > /etc/profile.d/valet.sh << 'EOF'
    export DISPLAY=:99
    export PATH="/opt/worker/.venv/bin:$PATH"
    EOF

  # Self-signed TLS cert for nginx (VALET addition)
  - mkdir -p /etc/nginx/ssl
  - openssl req -x509 -nodes -days 365 -newkey rsa:2048
      -keyout /etc/nginx/ssl/valet-worker.key
      -out /etc/nginx/ssl/valet-worker.crt
      -subj "/CN=valet-worker"

  # VNC password
  - mkdir -p /home/valet/.vnc
  - x11vnc -storepasswd "changeme" /home/valet/.vnc/passwd
  - chown -R valet:valet /home/valet/.vnc

  - touch /var/lib/cloud/instance/valet-init-complete
```

### 11.3 Nginx Configuration (VALET addition)

axon exposes plain HTTP on :8080 directly. We add nginx for TLS + VNC WebSocket:

```nginx
# /etc/nginx/sites-available/valet-worker

limit_req_zone $binary_remote_addr zone=api_limit:10m rate=30r/s;
limit_req_zone $binary_remote_addr zone=vnc_limit:10m rate=5r/s;

server {
    listen 80;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    ssl_certificate     /etc/nginx/ssl/valet-worker.crt;
    ssl_certificate_key /etc/nginx/ssl/valet-worker.key;
    ssl_protocols TLSv1.2 TLSv1.3;

    # Health check (no auth, no rate limit)
    location = /health {
        proxy_pass http://127.0.0.1:8080/health;
        access_log off;
    }

    # FastAPI API
    location /api/ {
        limit_req zone=api_limit burst=50 nodelay;
        proxy_pass http://127.0.0.1:8080/api/;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;  # long-running browser tasks
        proxy_buffering off;
    }

    # WebSocket proxy for VNC (VALET addition)
    location /vnc/ {
        limit_req zone=vnc_limit burst=10 nodelay;
        proxy_pass http://127.0.0.1:6901/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 3600s;  # long-lived VNC sessions
        proxy_buffering off;
    }

    location / { return 404; }
}
```

### 11.4 Terraform

Adapted from axon's `deploy/terraform/main.tf` — same structure, tailored for VALET:

```hcl
# infra/ec2-worker/deploy/terraform/main.tf

terraform {
  required_version = ">= 1.0"
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.0" }
  }
}

provider "aws" { region = var.aws_region }

variable "aws_region"       { default = "us-east-1" }   # Closest to Fly.io
variable "instance_type"    { default = "t3.medium" }    # 2 vCPU, 4GB (vs axon's t3.xlarge)
variable "instance_count"   { default = 1 }
variable "key_name"         { type = string }
variable "allowed_api_cidr" { default = "0.0.0.0/0" }   # Lock to Fly.io egress CIDR in prod
variable "project_name"     { default = "valet-worker" }

data "aws_ami" "ubuntu" {
  most_recent = true
  owners      = ["099720109477"]  # Canonical
  filter { name = "name"; values = ["ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-amd64-server-*"] }
  filter { name = "virtualization-type"; values = ["hvm"] }
}

data "aws_vpc" "default"     { default = true }
data "aws_subnets" "default" { filter { name = "vpc-id"; values = [data.aws_vpc.default.id] } }

resource "aws_security_group" "worker" {
  name   = "${var.project_name}-sg"
  vpc_id = data.aws_vpc.default.id

  # HTTPS (nginx TLS) — from VALET API only
  ingress { from_port=443;  to_port=443;  protocol="tcp"; cidr_blocks=[var.allowed_api_cidr]; description="HTTPS API + VNC" }
  # SSH — restricted
  ingress { from_port=22;   to_port=22;   protocol="tcp"; cidr_blocks=[var.allowed_api_cidr]; description="SSH" }
  # All outbound (job sites, S3, etc.)
  egress  { from_port=0;    to_port=0;    protocol="-1";  cidr_blocks=["0.0.0.0/0"] }

  tags = { Name = "${var.project_name}-sg", Project = var.project_name }
}

resource "aws_instance" "worker" {
  count                  = var.instance_count
  ami                    = data.aws_ami.ubuntu.id
  instance_type          = var.instance_type
  key_name               = var.key_name
  vpc_security_group_ids = [aws_security_group.worker.id]
  subnet_id              = data.aws_subnets.default.ids[0]
  iam_instance_profile   = aws_iam_instance_profile.worker.name

  root_block_device {
    volume_size           = 30   # vs axon's 80GB
    volume_type           = "gp3"
    delete_on_termination = true
  }

  user_data = file("${path.module}/cloud-init.yaml")

  tags = { Name = "${var.project_name}-${count.index + 1}", Project = var.project_name }
}

resource "aws_eip" "worker" {
  count    = var.instance_count
  instance = aws_instance.worker[count.index].id
  domain   = "vpc"
  tags     = { Name = "${var.project_name}-eip-${count.index + 1}" }
}

# IAM role for Secrets Manager + CloudWatch + S3
resource "aws_iam_role" "worker" {
  name = "${var.project_name}-role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{ Action = "sts:AssumeRole", Effect = "Allow", Principal = { Service = "ec2.amazonaws.com" } }]
  })
}

resource "aws_iam_role_policy" "worker" {
  role = aws_iam_role.worker.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      { Effect = "Allow", Action = ["secretsmanager:GetSecretValue"], Resource = "*" },
      { Effect = "Allow", Action = ["cloudwatch:PutMetricData"], Resource = "*" },
      { Effect = "Allow", Action = ["logs:CreateLogGroup","logs:CreateLogStream","logs:PutLogEvents"], Resource = "*" },
      { Effect = "Allow", Action = ["s3:PutObject"], Resource = "arn:aws:s3:::valet-artifacts-*/*" },
    ]
  })
}

resource "aws_iam_instance_profile" "worker" {
  name = "${var.project_name}-profile"
  role = aws_iam_role.worker.name
}

output "worker_ips"   { value = aws_eip.worker[*].public_ip }
output "ssh_commands"  { value = [for eip in aws_eip.worker : "ssh -i ~/.ssh/${var.key_name}.pem ubuntu@${eip.public_ip}"] }
output "api_urls"      { value = [for eip in aws_eip.worker : "https://${eip.public_ip}"] }
```

### 11.5 Ansible Deployment

Adapted from axon's `deploy/ansible/`. Used for code deploys after Terraform provisions:

```yaml
# infra/ec2-worker/deploy/ansible/deploy.yml
- name: Deploy VALET Browser Worker
  hosts: workers
  become: yes
  vars:
    project_dir: /opt/worker
    valet_user: valet

  tasks:
    - name: Wait for cloud-init
      wait_for: { path: /var/lib/cloud/instance/valet-init-complete, timeout: 600 }
      tags: [init]

    - name: Clone worker code
      git:
        repo: "{{ repo_url }}"
        dest: "{{ project_dir }}"
        version: "{{ repo_branch | default('main') }}"
        force: yes
      become_user: "{{ valet_user }}"
      tags: [code]

    - name: Create venv
      command: python3 -m venv {{ project_dir }}/.venv
      args: { creates: "{{ project_dir }}/.venv/bin/python" }
      become_user: "{{ valet_user }}"
      tags: [code]

    - name: Install deps
      pip: { requirements: "{{ project_dir }}/requirements.txt", virtualenv: "{{ project_dir }}/.venv" }
      become_user: "{{ valet_user }}"
      tags: [code]

    - name: Deploy systemd services
      template: { src: "{{ item }}.service.j2", dest: "/etc/systemd/system/{{ item }}.service" }
      loop: [adspower, browser-worker, websockify]
      notify: [Reload systemd, Restart browser-worker]
      tags: [service]

    - name: Deploy nginx config
      template: { src: valet-worker.nginx.j2, dest: /etc/nginx/sites-available/valet-worker }
      notify: Reload nginx
      tags: [config]

    - name: Enable nginx site
      file: { src: /etc/nginx/sites-available/valet-worker, dest: /etc/nginx/sites-enabled/valet-worker, state: link }
      tags: [config]

    - name: Start services
      systemd: { name: "{{ item }}", state: started, enabled: yes }
      loop: [xvfb, adspower, x11vnc, websockify, browser-worker, nginx]
      tags: [service]

    - name: Health check
      uri: { url: "http://127.0.0.1:8080/health" }
      register: health
      until: health.status == 200
      retries: 30
      delay: 2
      tags: [verify]

  handlers:
    - name: Reload systemd
      systemd: { daemon_reload: yes }
    - name: Restart browser-worker
      systemd: { name: browser-worker, state: restarted }
    - name: Reload nginx
      systemd: { name: nginx, state: reloaded }
```

### 11.6 Deploy Scripts

Adapted from axon's `deploy/scripts/`:

**`setup-worker.sh`** — Run on VM after cloning code:
```bash
#!/bin/bash
set -e
PROJECT_DIR="/opt/worker"
cd "$PROJECT_DIR"

# 1. Python venv
[ ! -d ".venv" ] && python3 -m venv .venv
source .venv/bin/activate

# 2. Dependencies
pip install --upgrade pip -q
pip install -r requirements.txt -q

# 3. Check AdsPower
if curl -s http://127.0.0.1:50325/status > /dev/null 2>&1; then
    echo "✓ AdsPower running"
else
    echo "✗ AdsPower not running — install and activate via VNC first"
fi

# 4. Start worker
sudo systemctl enable browser-worker
sudo systemctl start browser-worker
curl http://localhost:8080/health
```

**`install-adspower.sh`** — Download and install AdsPower:
```bash
#!/bin/bash
set -e
ADSPOWER_VERSION="7.12.29"

# Download .deb (VALET uses .deb, axon used .tar.gz)
wget -O /tmp/adspower.deb \
  "https://version.adspower.net/software/linux-x64-global/${ADSPOWER_VERSION}/AdsPower-Global-${ADSPOWER_VERSION}-x64.deb"
sudo gdebi -n /tmp/adspower.deb
ln -sf "/opt/AdsPower Global" /opt/adspower

# First-time activation requires VNC:
# 1. Start: DISPLAY=:99 /opt/adspower/adspower_global &
# 2. VNC in: open vnc://<VM_IP>:5900
# 3. Login, activate license, create first profile
# 4. Switch to headless: pkill adspower && systemctl start adspower
```

**`health-check.sh`** — Adapted from axon's version, adds nginx + websockify:
```bash
#!/bin/bash
echo "=== VALET Browser Worker Health ==="
for svc in xvfb adspower x11vnc websockify browser-worker nginx; do
  if systemctl is-active --quiet "$svc"; then
    echo "  ✓ $svc"
  else
    echo "  ✗ $svc (not running)"
  fi
done
echo ""
echo "API Endpoints:"
curl -s http://127.0.0.1:50325/status > /dev/null 2>&1 && echo "  ✓ AdsPower :50325" || echo "  ✗ AdsPower :50325"
curl -s http://127.0.0.1:8080/health  > /dev/null 2>&1 && echo "  ✓ Worker :8080"    || echo "  ✗ Worker :8080"
echo ""
echo "Memory: $(free -h | grep Mem | awk '{print $3 " / " $2}')"
echo "Disk:   $(df -h / | tail -1 | awk '{print $5 " used"}')"
```

### 11.7 Makefile

Adapted from axon's `deploy/Makefile`:

```makefile
# infra/ec2-worker/deploy/Makefile
.PHONY: help init plan apply destroy ssh health ansible vnc

TERRAFORM_DIR = terraform
ANSIBLE_DIR = ansible
KEY_NAME ?= valet-worker
KEY_PATH ?= ~/.ssh/$(KEY_NAME).pem

help:
	@echo "VALET Browser Worker Deployment"
	@echo "  make init    - terraform init"
	@echo "  make plan    - terraform plan"
	@echo "  make apply   - deploy EC2"
	@echo "  make destroy - tear down"
	@echo "  make ssh     - SSH to first worker"
	@echo "  make vnc     - VNC to first worker"
	@echo "  make health  - check all workers"
	@echo "  make ansible - deploy code via ansible"

init:
	cd $(TERRAFORM_DIR) && terraform init

plan:
	cd $(TERRAFORM_DIR) && terraform plan

apply:
	cd $(TERRAFORM_DIR) && terraform apply

destroy:
	cd $(TERRAFORM_DIR) && terraform destroy

ssh:
	@IP=$$(cd $(TERRAFORM_DIR) && terraform output -json worker_ips | jq -r '.[0]'); \
	ssh -i $(KEY_PATH) ubuntu@$$IP

vnc:
	@IP=$$(cd $(TERRAFORM_DIR) && terraform output -json worker_ips | jq -r '.[0]'); \
	open vnc://$$IP:5900 || echo "Run: vncviewer $$IP:5900"

health:
	@for IP in $$(cd $(TERRAFORM_DIR) && terraform output -json worker_ips | jq -r '.[]'); do \
		echo "=== $$IP ==="; \
		curl -sk https://$$IP/health | jq . || echo "Failed"; echo ""; \
	done

inventory:
	@cd $(TERRAFORM_DIR) && terraform output -raw ansible_inventory > ../$(ANSIBLE_DIR)/inventory.ini

ansible: inventory
	cd $(ANSIBLE_DIR) && ansible-playbook -i inventory.ini deploy.yml
```

### 11.8 CloudWatch Monitoring

```
Log Groups:
  /valet/browser-worker/adspower    ← journalctl -u adspower    (14d retention)
  /valet/browser-worker/fastapi     ← journalctl -u browser-worker (14d)
  /valet/browser-worker/nginx       ← /var/log/nginx/access.log (14d)

Custom Metrics (cron every 60s → VALET/BrowserWorker namespace):
  ActiveTasks, AdsPowerStatus, FastAPIStatus, MemoryUsagePercent, DiskUsagePercent

Alarms:
  adspower-down    | AdsPowerStatus < 1 for 3 min  | SNS → PagerDuty
  fastapi-down     | FastAPIStatus < 1 for 3 min   | SNS → PagerDuty
  high-memory      | MemoryUsagePercent > 85% 5 min | SNS → Slack
  high-disk        | DiskUsagePercent > 80% 5 min   | SNS → Slack
  task-stuck       | ActiveTasks > 0 unchanged 30m  | SNS → PagerDuty
```

---

## 12. Networking & Security

### Traffic Flow

```
User browser ──HTTPS──► VALET API (Fly.io)
                              │
                    HTTPS (SG restricted) ──► EC2 nginx :443
                              │                   ├─► FastAPI :8080
                              │                   └─► websockify :6901 (WSS)
                              │
User browser ──WSS via nginx──► EC2 :443/vnc/ (VNC, token-gated)
                              │
                    EC2 ──► Job sites (via residential proxy)
                    EC2 ──► AdsPower Local API :50325 (localhost only)
                    EC2 ──► Supabase Storage S3 (screenshots)
```

### Security

| Concern | Solution |
|---------|----------|
| Worker API auth | `Authorization: Bearer {EC2_WORKER_API_KEY}` on every request |
| VNC auth | Task-scoped JWT tokens (30 min expiry) + x11vnc rfbauth password |
| Secrets | AWS Secrets Manager, loaded at boot via IAM role |
| Network | Security group: :443 only from VALET API CIDR |
| TLS | nginx terminates TLS (self-signed MVP, Let's Encrypt prod) |
| Callback auth | JWT signed with `EC2_WEBHOOK_SECRET`, verified by VALET API |

---

## 13. Cost Model

### Per-Instance Monthly

| Component | Cost/Month |
|-----------|-----------|
| EC2 t3.medium (1yr RI) | $22.00 |
| EBS 30 GB gp3 | $2.40 |
| Data transfer (~20 GB) | $2.00 |
| Elastic IP | $3.65 |
| AdsPower Professional | $9.00 |
| **Total** | **~$39/mo** |

### Capacity

- Each task: ~2-3 min
- Sequential (1 at a time per instance)
- ~20-30 tasks/hour → ~500 tasks/day
- 3 AdsPower profiles per instance for rotation

### Scaling

| Scale | Instances | Tasks/Day | Cost/Month |
|-------|-----------|-----------|-----------|
| MVP | 1 | ~500 | $39 |
| Small | 3 | ~1,500 | $117 |
| Medium | 10 | ~5,000 | $390 |

---

## 14. axon-browser-worker → VALET Integration Map

> Concrete mapping of what to fork, adapt, and build from scratch.

### 14.1 What We Fork Directly (minimal changes)

| axon File | VALET Location | Changes |
|-----------|---------------|---------|
| `src/adspower/client.py` | `infra/ec2-worker/src/adspower/client.py` | Add `api_key` header support (paid plan requires auth) |
| `src/browser/session.py` | `infra/ec2-worker/src/browser/session.py` | Fork as-is — BrowserSession context manager |
| `src/browser/humanize.py` | `infra/ec2-worker/src/browser/humanize.py` | Fork as-is — HumanizedActions (type, click, scroll) |
| `src/worker/circuit_breaker.py` | `infra/ec2-worker/src/worker/circuit_breaker.py` | Fork as-is — ProfileState machine |
| `src/worker/detection.py` | `infra/ec2-worker/src/worker/detection.py` | Add job-platform patterns (greenhouse, lever, workday URLs) |
| `src/worker/tasks.py` | `infra/ec2-worker/src/worker/tasks.py` | Extend Task/TaskResult with `user_data`, `qa_answers`, `resume_file_url`, `callback_url` |
| `src/worker/runner.py` | `infra/ec2-worker/src/worker/runner.py` | Add webhook callbacks during execution |
| `deploy/terraform/main.tf` | `infra/ec2-worker/deploy/terraform/main.tf` | Region, instance type, security group, IAM role |
| `deploy/terraform/cloud-init.yaml` | `infra/ec2-worker/deploy/terraform/cloud-init.yaml` | Add nginx, websockify, noVNC, valet user |
| `deploy/ansible/deploy.yml` | `infra/ec2-worker/deploy/ansible/deploy.yml` | Add nginx, websockify services |
| `deploy/scripts/setup-worker.sh` | `infra/ec2-worker/deploy/scripts/setup-worker.sh` | Change paths, add nginx setup |
| `deploy/scripts/install-adspower.sh` | `infra/ec2-worker/deploy/scripts/install-adspower.sh` | Use .deb instead of .tar.gz |
| `deploy/scripts/health-check.sh` | `infra/ec2-worker/deploy/scripts/health-check.sh` | Add nginx, websockify checks |
| `deploy/Makefile` | `infra/ec2-worker/deploy/Makefile` | Rename vars, add HTTPS health check |

### 14.2 What We Build New (not in axon)

| Component | VALET Location | Why Not in axon |
|-----------|---------------|-----------------|
| **Webhook callbacks** | `infra/ec2-worker/src/callbacks/webhook.py` | axon has NO streaming/callbacks — sync-only |
| **Job application handlers** | `infra/ec2-worker/src/handlers/linkedin.py`, `greenhouse.py`, `generic.py` | axon has `page_probe`, `scroll_probe`, `perf_probe` only |
| **Resume file download** | `infra/ec2-worker/src/browser/resume.py` | Download PDF from Supabase S3 → upload to form |
| **Form field analysis** | `infra/ec2-worker/src/handlers/form_analyzer.py` | Detect form fields, map to UserData |
| **Screenshot + S3 upload** | `infra/ec2-worker/src/browser/screenshot.py` | Upload artifacts to Supabase Storage |
| **nginx config** | `infra/ec2-worker/deploy/nginx/valet-worker.conf` | axon uses plain HTTP on :8080 |
| **websockify service** | `infra/ec2-worker/deploy/systemd/websockify.service` | axon has VNC but no WebSocket proxy |
| **EC2WorkerClient** | `apps/worker/src/services/ec2-client.ts` | TypeScript HTTP client for Hatchet → EC2 |
| **ProfilePool** | `apps/worker/src/services/profile-pool.ts` | Redis-locked profile assignment |
| **ec2_profiles table** | `packages/db/src/schema/ec2-profiles.ts` | Drizzle migration for profile state |
| **job-application-ec2.ts** | `apps/worker/src/workflows/job-application-ec2.ts` | 2-step Hatchet workflow |
| **Webhook handler route** | `apps/api/src/modules/webhooks/worker-webhook.routes.ts` | Receive EC2 progress callbacks |
| **CloudWatch agent config** | `infra/ec2-worker/deploy/cloudwatch/` | axon has basic health-check.sh only |

### 14.3 Key Differences from axon

| Aspect | axon-browser-worker | VALET Adaptation |
|--------|-------------------|------------------|
| **Process management** | systemd | **Keep systemd** (proven, simpler than supervisord) |
| **Instance type** | t3.xlarge (16GB, ~$120/mo) | **t3.medium** (4GB, ~$22/mo RI) — sufficient for 1-3 browsers |
| **OS** | Ubuntu 22.04 (Jammy) | **Keep 22.04** — proven with AdsPower |
| **Storage** | 80GB gp3 | **30GB gp3** — less artifact storage needed |
| **TLS** | None (plain HTTP :8080) | **nginx TLS on :443** |
| **VNC** | x11vnc :5900 (no password, direct) | **x11vnc → websockify :6901 → nginx /vnc/** (WSS, auth) |
| **API design** | `POST /run-task` generic | `POST /api/v1/tasks` with user_data, qa_answers, resume |
| **Streaming** | None | **Webhook callbacks** for real-time progress |
| **Auth** | None | **Bearer token** on every request |
| **Handlers** | page_probe, scroll_probe, perf_probe | **linkedin, greenhouse, lever, workday, generic** |
| **AdsPower install** | .tar.gz manual extract | **.deb** via gdebi (cleaner) |
| **AdsPower activation** | VNC → GUI login (one-time) | **Same** — one-time manual step |
| **Secrets** | Env vars / config.yaml | **AWS Secrets Manager** via IAM role |
| **Monitoring** | health-check.sh script | **CloudWatch** agent + custom metrics + alarms |
| **User** | `axon` | `valet` |
| **Code deploy** | Ansible git pull | **Same** — Ansible playbook |

### 14.4 axon Source Code: What Each File Does

For reference when forking:

```
src/server.py          → FastAPI app with /run-task, /health, /profiles endpoints
                         TaskRunner initialized on app startup (lifespan)
                         Pydantic models for request/response validation

src/adspower/client.py → AdsPowerClient class: health_check(), start(), stop(),
                         list_profiles(), create_profile()
                         Returns BrowserConnection(selenium_address, cdp_url, chromedriver_path)

src/browser/session.py → BrowserSession context manager: start() → stop()
                         Connects Selenium via debuggerAddress from AdsPower
                         with BrowserSession(profile_id) as session: session.driver.get(url)

src/browser/humanize.py → HumanizedActions: type_text (50-180ms/char, 2% typos),
                          click (random offset), scroll (80-180px steps, reading pauses)

src/worker/runner.py   → TaskRunner: check circuit breaker → create artifacts dir →
                         lookup handler → BrowserSession context → run handler →
                         update circuit breaker → finalize result

src/worker/tasks.py    → Task(task_id, profile_id, task_type, platform, params, policy)
                         TaskResult(success, blocked, block_reason, next_action,
                                    metrics, artifacts, profile_status, timing)
                         NextAction enum: CONTINUE, COOLDOWN, NEEDS_HUMAN, DISABLE_PROFILE

src/worker/circuit_breaker.py → ProfileState machine: HEALTHY → COOLING → NEEDS_HUMAN → DISABLED
                                record_block(), record_failure(), record_success(), can_run()
                                Cooldown tiers: 15-30min, 2-6hr, manual

src/worker/detection.py → detect_block(): URL patterns, redirect detection, title keywords,
                          body text analysis, empty page detection. Supports EN + ZH.

src/worker/handlers.py → Built-in handlers: page_probe (navigate + screenshot),
                         scroll_probe (navigate + scroll + detect blocks),
                         perf_probe (navigate + JS performance metrics)
```

---

## 15. Implementation Phases (Concrete)

### Phase 1: Fork + EC2 Worker MVP (Week 1-2)

**Goal**: `curl POST https://<EC2>/api/v1/tasks` → AdsPower → LinkedIn → result

```
Step 1.1  Create infra/ec2-worker/ directory structure
Step 1.2  Fork axon Python files (server.py, adspower/, browser/, worker/)
Step 1.3  Extend Task/TaskResult with user_data, qa_answers, resume_file_url, callback_url
Step 1.4  Add webhook callback module (POST to callback_url during execution)
Step 1.5  Implement LinkedIn Easy Apply handler:
            - Navigate to job URL
            - Detect "Easy Apply" button
            - Fill form pages (user_data + qa_answers)
            - Upload resume from URL
            - Submit + verify confirmation
Step 1.6  Add Bearer token auth middleware
Step 1.7  Fork deploy/ (terraform, ansible, scripts, Makefile)
Step 1.8  Adapt cloud-init for VALET (nginx, websockify, noVNC)
Step 1.9  terraform apply (1x t3.medium)
Step 1.10 SSH in, run install-adspower.sh + setup-worker.sh
Step 1.11 VNC in, activate AdsPower license, create 3 profiles
Step 1.12 Test: curl → EC2 → AdsPower → LinkedIn → response
```

**Deliverables**:
- `infra/ec2-worker/` with forked + extended Python worker
- `infra/ec2-worker/deploy/` with Terraform + Ansible + scripts
- Running EC2 instance responding to API calls

### Phase 2: Hatchet Integration (Week 2-3)

**Goal**: Frontend → API → Hatchet → EC2 → LinkedIn → result → frontend

```
Step 2.1  Create EC2WorkerClient (apps/worker/src/services/ec2-client.ts)
Step 2.2  Create ProfilePool (apps/worker/src/services/profile-pool.ts)
Step 2.3  Add ec2_profiles table (packages/db/src/schema/ec2-profiles.ts)
Step 2.4  Run drizzle migration, update tablesFilter whitelist
Step 2.5  Create job-application-ec2.ts (2-step workflow)
Step 2.6  Update main.ts: conditional registration (EC2 vs mock)
Step 2.7  Create webhook handler route (apps/api/src/modules/webhooks/)
Step 2.8  Register webhook route in app.ts (before ts-rest)
Step 2.9  E2E test: Create task in frontend → watch progress → see result
Step 2.10 Test CAPTCHA flow: EC2 returns blocked → VNC URL → solve → resume
Step 2.11 Test copilot review: fields sent to frontend → approve → submit
```

**Deliverables**:
- TypeScript integration code in apps/worker/ and apps/api/
- Database migration applied
- Full E2E flow working

### Phase 3: VNC + Human Takeover (Week 3-4)

**Goal**: User can see browser and solve CAPTCHAs via web interface

```
Step 3.1  Install @novnc/novnc in apps/web/
Step 3.2  Create VncViewer component (connects to WSS /vnc/ endpoint)
Step 3.3  VNC token generation in API (JWT, 30 min expiry)
Step 3.4  Wire into task-detail page: show VNC when status = waiting_human
Step 3.5  Test: CAPTCHA detected → VNC viewer appears → solve → resume
```

### Phase 4: Monitoring + Hardening (Week 4+)

**Goal**: Production-ready with alerts and auto-recovery

```
Step 4.1  CloudWatch agent config + custom metrics cron
Step 4.2  CloudWatch alarms (adspower-down, fastapi-down, high-memory)
Step 4.3  SNS topics → Slack/PagerDuty
Step 4.4  Instance auto-recovery (EC2 status check alarm)
Step 4.5  Log rotation for systemd journals
Step 4.6  Terraform state backend (S3 + DynamoDB lock)
Step 4.7  Lock security group to actual Fly.io CIDR
```

---

## 16. V2: Session-Based Model + Browser Agents

> Deferred. After MVP is stable:

### Session-Based API

Replace stateless `/api/v1/tasks` with persistent browser sessions:

```
POST /sessions              → Open browser, keep alive
POST /sessions/{id}/analyze → Stagehand observe
POST /sessions/{id}/fill    → Stagehand act
POST /sessions/{id}/submit  → Submit
POST /sessions/{id}/continue → Resume after human intervention
DELETE /sessions/{id}        → Close browser
```

### Browser Agents

- **Stagehand** (primary): DOM-first, `act()` / `observe()` / `extract()`, CDP
- **Magnitude** (fallback): Vision-first, screenshots → Claude, pixel coordinates
- Engine switching: Stagehand fails → Magnitude retries via vision

### Expanded Workflow

```
start-session → analyze → fill (durable) → submit → verify → cleanup
```

Each step calls session API for fine-grained progress, retries, and human checkpoints.

---

## Appendix A: First-Time EC2 Setup Checklist

Based on axon's `deploy/MANUAL_SETUP.md`, adapted for VALET:

```
Prerequisites:
  □ AWS account with EC2 access
  □ AdsPower account + license (Professional plan, $9/mo)
  □ SSH key pair in AWS (name: valet-worker)
  □ Terraform installed locally
  □ Ansible installed locally

Deploy:
  □ cd infra/ec2-worker/deploy
  □ cp terraform/terraform.tfvars.example terraform/terraform.tfvars
  □ Edit terraform.tfvars (region, key_name, allowed_api_cidr)
  □ make init && make apply (wait ~3 min)
  □ make ssh → tail -f /var/log/cloud-init-output.log (wait for "complete")

Install AdsPower (one-time):
  □ make ssh
  □ sudo -u valet ./deploy/scripts/install-adspower.sh
  □ make vnc → connect to VNC
  □ In VNC: login AdsPower, activate license, create 3 profiles
  □ Switch to headless: pkill adspower && sudo systemctl start adspower

Deploy Worker Code:
  □ make ansible  (or: make ssh → ./deploy/scripts/setup-worker.sh)
  □ make health → all services ✓

Verify:
  □ curl -sk https://<IP>/health
  □ curl -sk -X POST https://<IP>/api/v1/tasks -H "Authorization: Bearer <key>" -d '{...}'
```

## Appendix B: EC2 Worker File Structure

```
infra/ec2-worker/
├── src/
│   ├── server.py               # FastAPI app (forked from axon, extended)
│   ├── config.py               # pydantic-settings (VALET env vars)
│   ├── auth.py                 # Bearer token middleware (NEW)
│   ├── adspower/
│   │   ├── __init__.py
│   │   └── client.py           # AdsPower Local API (forked from axon)
│   ├── browser/
│   │   ├── __init__.py
│   │   ├── session.py          # BrowserSession context manager (forked)
│   │   ├── humanize.py         # HumanizedActions (forked as-is)
│   │   ├── screenshot.py       # Screenshot + S3 upload (NEW)
│   │   └── resume.py           # Download resume from URL (NEW)
│   ├── worker/
│   │   ├── __init__.py
│   │   ├── runner.py           # TaskRunner (forked, add webhook calls)
│   │   ├── tasks.py            # Task/TaskResult (forked, extend fields)
│   │   ├── circuit_breaker.py  # Profile state machine (forked as-is)
│   │   └── detection.py        # Block detection (forked, add job-platform patterns)
│   ├── handlers/
│   │   ├── __init__.py
│   │   ├── linkedin.py         # LinkedIn Easy Apply (NEW)
│   │   ├── greenhouse.py       # Greenhouse ATS (NEW, Phase 2+)
│   │   └── generic.py          # Generic form fill (NEW)
│   └── callbacks/
│       ├── __init__.py
│       └── webhook.py          # POST progress to VALET API (NEW)
├── tests/
│   ├── test_runner.py
│   ├── test_handlers.py
│   └── test_integration.py     # (forked from axon)
├── requirements.txt
├── deploy/
│   ├── Makefile
│   ├── terraform/
│   │   ├── main.tf
│   │   ├── cloud-init.yaml
│   │   └── terraform.tfvars.example
│   ├── ansible/
│   │   ├── deploy.yml
│   │   ├── inventory.ini.example
│   │   └── templates/
│   │       ├── browser-worker.service.j2
│   │       ├── adspower.service.j2
│   │       ├── websockify.service.j2
│   │       └── valet-worker.nginx.j2
│   ├── scripts/
│   │   ├── setup-worker.sh
│   │   ├── install-adspower.sh
│   │   ├── health-check.sh
│   │   └── push-metrics.py     # CloudWatch custom metrics
│   └── cloudwatch/
│       └── config.json         # CloudWatch agent config
└── Dockerfile                  # For local dev/testing
```
