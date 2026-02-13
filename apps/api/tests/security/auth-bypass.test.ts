import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import {
  buildTestApp,
  createToken,
  createTokenWithWrongSecret,
  createTokenWithoutSub,
  createTokenWithoutEmail,
} from "./setup";

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildTestApp();
});

afterAll(async () => {
  await app.close();
});

describe("Auth Bypass", () => {
  // ---- Missing / malformed credentials ------------------------------------

  it("returns 401 when no Authorization header is provided", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/tasks" });
    expect(res.statusCode).toBe(401);
    expect(res.json().error).toBe("UNAUTHORIZED");
  });

  it("returns 401 when Authorization header has no Bearer prefix", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/tasks",
      headers: { authorization: "Token some-random-value" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("returns 401 when Authorization header has empty Bearer token", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/tasks",
      headers: { authorization: "Bearer " },
    });
    expect(res.statusCode).toBe(401);
  });

  // ---- Invalid tokens -----------------------------------------------------

  it("returns 401 for an expired JWT", async () => {
    const expiredToken = await createToken({ sub: randomUUID() }, "-1h");
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/tasks",
      headers: { authorization: `Bearer ${expiredToken}` },
    });
    expect(res.statusCode).toBe(401);
  });

  it("returns 401 for a malformed JWT (not a valid JWT string)", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/tasks",
      headers: { authorization: "Bearer not.a.valid.jwt.token" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("returns 401 for a JWT signed with the wrong secret", async () => {
    const token = await createTokenWithWrongSecret(randomUUID());
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/tasks",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(401);
  });

  it("returns 401 for a JWT with missing sub claim", async () => {
    const token = await createTokenWithoutSub();
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/tasks",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(401);
  });

  it("returns 401 for a JWT with missing email claim", async () => {
    const token = await createTokenWithoutEmail();
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/tasks",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(401);
  });

  // ---- Missing user in DB for a valid JWT ---------------------------------

  it("returns 401 when JWT is valid but user does not exist in DB", async () => {
    // Token is valid (proper secret, not expired, has sub + email)
    // but the userId does not correspond to any user in the database
    const nonExistentUserId = randomUUID();
    const token = await createToken({ sub: nonExistentUserId });
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/auth/me",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error).toBe("UNAUTHORIZED");
    expect(res.json().message).toContain("User not found");
  });

  // ---- Public endpoints ---------------------------------------------------

  it("allows unauthenticated access to public health endpoint", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe("ok");
  });

  // ---- Cross-user access control ------------------------------------------

  it("returns 404 (not 403) when accessing another user's task", async () => {
    const aliceToken = await createToken({ sub: "alice-user-id", email: "alice@example.com" });
    const bobToken = await createToken({ sub: "bob-user-id", email: "bob@example.com" });

    // Alice can access her own task
    const aliceRes = await app.inject({
      method: "GET",
      url: "/api/v1/tasks/task-owned-by-alice",
      headers: { authorization: `Bearer ${aliceToken}` },
    });
    expect(aliceRes.statusCode).toBe(200);
    expect(aliceRes.json().userId).toBe("alice-user-id");

    // Bob tries to access Alice's task -- should get 404, NOT 403
    const bobRes = await app.inject({
      method: "GET",
      url: "/api/v1/tasks/task-owned-by-alice",
      headers: { authorization: `Bearer ${bobToken}` },
    });
    expect(bobRes.statusCode).toBe(404);
    expect(bobRes.json().error).toBe("NOT_FOUND");
    // Response must not leak that the resource exists
    expect(bobRes.json().message).not.toContain("forbidden");
    expect(bobRes.json().message).not.toContain("permission");
  });

  // ---- All protected routes require auth ----------------------------------

  const protectedRoutes = [
    { method: "GET" as const, url: "/api/v1/tasks" },
    { method: "GET" as const, url: "/api/v1/tasks/some-id" },
    { method: "POST" as const, url: "/api/v1/tasks" },
    { method: "POST" as const, url: "/api/v1/resumes/upload" },
    { method: "GET" as const, url: "/api/v1/auth/me" },
  ];

  for (const route of protectedRoutes) {
    it(`requires auth for ${route.method} ${route.url}`, async () => {
      const res = await app.inject({ method: route.method, url: route.url });
      expect(res.statusCode).toBe(401);
    });
  }
});
