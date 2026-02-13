import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildTestApp, createToken } from "./setup";

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildTestApp();
});

afterAll(async () => {
  await app.close();
});

describe("Rate Limiting", () => {
  it("returns 429 after exceeding 100 requests per minute", async () => {
    const token = await createToken({ sub: "rate-limit-test-user" });

    // Send 101 requests -- the 101st should be rate-limited
    const results: number[] = [];
    for (let i = 0; i < 101; i++) {
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/health",
        headers: { authorization: `Bearer ${token}` },
      });
      results.push(res.statusCode);
    }

    expect(results.filter((s) => s === 429).length).toBeGreaterThanOrEqual(1);
    expect(results.slice(0, 100).every((s) => s === 200)).toBe(true);
  });

  it("returns correct rate limit error response format", async () => {
    const token = await createToken({ sub: "rate-format-test-user" });

    // Exhaust rate limit
    for (let i = 0; i < 101; i++) {
      await app.inject({
        method: "GET",
        url: "/api/v1/health",
        headers: { authorization: `Bearer ${token}` },
      });
    }

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/health",
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(429);
    const body = res.json();
    expect(body.error).toBe("RATE_LIMIT_EXCEEDED");
    expect(body.message).toBeDefined();
  });

  it("includes X-RateLimit-* headers in responses", async () => {
    const token = await createToken({ sub: "rate-header-test-user" });

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/health",
      headers: { authorization: `Bearer ${token}` },
    });

    // @fastify/rate-limit sets these headers by default
    expect(res.headers["x-ratelimit-limit"]).toBeDefined();
    expect(res.headers["x-ratelimit-remaining"]).toBeDefined();
    expect(res.headers["x-ratelimit-reset"]).toBeDefined();
  });

  it("applies rate limit per-user (different users get separate buckets)", async () => {
    const userA = await createToken({ sub: "rate-user-a" });
    const userB = await createToken({ sub: "rate-user-b" });

    // Exhaust user A's limit
    for (let i = 0; i < 101; i++) {
      await app.inject({
        method: "GET",
        url: "/api/v1/health",
        headers: { authorization: `Bearer ${userA}` },
      });
    }

    // User B should still be able to make requests
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/health",
      headers: { authorization: `Bearer ${userB}` },
    });
    expect(res.statusCode).toBe(200);
  });

  // TODO: Per-platform rate limits (e.g., LinkedIn: 20 applications/day)
  // These limits are enforced at the application/service layer, not HTTP middleware.
  // Once TaskService implements platform-specific daily caps, add tests here:
  //
  // it("enforces per-platform daily limits (LinkedIn: 20 apps/day)", async () => {
  //   const token = await createToken({ sub: "platform-limit-user" });
  //   // Submit 20 LinkedIn applications, expect 21st to return 429 or 400
  //   // with a platform-specific error code
  // });
});
