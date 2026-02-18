/**
 * GhostHands webhook regression tests (W-01 through W-09).
 *
 * Self-contained Fastify app that mirrors the production webhook handlers
 * with mocked DI services (taskRepo, ghJobRepo, redis).
 */
import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import crypto from "node:crypto";
import { randomUUID } from "node:crypto";

const GH_SERVICE_SECRET = "test-service-secret";
const VALET_DEPLOY_WEBHOOK_SECRET = "test-webhook-secret";

// ---- In-memory task store --------------------------------------------------

const taskStore = new Map<
  string,
  {
    id: string;
    userId: string;
    status: string;
    workflowRunId: string | null;
    progress: number;
    llmCostUsd: number | null;
    llmActionCount: number | null;
    llmTotalTokens: number | null;
    interactionType: string | null;
    interactionData: Record<string, unknown> | null;
    ghResult: Record<string, unknown> | null;
    ghError: Record<string, unknown> | null;
    currentStep: string | null;
  }
>();

const TASK_1_ID = randomUUID();
const TASK_1_USER = randomUUID();
const GH_JOB_1 = `gh-job-${randomUUID().slice(0, 8)}`;

function resetStore() {
  taskStore.clear();
  taskStore.set(TASK_1_ID, {
    id: TASK_1_ID,
    userId: TASK_1_USER,
    status: "queued",
    workflowRunId: GH_JOB_1,
    progress: 0,
    llmCostUsd: null,
    llmActionCount: null,
    llmTotalTokens: null,
    interactionType: null,
    interactionData: null,
    ghResult: null,
    ghError: null,
    currentStep: null,
  });
}

// ---- Mock DI cradle --------------------------------------------------------

function createMockCradle() {
  const mockRedis = {
    publish: vi.fn().mockResolvedValue(1),
  };

  const taskRepo = {
    updateStatus: vi.fn().mockImplementation(async (id: string, status: string) => {
      const task = taskStore.get(id);
      if (!task) return null;
      task.status = status;
      return task;
    }),
    findByWorkflowRunId: vi.fn().mockImplementation(async (jobId: string) => {
      for (const task of taskStore.values()) {
        if (task.workflowRunId === jobId) return task;
      }
      return null;
    }),
    updateGhosthandsResult: vi
      .fn()
      .mockImplementation(async (id: string, data: Record<string, unknown>) => {
        const task = taskStore.get(id);
        if (task) {
          task.ghResult = data.result as Record<string, unknown> | null;
          task.ghError = data.error as Record<string, unknown> | null;
        }
      }),
    updateLlmUsage: vi
      .fn()
      .mockImplementation(async (id: string, data: Record<string, unknown>) => {
        const task = taskStore.get(id);
        if (task) {
          task.llmCostUsd = data.totalCostUsd as number | null;
          task.llmActionCount = data.actionCount as number | null;
          task.llmTotalTokens = data.totalTokens as number | null;
        }
      }),
    updateInteractionData: vi
      .fn()
      .mockImplementation(async (id: string, data: Record<string, unknown>) => {
        const task = taskStore.get(id);
        if (task) {
          task.interactionType = data.interactionType as string | null;
          task.interactionData = data.interactionData as Record<string, unknown> | null;
        }
      }),
    clearInteractionData: vi.fn().mockImplementation(async (id: string) => {
      const task = taskStore.get(id);
      if (task) {
        task.interactionType = null;
        task.interactionData = null;
      }
    }),
    updateProgress: vi
      .fn()
      .mockImplementation(async (id: string, data: Record<string, unknown>) => {
        const task = taskStore.get(id);
        if (task) {
          if (data.progress != null) task.progress = data.progress as number;
          if (data.currentStep != null) task.currentStep = data.currentStep as string;
        }
      }),
  };

  const ghJobRepo = {
    updateStatus: vi.fn().mockResolvedValue(undefined),
  };

  const deployService = {
    createFromWebhook: vi.fn().mockResolvedValue({ id: randomUUID() }),
  };

  return { taskRepo, ghJobRepo, redis: mockRedis, deployService };
}

// ---- Build test app --------------------------------------------------------

async function buildWebhookTestApp(): Promise<{
  app: FastifyInstance;
  cradle: ReturnType<typeof createMockCradle>;
}> {
  const app = Fastify({ logger: false });

  const cookie = await import("@fastify/cookie");
  await app.register(cookie.default);

  const cradle = createMockCradle();

  app.decorateRequest("diScope", null);

  app.addHook("onRequest", async (request) => {
    (request as any).diScope = { cradle };
  });

  // Error handler
  app.setErrorHandler((error, _request, reply) => {
    const status = (error as any).statusCode ?? 500;
    reply.status(status).send({
      error: (error as any).code ?? "INTERNAL_ERROR",
      message: error.message,
    });
  });

  // ── Job callback webhook (mirrors ghosthands.webhook.ts) ──────
  app.post("/api/v1/webhooks/ghosthands", async (request, reply) => {
    // Verify service key: header or query param
    const expectedKey = GH_SERVICE_SECRET;
    const headerKey = request.headers["x-gh-service-key"] as string | undefined;
    const url = new URL(request.url, `http://${request.headers.host ?? "localhost"}`);
    const tokenParam = url.searchParams.get("token");

    let authorized = false;
    if (headerKey) {
      try {
        authorized = crypto.timingSafeEqual(Buffer.from(headerKey), Buffer.from(expectedKey));
      } catch {
        authorized = false;
      }
    } else if (tokenParam) {
      try {
        authorized = crypto.timingSafeEqual(Buffer.from(tokenParam), Buffer.from(expectedKey));
      } catch {
        authorized = false;
      }
    }

    if (!authorized) {
      return reply.status(401).send({ error: "Unauthorized" });
    }

    const { taskRepo, ghJobRepo, redis } = (request as any).diScope.cradle;
    const payload = request.body as Record<string, unknown>;

    if (!payload?.job_id || !payload?.status) {
      return reply.status(400).send({
        error: "Bad Request",
        message: "Missing required fields: job_id, status",
      });
    }

    // Status mapping
    const statusMap: Record<string, string> = {
      running: "in_progress",
      completed: "completed",
      failed: "failed",
      cancelled: "cancelled",
      needs_human: "waiting_human",
      resumed: "in_progress",
    };

    const taskStatus = statusMap[payload.status as string];
    if (!taskStatus) {
      return reply.status(200).send({ received: true });
    }

    // Find task
    let valetTaskId = payload.valet_task_id as string | null;
    if (!valetTaskId) {
      const taskByJobId = await taskRepo.findByWorkflowRunId(payload.job_id as string);
      if (taskByJobId) {
        valetTaskId = taskByJobId.id;
      } else {
        return reply.status(200).send({ received: true, warning: "task not found" });
      }
    }

    const task = await taskRepo.updateStatus(valetTaskId, taskStatus);
    if (!task) {
      return reply.status(404).send({
        error: "Not Found",
        message: `Task ${valetTaskId} not found`,
      });
    }

    // HITL
    const interactionTypeMap: Record<string, string> = {
      "2fa": "two_factor",
      login: "login_required",
    };
    if (payload.status === "needs_human" && payload.interaction) {
      const interaction = payload.interaction as Record<string, unknown>;
      const mappedType = interactionTypeMap[interaction.type as string] ?? interaction.type;
      await taskRepo.updateInteractionData(valetTaskId, {
        interactionType: mappedType,
        interactionData: { ...interaction, type: mappedType },
      });
    }
    if (payload.status === "resumed") {
      await taskRepo.clearInteractionData(valetTaskId);
    }

    // Result/error
    const resultObj = payload.result_data
      ? {
          ...(payload.result_data as Record<string, unknown>),
          summary: payload.result_summary,
          screenshot_url: payload.screenshot_url,
        }
      : payload.result
        ? { ...(payload.result as Record<string, unknown>) }
        : null;

    const errorObj = payload.error_code
      ? { code: payload.error_code, message: payload.error_message ?? "Unknown error" }
      : payload.error
        ? { ...(payload.error as Record<string, unknown>) }
        : null;

    const completedAt = (payload.completed_at as string) ?? null;

    if (resultObj || errorObj) {
      await taskRepo.updateGhosthandsResult(valetTaskId, {
        ghJobId: payload.job_id,
        result: resultObj,
        error: errorObj,
        completedAt,
      });
    }

    // Cost tracking
    if (payload.cost) {
      const cost = payload.cost as Record<string, number>;
      await taskRepo.updateLlmUsage(valetTaskId, {
        totalCostUsd: cost.total_cost_usd,
        actionCount: cost.action_count,
        totalTokens: cost.total_tokens,
        costBreakdown: (payload.cost_breakdown as Record<string, unknown> | undefined) ?? null,
      });
    }

    // Sync gh_automation_jobs (simplified)
    await ghJobRepo.updateStatus(payload.job_id, {
      status: payload.status,
      updatedAt: new Date(),
    });

    // Publish WS event
    await redis.publish(
      `tasks:${task.userId}`,
      JSON.stringify({
        type: "task_update",
        taskId: task.id,
        status: taskStatus,
      }),
    );

    return reply.status(200).send({ received: true });
  });

  // ── Deploy webhook (mirrors ghosthands.webhook.ts) ──────
  app.post("/api/v1/webhooks/ghosthands/deploy", async (request, reply) => {
    const webhookSecret = VALET_DEPLOY_WEBHOOK_SECRET;

    const signatureHeader = request.headers["x-gh-webhook-signature"] as string | undefined;
    if (!signatureHeader) {
      return reply.status(401).send({ error: "Missing signature header" });
    }

    // Verify HMAC
    const expected = signatureHeader.replace("sha256=", "");
    if (!expected || expected.length !== 64) {
      return reply.status(401).send({ error: "Invalid signature" });
    }
    const bodyStr = typeof request.body === "string" ? request.body : JSON.stringify(request.body);
    const computed = crypto.createHmac("sha256", webhookSecret).update(bodyStr).digest("hex");

    let signatureValid = false;
    try {
      signatureValid = crypto.timingSafeEqual(
        Buffer.from(expected, "hex"),
        Buffer.from(computed, "hex"),
      );
    } catch {
      signatureValid = false;
    }

    if (!signatureValid) {
      return reply.status(401).send({ error: "Invalid signature" });
    }

    const payload = request.body as Record<string, unknown>;
    const { deployService } = (request as any).diScope.cradle;
    const deploy = await deployService.createFromWebhook({
      imageTag: payload.image_tag,
      commitSha: payload.commit_sha,
      commitMessage: payload.commit_message,
      branch: payload.branch,
      environment: payload.environment,
      repository: payload.repository,
      runUrl: payload.run_url,
    });

    return reply.status(200).send({
      received: true,
      deploy_id: deploy.id,
      environment: payload.environment,
      image_tag: payload.image_tag,
    });
  });

  await app.ready();
  return { app, cradle };
}

// ---- Helper to create HMAC signature ---------------------------------------

function signPayload(payload: unknown, secret: string): string {
  const bodyStr = JSON.stringify(payload);
  const hmac = crypto.createHmac("sha256", secret).update(bodyStr).digest("hex");
  return `sha256=${hmac}`;
}

// ---- Tests -----------------------------------------------------------------

let app: FastifyInstance;
let cradle: ReturnType<typeof createMockCradle>;

beforeAll(async () => {
  const result = await buildWebhookTestApp();
  app = result.app;
  cradle = result.cradle;
});

beforeEach(() => {
  resetStore();
  vi.clearAllMocks();
});

afterAll(async () => {
  await app.close();
});

describe("GhostHands Webhook Regression Tests", () => {
  // W-01: POST /webhooks/ghosthands updates task status
  it("W-01: updates task status on valid callback", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/webhooks/ghosthands",
      headers: {
        "x-gh-service-key": GH_SERVICE_SECRET,
        "content-type": "application/json",
      },
      payload: JSON.stringify({
        job_id: GH_JOB_1,
        valet_task_id: TASK_1_ID,
        status: "completed",
        result_data: { confirmation_id: "CONF-123" },
        result_summary: "Application submitted successfully",
      }),
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().received).toBe(true);

    // Verify task was updated
    const task = taskStore.get(TASK_1_ID);
    expect(task?.status).toBe("completed");
  });

  // W-02: Returns 401 without service key
  it("W-02: returns 401 without service key", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/webhooks/ghosthands",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({
        job_id: GH_JOB_1,
        valet_task_id: TASK_1_ID,
        status: "completed",
      }),
    });

    expect(res.statusCode).toBe(401);
    expect(res.json().error).toBe("Unauthorized");
  });

  // W-03: Returns 401 with wrong key
  it("W-03: returns 401 with wrong service key", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/webhooks/ghosthands",
      headers: {
        "x-gh-service-key": "wrong-secret-key-zzz",
        "content-type": "application/json",
      },
      payload: JSON.stringify({
        job_id: GH_JOB_1,
        valet_task_id: TASK_1_ID,
        status: "completed",
      }),
    });

    expect(res.statusCode).toBe(401);
  });

  // W-04: Handles needs_human status
  it("W-04: handles needs_human status and stores interaction data", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/webhooks/ghosthands",
      headers: {
        "x-gh-service-key": GH_SERVICE_SECRET,
        "content-type": "application/json",
      },
      payload: JSON.stringify({
        job_id: GH_JOB_1,
        valet_task_id: TASK_1_ID,
        status: "needs_human",
        interaction: {
          type: "captcha",
          screenshot_url: "https://screenshots.example.com/captcha.png",
          page_url: "https://example.com/apply",
          timeout_seconds: 120,
          message: "Please solve the CAPTCHA",
        },
      }),
    });

    expect(res.statusCode).toBe(200);

    const task = taskStore.get(TASK_1_ID);
    expect(task?.status).toBe("waiting_human");
    expect(task?.interactionType).toBe("captcha");
    expect(task?.interactionData).toBeDefined();
  });

  // W-05: Handles resumed status
  it("W-05: handles resumed status, sets task to in_progress", async () => {
    // First set to waiting_human
    const task = taskStore.get(TASK_1_ID)!;
    task.status = "waiting_human";
    task.interactionType = "captcha";
    task.interactionData = { type: "captcha" };

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/webhooks/ghosthands",
      headers: {
        "x-gh-service-key": GH_SERVICE_SECRET,
        "content-type": "application/json",
      },
      payload: JSON.stringify({
        job_id: GH_JOB_1,
        valet_task_id: TASK_1_ID,
        status: "resumed",
      }),
    });

    expect(res.statusCode).toBe(200);

    const updated = taskStore.get(TASK_1_ID);
    expect(updated?.status).toBe("in_progress");
    // Interaction data should be cleared
    expect(updated?.interactionType).toBeNull();
    expect(updated?.interactionData).toBeNull();
  });

  // W-06: Rejects malformed payload
  it("W-06: rejects malformed payload (missing job_id)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/webhooks/ghosthands",
      headers: {
        "x-gh-service-key": GH_SERVICE_SECRET,
        "content-type": "application/json",
      },
      payload: JSON.stringify({
        status: "completed",
        // missing job_id
      }),
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("Bad Request");
  });

  // W-06b: Rejects malformed payload (missing status)
  it("W-06b: rejects malformed payload (missing status)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/webhooks/ghosthands",
      headers: {
        "x-gh-service-key": GH_SERVICE_SECRET,
        "content-type": "application/json",
      },
      payload: JSON.stringify({
        job_id: GH_JOB_1,
        // missing status
      }),
    });

    expect(res.statusCode).toBe(400);
  });

  // W-07: Stores cost data
  it("W-07: stores cost data from callback", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/webhooks/ghosthands",
      headers: {
        "x-gh-service-key": GH_SERVICE_SECRET,
        "content-type": "application/json",
      },
      payload: JSON.stringify({
        job_id: GH_JOB_1,
        valet_task_id: TASK_1_ID,
        status: "completed",
        result_summary: "Applied successfully",
        cost: {
          total_cost_usd: 0.0342,
          action_count: 15,
          total_tokens: 4500,
        },
      }),
    });

    expect(res.statusCode).toBe(200);

    // Verify updateLlmUsage was called
    expect(cradle.taskRepo.updateLlmUsage).toHaveBeenCalledWith(
      TASK_1_ID,
      expect.objectContaining({
        totalCostUsd: 0.0342,
        actionCount: 15,
        totalTokens: 4500,
      }),
    );

    // Verify in-memory store
    const task = taskStore.get(TASK_1_ID);
    expect(task?.llmCostUsd).toBe(0.0342);
    expect(task?.llmActionCount).toBe(15);
    expect(task?.llmTotalTokens).toBe(4500);
  });

  // W-08: Deploy webhook verifies HMAC
  it("W-08: deploy webhook accepts valid HMAC signature", async () => {
    const payload = {
      event: "ghosthands.deploy_ready",
      image_tag: "v1.2.3",
      commit_sha: "abc1234",
      commit_message: "fix: resolve race condition",
      branch: "main",
      environment: "staging",
      repository: "WeKruit/GHOST-HANDS",
      run_url: "https://github.com/WeKruit/GHOST-HANDS/actions/runs/12345",
    };

    const signature = signPayload(payload, VALET_DEPLOY_WEBHOOK_SECRET);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/webhooks/ghosthands/deploy",
      headers: {
        "x-gh-webhook-signature": signature,
        "content-type": "application/json",
      },
      payload: JSON.stringify(payload),
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.received).toBe(true);
    expect(body.deploy_id).toBeDefined();
    expect(body.environment).toBe("staging");
  });

  // W-09: Deploy webhook rejects bad HMAC
  it("W-09: deploy webhook rejects invalid HMAC signature", async () => {
    const payload = {
      event: "ghosthands.deploy_ready",
      image_tag: "v1.2.3",
      commit_sha: "abc1234",
      commit_message: "fix: something",
      branch: "main",
      environment: "staging",
      repository: "WeKruit/GHOST-HANDS",
      run_url: "https://github.com/WeKruit/GHOST-HANDS/actions/runs/12345",
    };

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/webhooks/ghosthands/deploy",
      headers: {
        "x-gh-webhook-signature":
          "sha256=0000000000000000000000000000000000000000000000000000000000000000",
        "content-type": "application/json",
      },
      payload: JSON.stringify(payload),
    });

    expect(res.statusCode).toBe(401);
    expect(res.json().error).toBe("Invalid signature");
  });

  // W-09b: Deploy webhook rejects missing signature header
  it("W-09b: deploy webhook rejects missing signature header", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/webhooks/ghosthands/deploy",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({ event: "ghosthands.deploy_ready" }),
    });

    expect(res.statusCode).toBe(401);
    expect(res.json().error).toBe("Missing signature header");
  });

  // W-01b: Verify auth via query param (GH callbackNotifier style)
  it("W-01b: accepts auth via query param token", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/webhooks/ghosthands?token=${GH_SERVICE_SECRET}`,
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({
        job_id: GH_JOB_1,
        valet_task_id: TASK_1_ID,
        status: "running",
      }),
    });

    expect(res.statusCode).toBe(200);
    expect(taskStore.get(TASK_1_ID)?.status).toBe("in_progress");
  });
});
