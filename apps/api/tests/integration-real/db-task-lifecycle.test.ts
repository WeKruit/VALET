/**
 * Real DB integration tests for task lifecycle.
 *
 * Tests TaskRepository CRUD, status transitions, and guarded updates
 * against real Postgres.
 *
 * Gated: INTEGRATION_TEST=true + DATABASE_URL/DATABASE_DIRECT_URL set.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import {
  isAvailable,
  getDb,
  closeDb,
  createTestScope,
  insertTestUser,
  insertTestSandbox,
  testEmail,
} from "./_setup.js";

const SCOPE = "tl"; // task-lifecycle — unique per file
const { cleanup } = createTestScope(SCOPE);

let TaskRepository: any;

describe.runIf(isAvailable())("Real DB: Task Lifecycle", () => {
  // Each test gets its own fresh user to avoid cross-test interference
  let testUser: { id: string; email: string };

  beforeAll(async () => {
    const mod = await import("../../src/modules/tasks/task.repository.js");
    TaskRepository = mod.TaskRepository;
    await cleanup();
  });

  beforeEach(async () => {
    // Fresh user per test — no shared state between tests
    testUser = await insertTestUser({
      email: testEmail(crypto.randomUUID().slice(0, 8), SCOPE),
    });
  });

  afterAll(async () => {
    await cleanup();
    await closeDb();
  });

  function taskRepo() {
    return new TaskRepository({ db: getDb() });
  }

  // ── Basic CRUD ───────────────────────────────────────────────────
  it("create task → read back with all fields", async () => {
    const r = taskRepo();
    const task = await r.create({
      userId: testUser.id,
      jobUrl: "https://example.com/job/123",
      mode: "copilot",
      notes: "Test notes",
    });

    expect(task.id).toBeDefined();
    expect(task.userId).toBe(testUser.id);
    expect(task.jobUrl).toBe("https://example.com/job/123");
    expect(task.status).toBe("created");
    expect(task.mode).toBe("copilot");
    expect(task.notes).toBe("Test notes");
    expect(task.progress).toBe(0);

    const found = await r.findById(task.id, testUser.id);
    expect(found).not.toBeNull();
    expect(found!.id).toBe(task.id);
    expect(found!.jobUrl).toBe("https://example.com/job/123");
  });

  // ── Status transitions ──────────────────────────────────────────
  it("updateStatusGuarded: queued → in_progress succeeds", async () => {
    const r = taskRepo();
    const task = await r.create({ userId: testUser.id, jobUrl: "https://example.com/job" });
    await r.updateStatus(task.id, "queued");

    const updated = await r.updateStatusGuarded(task.id, "in_progress");
    expect(updated).not.toBeNull();
    expect(updated!.status).toBe("in_progress");
    expect(updated!.startedAt).not.toBeNull();
  });

  it("updateStatusGuarded: completed → in_progress returns null (terminal state)", async () => {
    const r = taskRepo();
    const task = await r.create({ userId: testUser.id, jobUrl: "https://example.com/job" });
    await r.updateStatus(task.id, "completed");

    const updated = await r.updateStatusGuarded(task.id, "in_progress");
    expect(updated).toBeNull();
  });

  it("updateStatusGuarded increments statusVersion", async () => {
    const r = taskRepo();
    const task = await r.create({ userId: testUser.id, jobUrl: "https://example.com/job" });

    const v1 = await r.updateStatusGuarded(task.id, "queued");
    expect(v1!.statusVersion).toBe(1);

    const v2 = await r.updateStatusGuarded(task.id, "in_progress");
    expect(v2!.statusVersion).toBe(2);
  });

  // ── Interaction data (HITL) ─────────────────────────────────────
  it("updateInteractionData persists + clearInteractionData removes", async () => {
    const r = taskRepo();
    const task = await r.create({ userId: testUser.id, jobUrl: "https://example.com/job" });

    await r.updateInteractionData(task.id, {
      interactionType: "captcha",
      interactionData: { captchaUrl: "https://example.com/captcha.png" },
    });

    let found = await r.findById(task.id, testUser.id);
    expect(found!.interactionType).toBe("captcha");
    expect(found!.interactionData).toEqual({ captchaUrl: "https://example.com/captcha.png" });

    await r.clearInteractionData(task.id);

    found = await r.findById(task.id, testUser.id);
    expect(found!.interactionType).toBeNull();
    expect(found!.interactionData).toBeNull();
  });

  // ── GH result + LLM usage ──────────────────────────────────────
  it("updateGhosthandsResult stores result + error JSON", async () => {
    const r = taskRepo();
    const task = await r.create({ userId: testUser.id, jobUrl: "https://example.com/job" });

    await r.updateGhosthandsResult(task.id, {
      ghJobId: "gh-job-001",
      result: { confirmationNumber: "APP-12345", screenshotUrl: "https://s3.example.com/shot.png" },
      error: null,
      completedAt: new Date().toISOString(),
    });

    const found = await r.findByIdAdmin(task.id);
    // ghJobId is stored inside the screenshots JSONB column, not workflowRunId
    expect((found!.screenshots as any).ghJobId).toBe("gh-job-001");
    expect((found!.screenshots as any).confirmationNumber).toBe("APP-12345");
  });

  it("updateLlmUsage stores cost breakdown", async () => {
    const r = taskRepo();
    const task = await r.create({ userId: testUser.id, jobUrl: "https://example.com/job" });

    await r.updateLlmUsage(task.id, {
      totalCostUsd: 0.0042,
      actionCount: 12,
      totalTokens: 8500,
      costBreakdown: [{ model: "claude-3-5-sonnet", tokens: 8500, cost: 0.0042 }],
    });

    const found = await r.findByIdAdmin(task.id);
    expect(found!.llmUsage).toBeDefined();
    expect((found!.llmUsage as any).totalCostUsd).toBe(0.0042);
  });

  // ── Lookup methods ──────────────────────────────────────────────
  it("findByWorkflowRunId resolves task from GH job ID", async () => {
    const r = taskRepo();
    const task = await r.create({ userId: testUser.id, jobUrl: "https://example.com/job" });
    await r.updateWorkflowRunId(task.id, `gh-run-${SCOPE}-${task.id.slice(0, 8)}`);

    const found = await r.findByWorkflowRunId(`gh-run-${SCOPE}-${task.id.slice(0, 8)}`);
    expect(found).not.toBeNull();
    expect(found!.id).toBe(task.id);
  });

  it("findMany returns multiple tasks for same user", async () => {
    const r = taskRepo();
    await r.create({ userId: testUser.id, jobUrl: "https://example.com/job/1" });
    await r.create({ userId: testUser.id, jobUrl: "https://example.com/job/2" });

    const { data, total } = await r.findMany(testUser.id, {});
    expect(total).toBeGreaterThanOrEqual(2);
    expect(data.length).toBeGreaterThanOrEqual(2);
  });

  // ── Sandbox-scoped queries ──────────────────────────────────────
  it("findActiveBySandbox returns only active tasks for user+sandbox", async () => {
    const r = taskRepo();
    const sandbox = await insertTestSandbox({}, SCOPE);

    await r.create({
      userId: testUser.id,
      jobUrl: "https://example.com/job/a",
      sandboxId: sandbox.id,
    });
    const t2 = await r.create({
      userId: testUser.id,
      jobUrl: "https://example.com/job/b",
      sandboxId: sandbox.id,
    });
    await r.updateStatus(t2.id, "completed");

    const active = await r.findActiveBySandbox(testUser.id, sandbox.id);
    expect(active.length).toBe(1);
    expect(active[0]!.status).toBe("created");
  });
});
