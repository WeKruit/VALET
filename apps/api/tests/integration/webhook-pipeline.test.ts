/**
 * Integration Tests: Webhook → Real-Time Pipeline
 *
 * Tests the webhook handler's integration with:
 * - Redis Streams (SSE bridge)
 * - WebSocket event publishing
 * - kasm_url propagation
 * - GH job sync (gh_automation_jobs)
 * - Idempotency (updateStatusGuarded)
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";

const GH_SERVICE_SECRET = "test-service-secret-pipeline";
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

// ── Test app builder ─────────────────────────────────────────────────────────

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

describe("Integration: Webhook → Real-Time Pipeline", () => {
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

  // ── Redis Streams bridge ──────────────────────────────────────────────

  describe("Redis Streams bridge (SSE)", () => {
    it("XADD called with stream key gh:events:{jobId} on running callback", async () => {
      const taskId = randomUUID();
      const ghJobId = randomUUID();

      taskRepo.updateStatusGuarded.mockResolvedValue({
        id: taskId,
        userId: TEST_USER_ID,
        status: "in_progress",
        workflowRunId: ghJobId,
      });

      await app.inject({
        method: "POST",
        url: "/api/v1/webhooks/ghosthands",
        headers: makeHeaders(),
        payload: {
          job_id: ghJobId,
          valet_task_id: taskId,
          status: "running",
          result_summary: "Navigating",
        },
      });

      expect(redis.xadd).toHaveBeenCalledWith(
        `gh:events:${ghJobId}`,
        "*",
        "event_type",
        "running",
        "job_id",
        ghJobId,
        "task_id",
        taskId,
        "status",
        "in_progress",
        "message",
        "Navigating",
        "payload",
        expect.any(String),
      );
    });

    it("stream entry includes all required fields", async () => {
      const taskId = randomUUID();
      const ghJobId = randomUUID();

      taskRepo.updateStatusGuarded.mockResolvedValue({
        id: taskId,
        userId: TEST_USER_ID,
        status: "completed",
        workflowRunId: ghJobId,
      });

      await app.inject({
        method: "POST",
        url: "/api/v1/webhooks/ghosthands",
        headers: makeHeaders(),
        payload: {
          job_id: ghJobId,
          valet_task_id: taskId,
          status: "completed",
          result_summary: "Done",
          completed_at: new Date().toISOString(),
        },
      });

      const xaddCall = redis.xadd.mock.calls[0];
      expect(xaddCall).toBeDefined();
      // Verify field names are present in the XADD call
      expect(xaddCall).toContain("event_type");
      expect(xaddCall).toContain("job_id");
      expect(xaddCall).toContain("task_id");
      expect(xaddCall).toContain("status");
      expect(xaddCall).toContain("message");
      expect(xaddCall).toContain("payload");
    });

    it("stream TTL set via redis.expire", async () => {
      const taskId = randomUUID();
      const ghJobId = randomUUID();

      taskRepo.updateStatusGuarded.mockResolvedValue({
        id: taskId,
        userId: TEST_USER_ID,
        status: "in_progress",
        workflowRunId: ghJobId,
      });

      await app.inject({
        method: "POST",
        url: "/api/v1/webhooks/ghosthands",
        headers: makeHeaders(),
        payload: {
          job_id: ghJobId,
          valet_task_id: taskId,
          status: "running",
        },
      });

      expect(redis.expire).toHaveBeenCalledWith(`gh:events:${ghJobId}`, 3600);
    });

    it("XADD failure does not fail webhook response", async () => {
      const taskId = randomUUID();
      const ghJobId = randomUUID();

      taskRepo.updateStatusGuarded.mockResolvedValue({
        id: taskId,
        userId: TEST_USER_ID,
        status: "in_progress",
        workflowRunId: ghJobId,
      });
      redis.xadd.mockRejectedValue(new Error("Redis connection lost"));

      const response = await app.inject({
        method: "POST",
        url: "/api/v1/webhooks/ghosthands",
        headers: makeHeaders(),
        payload: {
          job_id: ghJobId,
          valet_task_id: taskId,
          status: "running",
        },
      });

      // Webhook should still succeed despite XADD failure
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ received: true });
    });
  });

  // ── WebSocket events ──────────────────────────────────────────────────

  describe("WebSocket event publishing", () => {
    it("running → publishes task_update with status in_progress", async () => {
      const taskId = randomUUID();
      const ghJobId = randomUUID();

      taskRepo.updateStatusGuarded.mockResolvedValue({
        id: taskId,
        userId: TEST_USER_ID,
        status: "in_progress",
        workflowRunId: ghJobId,
      });

      await app.inject({
        method: "POST",
        url: "/api/v1/webhooks/ghosthands",
        headers: makeHeaders(),
        payload: {
          job_id: ghJobId,
          valet_task_id: taskId,
          status: "running",
        },
      });

      expect(redis.publish).toHaveBeenCalledWith(
        `tasks:${TEST_USER_ID}`,
        expect.stringContaining('"type":"task_update"'),
      );
      const wsPayload = JSON.parse(redis.publish.mock.calls[0]?.[1] as string);
      expect(wsPayload.status).toBe("in_progress");
    });

    it("completed → publishes task_update with progress=100", async () => {
      const taskId = randomUUID();
      const ghJobId = randomUUID();

      taskRepo.updateStatusGuarded.mockResolvedValue({
        id: taskId,
        userId: TEST_USER_ID,
        status: "completed",
        workflowRunId: ghJobId,
      });

      await app.inject({
        method: "POST",
        url: "/api/v1/webhooks/ghosthands",
        headers: makeHeaders(),
        payload: {
          job_id: ghJobId,
          valet_task_id: taskId,
          status: "completed",
          result_summary: "Application submitted",
          completed_at: new Date().toISOString(),
        },
      });

      const wsPayload = JSON.parse(redis.publish.mock.calls[0]?.[1] as string);
      expect(wsPayload.type).toBe("task_update");
      expect(wsPayload.status).toBe("completed");
      expect(wsPayload.progress).toBe(100);
    });

    it("failed → publishes task_update with error details", async () => {
      const taskId = randomUUID();
      const ghJobId = randomUUID();

      taskRepo.updateStatusGuarded.mockResolvedValue({
        id: taskId,
        userId: TEST_USER_ID,
        status: "failed",
        workflowRunId: ghJobId,
      });

      await app.inject({
        method: "POST",
        url: "/api/v1/webhooks/ghosthands",
        headers: makeHeaders(),
        payload: {
          job_id: ghJobId,
          valet_task_id: taskId,
          status: "failed",
          error_code: "BROWSER_CRASH",
          error_message: "Chrome crashed unexpectedly",
        },
      });

      const wsPayload = JSON.parse(redis.publish.mock.calls[0]?.[1] as string);
      expect(wsPayload.type).toBe("task_update");
      expect(wsPayload.status).toBe("failed");
      expect(wsPayload.error).toEqual(expect.objectContaining({ code: "BROWSER_CRASH" }));
    });

    it("needs_human → publishes task_needs_human with interaction + VNC URL", async () => {
      const taskId = randomUUID();
      const ghJobId = randomUUID();

      taskRepo.updateStatusGuarded.mockResolvedValue({
        id: taskId,
        userId: TEST_USER_ID,
        status: "waiting_human",
        workflowRunId: ghJobId,
        sandboxId: "sb-1",
      });

      await app.inject({
        method: "POST",
        url: "/api/v1/webhooks/ghosthands",
        headers: makeHeaders(),
        payload: {
          job_id: ghJobId,
          valet_task_id: taskId,
          status: "needs_human",
          kasm_url: "https://10.0.0.1:6901",
          interaction: {
            type: "2fa",
            message: "Enter 2FA code",
            screenshot_url: "https://storage.example.com/2fa.png",
          },
        },
      });

      const wsPayload = JSON.parse(redis.publish.mock.calls[0]?.[1] as string);
      expect(wsPayload.type).toBe("task_needs_human");
      expect(wsPayload.vncUrl).toBe("https://10.0.0.1:6901");
      expect(wsPayload.vncType).toBe("kasmvnc");
      expect(wsPayload.interaction.type).toBe("two_factor");
    });

    it("resumed → publishes task_resumed and clears interaction", async () => {
      const taskId = randomUUID();
      const ghJobId = randomUUID();

      taskRepo.updateStatusGuarded.mockResolvedValue({
        id: taskId,
        userId: TEST_USER_ID,
        status: "in_progress",
        workflowRunId: ghJobId,
      });

      await app.inject({
        method: "POST",
        url: "/api/v1/webhooks/ghosthands",
        headers: makeHeaders(),
        payload: {
          job_id: ghJobId,
          valet_task_id: taskId,
          status: "resumed",
        },
      });

      const wsPayload = JSON.parse(redis.publish.mock.calls[0]?.[1] as string);
      expect(wsPayload.type).toBe("task_resumed");
      expect(wsPayload.status).toBe("in_progress");

      // Interaction data should be cleared
      expect(taskRepo.clearInteractionData).toHaveBeenCalledWith(taskId);
    });
  });

  // ── kasm_url propagation ──────────────────────────────────────────────

  describe("kasm_url propagation", () => {
    it("kasm_url from callback stored in gh_automation_jobs metadata", async () => {
      const taskId = randomUUID();
      const ghJobId = randomUUID();

      taskRepo.updateStatusGuarded.mockResolvedValue({
        id: taskId,
        userId: TEST_USER_ID,
        status: "in_progress",
        workflowRunId: ghJobId,
      });

      await app.inject({
        method: "POST",
        url: "/api/v1/webhooks/ghosthands",
        headers: makeHeaders(),
        payload: {
          job_id: ghJobId,
          valet_task_id: taskId,
          status: "running",
          kasm_url: "https://10.0.0.1:6901",
        },
      });

      expect(ghJobRepo.updateStatus).toHaveBeenCalledWith(
        ghJobId,
        expect.objectContaining({
          metadata: expect.objectContaining({
            kasm_url: "https://10.0.0.1:6901",
          }),
        }),
      );
    });

    it("kasm_url included in WS event for needs_human", async () => {
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
          kasm_url: "https://10.0.0.5:6901",
          interaction: {
            type: "captcha",
            message: "Solve CAPTCHA",
          },
        },
      });

      const wsPayload = JSON.parse(redis.publish.mock.calls[0]?.[1] as string);
      expect(wsPayload.vncUrl).toBe("https://10.0.0.5:6901");
    });

    it("falls back to sandbox novncUrl when no kasm_url", async () => {
      const taskId = randomUUID();
      const ghJobId = randomUUID();

      taskRepo.updateStatusGuarded.mockResolvedValue({
        id: taskId,
        userId: TEST_USER_ID,
        status: "waiting_human",
        workflowRunId: ghJobId,
        sandboxId: "sb-fallback",
      });
      sandboxRepo.findById.mockResolvedValue({
        id: "sb-fallback",
        novncUrl: "https://novnc.example.com/vnc",
      });

      await app.inject({
        method: "POST",
        url: "/api/v1/webhooks/ghosthands",
        headers: makeHeaders(),
        payload: {
          job_id: ghJobId,
          valet_task_id: taskId,
          status: "needs_human",
          interaction: {
            type: "login",
            message: "Please log in",
          },
        },
      });

      const wsPayload = JSON.parse(redis.publish.mock.calls[0]?.[1] as string);
      expect(wsPayload.vncUrl).toBe("https://novnc.example.com/vnc");
      expect(wsPayload.vncType).toBe("novnc");
    });
  });

  // ── GH job sync ───────────────────────────────────────────────────────

  describe("GH job sync (gh_automation_jobs)", () => {
    it("running callback sets startedAt + lastHeartbeat", async () => {
      const taskId = randomUUID();
      const ghJobId = randomUUID();

      taskRepo.updateStatusGuarded.mockResolvedValue({
        id: taskId,
        userId: TEST_USER_ID,
        status: "in_progress",
        workflowRunId: ghJobId,
      });

      await app.inject({
        method: "POST",
        url: "/api/v1/webhooks/ghosthands",
        headers: makeHeaders(),
        payload: {
          job_id: ghJobId,
          valet_task_id: taskId,
          status: "running",
        },
      });

      expect(ghJobRepo.updateStatus).toHaveBeenCalledWith(
        ghJobId,
        expect.objectContaining({
          status: "running",
          startedAt: expect.any(Date),
          lastHeartbeat: expect.any(Date),
        }),
      );
    });

    it("completed callback sets completedAt + resultData", async () => {
      const taskId = randomUUID();
      const ghJobId = randomUUID();

      taskRepo.updateStatusGuarded.mockResolvedValue({
        id: taskId,
        userId: TEST_USER_ID,
        status: "completed",
        workflowRunId: ghJobId,
      });

      const completedAt = new Date().toISOString();

      await app.inject({
        method: "POST",
        url: "/api/v1/webhooks/ghosthands",
        headers: makeHeaders(),
        payload: {
          job_id: ghJobId,
          valet_task_id: taskId,
          status: "completed",
          result_summary: "Submitted",
          result_data: { confirmation_id: "CONF-1" },
          completed_at: completedAt,
        },
      });

      expect(ghJobRepo.updateStatus).toHaveBeenCalledWith(
        ghJobId,
        expect.objectContaining({
          status: "completed",
          completedAt: expect.any(Date),
          resultData: expect.objectContaining({
            confirmation_id: "CONF-1",
            summary: "Submitted",
          }),
        }),
      );
    });

    it("failed callback sets errorCode + errorDetails", async () => {
      const taskId = randomUUID();
      const ghJobId = randomUUID();

      taskRepo.updateStatusGuarded.mockResolvedValue({
        id: taskId,
        userId: TEST_USER_ID,
        status: "failed",
        workflowRunId: ghJobId,
      });

      await app.inject({
        method: "POST",
        url: "/api/v1/webhooks/ghosthands",
        headers: makeHeaders(),
        payload: {
          job_id: ghJobId,
          valet_task_id: taskId,
          status: "failed",
          error_code: "TIMEOUT",
          error_message: "Job timed out after 4 hours",
        },
      });

      expect(ghJobRepo.updateStatus).toHaveBeenCalledWith(
        ghJobId,
        expect.objectContaining({
          status: "failed",
          errorCode: "TIMEOUT",
          errorDetails: expect.objectContaining({
            code: "TIMEOUT",
            message: "Job timed out after 4 hours",
          }),
        }),
      );
    });

    it("needs_human sets interactionType + pausedAt", async () => {
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
          interaction: {
            type: "2fa",
            message: "Enter code",
          },
        },
      });

      expect(ghJobRepo.updateStatus).toHaveBeenCalledWith(
        ghJobId,
        expect.objectContaining({
          status: "needs_human",
          interactionType: "two_factor",
          pausedAt: expect.any(Date),
        }),
      );
    });

    it("resumed clears interactionType + pausedAt", async () => {
      const taskId = randomUUID();
      const ghJobId = randomUUID();

      taskRepo.updateStatusGuarded.mockResolvedValue({
        id: taskId,
        userId: TEST_USER_ID,
        status: "in_progress",
        workflowRunId: ghJobId,
      });

      await app.inject({
        method: "POST",
        url: "/api/v1/webhooks/ghosthands",
        headers: makeHeaders(),
        payload: {
          job_id: ghJobId,
          valet_task_id: taskId,
          status: "resumed",
        },
      });

      expect(ghJobRepo.updateStatus).toHaveBeenCalledWith(
        ghJobId,
        expect.objectContaining({
          status: "resumed",
          interactionType: null,
          interactionData: null,
          pausedAt: null,
        }),
      );
    });

    it("updateStatusGuarded prevents duplicate processing (terminal task)", async () => {
      const taskId = randomUUID();
      const ghJobId = randomUUID();

      // updateStatusGuarded returns null → task is already in terminal state
      taskRepo.updateStatusGuarded.mockResolvedValue(null);

      const response = await app.inject({
        method: "POST",
        url: "/api/v1/webhooks/ghosthands",
        headers: makeHeaders(),
        payload: {
          job_id: ghJobId,
          valet_task_id: taskId,
          status: "completed",
          result_summary: "Done",
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ received: true, skipped: true });

      // No further processing should occur
      expect(ghJobRepo.updateStatus).not.toHaveBeenCalled();
      expect(redis.publish).not.toHaveBeenCalled();
      expect(redis.xadd).not.toHaveBeenCalled();
    });
  });
});
