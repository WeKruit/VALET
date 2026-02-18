# GhostHands Integration — Worker Lifecycle & Observability Requirements

**From**: VALET Engineering
**To**: GhostHands Team
**Date**: 2026-02-18
**Priority**: High

---

## Context

We've completed Sprint 1 HITL integration and are running jobs on staging. During testing, we identified several gaps in worker observability and lifecycle management that need to be addressed for production readiness.

Currently, VALET sends `target_worker_id` (our sandbox UUID) when submitting jobs, and GhostHands assigns them to actual workers (e.g., `worker-production-1771386675208`). However, we have no visibility into:

- Which physical worker picked up a job
- Whether a worker is still alive after we terminate its sandbox
- How workers map to EC2 instances
- Real-time worker state (active task, browser session, resource usage)

---

## 1. Worker Registry & Lifecycle Events

### What we need:

GhostHands should maintain and expose a **worker registry** — a list of all known workers with their current state.

### API Endpoint Requested:

```
GET /api/v1/monitoring/workers
```

**Response:**

```json
{
  "workers": [
    {
      "worker_id": "worker-production-1771386675208",
      "status": "idle" | "busy" | "draining" | "offline",
      "target_worker_id": "<sandbox-uuid>",
      "ec2_instance_id": "i-0abc123def456",
      "ec2_ip": "34.197.248.80",
      "current_job_id": "uuid-or-null",
      "current_task_url": "https://...",
      "browser_session_id": "session-uuid-or-null",
      "registered_at": "2026-02-18T...",
      "last_heartbeat": "2026-02-18T...",
      "jobs_completed": 42,
      "jobs_failed": 3,
      "uptime_seconds": 86400
    }
  ]
}
```

### Worker Lifecycle Events:

Include these in `gh_job_events` (or a new `gh_worker_events` table):

| Event                 | When                    | Metadata                                        |
| --------------------- | ----------------------- | ----------------------------------------------- |
| `worker_registered`   | Worker container starts | `ec2_instance_id`, `ec2_ip`, `target_worker_id` |
| `worker_heartbeat`    | Periodic (every 30s)    | `status`, `current_job_id`, `memory_usage`      |
| `worker_draining`     | Worker about to stop    | `reason` (shutdown, deploy, scale-down)         |
| `worker_deregistered` | Worker container stops  | `reason`, `jobs_completed`, `uptime`            |

---

## 2. Worker Deregistration on Sandbox Termination

### Problem:

When VALET terminates a sandbox (sets status to "terminated" in our DB), the GH worker on that EC2 instance may still be running, accepting new jobs, and processing tasks. This creates "ghost workers" — workers that are active in GH but invisible in VALET.

### What we need:

A **deregister endpoint** that VALET can call when terminating a sandbox:

```
POST /api/v1/workers/deregister
{
  "target_worker_id": "<sandbox-uuid>",
  "reason": "sandbox_terminated",
  "cancel_active_jobs": true,
  "drain_timeout_seconds": 30
}
```

**Expected behavior:**

1. Stop accepting new jobs for this `target_worker_id`
2. If `cancel_active_jobs: true`, cancel any running jobs and send `cancelled` callbacks
3. If `drain_timeout_seconds` is set, wait for current job to finish before stopping
4. Send a final `worker_deregistered` event
5. Return the list of cancelled job IDs

### VALET will call this:

- When admin clicks "Terminate" on a sandbox
- When a sandbox health check fails repeatedly
- When EC2 instance is stopped/terminated

---

## 3. Worker Assignment in Callbacks

### Problem:

When GH picks up a job, the callback payload doesn't include which worker is actually running it. We only have `target_worker_id` (what we requested) but not `worker_id` (who actually got it).

### What we need:

Include `worker_id` in **all callback payloads**:

```json
{
  "job_id": "...",
  "valet_task_id": "...",
  "status": "running",
  "worker_id": "worker-production-1771386675208",
  "target_worker_id": "<sandbox-uuid>",
  ...
}
```

This lets VALET:

- Track which physical worker is processing each job
- Detect worker reassignment (when `worker_id` doesn't match what we expected)
- Show the worker in the task detail UI

---

## 4. Strict Worker Affinity

### Problem:

If we send `target_worker_id: sandbox-A` but that worker is busy/offline, GH may silently reassign the job to a different worker. This causes confusion because the job disappears from sandbox-A's view but doesn't appear in sandbox-B's view.

### What we need:

Add a `worker_affinity` parameter to job submissions:

```json
{
  "target_worker_id": "<sandbox-uuid>",
  "worker_affinity": "strict" | "preferred" | "any"
}
```

| Mode        | Behavior                                                                                            |
| ----------- | --------------------------------------------------------------------------------------------------- |
| `strict`    | Only run on the specified worker. Fail with `WORKER_UNAVAILABLE` if it's offline/busy.              |
| `preferred` | Try the specified worker first, fall back to any available. Include actual `worker_id` in callback. |
| `any`       | Default. GH load-balancer picks freely.                                                             |

VALET will use `strict` for sandbox-triggered jobs, `preferred` for production.

---

## 5. Cost Reporting in Callbacks

### Problem:

The `cost` field in callbacks is currently returning `total_cost_usd: 0` for completed jobs with multiple actions. The frontend shows "$0.0000 (4 actions)" which is confusing.

### What we need:

- Accurate `total_cost_usd` based on actual LLM token usage and model pricing
- Send cost data in BOTH running (incremental) and terminal (final) callbacks:

```json
{
  "cost": {
    "total_cost_usd": 0.0342,
    "action_count": 4,
    "total_tokens": 15230,
    "breakdown": [
      { "model": "claude-sonnet-4-20250514", "tokens": 12000, "cost_usd": 0.028 },
      { "model": "claude-haiku-4-5-20251001", "tokens": 3230, "cost_usd": 0.0062 }
    ]
  }
}
```

- If cost calculation is async, send it in a follow-up callback with `status: "completed"` and the cost field populated

---

## 6. HITL — reCAPTCHA & Bot Detection

### Current state:

Jobs are failing with reCAPTCHA/bot detection. GH sends `needs_human` callback with interaction data. VALET renders the HITL blocker card and provides noVNC Live View for manual intervention.

### What's working:

- `needs_human` callback → VALET pauses task → shows Live View + HITL card
- `resumed` callback → VALET resumes task → clears interaction data

### What we need improved:

#### a) Screenshot in HITL callback

Include a screenshot URL in the `interaction` payload so VALET can show the current page state without requiring noVNC:

```json
{
  "interaction": {
    "type": "captcha",
    "screenshot_url": "https://storage.../screenshot.png",
    "page_url": "https://...",
    "element_selector": "#recaptcha-anchor",
    "timeout_seconds": 120,
    "message": "reCAPTCHA challenge detected"
  }
}
```

#### b) Auto-retry after human solve

After VALET sends `POST /jobs/:id/resume` with `resolved_by: "human"`, GH should:

1. Wait 2-3s for the captcha solution to propagate
2. Verify the captcha is actually solved (check if the element is gone)
3. If still blocked, send another `needs_human` callback
4. If cleared, continue automation and send `running` callback

#### c) Captcha detection metadata

Include captcha type in metadata so VALET can render type-specific UI:

```json
{
  "interaction": {
    "type": "captcha",
    "captcha_type": "recaptcha_v2" | "recaptcha_v3" | "hcaptcha" | "cloudflare_turnstile" | "custom",
    "difficulty": "easy" | "medium" | "hard"
  }
}
```

---

## 7. Job Events — `gh_job_events` Table Completeness

We're now reading `gh_job_events` to display an activity feed on the task detail page. Please ensure all meaningful events are being written:

### Required events:

| Event Type                | When                        | Message Example                         |
| ------------------------- | --------------------------- | --------------------------------------- |
| `job_started`             | Worker picks up job         | "Job assigned to worker-xyz"            |
| `job_completed`           | Job finishes successfully   | "Application submitted successfully"    |
| `job_failed`              | Job fails                   | "Failed: reCAPTCHA could not be solved" |
| `step_started`            | Each automation step begins | "Navigating to application page"        |
| `step_completed`          | Step finishes               | "Form fields identified: 12"            |
| `cookbook_step_started`   | Cookbook recipe step begins | "Running recipe: fill_basic_info"       |
| `cookbook_step_completed` | Recipe step done            | "Basic info filled"                     |
| `cookbook_step_failed`    | Recipe step fails           | "Recipe failed: field not found"        |
| `thought`                 | LLM reasoning               | "Analyzing form structure..."           |
| `tokens_used`             | After LLM call              | metadata: `{model, tokens, cost_usd}`   |
| `observation_started`     | Screenshot/DOM capture      | "Capturing page state"                  |
| `observation_completed`   | Capture done                | "Page state captured"                   |
| `mode_switched`           | Cookbook→AI or vice versa   | metadata: `{fromMode, toMode, reason}`  |
| `interaction_needed`      | HITL blocker                | "reCAPTCHA detected"                    |
| `interaction_resolved`    | HITL resolved               | "Captcha solved by human"               |

### Required metadata per event:

All events should include:

```json
{
  "actor": "worker-production-1771386675208",
  "metadata": {
    "worker_id": "worker-production-1771386675208",
    "elapsed_ms": 3420,
    "step_index": 3,
    "total_steps": 8
  }
}
```

---

## 8. Summary of API Changes Requested

| Priority | Item                                         | Type            |
| -------- | -------------------------------------------- | --------------- |
| **P0**   | Include `worker_id` in all callbacks         | Callback change |
| **P0**   | Accurate cost reporting in callbacks         | Callback change |
| **P1**   | Worker deregistration endpoint               | New endpoint    |
| **P1**   | Worker registry endpoint                     | New endpoint    |
| **P1**   | Complete `gh_job_events` coverage            | Event logging   |
| **P2**   | Worker affinity modes (strict/preferred/any) | Submit param    |
| **P2**   | Screenshot URL in HITL callbacks             | Callback change |
| **P2**   | Captcha type metadata                        | Callback change |
| **P3**   | Worker lifecycle events                      | Event logging   |

---

## Questions for GhostHands Team

1. What is the current worker-to-EC2 mapping? Is there always 1 worker per EC2, or can multiple workers run on one instance?
2. When we send `target_worker_id`, how does GH determine which physical worker to use? Is there a routing table?
3. Is the `worker-production-1771386675208` naming convention stable? Can we parse the timestamp from it?
4. What happens to in-flight jobs when a worker container restarts during a deploy?
5. Can we get a webhook/callback when a worker goes offline unexpectedly?

---

_Please review and let us know your timeline for implementing these changes. P0 items are blocking our staging testing._
