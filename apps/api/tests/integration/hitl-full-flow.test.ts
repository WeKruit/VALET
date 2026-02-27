/**
 * Integration Tests: HITL Full Lifecycle
 *
 * Tests the complete Human-In-The-Loop round-trip:
 * needs_human → waiting_human → resolveBlocker → resumed → completed
 *
 * Uses Fastify test app with real webhook route + mocked TaskService for resolve path.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";

const GH_SERVICE_SECRET = "test-service-secret-hitl";
const TEST_USER_ID = randomUUID();

// ── Mock factories ───────────────────────────────────────────────────────────

function createMockTaskRepo() {
  return {
    create: vi.fn(),
    findById: vi.fn(),
    findByIdAdmin: vi.fn(),
    findByWorkflowRunId: vi.fn(),
    updateStatus: vi.fn(),
    updateStatusGuarded: vi.fn(),
    updateWorkflowRunId: vi.fn(),
    updateGhosthandsResult: vi.fn(),
    updateLlmUsage: vi.fn(),
    updateInteractionData: vi.fn(),
    clearInteractionData: vi.fn(),
    cancel: vi.fn(),
    findMany: vi.fn(),
    findAllForExport: vi.fn(),
    updateExternalStatus: vi.fn(),
    getStats: vi.fn(),
    findStuckJobs: vi.fn(),
    findManyAdmin: vi.fn(),
    findActiveBySandbox: vi.fn(),
    findRecentBySandbox: vi.fn(),
  };
}

function createMockGhJobRepo() {
  return {
    findById: vi.fn(),
    findByValetTaskId: vi.fn(),
    updateStatus: vi.fn(),
    findStuckJobs: vi.fn(),
  };
}

function createMockRedis() {
  return {
    publish: vi.fn().mockResolvedValue(1),
    xadd: vi.fn().mockResolvedValue("1-0"),
    expire: vi.fn().mockResolvedValue(1),
  };
}

function createMockSandboxRepo() {
  return {
    findById: vi.fn(),
  };
}

async function buildTestApp(mocks: {
  taskRepo: ReturnType<typeof createMockTaskRepo>;
  ghJobRepo: ReturnType<typeof createMockGhJobRepo>;
  redis: ReturnType<typeof createMockRedis>;
  sandboxRepo: ReturnType<typeof createMockSandboxRepo>;
}): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });

  app.decorateRequest("diScope", null);
  app.addHook("onRequest", async (request) => {
    (request as any).diScope = {
      cradle: {
        taskRepo: mocks.taskRepo,
        ghJobRepo: mocks.ghJobRepo,
        redis: mocks.redis,
        sandboxRepo: mocks.sandboxRepo,
        kasmClient: null,
      },
    };
  });

  const { ghosthandsWebhookRoute } =
    await import("../../src/modules/ghosthands/ghosthands.webhook.js");

  process.env.GH_SERVICE_SECRET = GH_SERVICE_SECRET;
  await app.register(ghosthandsWebhookRoute);
  await app.ready();
  return app;
}

function makeHeaders(): Record<string, string> {
  return {
    "content-type": "application/json",
    "x-gh-service-key": GH_SERVICE_SECRET,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("Integration: HITL Full Lifecycle", () => {
  let app: FastifyInstance;
  let taskRepo: ReturnType<typeof createMockTaskRepo>;
  let ghJobRepo: ReturnType<typeof createMockGhJobRepo>;
  let redis: ReturnType<typeof createMockRedis>;
  let sandboxRepo: ReturnType<typeof createMockSandboxRepo>;

  beforeAll(async () => {
    taskRepo = createMockTaskRepo();
    ghJobRepo = createMockGhJobRepo();
    redis = createMockRedis();
    sandboxRepo = createMockSandboxRepo();
    app = await buildTestApp({ taskRepo, ghJobRepo, redis, sandboxRepo });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("HITL-01: needs_human → waiting_human → WS event with VNC URL", async () => {
    const taskId = randomUUID();
    const ghJobId = randomUUID();

    taskRepo.updateStatusGuarded.mockResolvedValue({
      id: taskId,
      userId: TEST_USER_ID,
      status: "waiting_human",
      workflowRunId: ghJobId,
      sandboxId: "sb-1",
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/webhooks/ghosthands",
      headers: makeHeaders(),
      payload: {
        job_id: ghJobId,
        valet_task_id: taskId,
        status: "needs_human",
        kasm_url: "https://10.0.0.1:6901",
        interaction: {
          type: "captcha",
          message: "Please solve the CAPTCHA",
          screenshot_url: "https://storage.example.com/captcha.png",
          page_url: "https://workday.com/login",
          timeout_seconds: 300,
        },
      },
    });

    expect(response.statusCode).toBe(200);

    // Task status set to waiting_human
    expect(taskRepo.updateStatusGuarded).toHaveBeenCalledWith(taskId, "waiting_human");

    // Interaction data persisted
    expect(taskRepo.updateInteractionData).toHaveBeenCalledWith(taskId, {
      interactionType: "captcha",
      interactionData: expect.objectContaining({
        type: "captcha",
        message: "Please solve the CAPTCHA",
        paused_at: expect.any(String),
      }),
    });

    // WebSocket event includes VNC URL
    const wsPayload = JSON.parse(redis.publish.mock.calls[0]?.[1] as string);
    expect(wsPayload.type).toBe("task_needs_human");
    expect(wsPayload.vncUrl).toBe("https://10.0.0.1:6901");
    expect(wsPayload.interaction.type).toBe("captcha");
    expect(wsPayload.interaction.screenshotUrl).toBe("https://storage.example.com/captcha.png");
  });

  it("HITL-02: resolveBlocker → resumeJob called with resolution_data (unit test via TaskService)", async () => {
    // This test validates the resolveBlocker method directly
    const { TaskService } = await import("../../src/modules/tasks/task.service.js");

    const mockDeps = {
      taskRepo: {
        findById: vi.fn().mockResolvedValue({
          id: "task-1",
          userId: "user-1",
          status: "waiting_human",
          workflowRunId: "gh-job-1",
        }),
      },
      ghosthandsClient: {
        resumeJob: vi.fn().mockResolvedValue({ success: true }),
      },
      resumeRepo: {},
      qaBankRepo: {},
      ghJobRepo: {},
      ghJobEventRepo: {},
      ghSessionRepo: {},
      taskQueueService: { isAvailable: false },
      redis: { publish: vi.fn() },
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
      sandboxRepo: {},
      userSandboxRepo: {},
    };

    const taskService = new TaskService(mockDeps as never);

    const result = await taskService.resolveBlocker(
      "task-1",
      "user-1",
      "admin@example.com",
      "Solved CAPTCHA manually",
      "manual",
      { captcha_token: "abc123" },
    );

    expect(result.message).toBe("Resume request sent to GhostHands");
    expect(mockDeps.ghosthandsClient.resumeJob).toHaveBeenCalledWith("gh-job-1", {
      resolved_by: "admin@example.com",
      notes: "Solved CAPTCHA manually",
      resolution_type: "manual",
      resolution_data: { captcha_token: "abc123" },
    });
  });

  it("HITL-03: resumed callback → in_progress → interaction cleared", async () => {
    const taskId = randomUUID();
    const ghJobId = randomUUID();

    taskRepo.updateStatusGuarded.mockResolvedValue({
      id: taskId,
      userId: TEST_USER_ID,
      status: "in_progress",
      workflowRunId: ghJobId,
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/webhooks/ghosthands",
      headers: makeHeaders(),
      payload: {
        job_id: ghJobId,
        valet_task_id: taskId,
        status: "resumed",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(taskRepo.updateStatusGuarded).toHaveBeenCalledWith(taskId, "in_progress");
    expect(taskRepo.clearInteractionData).toHaveBeenCalledWith(taskId);

    // GH job should also clear interaction data
    expect(ghJobRepo.updateStatus).toHaveBeenCalledWith(
      ghJobId,
      expect.objectContaining({
        interactionType: null,
        interactionData: null,
        pausedAt: null,
      }),
    );

    // WebSocket publishes task_resumed
    const wsPayload = JSON.parse(redis.publish.mock.calls[0]?.[1] as string);
    expect(wsPayload.type).toBe("task_resumed");
  });

  it("HITL-04: Full sequence: needs_human → resolve → resumed → completed", async () => {
    const taskId = randomUUID();
    const ghJobId = randomUUID();

    // Step 1: needs_human callback
    taskRepo.updateStatusGuarded.mockResolvedValue({
      id: taskId,
      userId: TEST_USER_ID,
      status: "waiting_human",
      workflowRunId: ghJobId,
    });

    const needsHumanRes = await app.inject({
      method: "POST",
      url: "/api/v1/webhooks/ghosthands",
      headers: makeHeaders(),
      payload: {
        job_id: ghJobId,
        valet_task_id: taskId,
        status: "needs_human",
        interaction: { type: "2fa", message: "Enter code" },
      },
    });
    expect(needsHumanRes.statusCode).toBe(200);

    vi.clearAllMocks();

    // Step 2: resumed callback (after user resolves blocker)
    taskRepo.updateStatusGuarded.mockResolvedValue({
      id: taskId,
      userId: TEST_USER_ID,
      status: "in_progress",
      workflowRunId: ghJobId,
    });

    const resumedRes = await app.inject({
      method: "POST",
      url: "/api/v1/webhooks/ghosthands",
      headers: makeHeaders(),
      payload: {
        job_id: ghJobId,
        valet_task_id: taskId,
        status: "resumed",
      },
    });
    expect(resumedRes.statusCode).toBe(200);
    expect(taskRepo.clearInteractionData).toHaveBeenCalledWith(taskId);

    vi.clearAllMocks();

    // Step 3: completed callback
    taskRepo.updateStatusGuarded.mockResolvedValue({
      id: taskId,
      userId: TEST_USER_ID,
      status: "completed",
      workflowRunId: ghJobId,
    });

    const completedRes = await app.inject({
      method: "POST",
      url: "/api/v1/webhooks/ghosthands",
      headers: makeHeaders(),
      payload: {
        job_id: ghJobId,
        valet_task_id: taskId,
        status: "completed",
        result_summary: "Application submitted after 2FA",
        completed_at: new Date().toISOString(),
      },
    });
    expect(completedRes.statusCode).toBe(200);
    expect(taskRepo.updateStatusGuarded).toHaveBeenCalledWith(taskId, "completed");
  });

  it("HITL-05: Interaction type mapping (2fa → two_factor, login → login_required)", async () => {
    const mappings = [
      { ghType: "2fa", valetType: "two_factor" },
      { ghType: "login", valetType: "login_required" },
      { ghType: "bot_check", valetType: "bot_check" },
      { ghType: "rate_limited", valetType: "rate_limited" },
      { ghType: "rate_limit", valetType: "rate_limited" },
      { ghType: "verification", valetType: "verification" },
      { ghType: "visual_verification", valetType: "verification" },
    ];

    for (const { ghType, valetType } of mappings) {
      vi.clearAllMocks();

      const taskId = randomUUID();
      const ghJobId = randomUUID();

      taskRepo.updateStatusGuarded.mockResolvedValue({
        id: taskId,
        userId: TEST_USER_ID,
        status: "waiting_human",
        workflowRunId: ghJobId,
      });

      await app.inject({
        method: "POST",
        url: "/api/v1/webhooks/ghosthands",
        headers: makeHeaders(),
        payload: {
          job_id: ghJobId,
          valet_task_id: taskId,
          status: "needs_human",
          interaction: { type: ghType, message: "Test" },
        },
      });

      expect(taskRepo.updateInteractionData).toHaveBeenCalledWith(
        taskId,
        expect.objectContaining({
          interactionType: valetType,
        }),
      );
    }
  });

  it("HITL-06: resolveBlocker rejects when task not in waiting_human", async () => {
    const { TaskService } = await import("../../src/modules/tasks/task.service.js");
    const { TaskNotResolvableError } = await import("../../src/modules/tasks/task.errors.js");

    const mockDeps = {
      taskRepo: {
        findById: vi.fn().mockResolvedValue({
          id: "task-1",
          userId: "user-1",
          status: "in_progress", // NOT waiting_human
          workflowRunId: "gh-job-1",
        }),
      },
      ghosthandsClient: { resumeJob: vi.fn() },
      resumeRepo: {},
      qaBankRepo: {},
      ghJobRepo: {},
      ghJobEventRepo: {},
      ghSessionRepo: {},
      taskQueueService: { isAvailable: false },
      redis: { publish: vi.fn() },
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
      sandboxRepo: {},
      userSandboxRepo: {},
    };

    const taskService = new TaskService(mockDeps as never);

    await expect(taskService.resolveBlocker("task-1", "user-1")).rejects.toThrow(
      TaskNotResolvableError,
    );

    // resumeJob should NOT be called
    expect(mockDeps.ghosthandsClient.resumeJob).not.toHaveBeenCalled();
  });

  it("HITL-07: resolveBlocker rejects when task has no workflowRunId", async () => {
    const { TaskService } = await import("../../src/modules/tasks/task.service.js");
    const { TaskNotResolvableError } = await import("../../src/modules/tasks/task.errors.js");

    const mockDeps = {
      taskRepo: {
        findById: vi.fn().mockResolvedValue({
          id: "task-1",
          userId: "user-1",
          status: "waiting_human",
          workflowRunId: null, // No GH job
        }),
      },
      ghosthandsClient: { resumeJob: vi.fn() },
      resumeRepo: {},
      qaBankRepo: {},
      ghJobRepo: {},
      ghJobEventRepo: {},
      ghSessionRepo: {},
      taskQueueService: { isAvailable: false },
      redis: { publish: vi.fn() },
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
      sandboxRepo: {},
      userSandboxRepo: {},
    };

    const taskService = new TaskService(mockDeps as never);

    await expect(taskService.resolveBlocker("task-1", "user-1")).rejects.toThrow(
      TaskNotResolvableError,
    );

    expect(mockDeps.ghosthandsClient.resumeJob).not.toHaveBeenCalled();
  });
});
