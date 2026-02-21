/**
 * SSE streaming endpoint auth tests.
 *
 * Self-contained Fastify app that tests the SSE route's JWT auth,
 * connection limits, and task ownership checks.
 *
 * Note: Tests focus on the auth/guard layer (401, 404, 500 paths) which all
 * return before the XREAD loop. The streaming path is not tested here because
 * Fastify inject() does not emit raw socket "close" events, which would cause
 * the XREAD loop to run forever.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import * as jose from "jose";
import { randomUUID } from "node:crypto";

const TEST_JWT_SECRET = "test-jwt-secret-do-not-use-in-production";
const SECRET_KEY = new TextEncoder().encode(TEST_JWT_SECRET);

// ---- Token helper ----------------------------------------------------------

async function createAccessToken(claims: { sub: string; email: string }) {
  return new jose.SignJWT({ email: claims.email })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(SECRET_KEY);
}

// ---- Test data -------------------------------------------------------------

const USER_ID = randomUUID();
const TASK_ID = randomUUID();
const TASK_NO_JOB_ID = randomUUID();
const JOB_ID = randomUUID();

// ---- Build test app --------------------------------------------------------

async function buildSSETestApp(opts?: {
  jwtSecret?: string | undefined;
}): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });

  // Set JWT_SECRET env for the route
  const originalSecret = process.env.JWT_SECRET;
  if (opts?.jwtSecret !== undefined) {
    if (opts.jwtSecret === "") {
      delete process.env.JWT_SECRET;
    } else {
      process.env.JWT_SECRET = opts.jwtSecret;
    }
  } else {
    process.env.JWT_SECRET = TEST_JWT_SECRET;
  }

  // Mock redis — xread throws immediately so the XREAD loop terminates
  const mockRedis = {
    duplicate: () => ({
      xread: async () => {
        throw new Error("mock: connection closed");
      },
      disconnect: () => {},
    }),
  };
  app.decorate("redis", mockRedis);

  // Mock DI cradle
  const mockCradle = {
    taskService: {
      getById: async (taskId: string, userId: string) => {
        if (taskId === TASK_ID && userId === USER_ID) {
          return { id: TASK_ID, ghJob: { jobId: JOB_ID } };
        }
        if (taskId === TASK_NO_JOB_ID && userId === USER_ID) {
          return { id: TASK_NO_JOB_ID, ghJob: null };
        }
        throw new Error("Task not found");
      },
    },
    securityLogger: {
      logEvent: () => {},
    },
  };

  app.decorateRequest("diScope", null);
  app.addHook("onRequest", async (request) => {
    (request as any).diScope = { cradle: mockCradle };
  });

  // Import and register the SSE route
  const { taskEventsSSERoutes } = await import("../../src/modules/tasks/task-events-sse.routes.js");
  await app.register(taskEventsSSERoutes);

  // Restore env in onClose
  app.addHook("onClose", async () => {
    if (originalSecret !== undefined) {
      process.env.JWT_SECRET = originalSecret;
    } else {
      delete process.env.JWT_SECRET;
    }
  });

  await app.ready();
  return app;
}

// ---- Tests -----------------------------------------------------------------

describe("SSE Auth Tests", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildSSETestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it("returns 401 when token query param is missing", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/tasks/${TASK_ID}/events/stream`,
    });

    expect(res.statusCode).toBe(401);
    expect(res.json().error).toBe("Missing token query parameter");
  });

  it("returns 401 with an invalid JWT", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/tasks/${TASK_ID}/events/stream?token=not-a-valid-jwt`,
    });

    expect(res.statusCode).toBe(401);
    expect(res.json().error).toBe("Invalid or expired token");
  });

  it("returns 401 with a JWT signed with wrong secret", async () => {
    const wrongKey = new TextEncoder().encode("wrong-secret");
    const token = await new jose.SignJWT({ email: "test@example.com" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(USER_ID)
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(wrongKey);

    const res = await app.inject({
      method: "GET",
      url: `/api/v1/tasks/${TASK_ID}/events/stream?token=${token}`,
    });

    expect(res.statusCode).toBe(401);
    expect(res.json().error).toBe("Invalid or expired token");
  });

  it("returns 404 when user does not own the task", async () => {
    const otherUserId = randomUUID();
    const token = await createAccessToken({
      sub: otherUserId,
      email: "other@example.com",
    });

    const res = await app.inject({
      method: "GET",
      url: `/api/v1/tasks/${TASK_ID}/events/stream?token=${token}`,
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe("Task not found");
  });

  it("returns SSE comment and closes when task has no GH job", async () => {
    const token = await createAccessToken({
      sub: USER_ID,
      email: "test@example.com",
    });

    const res = await app.inject({
      method: "GET",
      url: `/api/v1/tasks/${TASK_NO_JOB_ID}/events/stream?token=${token}`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("text/event-stream");
    expect(res.body).toContain("no GH job");
  });
});

describe("SSE Missing JWT_SECRET", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildSSETestApp({ jwtSecret: "" });
  });

  afterAll(async () => {
    await app.close();
  });

  it("returns 500 when JWT_SECRET is not configured", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/tasks/${TASK_ID}/events/stream?token=some-token`,
    });

    expect(res.statusCode).toBe(500);
    expect(res.json().error).toBe("Server configuration error");
  });
});
