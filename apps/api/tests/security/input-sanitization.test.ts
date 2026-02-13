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

describe("Input Sanitization", () => {
  // =========================================================================
  // SQL Injection
  // =========================================================================

  describe("SQL Injection", () => {
    it("rejects SQL injection in query parameters without 500", async () => {
      const token = await authedToken();
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/tasks?status=completed' OR '1'='1",
        headers: { authorization: `Bearer ${token}` },
      });
      // Parameterized queries (Drizzle) treat the payload as a literal -- no 500
      expect(res.statusCode).not.toBe(500);
    });

    it("treats SQL injection payload as literal string in task creation", async () => {
      const token = await authedToken();
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tasks",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        payload: JSON.stringify({
          jobUrl: "https://www.linkedin.com/jobs/view/123456",
          notes: "Robert'); DROP TABLE tasks;--",
        }),
      });
      expect(res.statusCode).not.toBe(500);
      if (res.statusCode === 200 || res.statusCode === 201) {
        // Value stored/returned as-is, not executed as SQL
        expect(res.json().notes).toBe("Robert'); DROP TABLE tasks;--");
      }
    });

    it("handles UNION SELECT injection attempt safely", async () => {
      const token = await authedToken();
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/tasks?status=completed' UNION SELECT * FROM users--",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).not.toBe(500);
    });

    it("handles stacked query injection attempt safely", async () => {
      const token = await authedToken();
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tasks",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        payload: JSON.stringify({
          jobUrl: "https://example.com/jobs/1",
          notes: "test'; DELETE FROM users WHERE '1'='1",
        }),
      });
      expect(res.statusCode).not.toBe(500);
    });
  });

  // =========================================================================
  // XSS Prevention
  // =========================================================================

  describe("XSS Prevention", () => {
    it("returns application/json content-type even with script tag in body", async () => {
      const token = await authedToken();
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tasks",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        payload: JSON.stringify({
          jobUrl: "https://www.linkedin.com/jobs/view/123456",
          notes: '<script>alert("XSS")</script>',
        }),
      });
      // API always responds with JSON, never HTML -- XSS cannot execute
      expect(res.headers["content-type"]).toContain("application/json");
    });

    it("returns application/json with event handler XSS payload", async () => {
      const token = await authedToken();
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tasks",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        payload: JSON.stringify({
          jobUrl: "https://www.linkedin.com/jobs/view/123456",
          notes: '"><img src=x onerror=alert(1)>',
        }),
      });
      expect(res.headers["content-type"]).toContain("application/json");
    });

    it("does not reflect XSS payload in error messages", async () => {
      const token = await authedToken();
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tasks",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        payload: JSON.stringify({
          jobUrl: '<script>alert("XSS")</script>',
        }),
      });
      // Error message must not include the raw script tag
      const body = res.json();
      if (body.message) {
        expect(body.message).not.toContain("<script>");
      }
    });
  });

  // =========================================================================
  // Path Traversal
  // =========================================================================

  describe("Path Traversal", () => {
    it("rejects filenames with ../ path traversal", async () => {
      const token = await authedToken();
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/resumes/upload",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        payload: JSON.stringify({ filename: "../../../etc/passwd" }),
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe("VALIDATION_ERROR");
    });

    it("rejects filenames with backslash path traversal", async () => {
      const token = await authedToken();
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/resumes/upload",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        payload: JSON.stringify({ filename: "..\\..\\..\\etc\\passwd" }),
      });
      expect(res.statusCode).toBe(400);
    });

    it("rejects filenames containing forward slashes", async () => {
      const token = await authedToken();
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/resumes/upload",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        payload: JSON.stringify({ filename: "path/to/malicious.pdf" }),
      });
      expect(res.statusCode).toBe(400);
    });

    it("rejects null byte injection in filenames", async () => {
      const token = await authedToken();
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/resumes/upload",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        payload: JSON.stringify({ filename: "resume.pdf\0.exe" }),
      });
      // Should either reject or safely sanitize -- no 500
      expect(res.statusCode).not.toBe(500);
    });

    it("accepts a safe filename", async () => {
      const token = await authedToken();
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/resumes/upload",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        payload: JSON.stringify({ filename: "my-resume-2026.pdf" }),
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().filename).toBe("my-resume-2026.pdf");
    });
  });

  // =========================================================================
  // Oversized Request Bodies
  // =========================================================================

  describe("Oversized Request Bodies", () => {
    it("rejects request bodies larger than 10 MB with 413", async () => {
      const token = await authedToken();
      // Create a payload slightly over 10 MB
      const oversizedPayload = JSON.stringify({
        jobUrl: "https://example.com/jobs/1",
        notes: "x".repeat(11 * 1024 * 1024),
      });

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tasks",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        payload: oversizedPayload,
      });
      // Fastify returns 413 Payload Too Large or FST_ERR_CTP_BODY_TOO_LARGE
      expect(res.statusCode).toBe(413);
    });

    it("accepts request bodies under the size limit", async () => {
      const token = await authedToken();
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tasks",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        payload: JSON.stringify({
          jobUrl: "https://example.com/jobs/1",
          notes: "A reasonable note of normal size",
        }),
      });
      expect(res.statusCode).not.toBe(413);
    });
  });
});
