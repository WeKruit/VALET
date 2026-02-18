/**
 * P1 Integration Tests: Error & Recovery Flows
 *
 * Tests failure, cancellation, retry, WebSocket delivery, self-healing
 * reconciliation, and admin sync flows through the API layer with mocked
 * external services.
 *
 * INT-10: Failure flow (GH failed callback → task marked failed)
 * INT-11: Cancel flow (user cancels → GH cancelJob called)
 * INT-12: Retry flow (user retries failed task → GH retryJob called)
 * INT-13: WebSocket delivery (webhook triggers publishToUser → Redis publish called)
 * INT-14: Self-healing reconciliation (task terminal but GH job stale → corrected)
 * INT-15: Admin sync (syncGhJobStatus pulls from GH API → both tables updated)
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";

// ── Constants ────────────────────────────────────────────────────────────────

const GH_SERVICE_SECRET = "test-service-secret";
const TEST_USER_ID = randomUUID();

// ── Mock factories ───────────────────────────────────────────────────────────

function createMockTaskRepo() {
  return {
    create: vi.fn(),
    findById: vi.fn(),
    findByIdAdmin: vi.fn(),
    findByWorkflowRunId: vi.fn(),
    updateStatus: vi.fn(),
    updateWorkflowRunId: vi.fn(),
    updateGhosthandsResult: vi.fn(),
    updateLlmUsage: vi.fn(),
    updateProgress: vi.fn(),
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

function createMockGhSessionRepo() {
  return {
    findByUserId: vi.fn(),
    deleteByUserAndDomain: vi.fn(),
    deleteAllByUser: vi.fn(),
  };
}

function createMockRedis() {
  return {
    publish: vi.fn().mockResolvedValue(1),
  };
}

function createMockResumeRepo() {
  return { findById: vi.fn() };
}

function createMockQaBankRepo() {
  return { findByUserId: vi.fn().mockResolvedValue([]) };
}

function createMockGhClient() {
  return {
    submitApplication: vi.fn(),
    submitGenericTask: vi.fn(),
    getJobStatus: vi.fn(),
    cancelJob: vi.fn(),
    retryJob: vi.fn(),
    resumeJob: vi.fn(),
    healthCheck: vi.fn(),
    listSessions: vi.fn(),
    clearSession: vi.fn(),
    clearAllSessions: vi.fn(),
  };
}

function createMockLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    fatal: vi.fn(),
    trace: vi.fn(),
    child: vi.fn().mockReturnThis(),
    level: "silent",
    silent: vi.fn(),
  };
}

// ── Webhook test app ─────────────────────────────────────────────────────────

async function buildWebhookTestApp(mocks: {
  taskRepo: ReturnType<typeof createMockTaskRepo>;
  ghJobRepo: ReturnType<typeof createMockGhJobRepo>;
  redis: ReturnType<typeof createMockRedis>;
}): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });

  app.decorateRequest("diScope", null);
  app.addHook("onRequest", async (request) => {
    (request as any).diScope = {
      cradle: {
        taskRepo: mocks.taskRepo,
        ghJobRepo: mocks.ghJobRepo,
        redis: mocks.redis,
      },
    };
  });

  process.env.GH_SERVICE_SECRET = GH_SERVICE_SECRET;

  const { ghosthandsWebhookRoute } =
    await import("../../src/modules/ghosthands/ghosthands.webhook.js");
  await app.register(ghosthandsWebhookRoute);
  await app.ready();
  return app;
}

function webhookHeaders(secret = GH_SERVICE_SECRET): Record<string, string> {
  return {
    "content-type": "application/json",
    "x-gh-service-key": secret,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("Integration: Error & Recovery Flows (P1)", () => {
  let app: FastifyInstance;
  let taskRepo: ReturnType<typeof createMockTaskRepo>;
  let ghJobRepo: ReturnType<typeof createMockGhJobRepo>;
  let redis: ReturnType<typeof createMockRedis>;

  beforeAll(async () => {
    taskRepo = createMockTaskRepo();
    ghJobRepo = createMockGhJobRepo();
    redis = createMockRedis();
    app = await buildWebhookTestApp({ taskRepo, ghJobRepo, redis });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── INT-10: Failure flow ───────────────────────────────────────────────

  describe("INT-10: Failure flow", () => {
    it("should mark task as failed when GH sends failed callback", async () => {
      const taskId = randomUUID();
      const ghJobId = randomUUID();

      const mockTask = {
        id: taskId,
        userId: TEST_USER_ID,
        status: "failed",
        progress: 45,
        workflowRunId: ghJobId,
      };

      taskRepo.updateStatus.mockResolvedValue(mockTask);
      ghJobRepo.updateStatus.mockResolvedValue(null);

      const response = await app.inject({
        method: "POST",
        url: "/api/v1/webhooks/ghosthands",
        headers: webhookHeaders(),
        payload: {
          job_id: ghJobId,
          valet_task_id: taskId,
          status: "failed",
          error_code: "FORM_FILL_ERROR",
          error_message: "Could not find the submit button",
        },
      });

      expect(response.statusCode).toBe(200);

      // Task status updated to failed
      expect(taskRepo.updateStatus).toHaveBeenCalledWith(taskId, "failed");

      // Error stored in result
      expect(taskRepo.updateGhosthandsResult).toHaveBeenCalledWith(
        taskId,
        expect.objectContaining({
          ghJobId,
          error: {
            code: "FORM_FILL_ERROR",
            message: "Could not find the submit button",
          },
        }),
      );

      // gh_automation_jobs updated with error
      expect(ghJobRepo.updateStatus).toHaveBeenCalledWith(
        ghJobId,
        expect.objectContaining({
          status: "failed",
          errorCode: "FORM_FILL_ERROR",
        }),
      );

      // WebSocket publishes failure event
      const publishCall = redis.publish.mock.calls[0];
      expect(publishCall?.[0]).toBe(`tasks:${TEST_USER_ID}`);
      const wsPayload = JSON.parse(publishCall?.[1] as string);
      expect(wsPayload.status).toBe("failed");
      expect(wsPayload.error).toBeDefined();
      expect(wsPayload.error.code).toBe("FORM_FILL_ERROR");
    });

    it("should return 404 when task not found for update", async () => {
      const taskId = randomUUID();
      const ghJobId = randomUUID();

      taskRepo.updateStatus.mockResolvedValue(null);

      const response = await app.inject({
        method: "POST",
        url: "/api/v1/webhooks/ghosthands",
        headers: webhookHeaders(),
        payload: {
          job_id: ghJobId,
          valet_task_id: taskId,
          status: "failed",
          error_code: "TEST_ERROR",
          error_message: "test",
        },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  // ── INT-11: Cancel flow ────────────────────────────────────────────────

  describe("INT-11: Cancel flow", () => {
    it("should handle cancelled callback from GH", async () => {
      const taskId = randomUUID();
      const ghJobId = randomUUID();

      taskRepo.updateStatus.mockResolvedValue({
        id: taskId,
        userId: TEST_USER_ID,
        status: "cancelled",
        progress: 30,
        workflowRunId: ghJobId,
      });
      ghJobRepo.updateStatus.mockResolvedValue(null);

      const response = await app.inject({
        method: "POST",
        url: "/api/v1/webhooks/ghosthands",
        headers: webhookHeaders(),
        payload: {
          job_id: ghJobId,
          valet_task_id: taskId,
          status: "cancelled",
        },
      });

      expect(response.statusCode).toBe(200);
      expect(taskRepo.updateStatus).toHaveBeenCalledWith(taskId, "cancelled");

      // WebSocket publishes cancelled status
      const wsPayload = JSON.parse(redis.publish.mock.calls[0]?.[1] as string);
      expect(wsPayload.status).toBe("cancelled");
      expect(wsPayload.currentStep).toBe("Cancelled");
    });

    it("should handle user-initiated cancel via TaskService", async () => {
      const taskId = randomUUID();
      const ghJobId = randomUUID();

      // Build TaskService with mocks (unit-level but validates integration contract)
      const mockTaskRepo = createMockTaskRepo();
      const mockGhClient = createMockGhClient();
      const mockRedis = createMockRedis();
      const mockLogger = createMockLogger();

      mockTaskRepo.findById.mockResolvedValue({
        id: taskId,
        userId: TEST_USER_ID,
        status: "in_progress",
        workflowRunId: ghJobId,
      });
      mockTaskRepo.cancel.mockResolvedValue({
        id: taskId,
        userId: TEST_USER_ID,
        status: "cancelled",
      });
      mockGhClient.cancelJob.mockResolvedValue(undefined);

      const { TaskService } = await import("../../src/modules/tasks/task.service.js");
      const taskService = new TaskService({
        taskRepo: mockTaskRepo as any,
        resumeRepo: createMockResumeRepo() as any,
        qaBankRepo: createMockQaBankRepo() as any,
        ghosthandsClient: mockGhClient as any,
        ghJobRepo: createMockGhJobRepo() as any,
        ghSessionRepo: createMockGhSessionRepo() as any,
        redis: mockRedis as any,
        logger: mockLogger as any,
      });

      await taskService.cancel(taskId, TEST_USER_ID);

      expect(mockTaskRepo.cancel).toHaveBeenCalledWith(taskId);
      expect(mockGhClient.cancelJob).toHaveBeenCalledWith(ghJobId);
    });
  });

  // ── INT-12: Retry flow ─────────────────────────────────────────────────

  describe("INT-12: Retry flow", () => {
    it("should retry a failed task through TaskService", async () => {
      const taskId = randomUUID();
      const ghJobId = randomUUID();

      const mockTaskRepo = createMockTaskRepo();
      const mockGhClient = createMockGhClient();
      const mockRedis = createMockRedis();
      const mockLogger = createMockLogger();

      // findById returns a failed task
      mockTaskRepo.findById
        .mockResolvedValueOnce({
          id: taskId,
          userId: TEST_USER_ID,
          status: "failed",
          workflowRunId: ghJobId,
        })
        // Second call after retry returns queued
        .mockResolvedValueOnce({
          id: taskId,
          userId: TEST_USER_ID,
          status: "queued",
          workflowRunId: ghJobId,
        });

      mockGhClient.retryJob.mockResolvedValue(undefined);
      mockTaskRepo.updateStatus.mockResolvedValue({
        id: taskId,
        status: "queued",
      });

      const { TaskService } = await import("../../src/modules/tasks/task.service.js");
      const taskService = new TaskService({
        taskRepo: mockTaskRepo as any,
        resumeRepo: createMockResumeRepo() as any,
        qaBankRepo: createMockQaBankRepo() as any,
        ghosthandsClient: mockGhClient as any,
        ghJobRepo: createMockGhJobRepo() as any,
        ghSessionRepo: createMockGhSessionRepo() as any,
        redis: mockRedis as any,
        logger: mockLogger as any,
      });

      await taskService.retry(taskId, TEST_USER_ID);

      expect(mockGhClient.retryJob).toHaveBeenCalledWith(ghJobId);
      expect(mockTaskRepo.updateStatus).toHaveBeenCalledWith(taskId, "queued");
      expect(mockTaskRepo.updateProgress).toHaveBeenCalledWith(taskId, {
        progress: 0,
        currentStep: "Retry submitted",
      });

      // WebSocket event published for retry
      expect(mockRedis.publish).toHaveBeenCalledWith(
        `tasks:${TEST_USER_ID}`,
        expect.stringContaining('"status":"queued"'),
      );
    });

    it("should reject retry for non-failed task", async () => {
      const taskId = randomUUID();

      const mockTaskRepo = createMockTaskRepo();
      const mockGhClient = createMockGhClient();
      const mockLogger = createMockLogger();

      mockTaskRepo.findById.mockResolvedValue({
        id: taskId,
        userId: TEST_USER_ID,
        status: "in_progress",
        workflowRunId: randomUUID(),
      });

      const { TaskService } = await import("../../src/modules/tasks/task.service.js");
      const taskService = new TaskService({
        taskRepo: mockTaskRepo as any,
        resumeRepo: createMockResumeRepo() as any,
        qaBankRepo: createMockQaBankRepo() as any,
        ghosthandsClient: mockGhClient as any,
        ghJobRepo: createMockGhJobRepo() as any,
        ghSessionRepo: createMockGhSessionRepo() as any,
        redis: createMockRedis() as any,
        logger: mockLogger as any,
      });

      await expect(taskService.retry(taskId, TEST_USER_ID)).rejects.toThrow();
      expect(mockGhClient.retryJob).not.toHaveBeenCalled();
    });
  });

  // ── INT-13: WebSocket delivery ─────────────────────────────────────────

  describe("INT-13: WebSocket delivery via Redis pub/sub", () => {
    it("should publish task_update event for running callback", async () => {
      const taskId = randomUUID();
      const ghJobId = randomUUID();

      taskRepo.updateStatus.mockResolvedValue({
        id: taskId,
        userId: TEST_USER_ID,
        status: "in_progress",
        progress: 5,
        workflowRunId: ghJobId,
      });
      ghJobRepo.updateStatus.mockResolvedValue(null);

      await app.inject({
        method: "POST",
        url: "/api/v1/webhooks/ghosthands",
        headers: webhookHeaders(),
        payload: {
          job_id: ghJobId,
          valet_task_id: taskId,
          status: "running",
          result_summary: "Filling form fields",
          progress: 50,
        },
      });

      expect(redis.publish).toHaveBeenCalledTimes(1);
      const [channel, message] = redis.publish.mock.calls[0]!;
      expect(channel).toBe(`tasks:${TEST_USER_ID}`);

      const parsed = JSON.parse(message as string);
      expect(parsed.type).toBe("task_update");
      expect(parsed.taskId).toBe(taskId);
      expect(parsed.status).toBe("in_progress");
      expect(parsed.progress).toBe(50);
      expect(parsed.currentStep).toBe("Filling form fields");
    });

    it("should publish task_needs_human event for needs_human callback", async () => {
      const taskId = randomUUID();
      const ghJobId = randomUUID();

      taskRepo.updateStatus.mockResolvedValue({
        id: taskId,
        userId: TEST_USER_ID,
        status: "waiting_human",
        workflowRunId: ghJobId,
      });
      ghJobRepo.updateStatus.mockResolvedValue(null);

      await app.inject({
        method: "POST",
        url: "/api/v1/webhooks/ghosthands",
        headers: webhookHeaders(),
        payload: {
          job_id: ghJobId,
          valet_task_id: taskId,
          status: "needs_human",
          interaction: {
            type: "captcha",
            screenshot_url: "https://example.com/captcha.png",
            message: "Solve the captcha",
          },
        },
      });

      expect(redis.publish).toHaveBeenCalledTimes(1);
      const parsed = JSON.parse(redis.publish.mock.calls[0]![1] as string);
      expect(parsed.type).toBe("task_needs_human");
      expect(parsed.interaction.type).toBe("captcha");
    });

    it("should publish task_resumed event for resumed callback", async () => {
      const taskId = randomUUID();
      const ghJobId = randomUUID();

      taskRepo.updateStatus.mockResolvedValue({
        id: taskId,
        userId: TEST_USER_ID,
        status: "in_progress",
        workflowRunId: ghJobId,
      });
      ghJobRepo.updateStatus.mockResolvedValue(null);

      await app.inject({
        method: "POST",
        url: "/api/v1/webhooks/ghosthands",
        headers: webhookHeaders(),
        payload: {
          job_id: ghJobId,
          valet_task_id: taskId,
          status: "resumed",
        },
      });

      const parsed = JSON.parse(redis.publish.mock.calls[0]![1] as string);
      expect(parsed.type).toBe("task_resumed");
      expect(parsed.taskId).toBe(taskId);
    });

    it("should publish completed event with result data", async () => {
      const taskId = randomUUID();
      const ghJobId = randomUUID();

      taskRepo.updateStatus.mockResolvedValue({
        id: taskId,
        userId: TEST_USER_ID,
        status: "completed",
        progress: 100,
        workflowRunId: ghJobId,
      });
      ghJobRepo.updateStatus.mockResolvedValue(null);

      await app.inject({
        method: "POST",
        url: "/api/v1/webhooks/ghosthands",
        headers: webhookHeaders(),
        payload: {
          job_id: ghJobId,
          valet_task_id: taskId,
          status: "completed",
          result_summary: "Application submitted",
          result_data: { confirmation_id: "ABC-123" },
          completed_at: new Date().toISOString(),
        },
      });

      const parsed = JSON.parse(redis.publish.mock.calls[0]![1] as string);
      expect(parsed.type).toBe("task_update");
      expect(parsed.status).toBe("completed");
      expect(parsed.progress).toBe(100);
      expect(parsed.result).toBeDefined();
      expect(parsed.result.confirmation_id).toBe("ABC-123");
    });
  });

  // ── INT-14: Self-healing reconciliation ────────────────────────────────

  describe("INT-14: Self-healing reconciliation", () => {
    it("should correct stale GH job status when task is terminal", async () => {
      const taskId = randomUUID();
      const ghJobId = randomUUID();

      const mockTaskRepo = createMockTaskRepo();
      const mockGhJobRepo = createMockGhJobRepo();
      const mockGhClient = createMockGhClient();
      const mockLogger = createMockLogger();

      // Task is completed but GH job is still "running"
      mockTaskRepo.findById.mockResolvedValue({
        id: taskId,
        userId: TEST_USER_ID,
        status: "completed",
        workflowRunId: ghJobId,
        interactionType: null,
        interactionData: null,
      });

      // GH job shows running (stale)
      mockGhJobRepo.findById.mockResolvedValue({
        id: ghJobId,
        status: "running",
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      mockGhJobRepo.updateStatus.mockResolvedValue(null);

      const { TaskService } = await import("../../src/modules/tasks/task.service.js");
      const taskService = new TaskService({
        taskRepo: mockTaskRepo as any,
        resumeRepo: createMockResumeRepo() as any,
        qaBankRepo: createMockQaBankRepo() as any,
        ghosthandsClient: mockGhClient as any,
        ghJobRepo: mockGhJobRepo as any,
        ghSessionRepo: createMockGhSessionRepo() as any,
        redis: createMockRedis() as any,
        logger: mockLogger as any,
      });

      const result = await taskService.getById(taskId, TEST_USER_ID);

      // GH job should have been reconciled to "completed"
      expect(mockGhJobRepo.updateStatus).toHaveBeenCalledWith(
        ghJobId,
        expect.objectContaining({
          status: "completed",
          statusMessage: "Reconciled: task was completed",
        }),
      );

      // Result should show corrected GH status
      expect(result.ghJob?.ghStatus).toBe("completed");
    });

    it("should not reconcile when GH job is already in correct terminal state", async () => {
      const taskId = randomUUID();
      const ghJobId = randomUUID();

      const mockTaskRepo = createMockTaskRepo();
      const mockGhJobRepo = createMockGhJobRepo();
      const mockLogger = createMockLogger();

      mockTaskRepo.findById.mockResolvedValue({
        id: taskId,
        userId: TEST_USER_ID,
        status: "completed",
        workflowRunId: ghJobId,
        interactionType: null,
        interactionData: null,
      });

      // GH job already shows completed (in sync)
      mockGhJobRepo.findById.mockResolvedValue({
        id: ghJobId,
        status: "completed",
        createdAt: new Date(),
        updatedAt: new Date(),
        completedAt: new Date(),
      });

      const { TaskService } = await import("../../src/modules/tasks/task.service.js");
      const taskService = new TaskService({
        taskRepo: mockTaskRepo as any,
        resumeRepo: createMockResumeRepo() as any,
        qaBankRepo: createMockQaBankRepo() as any,
        ghosthandsClient: createMockGhClient() as any,
        ghJobRepo: mockGhJobRepo as any,
        ghSessionRepo: createMockGhSessionRepo() as any,
        redis: createMockRedis() as any,
        logger: mockLogger as any,
      });

      await taskService.getById(taskId, TEST_USER_ID);

      // No reconciliation needed — updateStatus should NOT be called
      expect(mockGhJobRepo.updateStatus).not.toHaveBeenCalled();
    });
  });

  // ── INT-15: Admin sync ─────────────────────────────────────────────────

  describe("INT-15: Admin syncGhJobStatus", () => {
    it("should sync task and GH job status from GH API", async () => {
      const taskId = randomUUID();
      const ghJobId = randomUUID();

      const mockTaskRepo = createMockTaskRepo();
      const mockGhJobRepo = createMockGhJobRepo();
      const mockGhClient = createMockGhClient();
      const mockLogger = createMockLogger();

      // Task is in_progress but GH API says completed
      mockTaskRepo.findByIdAdmin.mockResolvedValue({
        id: taskId,
        userId: TEST_USER_ID,
        status: "in_progress",
        workflowRunId: ghJobId,
      });

      const completedAt = new Date().toISOString();
      mockGhClient.getJobStatus.mockResolvedValue({
        job_id: ghJobId,
        valet_task_id: taskId,
        status: "completed",
        status_message: "Application submitted",
        result: { confirmation_id: "CONF-999" },
        error: null,
        timestamps: {
          created_at: new Date(Date.now() - 60000).toISOString(),
          started_at: new Date(Date.now() - 30000).toISOString(),
          completed_at: completedAt,
        },
      });

      mockTaskRepo.updateStatus.mockResolvedValue({
        id: taskId,
        status: "completed",
      });

      // GH job in local DB still shows running
      mockGhJobRepo.findById.mockResolvedValue({
        id: ghJobId,
        status: "running",
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      mockGhJobRepo.updateStatus.mockResolvedValue(null);

      const { TaskService } = await import("../../src/modules/tasks/task.service.js");
      const taskService = new TaskService({
        taskRepo: mockTaskRepo as any,
        resumeRepo: createMockResumeRepo() as any,
        qaBankRepo: createMockQaBankRepo() as any,
        ghosthandsClient: mockGhClient as any,
        ghJobRepo: mockGhJobRepo as any,
        ghSessionRepo: createMockGhSessionRepo() as any,
        redis: createMockRedis() as any,
        logger: mockLogger as any,
      });

      const result = await taskService.syncGhJobStatus(taskId);

      // Task should have been updated to completed
      expect(result.taskUpdated).toBe(true);
      expect(result.newTaskStatus).toBe("completed");
      expect(result.previousTaskStatus).toBe("in_progress");

      // GH job should have been updated
      expect(result.ghJobUpdated).toBe(true);
      expect(result.ghApiStatus).toBe("completed");

      // Verify actual calls
      expect(mockTaskRepo.updateStatus).toHaveBeenCalledWith(taskId, "completed");
      expect(mockTaskRepo.updateGhosthandsResult).toHaveBeenCalledWith(
        taskId,
        expect.objectContaining({
          ghJobId,
          result: expect.objectContaining({ confirmation_id: "CONF-999" }),
        }),
      );
      expect(mockGhJobRepo.updateStatus).toHaveBeenCalledWith(
        ghJobId,
        expect.objectContaining({
          status: "completed",
        }),
      );
    });

    it("should report already in sync when statuses match", async () => {
      const taskId = randomUUID();
      const ghJobId = randomUUID();

      const mockTaskRepo = createMockTaskRepo();
      const mockGhJobRepo = createMockGhJobRepo();
      const mockGhClient = createMockGhClient();
      const mockLogger = createMockLogger();

      mockTaskRepo.findByIdAdmin.mockResolvedValue({
        id: taskId,
        userId: TEST_USER_ID,
        status: "completed",
        workflowRunId: ghJobId,
      });

      mockGhClient.getJobStatus.mockResolvedValue({
        job_id: ghJobId,
        valet_task_id: taskId,
        status: "completed",
        timestamps: {
          created_at: new Date().toISOString(),
          completed_at: new Date().toISOString(),
        },
      });

      mockGhJobRepo.findById.mockResolvedValue({
        id: ghJobId,
        status: "completed",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const { TaskService } = await import("../../src/modules/tasks/task.service.js");
      const taskService = new TaskService({
        taskRepo: mockTaskRepo as any,
        resumeRepo: createMockResumeRepo() as any,
        qaBankRepo: createMockQaBankRepo() as any,
        ghosthandsClient: mockGhClient as any,
        ghJobRepo: mockGhJobRepo as any,
        ghSessionRepo: createMockGhSessionRepo() as any,
        redis: createMockRedis() as any,
        logger: mockLogger as any,
      });

      const result = await taskService.syncGhJobStatus(taskId);

      expect(result.taskUpdated).toBe(false);
      expect(result.ghJobUpdated).toBe(false);
      expect(result.message).toBe("Already in sync");
    });

    it("should handle task not found", async () => {
      const taskId = randomUUID();

      const mockTaskRepo = createMockTaskRepo();
      const mockLogger = createMockLogger();

      mockTaskRepo.findByIdAdmin.mockResolvedValue(null);

      const { TaskService } = await import("../../src/modules/tasks/task.service.js");
      const taskService = new TaskService({
        taskRepo: mockTaskRepo as any,
        resumeRepo: createMockResumeRepo() as any,
        qaBankRepo: createMockQaBankRepo() as any,
        ghosthandsClient: createMockGhClient() as any,
        ghJobRepo: createMockGhJobRepo() as any,
        ghSessionRepo: createMockGhSessionRepo() as any,
        redis: createMockRedis() as any,
        logger: mockLogger as any,
      });

      const result = await taskService.syncGhJobStatus(taskId);
      expect(result.error).toBe("Task not found");
    });

    it("should handle task with no GH job linked", async () => {
      const taskId = randomUUID();

      const mockTaskRepo = createMockTaskRepo();
      const mockLogger = createMockLogger();

      mockTaskRepo.findByIdAdmin.mockResolvedValue({
        id: taskId,
        userId: TEST_USER_ID,
        status: "created",
        workflowRunId: null,
      });

      const { TaskService } = await import("../../src/modules/tasks/task.service.js");
      const taskService = new TaskService({
        taskRepo: mockTaskRepo as any,
        resumeRepo: createMockResumeRepo() as any,
        qaBankRepo: createMockQaBankRepo() as any,
        ghosthandsClient: createMockGhClient() as any,
        ghJobRepo: createMockGhJobRepo() as any,
        ghSessionRepo: createMockGhSessionRepo() as any,
        redis: createMockRedis() as any,
        logger: mockLogger as any,
      });

      const result = await taskService.syncGhJobStatus(taskId);
      expect(result.error).toBe("No GhostHands job linked");
    });

    it("should handle GH API failure gracefully", async () => {
      const taskId = randomUUID();
      const ghJobId = randomUUID();

      const mockTaskRepo = createMockTaskRepo();
      const mockGhClient = createMockGhClient();
      const mockLogger = createMockLogger();

      mockTaskRepo.findByIdAdmin.mockResolvedValue({
        id: taskId,
        userId: TEST_USER_ID,
        status: "in_progress",
        workflowRunId: ghJobId,
      });

      mockGhClient.getJobStatus.mockRejectedValue(new Error("GH API timeout"));

      const { TaskService } = await import("../../src/modules/tasks/task.service.js");
      const taskService = new TaskService({
        taskRepo: mockTaskRepo as any,
        resumeRepo: createMockResumeRepo() as any,
        qaBankRepo: createMockQaBankRepo() as any,
        ghosthandsClient: mockGhClient as any,
        ghJobRepo: createMockGhJobRepo() as any,
        ghSessionRepo: createMockGhSessionRepo() as any,
        redis: createMockRedis() as any,
        logger: mockLogger as any,
      });

      const result = await taskService.syncGhJobStatus(taskId);
      expect(result.error).toBe("Failed to fetch GH status");
    });
  });

  // ── GH job sync resilience ─────────────────────────────────────────────

  describe("GH job sync resilience", () => {
    it("should retry once if gh_automation_jobs sync fails", async () => {
      const taskId = randomUUID();
      const ghJobId = randomUUID();

      taskRepo.updateStatus.mockResolvedValue({
        id: taskId,
        userId: TEST_USER_ID,
        status: "completed",
        progress: 100,
        workflowRunId: ghJobId,
      });

      // First call fails, second succeeds
      ghJobRepo.updateStatus
        .mockRejectedValueOnce(new Error("DB connection error"))
        .mockResolvedValueOnce(null);

      const response = await app.inject({
        method: "POST",
        url: "/api/v1/webhooks/ghosthands",
        headers: webhookHeaders(),
        payload: {
          job_id: ghJobId,
          valet_task_id: taskId,
          status: "completed",
          result_summary: "Done",
          completed_at: new Date().toISOString(),
        },
      });

      expect(response.statusCode).toBe(200);
      // ghJobRepo.updateStatus called twice (first fails, retry succeeds)
      expect(ghJobRepo.updateStatus).toHaveBeenCalledTimes(2);
    });

    it("should still return 200 if gh_automation_jobs sync fails permanently", async () => {
      const taskId = randomUUID();
      const ghJobId = randomUUID();

      taskRepo.updateStatus.mockResolvedValue({
        id: taskId,
        userId: TEST_USER_ID,
        status: "completed",
        progress: 100,
        workflowRunId: ghJobId,
      });

      // Both attempts fail
      ghJobRepo.updateStatus.mockRejectedValue(new Error("Permanent DB failure"));

      const response = await app.inject({
        method: "POST",
        url: "/api/v1/webhooks/ghosthands",
        headers: webhookHeaders(),
        payload: {
          job_id: ghJobId,
          valet_task_id: taskId,
          status: "completed",
          result_summary: "Done",
          completed_at: new Date().toISOString(),
        },
      });

      // Webhook should still succeed (gh_automation_jobs sync is non-critical)
      expect(response.statusCode).toBe(200);
    });
  });
});
