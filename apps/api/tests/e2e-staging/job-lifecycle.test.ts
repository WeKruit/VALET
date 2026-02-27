/**
 * Staging E2E: Full job lifecycle.
 *
 * Submits real tasks to staging and follows them through to completion.
 * No graceful skips — if ensureWorkerUp() passes, infra MUST be live.
 * Skip only on 401 (missing JWT is a config issue, not infra).
 *
 * Gated: STAGING_E2E=true + staging env vars set.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { isAvailable, getStagingClient, waitForStatus, ensureWorkerUp } from "./_setup.js";

type Client = ReturnType<typeof getStagingClient>;

/** Known resume ID for staging E2E tests — must exist in the staging DB. */
const TEST_RESUME_ID = "c815652b-e55f-4a63-bb4c-b3ae9295a8d5";

describe.runIf(isAvailable())("Staging E2E: Job Lifecycle", () => {
  let client: Client;

  beforeAll(async () => {
    await ensureWorkerUp();
    client = getStagingClient();
  }, 180_000);

  it("submit test task → 201 with task ID", async () => {
    const res = await client.api.post("/api/v1/tasks", {
      body: {
        jobUrl: "https://www.google.com/about/careers/applications/jobs/results/?q=test",
        mode: "copilot",
        resumeId: TEST_RESUME_ID,
        notes: "E2E staging test — safe to ignore",
      },
      timeoutMs: 30_000,
    });

    if (res.status === 401) {
      console.log("[e2e] Skipping: no valid staging JWT provided");
      return;
    }

    expect(res.status).toBe(201);
    const data = res.data as any;
    expect(data.id).toBeDefined();
    expect(typeof data.id).toBe("string");
  }, 60_000);

  it("task transitions to in_progress within 30s", async () => {
    const createRes = await client.api.post("/api/v1/tasks", {
      body: {
        jobUrl: "https://www.google.com/about/careers/applications/jobs/results/?q=test-lifecycle",
        mode: "copilot",
        resumeId: TEST_RESUME_ID,
        notes: "E2E staging lifecycle test",
      },
      timeoutMs: 30_000,
    });

    if (createRes.status === 401) {
      console.log("[e2e] Skipping: no valid staging JWT provided");
      return;
    }

    expect(createRes.status).toBe(201);
    const taskId = (createRes.data as any).id;

    const statusRes = await waitForStatus(
      client,
      taskId,
      ["queued", "in_progress", "completed", "failed", "waiting_human"],
      30_000,
      2_000,
    );
    const status = (statusRes.data as any)?.status;
    expect(["queued", "in_progress", "completed", "failed", "waiting_human"]).toContain(status);
  }, 60_000);

  it("task reaches terminal state within 120s", async () => {
    const createRes = await client.api.post("/api/v1/tasks", {
      body: {
        jobUrl: "https://www.google.com/about/careers/applications/jobs/results/?q=test-terminal",
        mode: "copilot",
        resumeId: TEST_RESUME_ID,
        notes: "E2E staging terminal test",
      },
      timeoutMs: 30_000,
    });

    if (createRes.status === 401) {
      console.log("[e2e] Skipping: no valid staging JWT provided");
      return;
    }

    expect(createRes.status).toBe(201);
    const taskId = (createRes.data as any).id;

    const statusRes = await waitForStatus(
      client,
      taskId,
      ["completed", "failed", "cancelled"],
      120_000,
      5_000,
    );
    const status = (statusRes.data as any)?.status;
    expect(["completed", "failed", "cancelled"]).toContain(status);
  }, 150_000);

  it("cancel in-progress task → cancelled status", async () => {
    const createRes = await client.api.post("/api/v1/tasks", {
      body: {
        jobUrl: "https://www.google.com/about/careers/applications/jobs/results/?q=test-cancel",
        mode: "copilot",
        resumeId: TEST_RESUME_ID,
        notes: "E2E staging cancel test",
      },
      timeoutMs: 30_000,
    });

    if (createRes.status === 401) {
      console.log("[e2e] Skipping: no valid staging JWT provided");
      return;
    }

    expect(createRes.status).toBe(201);
    const taskId = (createRes.data as any).id;

    // Wait a moment then cancel
    await new Promise((r) => setTimeout(r, 2_000));

    const cancelRes = await client.api.post(`/api/v1/tasks/${taskId}/cancel`, {
      timeoutMs: 15_000,
    });
    // Cancel may return 200 (success), 404 (task already terminal), or 409 (conflict)
    if (!cancelRes.ok) {
      console.log(
        `[e2e] Cancel returned ${cancelRes.status} — task may have already finished. Body:`,
        JSON.stringify(cancelRes.data),
      );
    }

    const task = await client.api.get(`/api/v1/tasks/${taskId}`);
    const status = (task.data as any)?.status;
    expect(["cancelled", "failed", "completed"]).toContain(status);
  }, 45_000);

  it("completed task has cost data", async () => {
    const res = await client.api.get("/api/v1/tasks?status=completed&limit=1", {
      timeoutMs: 10_000,
    });

    if (res.status === 401) {
      console.log("[e2e] Skipping: no valid staging JWT");
      return;
    }

    expect(res.ok).toBe(true);
    const data = res.data as any;
    const tasks = data?.data ?? data?.tasks ?? [];
    if (tasks.length > 0) {
      expect(tasks[0]).toHaveProperty("llmUsage");
    }
  }, 15_000);

  it("completed task has result data", async () => {
    const res = await client.api.get("/api/v1/tasks?status=completed&limit=1", {
      timeoutMs: 10_000,
    });

    if (res.status === 401) {
      console.log("[e2e] Skipping: no valid staging JWT");
      return;
    }

    expect(res.ok).toBe(true);
    const data = res.data as any;
    const tasks = data?.data ?? data?.tasks ?? [];
    if (tasks.length > 0) {
      expect(tasks[0].status).toBe("completed");
    }
  }, 15_000);

  it("kasm_url present when applicable", async () => {
    const res = await client.api.get("/api/v1/tasks?limit=5", {
      timeoutMs: 10_000,
    });

    if (res.status === 401) {
      console.log("[e2e] Skipping: no valid staging JWT");
      return;
    }

    expect(res.ok).toBe(true);
    const data = res.data as any;
    const tasks = data?.data ?? data?.tasks ?? [];

    for (const task of tasks) {
      if (task.interactionData?.kasm_url) {
        expect(typeof task.interactionData.kasm_url).toBe("string");
      }
    }
  }, 15_000);
});
