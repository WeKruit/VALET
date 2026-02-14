import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildTestApp, authedToken } from "./setup";

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildTestApp();
});

afterAll(async () => {
  await app.close();
});

describe("Security Headers", () => {
  describe("public endpoint (GET /api/v1/health)", () => {
    it("sets X-Frame-Options", async () => {
      const res = await app.inject({ method: "GET", url: "/api/v1/health" });
      const value = res.headers["x-frame-options"] as string;
      expect(value).toBeDefined();
      expect(["DENY", "SAMEORIGIN"]).toContain(value.toUpperCase());
    });

    it("sets Strict-Transport-Security with max-age", async () => {
      const res = await app.inject({ method: "GET", url: "/api/v1/health" });
      const hsts = res.headers["strict-transport-security"] as string;
      expect(hsts).toBeDefined();
      expect(hsts).toContain("max-age=");
    });

    it("sets Content-Security-Policy", async () => {
      const res = await app.inject({ method: "GET", url: "/api/v1/health" });
      expect(res.headers["content-security-policy"]).toBeDefined();
    });

    it("sets X-Content-Type-Options to nosniff", async () => {
      const res = await app.inject({ method: "GET", url: "/api/v1/health" });
      expect(res.headers["x-content-type-options"]).toBe("nosniff");
    });

    it("sets Referrer-Policy", async () => {
      const res = await app.inject({ method: "GET", url: "/api/v1/health" });
      expect(res.headers["referrer-policy"]).toBeDefined();
    });

    it("does NOT expose X-Powered-By", async () => {
      const res = await app.inject({ method: "GET", url: "/api/v1/health" });
      expect(res.headers["x-powered-by"]).toBeUndefined();
    });

    it("sets Cross-Origin-Opener-Policy to same-origin", async () => {
      const res = await app.inject({ method: "GET", url: "/api/v1/health" });
      expect(res.headers["cross-origin-opener-policy"]).toBe("same-origin");
    });
  });

  describe("protected endpoint (GET /api/v1/tasks)", () => {
    it("sets X-Frame-Options", async () => {
      const token = await authedToken();
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/tasks",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(200);
      const value = res.headers["x-frame-options"] as string;
      expect(value).toBeDefined();
      expect(["DENY", "SAMEORIGIN"]).toContain(value.toUpperCase());
    });

    it("sets Strict-Transport-Security with max-age", async () => {
      const token = await authedToken();
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/tasks",
        headers: { authorization: `Bearer ${token}` },
      });
      const hsts = res.headers["strict-transport-security"] as string;
      expect(hsts).toBeDefined();
      expect(hsts).toContain("max-age=");
    });

    it("sets Content-Security-Policy", async () => {
      const token = await authedToken();
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/tasks",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.headers["content-security-policy"]).toBeDefined();
    });

    it("sets X-Content-Type-Options to nosniff", async () => {
      const token = await authedToken();
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/tasks",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.headers["x-content-type-options"]).toBe("nosniff");
    });

    it("sets Referrer-Policy", async () => {
      const token = await authedToken();
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/tasks",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.headers["referrer-policy"]).toBeDefined();
    });

    it("does NOT expose X-Powered-By", async () => {
      const token = await authedToken();
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/tasks",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.headers["x-powered-by"]).toBeUndefined();
    });

    it("sets Cross-Origin-Opener-Policy to same-origin", async () => {
      const token = await authedToken();
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/tasks",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.headers["cross-origin-opener-policy"]).toBe("same-origin");
    });
  });

  describe("header values match Helmet config", () => {
    it("HSTS includes includeSubDomains and preload", async () => {
      const res = await app.inject({ method: "GET", url: "/api/v1/health" });
      const hsts = res.headers["strict-transport-security"] as string;
      expect(hsts).toContain("includeSubDomains");
      expect(hsts).toContain("preload");
      expect(hsts).toContain("max-age=31536000");
    });

    it("CSP includes expected directives", async () => {
      const res = await app.inject({ method: "GET", url: "/api/v1/health" });
      const csp = res.headers["content-security-policy"] as string;
      expect(csp).toContain("default-src 'self'");
      expect(csp).toContain("script-src 'self'");
      expect(csp).toContain("object-src 'none'");
      expect(csp).toContain("frame-src 'none'");
    });

    it("Referrer-Policy is strict-origin-when-cross-origin", async () => {
      const res = await app.inject({ method: "GET", url: "/api/v1/health" });
      expect(res.headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    });

    it("Cross-Origin-Resource-Policy is same-origin", async () => {
      const res = await app.inject({ method: "GET", url: "/api/v1/health" });
      expect(res.headers["cross-origin-resource-policy"]).toBe("same-origin");
    });
  });
});
