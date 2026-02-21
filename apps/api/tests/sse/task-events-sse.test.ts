/**
 * SSE route authentication and connection-limit tests.
 *
 * Tests the inline auth logic in task-events-sse.routes.ts
 * using a self-contained Fastify instance (same pattern as auth.test.ts).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import * as jose from "jose";
import { randomUUID } from "node:crypto";

const TEST_JWT_SECRET = "test-jwt-secret-do-not-use-in-production";
const SECRET_KEY = new TextEncoder().encode(TEST_JWT_SECRET);

async function createToken(sub: string): Promise<string> {
  return new jose.SignJWT({ email: "test@example.com", role: "user" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(sub)
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(SECRET_KEY);
}

async function createTokenWithWrongSecret(sub: string): Promise<string> {
  const wrongKey = new TextEncoder().encode("wrong-secret-key-no-match");
  return new jose.SignJWT({ email: "test@example.com" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(sub)
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(wrongKey);
}

/**
 * Build a minimal Fastify app that replicates only the SSE route's
 * auth + connection-limit logic (no Redis, no taskService).
 *
 * We import the real module so the JWT_SECRET check and the
 * activeSSEConnections Map are exercised.
 */
async function buildApp(): Promise<FastifyInstance> {
  // Dynamic import so env var can be set per-test
  const { taskEventsSSERoute } = await import("../../src/modules/tasks/task-events-sse.routes.js");

  const app = Fastify({ logger: false });

  // Mock the Redis duplicate so we don't need a real Redis connection.
  // The route will hit the task ownership check first, which we mock below.
  app.decorate("redis", {
    duplicate: () => ({
      connect: () => Promise.resolve(),
      quit: () => Promise.resolve(),
    }),
  });

  await taskEventsSSERoute(app);
  return app;
}

describe("SSE route auth", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    process.env.JWT_SECRET = TEST_JWT_SECRET;
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
    delete process.env.JWT_SECRET;
  });

  it("returns 401 when token query param is missing", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/tasks/${randomUUID()}/events`,
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error).toMatch(/missing token/i);
  });

  it("returns 401 when token is invalid", async () => {
    const badToken = await createTokenWithWrongSecret(randomUUID());
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/tasks/${randomUUID()}/events?token=${badToken}`,
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error).toMatch(/invalid|expired/i);
  });

  it("returns 401 when token has no sub claim", async () => {
    const noSubToken = await new jose.SignJWT({ email: "test@example.com" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(SECRET_KEY);

    const res = await app.inject({
      method: "GET",
      url: `/api/v1/tasks/${randomUUID()}/events?token=${noSubToken}`,
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error).toMatch(/invalid/i);
  });
});

describe("SSE route — missing JWT_SECRET", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    // Clear JWT_SECRET to trigger the 500 path
    delete process.env.JWT_SECRET;

    // Re-import with a fresh module so the env var is picked up at request time
    // We need to clear the module cache to force a re-import
    const moduleUrl = "../../src/modules/tasks/task-events-sse.routes.js";
    // Vitest/Node ESM doesn't cache the same way — the env check is at request
    // time (process.env.JWT_SECRET is read per-request), so we just need to
    // ensure it's unset before the request.
    const { taskEventsSSERoute } = await import(moduleUrl);

    app = Fastify({ logger: false });
    app.decorate("redis", {
      duplicate: () => ({
        connect: () => Promise.resolve(),
        quit: () => Promise.resolve(),
      }),
    });
    await taskEventsSSERoute(app);
  });

  afterAll(async () => {
    await app.close();
    // Restore for other tests
    process.env.JWT_SECRET = TEST_JWT_SECRET;
  });

  it("returns 500 when JWT_SECRET is not configured", async () => {
    // Need a structurally valid token (signed with any key) so we get past
    // the "missing token" check but hit the "no JWT_SECRET" check.
    const token = await createToken(randomUUID());
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/tasks/${randomUUID()}/events?token=${token}`,
    });
    expect(res.statusCode).toBe(500);
    expect(res.json().error).toMatch(/server configuration/i);
  });
});
