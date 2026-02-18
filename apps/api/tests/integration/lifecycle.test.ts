/**
 * P0 Integration Tests: Application Lifecycle
 *
 * Tests the full flow through the API layer with mocked external services.
 * Pattern: Build a test Fastify app with real middleware but mocked DI services.
 *
 * INT-01: Full application lifecycle (create → running → completed)
 * INT-02: HITL flow (needs_human → waiting_human → resolve → resumed)
 * INT-03: Cost tracking (callback with cost data → llmUsage populated)
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

function createMockRedis() {
  return {
    publish: vi.fn().mockResolvedValue(1),
  };
}

// ── Test app builder ─────────────────────────────────────────────────────────

async function buildIntegrationTestApp(mocks: {
  taskRepo: ReturnType<typeof createMockTaskRepo>;
  ghJobRepo: ReturnType<typeof createMockGhJobRepo>;
  redis: ReturnType<typeof createMockRedis>;
}): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });

  // Decorate request with diScope to mimic awilix DI container
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

  // Import and register the actual webhook route
  const { ghosthandsWebhookRoute } =
    await import("../../src/modules/ghosthands/ghosthands.webhook.js");

  // Set env for the webhook handler
  process.env.GH_SERVICE_SECRET = GH_SERVICE_SECRET;

  await app.register(ghosthandsWebhookRoute);
  await app.ready();
  return app;
}

function makeWebhookHeaders(secret = GH_SERVICE_SECRET): Record<string, string> {
  return {
    "content-type": "application/json",
    "x-gh-service-key": secret,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("Integration: Application Lifecycle (P0)", () => {
  let app: FastifyInstance;
  let taskRepo: ReturnType<typeof createMockTaskRepo>;
  let ghJobRepo: ReturnType<typeof createMockGhJobRepo>;
  let redis: ReturnType<typeof createMockRedis>;

  beforeAll(async () => {
    taskRepo = createMockTaskRepo();
    ghJobRepo = createMockGhJobRepo();
    redis = createMockRedis();
    app = await buildIntegrationTestApp({ taskRepo, ghJobRepo, redis });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── INT-01: Full application lifecycle ─────────────────────────────────

  describe("INT-01: Full application lifecycle", () => {
    const taskId = randomUUID();
    const ghJobId = randomUUID();

    it("should process running callback and transition task to in_progress", async () => {
      const mockTask = {
        id: taskId,
        userId: TEST_USER_ID,
        status: "queued",
        progress: 0,
        workflowRunId: ghJobId,
      };

      taskRepo.updateStatus.mockResolvedValue(mockTask);
      ghJobRepo.updateStatus.mockResolvedValue(null);

      const response = await app.inject({
        method: "POST",
        url: "/api/v1/webhooks/ghosthands",
        headers: makeWebhookHeaders(),
        payload: {
          job_id: ghJobId,
          valet_task_id: taskId,
          status: "running",
          result_summary: "Navigating to application page",
          progress: 10,
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ received: true });

      // Verify task was updated to in_progress
      expect(taskRepo.updateStatus).toHaveBeenCalledWith(taskId, "in_progress");

      // Verify progress was persisted
      expect(taskRepo.updateProgress).toHaveBeenCalledWith(taskId, {
        progress: 10,
        currentStep: "Navigating to application page",
      });

      // Verify gh_automation_jobs was synced
      expect(ghJobRepo.updateStatus).toHaveBeenCalledWith(
        ghJobId,
        expect.objectContaining({
          status: "running",
        }),
      );

      // Verify WebSocket event was published
      expect(redis.publish).toHaveBeenCalledWith(
        `tasks:${TEST_USER_ID}`,
        expect.stringContaining('"type":"task_update"'),
      );
    });

    it("should process completed callback and transition task to completed", async () => {
      const mockTask = {
        id: taskId,
        userId: TEST_USER_ID,
        status: "in_progress",
        progress: 100,
        workflowRunId: ghJobId,
      };

      taskRepo.updateStatus.mockResolvedValue(mockTask);
      ghJobRepo.updateStatus.mockResolvedValue(null);

      const response = await app.inject({
        method: "POST",
        url: "/api/v1/webhooks/ghosthands",
        headers: makeWebhookHeaders(),
        payload: {
          job_id: ghJobId,
          valet_task_id: taskId,
          status: "completed",
          result_summary: "Application submitted successfully",
          result_data: {
            confirmation_id: "CONF-12345",
            screenshot_url: "https://storage.example.com/screenshots/final.png",
          },
          completed_at: new Date().toISOString(),
        },
      });

      expect(response.statusCode).toBe(200);

      // Task updated to completed
      expect(taskRepo.updateStatus).toHaveBeenCalledWith(taskId, "completed");

      // Result data stored
      expect(taskRepo.updateGhosthandsResult).toHaveBeenCalledWith(
        taskId,
        expect.objectContaining({
          ghJobId,
          result: expect.objectContaining({
            confirmation_id: "CONF-12345",
          }),
          error: null,
        }),
      );

      // Progress shows "Application submitted"
      expect(taskRepo.updateProgress).toHaveBeenCalledWith(taskId, {
        currentStep: "Application submitted successfully",
      });

      // WebSocket published with completed status
      expect(redis.publish).toHaveBeenCalledWith(
        `tasks:${TEST_USER_ID}`,
        expect.stringContaining('"status":"completed"'),
      );
    });

    it("should handle full lifecycle: running → completed in sequence", async () => {
      const seqTaskId = randomUUID();
      const seqJobId = randomUUID();

      // Step 1: running callback
      taskRepo.updateStatus.mockResolvedValue({
        id: seqTaskId,
        userId: TEST_USER_ID,
        status: "in_progress",
        progress: 5,
        workflowRunId: seqJobId,
      });
      ghJobRepo.updateStatus.mockResolvedValue(null);

      const runningRes = await app.inject({
        method: "POST",
        url: "/api/v1/webhooks/ghosthands",
        headers: makeWebhookHeaders(),
        payload: {
          job_id: seqJobId,
          valet_task_id: seqTaskId,
          status: "running",
          progress: 5,
        },
      });
      expect(runningRes.statusCode).toBe(200);

      vi.clearAllMocks();

      // Step 2: completed callback
      taskRepo.updateStatus.mockResolvedValue({
        id: seqTaskId,
        userId: TEST_USER_ID,
        status: "completed",
        progress: 100,
        workflowRunId: seqJobId,
      });
      ghJobRepo.updateStatus.mockResolvedValue(null);

      const completedRes = await app.inject({
        method: "POST",
        url: "/api/v1/webhooks/ghosthands",
        headers: makeWebhookHeaders(),
        payload: {
          job_id: seqJobId,
          valet_task_id: seqTaskId,
          status: "completed",
          result_summary: "Done",
          completed_at: new Date().toISOString(),
        },
      });
      expect(completedRes.statusCode).toBe(200);
      expect(taskRepo.updateStatus).toHaveBeenCalledWith(seqTaskId, "completed");
    });
  });

  // ── INT-02: HITL flow ──────────────────────────────────────────────────

  describe("INT-02: HITL (Human-in-the-loop) flow", () => {
    const taskId = randomUUID();
    const ghJobId = randomUUID();

    it("should handle needs_human callback → waiting_human status", async () => {
      const mockTask = {
        id: taskId,
        userId: TEST_USER_ID,
        status: "waiting_human",
        workflowRunId: ghJobId,
      };

      taskRepo.updateStatus.mockResolvedValue(mockTask);
      ghJobRepo.updateStatus.mockResolvedValue(null);

      const response = await app.inject({
        method: "POST",
        url: "/api/v1/webhooks/ghosthands",
        headers: makeWebhookHeaders(),
        payload: {
          job_id: ghJobId,
          valet_task_id: taskId,
          status: "needs_human",
          interaction: {
            type: "2fa",
            screenshot_url: "https://storage.example.com/screenshots/2fa.png",
            page_url: "https://linkedin.com/checkpoint/challenge",
            timeout_seconds: 300,
            message: "Enter the 2FA code sent to your phone",
          },
        },
      });

      expect(response.statusCode).toBe(200);

      // Task status should be waiting_human
      expect(taskRepo.updateStatus).toHaveBeenCalledWith(taskId, "waiting_human");

      // Interaction data should be stored with mapped type (2fa → two_factor)
      expect(taskRepo.updateInteractionData).toHaveBeenCalledWith(taskId, {
        interactionType: "two_factor",
        interactionData: expect.objectContaining({
          type: "two_factor",
          screenshot_url: "https://storage.example.com/screenshots/2fa.png",
        }),
      });

      // WebSocket should publish task_needs_human event
      const publishCall = redis.publish.mock.calls[0];
      expect(publishCall?.[0]).toBe(`tasks:${TEST_USER_ID}`);
      const wsPayload = JSON.parse(publishCall?.[1] as string);
      expect(wsPayload.type).toBe("task_needs_human");
      expect(wsPayload.interaction.type).toBe("two_factor");
    });

    it("should handle resumed callback → clear interaction data and return to in_progress", async () => {
      const mockTask = {
        id: taskId,
        userId: TEST_USER_ID,
        status: "in_progress",
        workflowRunId: ghJobId,
      };

      taskRepo.updateStatus.mockResolvedValue(mockTask);
      ghJobRepo.updateStatus.mockResolvedValue(null);

      const response = await app.inject({
        method: "POST",
        url: "/api/v1/webhooks/ghosthands",
        headers: makeWebhookHeaders(),
        payload: {
          job_id: ghJobId,
          valet_task_id: taskId,
          status: "resumed",
        },
      });

      expect(response.statusCode).toBe(200);

      // Task goes to in_progress
      expect(taskRepo.updateStatus).toHaveBeenCalledWith(taskId, "in_progress");

      // Interaction data should be cleared
      expect(taskRepo.clearInteractionData).toHaveBeenCalledWith(taskId);

      // WebSocket should publish task_resumed event
      const publishCall = redis.publish.mock.calls[0];
      const wsPayload = JSON.parse(publishCall?.[1] as string);
      expect(wsPayload.type).toBe("task_resumed");
      expect(wsPayload.status).toBe("in_progress");
    });

    it("should handle login interaction type mapping (login → login_required)", async () => {
      const loginTaskId = randomUUID();
      const loginJobId = randomUUID();

      taskRepo.updateStatus.mockResolvedValue({
        id: loginTaskId,
        userId: TEST_USER_ID,
        status: "waiting_human",
        workflowRunId: loginJobId,
      });
      ghJobRepo.updateStatus.mockResolvedValue(null);

      const response = await app.inject({
        method: "POST",
        url: "/api/v1/webhooks/ghosthands",
        headers: makeWebhookHeaders(),
        payload: {
          job_id: loginJobId,
          valet_task_id: loginTaskId,
          status: "needs_human",
          interaction: {
            type: "login",
            message: "Please log in to continue",
          },
        },
      });

      expect(response.statusCode).toBe(200);

      // Interaction type should be mapped from "login" to "login_required"
      expect(taskRepo.updateInteractionData).toHaveBeenCalledWith(loginTaskId, {
        interactionType: "login_required",
        interactionData: expect.objectContaining({
          type: "login_required",
        }),
      });
    });
  });

  // ── INT-03: Cost tracking ──────────────────────────────────────────────

  describe("INT-03: Cost tracking", () => {
    it("should persist LLM cost data from completed callback", async () => {
      const taskId = randomUUID();
      const ghJobId = randomUUID();

      const mockTask = {
        id: taskId,
        userId: TEST_USER_ID,
        status: "completed",
        progress: 100,
        workflowRunId: ghJobId,
      };

      taskRepo.updateStatus.mockResolvedValue(mockTask);
      ghJobRepo.updateStatus.mockResolvedValue(null);

      const costData = {
        total_cost_usd: 0.0342,
        action_count: 15,
        total_tokens: 24500,
      };

      const costBreakdown = {
        total_cost_usd: 0.0342,
        action_count: 15,
        total_tokens: 24500,
        cookbook_steps: 8,
        magnitude_steps: 7,
        cookbook_cost_usd: 0.015,
        magnitude_cost_usd: 0.019,
        image_cost_usd: 0.0002,
        reasoning_cost_usd: 0.0,
      };

      const response = await app.inject({
        method: "POST",
        url: "/api/v1/webhooks/ghosthands",
        headers: makeWebhookHeaders(),
        payload: {
          job_id: ghJobId,
          valet_task_id: taskId,
          status: "completed",
          result_summary: "Application submitted",
          completed_at: new Date().toISOString(),
          cost: costData,
          cost_breakdown: costBreakdown,
        },
      });

      expect(response.statusCode).toBe(200);

      // LLM usage should be stored on the task
      expect(taskRepo.updateLlmUsage).toHaveBeenCalledWith(taskId, {
        totalCostUsd: 0.0342,
        actionCount: 15,
        totalTokens: 24500,
        costBreakdown: costBreakdown,
      });

      // gh_automation_jobs should also get cost data
      expect(ghJobRepo.updateStatus).toHaveBeenCalledWith(
        ghJobId,
        expect.objectContaining({
          actionCount: 15,
          totalTokens: 24500,
          llmCostCents: 3, // Math.round(0.0342 * 100)
        }),
      );
    });

    it("should handle callback without cost data gracefully", async () => {
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

      const response = await app.inject({
        method: "POST",
        url: "/api/v1/webhooks/ghosthands",
        headers: makeWebhookHeaders(),
        payload: {
          job_id: ghJobId,
          valet_task_id: taskId,
          status: "completed",
          result_summary: "Done",
          completed_at: new Date().toISOString(),
        },
      });

      expect(response.statusCode).toBe(200);

      // updateLlmUsage should NOT be called
      expect(taskRepo.updateLlmUsage).not.toHaveBeenCalled();
    });
  });

  // ── Auth edge cases ────────────────────────────────────────────────────

  describe("Webhook authentication", () => {
    it("should reject requests without service key", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/webhooks/ghosthands",
        headers: { "content-type": "application/json" },
        payload: {
          job_id: randomUUID(),
          valet_task_id: randomUUID(),
          status: "running",
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it("should reject requests with wrong service key", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/webhooks/ghosthands",
        headers: makeWebhookHeaders("wrong-secret"),
        payload: {
          job_id: randomUUID(),
          valet_task_id: randomUUID(),
          status: "running",
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it("should accept service key via query param", async () => {
      const taskId = randomUUID();
      const ghJobId = randomUUID();

      taskRepo.updateStatus.mockResolvedValue({
        id: taskId,
        userId: TEST_USER_ID,
        status: "in_progress",
        workflowRunId: ghJobId,
      });
      ghJobRepo.updateStatus.mockResolvedValue(null);

      const response = await app.inject({
        method: "POST",
        url: `/api/v1/webhooks/ghosthands?token=${GH_SERVICE_SECRET}`,
        headers: { "content-type": "application/json" },
        payload: {
          job_id: ghJobId,
          valet_task_id: taskId,
          status: "running",
        },
      });

      expect(response.statusCode).toBe(200);
    });
  });

  // ── Payload validation ─────────────────────────────────────────────────

  describe("Webhook payload validation", () => {
    it("should reject payload missing job_id", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/webhooks/ghosthands",
        headers: makeWebhookHeaders(),
        payload: {
          valet_task_id: randomUUID(),
          status: "running",
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it("should reject payload missing status", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/webhooks/ghosthands",
        headers: makeWebhookHeaders(),
        payload: {
          job_id: randomUUID(),
          valet_task_id: randomUUID(),
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it("should handle unknown GH status gracefully (200 with received:true)", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/webhooks/ghosthands",
        headers: makeWebhookHeaders(),
        payload: {
          job_id: randomUUID(),
          valet_task_id: randomUUID(),
          status: "unknown_status",
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ received: true });
    });

    it("should fall back to job_id lookup when valet_task_id is missing", async () => {
      const ghJobId = randomUUID();
      const resolvedTaskId = randomUUID();

      taskRepo.findByWorkflowRunId.mockResolvedValue({
        id: resolvedTaskId,
        userId: TEST_USER_ID,
      });
      taskRepo.updateStatus.mockResolvedValue({
        id: resolvedTaskId,
        userId: TEST_USER_ID,
        status: "in_progress",
        progress: 5,
        workflowRunId: ghJobId,
      });
      ghJobRepo.updateStatus.mockResolvedValue(null);

      const response = await app.inject({
        method: "POST",
        url: "/api/v1/webhooks/ghosthands",
        headers: makeWebhookHeaders(),
        payload: {
          job_id: ghJobId,
          valet_task_id: null,
          status: "running",
        },
      });

      expect(response.statusCode).toBe(200);
      expect(taskRepo.findByWorkflowRunId).toHaveBeenCalledWith(ghJobId);
      expect(taskRepo.updateStatus).toHaveBeenCalledWith(resolvedTaskId, "in_progress");
    });

    it("should return 200 with warning when no task found by either ID", async () => {
      taskRepo.findByWorkflowRunId.mockResolvedValue(null);

      const response = await app.inject({
        method: "POST",
        url: "/api/v1/webhooks/ghosthands",
        headers: makeWebhookHeaders(),
        payload: {
          job_id: randomUUID(),
          valet_task_id: null,
          status: "running",
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ received: true, warning: "task not found" });
    });
  });
});
