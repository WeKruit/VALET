import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildTestApp } from "./setup";

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildTestApp();
});

afterAll(async () => {
  await app.close();
});

/**
 * Parse Set-Cookie header(s) into an array of { name, value, attributes } objects.
 */
function parseCookies(headers: Record<string, string | string[] | undefined>) {
  const raw = headers["set-cookie"];
  if (!raw) return [];

  const cookieStrings = Array.isArray(raw) ? raw : [raw];
  return cookieStrings.map((str) => {
    const parts = str.split(";").map((p) => p.trim());
    const [nameValue, ...attrs] = parts;
    const [name, value] = nameValue.split("=", 2);

    const attributes: Record<string, string | true> = {};
    for (const attr of attrs) {
      const eqIdx = attr.indexOf("=");
      if (eqIdx === -1) {
        attributes[attr.toLowerCase()] = true;
      } else {
        attributes[attr.slice(0, eqIdx).toLowerCase()] = attr.slice(eqIdx + 1);
      }
    }

    return { name, value, attributes };
  });
}

describe("Cookie Security", () => {
  it("sets refresh token cookie with httpOnly flag", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/google",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({ code: "mock-auth-code", redirectUri: "http://localhost:5173" }),
    });

    const cookies = parseCookies(res.headers);
    const refreshCookie = cookies.find((c) => c.name === "refreshToken");

    expect(refreshCookie).toBeDefined();
    expect(refreshCookie!.attributes["httponly"]).toBe(true);
  });

  it("sets refresh token cookie with secure flag", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/google",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({ code: "mock-auth-code", redirectUri: "http://localhost:5173" }),
    });

    const cookies = parseCookies(res.headers);
    const refreshCookie = cookies.find((c) => c.name === "refreshToken");

    expect(refreshCookie).toBeDefined();
    expect(refreshCookie!.attributes["secure"]).toBe(true);
  });

  it("sets refresh token cookie with sameSite=strict", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/google",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({ code: "mock-auth-code", redirectUri: "http://localhost:5173" }),
    });

    const cookies = parseCookies(res.headers);
    const refreshCookie = cookies.find((c) => c.name === "refreshToken");

    expect(refreshCookie).toBeDefined();
    expect(refreshCookie!.attributes["samesite"]?.toString().toLowerCase()).toBe("strict");
  });

  it("sets refresh token cookie with restricted path", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/google",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({ code: "mock-auth-code", redirectUri: "http://localhost:5173" }),
    });

    const cookies = parseCookies(res.headers);
    const refreshCookie = cookies.find((c) => c.name === "refreshToken");

    expect(refreshCookie).toBeDefined();
    // Cookie path should be scoped to the refresh endpoint, not "/"
    expect(refreshCookie!.attributes["path"]).toBe("/api/v1/auth/refresh");
  });

  it("sets refresh token cookie on token refresh as well", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/refresh",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({ refreshToken: "mock-old-refresh-token" }),
    });

    const cookies = parseCookies(res.headers);
    const refreshCookie = cookies.find((c) => c.name === "refreshToken");

    expect(refreshCookie).toBeDefined();
    expect(refreshCookie!.attributes["httponly"]).toBe(true);
    expect(refreshCookie!.attributes["secure"]).toBe(true);
    expect(refreshCookie!.attributes["samesite"]?.toString().toLowerCase()).toBe("strict");
  });

  it("does not set cookie on non-auth endpoints", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/health",
    });

    const cookies = parseCookies(res.headers);
    expect(cookies.length).toBe(0);
  });
});
