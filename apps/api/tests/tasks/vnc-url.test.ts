/**
 * WEK-134: VNC URL endpoint tests.
 *
 * Tests GET /api/v1/tasks/:id/vnc-url — returns the noVNC live-view URL
 * for the sandbox running a given task.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import * as jose from "jose";
import { randomUUID } from "node:crypto";

const TEST_JWT_SECRET = "test-jwt-secret-do-not-use-in-production";
const SECRET_KEY = new TextEncoder().encode(TEST_JWT_SECRET);

// ── Token helper ──────────────────────────────────────────────────────────────

async function createAccessToken(claims: { sub: string; email: string }) {
  return new jose.SignJWT({
    email: claims.email,
    role: "user",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(SECRET_KEY);
}

// ── Test data ─────────────────────────────────────────────────────────────────

const ALICE_ID = randomUUID();
const BOB_ID = randomUUID();
const SANDBOX_ID = randomUUID();
const SANDBOX_VNC_URL = "https://52.200.199.70:6080";

const TASK_WITH_VNC = {
  id: randomUUID(),
  userId: ALICE_ID,
  sandboxId: SANDBOX_ID,
  status: "in_progress",
};

const TASK_NO_SANDBOX = {
  id: randomUUID(),
  userId: ALICE_ID,
  sandboxId: null,
  status: "in_progress",
};

const TASK_NO_VNC = {
  id: randomUUID(),
  userId: ALICE_ID,
  sandboxId: randomUUID(), // sandbox exists but has no novncUrl
  status: "in_progress",
};

const BOB_TASK = {
  id: randomUUID(),
  userId: BOB_ID,
  sandboxId: SANDBOX_ID,
  status: "in_progress",
};

// ── Mock services ─────────────────────────────────────────────────────────────

function createMockTaskService() {
  return {
    getVncUrl: vi.fn(async (taskId: string, userId: string) => {
      // Task not found or wrong user
      if (taskId === TASK_WITH_VNC.id && userId === ALICE_ID) {
        return { url: SANDBOX_VNC_URL, readOnly: true };
      }
      if (taskId === TASK_NO_SANDBOX.id && userId === ALICE_ID) {
        return null;
      }
      if (taskId === TASK_NO_VNC.id && userId === ALICE_ID) {
        return null;
      }
      if (taskId === BOB_TASK.id && userId === BOB_ID) {
        return { url: SANDBOX_VNC_URL, readOnly: true };
      }
      // Not found (wrong user or non-existent task)
      const err = new Error("Task not found");
      (err as any).statusCode = 404;
      (err as any).code = "TASK_NOT_FOUND";
      throw err;
    }),
  };
}

// ── Build test app ────────────────────────────────────────────────────────────

async function buildTestApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });

  const cradle = { taskService: createMockTaskService() };

  // Mock DI scope on request
  app.addHook("onRequest", async (request) => {
    (request as any).diScope = { cradle };
  });

  // Auth middleware
  app.addHook("onRequest", async (request, reply) => {
    const path = request.url.split("?")[0]!;
    // All /api/v1/tasks/ routes require auth
    if (!path.startsWith("/api/v1/tasks/")) return;

    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return reply.status(401).send({
        error: "UNAUTHORIZED",
        message: "Missing or invalid authorization header",
      });
    }

    const token = authHeader.slice(7);
    try {
      const { payload } = await jose.jwtVerify(token, SECRET_KEY, {
        algorithms: ["HS256"],
      });
      if (!payload.sub || !payload.email) {
        return reply.status(401).send({
          error: "UNAUTHORIZED",
          message: "Invalid token payload",
        });
      }
      (request as any).userId = payload.sub;
    } catch {
      return reply.status(401).send({
        error: "UNAUTHORIZED",
        message: "Invalid or expired token",
      });
    }
  });

  // Register the VNC URL route
  app.get("/api/v1/tasks/:id/vnc-url", async (request, reply) => {
    const { taskService } = (request as any).diScope.cradle;
    const { id } = request.params as { id: string };
    const userId = (request as any).userId;

    try {
      const result = await taskService.getVncUrl(id, userId);
      if (!result) {
        return reply.status(404).send({
          error: "NOT_FOUND",
          message: "VNC URL not available for this task",
        });
      }
      return reply.status(200).send(result);
    } catch (err: any) {
      if (err.statusCode === 404) {
        return reply.status(404).send({
          error: err.code ?? "NOT_FOUND",
          message: err.message,
        });
      }
      throw err;
    }
  });

  app.setErrorHandler((error, _request, reply) => {
    const status = (error as any).statusCode ?? 500;
    const code = (error as any).code ?? "INTERNAL_ERROR";
    reply.status(status).send({
      error: code,
      message: error.message ?? "An unexpected error occurred",
    });
  });

  await app.ready();
  return app;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("GET /api/v1/tasks/:id/vnc-url", () => {
  let app: FastifyInstance;
  let aliceToken: string;
  let bobToken: string;

  beforeAll(async () => {
    app = await buildTestApp();
    aliceToken = await createAccessToken({ sub: ALICE_ID, email: "alice@example.com" });
    bobToken = await createAccessToken({ sub: BOB_ID, email: "bob@example.com" });
  });

  afterAll(async () => {
    await app.close();
  });

  it("returns 401 without auth token", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/tasks/${TASK_WITH_VNC.id}/vnc-url`,
    });

    expect(res.statusCode).toBe(401);
    expect(res.json().error).toBe("UNAUTHORIZED");
  });

  it("returns 401 with invalid token", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/tasks/${TASK_WITH_VNC.id}/vnc-url`,
      headers: { authorization: "Bearer invalid-token" },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json().error).toBe("UNAUTHORIZED");
  });

  it("returns 404 for non-existent task", async () => {
    const fakeId = randomUUID();
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/tasks/${fakeId}/vnc-url`,
      headers: { authorization: `Bearer ${aliceToken}` },
    });

    expect(res.statusCode).toBe(404);
  });

  it("returns 404 when task belongs to another user", async () => {
    // Alice tries to access Bob's task
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/tasks/${BOB_TASK.id}/vnc-url`,
      headers: { authorization: `Bearer ${aliceToken}` },
    });

    expect(res.statusCode).toBe(404);
  });

  it("returns 404 when task has no sandboxId", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/tasks/${TASK_NO_SANDBOX.id}/vnc-url`,
      headers: { authorization: `Bearer ${aliceToken}` },
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe("NOT_FOUND");
    expect(res.json().message).toContain("VNC URL not available");
  });

  it("returns 404 when sandbox has no novncUrl", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/tasks/${TASK_NO_VNC.id}/vnc-url`,
      headers: { authorization: `Bearer ${aliceToken}` },
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe("NOT_FOUND");
  });

  it("returns { url, readOnly } for valid task with VNC URL", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/tasks/${TASK_WITH_VNC.id}/vnc-url`,
      headers: { authorization: `Bearer ${aliceToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.url).toBe(SANDBOX_VNC_URL);
    expect(body.readOnly).toBe(true);
  });

  it("returns VNC URL for task owner (Bob)", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/tasks/${BOB_TASK.id}/vnc-url`,
      headers: { authorization: `Bearer ${bobToken}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().url).toBe(SANDBOX_VNC_URL);
  });
});
