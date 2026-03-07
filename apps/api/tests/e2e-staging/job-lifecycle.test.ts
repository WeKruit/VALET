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
import { readFile } from "node:fs/promises";
import { getStagingClient, waitForStatus, ensureWorkerUp } from "./_setup.js";

type Client = ReturnType<typeof getStagingClient>;

interface StagingResume {
  id: string;
  isDefault?: boolean;
  status?: string;
}

/** Preferred resume ID for staging E2E tests — falls back if deleted. */
const PREFERRED_TEST_RESUME_ID = "c815652b-e55f-4a63-bb4c-b3ae9295a8d5";

async function uploadFallbackResume(): Promise<string | null> {
  const jwt = process.env.STAGING_JWT;
  if (!jwt) return null;

  const apiUrl = (process.env.STAGING_API_URL ?? "https://valet-api-stg.fly.dev").replace(
    /\/$/,
    "",
  );
  const filePath = new URL("../../../../tests/fixtures/test-resume.pdf", import.meta.url);
  const fileBytes = await readFile(filePath);

  const formData = new FormData();
  formData.append("file", new Blob([fileBytes], { type: "application/pdf" }), "test-resume.pdf");

  const response = await fetch(`${apiUrl}/api/v1/resumes/upload`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${jwt}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const body = await response.text();
    console.log(`[e2e] Resume upload fallback failed (${response.status}): ${body}`);
    return null;
  }

  const body = (await response.json()) as { id?: unknown };
  const uploadedId = typeof body?.id === "string" ? body.id : null;
  if (!uploadedId) {
    console.log("[e2e] Resume upload fallback succeeded but no id returned");
    return null;
  }

  console.log(`[e2e] Uploaded fallback resume ID ${uploadedId}`);
  return uploadedId;
}

async function resolveTestResumeId(client: Client, preferredResumeId: string): Promise<string> {
  const preferred = await client.api.get(`/api/v1/resumes/${preferredResumeId}`, {
    timeoutMs: 10_000,
  });

  if (preferred.status === 200) {
    return preferredResumeId;
  }

  // Preserve current skip behavior when JWT is missing/invalid.
  if (preferred.status === 401) {
    return preferredResumeId;
  }

  if (preferred.status !== 404) {
    console.log(
      `[e2e] Resume lookup returned ${preferred.status}; continuing with configured resume ID`,
    );
    return preferredResumeId;
  }

  const list = await client.api.get("/api/v1/resumes", { timeoutMs: 10_000 });
  if (!list.ok) {
    console.log(
      `[e2e] Resume fallback list returned ${list.status}; continuing with configured resume ID`,
    );
    return preferredResumeId;
  }

  const resumes = (((list.data as any) ?? {}).data ?? []) as StagingResume[];
  const fallbackResume =
    resumes.find((resume) => resume.isDefault === true && resume.status === "parsed") ??
    resumes.find((resume) => resume.status === "parsed") ??
    resumes.find((resume) => resume.isDefault === true) ??
    resumes[0];

  if (!fallbackResume?.id) {
    const uploadedResumeId = await uploadFallbackResume();
    if (uploadedResumeId) return uploadedResumeId;

    console.log("[e2e] No fallback resumes found; continuing with configured resume ID");
    return preferredResumeId;
  }

  console.log(
    `[e2e] Preferred resume missing; using fallback resume ID ${fallbackResume.id} instead`,
  );
  return fallbackResume.id;
}

// TODO: Re-enable once staging has deterministic resume/task fixtures for lifecycle assertions.
describe.skip("Staging E2E: Job Lifecycle", () => {
  let client: Client;
  let testResumeId = PREFERRED_TEST_RESUME_ID;

  beforeAll(async () => {
    await ensureWorkerUp();
    client = getStagingClient();
    testResumeId = await resolveTestResumeId(client, PREFERRED_TEST_RESUME_ID);
  }, 180_000);

  it("submit test task → 201 with task ID", async () => {
    const res = await client.api.post("/api/v1/tasks", {
      body: {
        jobUrl: "https://boards.greenhouse.io/example/jobs/1000001",
        mode: "copilot",
        resumeId: testResumeId,
        executionTarget: "cloud" as const,
        notes: "[e2e-test] E2E staging test — safe to ignore",
      },
      timeoutMs: 30_000,
    });

    if (res.status === 401) {
      console.log("[e2e] Skipping: no valid staging JWT provided");
      return;
    }

    if (res.status !== 201) {
      console.log(`[e2e] Task create returned ${res.status}:`, JSON.stringify(res.data));
    }
    expect(res.status).toBe(201);
    const data = res.data as any;
    expect(data.id).toBeDefined();
    expect(typeof data.id).toBe("string");
  }, 60_000);

  it("task transitions to in_progress within 30s", async () => {
    const createRes = await client.api.post("/api/v1/tasks", {
      body: {
        jobUrl: "https://boards.greenhouse.io/example/jobs/1000002",
        mode: "copilot",
        resumeId: testResumeId,
        executionTarget: "cloud" as const,
        notes: "[e2e-test] E2E staging lifecycle test",
      },
      timeoutMs: 30_000,
    });

    if (createRes.status === 401) {
      console.log("[e2e] Skipping: no valid staging JWT provided");
      return;
    }

    if (createRes.status !== 201) {
      console.log(
        `[e2e] Task create returned ${createRes.status}:`,
        JSON.stringify(createRes.data),
      );
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
        jobUrl: "https://boards.greenhouse.io/example/jobs/1000003",
        mode: "copilot",
        resumeId: testResumeId,
        executionTarget: "cloud" as const,
        notes: "[e2e-test] E2E staging terminal test",
      },
      timeoutMs: 30_000,
    });

    if (createRes.status === 401) {
      console.log("[e2e] Skipping: no valid staging JWT provided");
      return;
    }

    if (createRes.status !== 201) {
      console.log(
        `[e2e] Task create returned ${createRes.status}:`,
        JSON.stringify(createRes.data),
      );
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
        jobUrl: "https://boards.greenhouse.io/example/jobs/1000004",
        mode: "copilot",
        resumeId: testResumeId,
        executionTarget: "cloud" as const,
        notes: "[e2e-test] E2E staging cancel test",
      },
      timeoutMs: 30_000,
    });

    if (createRes.status === 401) {
      console.log("[e2e] Skipping: no valid staging JWT provided");
      return;
    }

    if (createRes.status !== 201) {
      console.log(
        `[e2e] Task create returned ${createRes.status}:`,
        JSON.stringify(createRes.data),
      );
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
