/**
 * Tasks CRUD regression tests (T-01 through T-18).
 *
 * Self-contained Fastify app with mocked TaskService and DI container.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import * as jose from "jose";
import { randomUUID } from "node:crypto";

const TEST_JWT_SECRET = "test-jwt-secret-do-not-use-in-production";
const SECRET_KEY = new TextEncoder().encode(TEST_JWT_SECRET);

// ---- Token helper ----------------------------------------------------------

async function createAccessToken(claims: { sub: string; email: string; role?: string }) {
  return new jose.SignJWT({
    email: claims.email,
    role: claims.role ?? "user",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(SECRET_KEY);
}

// ---- Test data -------------------------------------------------------------

const ALICE_ID = randomUUID();
const BOB_ID = randomUUID();

function makeTask(overrides: Record<string, unknown> = {}) {
  return {
    id: randomUUID(),
    userId: ALICE_ID,
    jobUrl: "https://www.linkedin.com/jobs/view/1234567890",
    platform: "linkedin",
    status: "created",
    mode: "copilot",
    progress: 0,
    currentStep: null,
    jobTitle: "Software Engineer",
    companyName: "Acme Corp",
    externalStatus: null,
    notes: null,
    workflowRunId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    completedAt: null,
    ...overrides,
  };
}

// Persistent task store (simulates DB)
const taskStore = new Map<string, ReturnType<typeof makeTask>>();

// Pre-populated tasks
const ALICE_TASK_1 = makeTask({ userId: ALICE_ID, status: "queued", workflowRunId: "gh-job-1" });
const ALICE_TASK_COMPLETED = makeTask({
  userId: ALICE_ID,
  status: "completed",
  progress: 100,
  completedAt: new Date(),
});
const ALICE_TASK_FAILED = makeTask({
  userId: ALICE_ID,
  status: "failed",
  workflowRunId: "gh-job-2",
});
const ALICE_TASK_WAITING = makeTask({
  userId: ALICE_ID,
  status: "waiting_human",
  workflowRunId: "gh-job-3",
});
const BOB_TASK = makeTask({ userId: BOB_ID });

taskStore.set(ALICE_TASK_1.id, ALICE_TASK_1);
taskStore.set(ALICE_TASK_COMPLETED.id, ALICE_TASK_COMPLETED);
taskStore.set(ALICE_TASK_FAILED.id, ALICE_TASK_FAILED);
taskStore.set(ALICE_TASK_WAITING.id, ALICE_TASK_WAITING);
taskStore.set(BOB_TASK.id, BOB_TASK);

// SSRF private IP patterns (mirrors production)
const PRIVATE_IP_PATTERNS = [
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^0\./,
  /^169\.254\./,
  /^fc00:/i,
  /^fd/i,
  /^::1$/,
  /^localhost$/i,
  /^0\.0\.0\.0$/,
];

// ---- Mock services ---------------------------------------------------------

const mockGhosthandsClient = {
  cancelJob: vi.fn().mockResolvedValue(undefined),
  retryJob: vi.fn().mockResolvedValue(undefined),
  resumeJob: vi.fn().mockResolvedValue({ job_id: "gh-job-3", status: "resumed" }),
};

function createMockCradle() {
  return {
    taskService: {
      create: async (body: Record<string, unknown>, userId: string) => {
        // Validate jobUrl
        if (!body.jobUrl || typeof body.jobUrl !== "string") {
          throw Object.assign(new Error("Invalid request data"), {
            statusCode: 400,
            code: "VALIDATION_ERROR",
          });
        }

        let parsedUrl: URL;
        try {
          parsedUrl = new URL(body.jobUrl as string);
        } catch {
          throw Object.assign(new Error("Invalid job URL"), {
            statusCode: 400,
            code: "VALIDATION_ERROR",
          });
        }

        if (!["http:", "https:"].includes(parsedUrl.protocol)) {
          throw Object.assign(new Error("Job URL must use http or https protocol"), {
            statusCode: 400,
            code: "VALIDATION_ERROR",
          });
        }

        if (PRIVATE_IP_PATTERNS.some((p) => p.test(parsedUrl.hostname))) {
          throw Object.assign(
            new Error("Job URL must not point to a private or internal address"),
            { statusCode: 400, code: "VALIDATION_ERROR" },
          );
        }

        const task = makeTask({
          userId,
          jobUrl: body.jobUrl as string,
          status: "created",
        });
        taskStore.set(task.id, task);
        return task;
      },

      list: async (userId: string, query: Record<string, unknown>) => {
        const userTasks = Array.from(taskStore.values()).filter((t) => t.userId === userId);
        return {
          data: userTasks,
          pagination: {
            page: (query.page as number) ?? 1,
            pageSize: (query.pageSize as number) ?? 25,
            total: userTasks.length,
            totalPages: Math.ceil(userTasks.length / ((query.pageSize as number) ?? 25)),
          },
        };
      },

      getById: async (id: string, userId: string) => {
        const task = taskStore.get(id);
        if (!task || task.userId !== userId) {
          throw Object.assign(new Error(`Task ${id} not found`), {
            statusCode: 404,
            code: "TASK_NOT_FOUND",
          });
        }
        return task;
      },

      cancel: async (id: string, userId: string) => {
        const task = taskStore.get(id);
        if (!task || task.userId !== userId) {
          throw Object.assign(new Error(`Task ${id} not found`), {
            statusCode: 404,
            code: "TASK_NOT_FOUND",
          });
        }
        const CANCELLABLE = new Set(["created", "queued", "in_progress", "waiting_human"]);
        if (!CANCELLABLE.has(task.status)) {
          throw Object.assign(
            new Error(`Task ${id} cannot be cancelled in status ${task.status}`),
            { statusCode: 409, code: "TASK_NOT_CANCELLABLE" },
          );
        }
        task.status = "cancelled";
        mockGhosthandsClient.cancelJob();
      },

      retry: async (id: string, userId: string) => {
        const task = taskStore.get(id);
        if (!task || task.userId !== userId) {
          throw Object.assign(new Error(`Task ${id} not found`), {
            statusCode: 404,
            code: "TASK_NOT_FOUND",
          });
        }
        if (task.status !== "failed") {
          throw Object.assign(new Error(`Task ${id} cannot be retried in status ${task.status}`), {
            statusCode: 409,
            code: "TASK_NOT_CANCELLABLE",
          });
        }
        task.status = "queued";
        return task;
      },

      approve: async (id: string, userId: string) => {
        const task = taskStore.get(id);
        if (!task || task.userId !== userId) {
          throw Object.assign(new Error(`Task ${id} not found`), {
            statusCode: 404,
            code: "TASK_NOT_FOUND",
          });
        }
        task.status = "in_progress";
        return task;
      },

      resolveBlocker: async (id: string, userId: string) => {
        const task = taskStore.get(id);
        if (!task || task.userId !== userId) {
          throw Object.assign(new Error(`Task ${id} not found`), {
            statusCode: 404,
            code: "TASK_NOT_FOUND",
          });
        }
        return {
          taskId: id,
          status: "waiting_human" as const,
          message: "Resume request sent to GhostHands",
        };
      },

      updateExternalStatus: async (id: string, userId: string, externalStatus: string | null) => {
        const task = taskStore.get(id);
        if (!task || task.userId !== userId) {
          throw Object.assign(new Error(`Task ${id} not found`), {
            statusCode: 404,
            code: "TASK_NOT_FOUND",
          });
        }
        task.externalStatus = externalStatus;
        return task;
      },

      stats: async (_userId: string) => ({
        total: 5,
        completed: 1,
        failed: 1,
        inProgress: 1,
        queued: 1,
        waiting: 1,
      }),

      exportCsv: async (_userId: string) => {
        return "Date,Job Title,Company,Platform,Status,External Status,URL\n2025-01-01,Software Engineer,Acme,linkedin,completed,,https://example.com";
      },
    },
    securityLogger: { logEvent: () => {} },
  };
}

// ---- Build test app --------------------------------------------------------

async function buildTaskTestApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });

  const cookie = await import("@fastify/cookie");
  await app.register(cookie.default);

  const cradle = createMockCradle();

  app.decorateRequest("diScope", null);
  app.decorateRequest("userId", "");
  app.decorateRequest("userEmail", "");
  app.decorateRequest("userRole", "user");

  app.addHook("onRequest", async (request) => {
    (request as any).diScope = { cradle };
  });

  // Auth middleware
  app.addHook("onRequest", async (request) => {
    const path = request.url.split("?")[0]!;
    if (path === "/api/v1/health") return;

    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      throw {
        statusCode: 401,
        code: "UNAUTHORIZED",
        message: "Missing or invalid authorization header",
      };
    }

    const token = authHeader.slice(7);
    try {
      const { payload } = await jose.jwtVerify(token, SECRET_KEY, {
        algorithms: ["HS256"],
      });
      if (!payload.sub || !payload.email) {
        throw { statusCode: 401, code: "UNAUTHORIZED", message: "Invalid token payload" };
      }
      request.userId = payload.sub;
      request.userEmail = payload.email as string;
      request.userRole = (payload.role as string) ?? "user";
    } catch (err: any) {
      if (err.statusCode === 401) throw err;
      throw { statusCode: 401, code: "UNAUTHORIZED", message: "Invalid or expired token" };
    }
  });

  // Error handler
  app.setErrorHandler((error, _request, reply) => {
    const status = (error as any).statusCode ?? 500;
    const code = (error as any).code ?? "INTERNAL_ERROR";
    reply.status(status).send({
      error: code,
      message: error.message ?? "An unexpected error occurred",
    });
  });

  // ---- Routes ---------------------------------------------------------------

  // T-01, T-02, T-03: POST /api/v1/tasks
  app.post("/api/v1/tasks", async (request, reply) => {
    const { taskService } = (request as any).diScope.cradle;
    const body = request.body as Record<string, unknown>;
    try {
      const task = await taskService.create(body, request.userId);
      return reply.status(201).send(task);
    } catch (err: any) {
      const status = err.statusCode ?? 500;
      return reply.status(status).send({
        error: err.code ?? "INTERNAL_ERROR",
        message: err.message,
      });
    }
  });

  // T-04, T-05: GET /api/v1/tasks
  app.get("/api/v1/tasks", async (request) => {
    const { taskService } = (request as any).diScope.cradle;
    const query = request.query as Record<string, unknown>;
    return taskService.list(request.userId, {
      page: Number(query.page) || 1,
      pageSize: Number(query.pageSize) || 25,
      sortBy: "createdAt",
      sortOrder: "desc",
    });
  });

  // T-17: GET /api/v1/tasks/stats
  app.get("/api/v1/tasks/stats", async (request) => {
    const { taskService } = (request as any).diScope.cradle;
    return taskService.stats(request.userId);
  });

  // T-18: GET /api/v1/tasks/export
  app.get("/api/v1/tasks/export", async (request, reply) => {
    const { taskService } = (request as any).diScope.cradle;
    const csv = await taskService.exportCsv(request.userId);
    reply.header("Content-Type", "text/csv");
    reply.header("Content-Disposition", "attachment; filename=tasks-export.csv");
    return csv;
  });

  // T-06, T-07, T-08: GET /api/v1/tasks/:id
  app.get("/api/v1/tasks/:id", async (request, reply) => {
    const { taskService } = (request as any).diScope.cradle;
    const { id } = request.params as { id: string };
    try {
      const task = await taskService.getById(id, request.userId);
      return task;
    } catch (err: any) {
      const status = err.statusCode ?? 500;
      return reply.status(status).send({
        error: err.code ?? "INTERNAL_ERROR",
        message: err.message,
      });
    }
  });

  // T-10, T-11: DELETE /api/v1/tasks/:id
  app.delete("/api/v1/tasks/:id", async (request, reply) => {
    const { taskService } = (request as any).diScope.cradle;
    const { id } = request.params as { id: string };
    try {
      await taskService.cancel(id, request.userId);
      return reply.status(204).send();
    } catch (err: any) {
      const status = err.statusCode ?? 500;
      return reply.status(status).send({
        error: err.code ?? "INTERNAL_ERROR",
        message: err.message,
      });
    }
  });

  // T-12, T-13: POST /api/v1/tasks/:id/retry
  app.post("/api/v1/tasks/:id/retry", async (request, reply) => {
    const { taskService } = (request as any).diScope.cradle;
    const { id } = request.params as { id: string };
    try {
      const task = await taskService.retry(id, request.userId);
      return task;
    } catch (err: any) {
      const status = err.statusCode ?? 500;
      return reply.status(status).send({
        error: err.code ?? "INTERNAL_ERROR",
        message: err.message,
      });
    }
  });

  // T-14: POST /api/v1/tasks/:id/approve
  app.post("/api/v1/tasks/:id/approve", async (request, reply) => {
    const { taskService } = (request as any).diScope.cradle;
    const { id } = request.params as { id: string };
    const body = request.body as Record<string, unknown> | undefined;
    try {
      const task = await taskService.approve(id, request.userId, body?.fieldOverrides);
      return task;
    } catch (err: any) {
      const status = err.statusCode ?? 500;
      return reply.status(status).send({
        error: err.code ?? "INTERNAL_ERROR",
        message: err.message,
      });
    }
  });

  // T-15: POST /api/v1/tasks/:id/resolve-blocker
  app.post("/api/v1/tasks/:id/resolve-blocker", async (request, reply) => {
    const { taskService } = (request as any).diScope.cradle;
    const { id } = request.params as { id: string };
    const body = request.body as Record<string, unknown> | undefined;
    try {
      const result = await taskService.resolveBlocker(
        id,
        request.userId,
        body?.resolvedBy,
        body?.notes,
      );
      return result;
    } catch (err: any) {
      const status = err.statusCode ?? 500;
      return reply.status(status).send({
        error: err.code ?? "INTERNAL_ERROR",
        message: err.message,
      });
    }
  });

  // T-16: PUT /api/v1/tasks/:id/external-status
  app.put("/api/v1/tasks/:id/external-status", async (request, reply) => {
    const { taskService } = (request as any).diScope.cradle;
    const { id } = request.params as { id: string };
    const body = request.body as { externalStatus: string | null };
    try {
      const task = await taskService.updateExternalStatus(id, request.userId, body.externalStatus);
      return task;
    } catch (err: any) {
      const status = err.statusCode ?? 500;
      return reply.status(status).send({
        error: err.code ?? "INTERNAL_ERROR",
        message: err.message,
      });
    }
  });

  await app.ready();
  return app;
}

// ---- Tests -----------------------------------------------------------------

let app: FastifyInstance;
let aliceToken: string;
let bobToken: string;

beforeAll(async () => {
  app = await buildTaskTestApp();
  aliceToken = await createAccessToken({ sub: ALICE_ID, email: "alice@example.com" });
  bobToken = await createAccessToken({ sub: BOB_ID, email: "bob@example.com" });
});

afterAll(async () => {
  await app.close();
});

describe("Tasks CRUD Regression Tests", () => {
  // T-01: POST /api/v1/tasks creates task record
  it("T-01: POST /api/v1/tasks creates task record", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tasks",
      headers: {
        authorization: `Bearer ${aliceToken}`,
        "content-type": "application/json",
      },
      payload: JSON.stringify({
        jobUrl: "https://www.linkedin.com/jobs/view/9876543210",
        mode: "copilot",
        resumeId: randomUUID(),
      }),
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.id).toBeDefined();
    expect(body.status).toBe("created");
    expect(body.jobUrl).toContain("linkedin.com");
    expect(body.platform).toBe("linkedin");
  });

  // T-02: POST /api/v1/tasks validates jobUrl
  it("T-02: POST /api/v1/tasks validates jobUrl", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tasks",
      headers: {
        authorization: `Bearer ${aliceToken}`,
        "content-type": "application/json",
      },
      payload: JSON.stringify({
        jobUrl: "not-a-valid-url",
        mode: "copilot",
        resumeId: randomUUID(),
      }),
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("VALIDATION_ERROR");
  });

  // T-03: POST /api/v1/tasks rejects private IPs (SSRF)
  it("T-03: POST /api/v1/tasks rejects private IPs (SSRF)", async () => {
    const ssrfUrls = [
      "http://127.0.0.1/jobs/view/123",
      "http://10.0.0.1/jobs/view/123",
      "http://192.168.1.1/jobs",
      "http://169.254.169.254/latest/meta-data",
      "http://localhost:3000/internal",
    ];

    for (const url of ssrfUrls) {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tasks",
        headers: {
          authorization: `Bearer ${aliceToken}`,
          "content-type": "application/json",
        },
        payload: JSON.stringify({
          jobUrl: url,
          mode: "copilot",
          resumeId: randomUUID(),
        }),
      });

      expect(res.statusCode).toBe(400);
    }
  });

  // T-04: GET /api/v1/tasks lists user's tasks
  it("T-04: GET /api/v1/tasks lists user's tasks", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/tasks",
      headers: { authorization: `Bearer ${aliceToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data).toBeDefined();
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.pagination).toBeDefined();
    expect(body.pagination.total).toBeGreaterThan(0);
  });

  // T-05: GET /api/v1/tasks does not show other users' tasks
  it("T-05: GET /api/v1/tasks does not show other users' tasks", async () => {
    const aliceRes = await app.inject({
      method: "GET",
      url: "/api/v1/tasks",
      headers: { authorization: `Bearer ${aliceToken}` },
    });
    const bobRes = await app.inject({
      method: "GET",
      url: "/api/v1/tasks",
      headers: { authorization: `Bearer ${bobToken}` },
    });

    const aliceTaskIds = aliceRes.json().data.map((t: any) => t.id);
    const bobTaskIds = bobRes.json().data.map((t: any) => t.id);

    // Alice's task list should not contain Bob's tasks and vice versa
    expect(aliceTaskIds).not.toContain(BOB_TASK.id);
    expect(bobTaskIds).not.toContain(ALICE_TASK_1.id);
  });

  // T-06: GET /api/v1/tasks/:id returns task detail
  it("T-06: GET /api/v1/tasks/:id returns task detail", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/tasks/${ALICE_TASK_1.id}`,
      headers: { authorization: `Bearer ${aliceToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.id).toBe(ALICE_TASK_1.id);
    expect(body.userId).toBe(ALICE_ID);
    expect(body.jobUrl).toBeDefined();
    expect(body.status).toBeDefined();
  });

  // T-07: GET /api/v1/tasks/:id returns 404 for other user's task
  it("T-07: GET /api/v1/tasks/:id returns 404 for other user's task", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/tasks/${BOB_TASK.id}`,
      headers: { authorization: `Bearer ${aliceToken}` },
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe("TASK_NOT_FOUND");
  });

  // T-08: GET /api/v1/tasks/:id returns 404 for nonexistent task
  it("T-08: GET /api/v1/tasks/:id returns 404 for nonexistent task", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/tasks/${randomUUID()}`,
      headers: { authorization: `Bearer ${aliceToken}` },
    });

    expect(res.statusCode).toBe(404);
  });

  // T-10: DELETE /api/v1/tasks/:id cancels task
  it("T-10: DELETE /api/v1/tasks/:id cancels task", async () => {
    const res = await app.inject({
      method: "DELETE",
      url: `/api/v1/tasks/${ALICE_TASK_1.id}`,
      headers: { authorization: `Bearer ${aliceToken}` },
    });

    expect(res.statusCode).toBe(204);
    expect(mockGhosthandsClient.cancelJob).toHaveBeenCalled();
  });

  // T-11: DELETE cancel on completed task returns 409
  it("T-11: DELETE cancel on completed task returns 409", async () => {
    const res = await app.inject({
      method: "DELETE",
      url: `/api/v1/tasks/${ALICE_TASK_COMPLETED.id}`,
      headers: { authorization: `Bearer ${aliceToken}` },
    });

    expect(res.statusCode).toBe(409);
  });

  // T-12: POST /api/v1/tasks/:id/retry on failed task
  it("T-12: POST /api/v1/tasks/:id/retry on failed task returns 200", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/tasks/${ALICE_TASK_FAILED.id}/retry`,
      headers: { authorization: `Bearer ${aliceToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe("queued");
  });

  // T-13: POST /api/v1/tasks/:id/retry on non-failed task returns 409
  it("T-13: POST /api/v1/tasks/:id/retry on non-failed task returns 409", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/tasks/${ALICE_TASK_COMPLETED.id}/retry`,
      headers: { authorization: `Bearer ${aliceToken}` },
    });

    expect(res.statusCode).toBe(409);
  });

  // T-14: POST /api/v1/tasks/:id/approve resumes waiting_human
  it("T-14: POST /api/v1/tasks/:id/approve resumes waiting_human task", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/tasks/${ALICE_TASK_WAITING.id}/approve`,
      headers: {
        authorization: `Bearer ${aliceToken}`,
        "content-type": "application/json",
      },
      payload: JSON.stringify({ fieldOverrides: {} }),
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe("in_progress");
  });

  // T-15: POST /api/v1/tasks/:id/resolve-blocker
  it("T-15: POST /api/v1/tasks/:id/resolve-blocker returns 200", async () => {
    // Reset ALICE_TASK_WAITING status back for this test
    ALICE_TASK_WAITING.status = "waiting_human";

    const res = await app.inject({
      method: "POST",
      url: `/api/v1/tasks/${ALICE_TASK_WAITING.id}/resolve-blocker`,
      headers: {
        authorization: `Bearer ${aliceToken}`,
        "content-type": "application/json",
      },
      payload: JSON.stringify({ resolvedBy: "human", notes: "Solved the captcha" }),
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.taskId).toBe(ALICE_TASK_WAITING.id);
    expect(body.message).toContain("GhostHands");
  });

  // T-16: PUT /api/v1/tasks/:id/external-status
  it("T-16: PUT /api/v1/tasks/:id/external-status updates and persists", async () => {
    const res = await app.inject({
      method: "PUT",
      url: `/api/v1/tasks/${ALICE_TASK_COMPLETED.id}/external-status`,
      headers: {
        authorization: `Bearer ${aliceToken}`,
        "content-type": "application/json",
      },
      payload: JSON.stringify({ externalStatus: "interviewing" }),
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.externalStatus).toBe("interviewing");
  });

  // T-17: GET /api/v1/tasks/stats
  it("T-17: GET /api/v1/tasks/stats returns stats", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/tasks/stats",
      headers: { authorization: `Bearer ${aliceToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.total).toBeDefined();
    expect(body.completed).toBeDefined();
    expect(body.failed).toBeDefined();
  });

  // T-18: GET /api/v1/tasks/export returns CSV
  it("T-18: GET /api/v1/tasks/export returns CSV", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/tasks/export",
      headers: { authorization: `Bearer ${aliceToken}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/csv");
    const body = res.body;
    expect(body).toContain("Date,Job Title,Company");
  });
});
