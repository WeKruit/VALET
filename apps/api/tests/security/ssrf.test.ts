import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { buildTestApp, createToken } from "./setup";

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildTestApp();
});

afterAll(async () => {
  await app.close();
});

describe("SSRF Prevention", () => {
  // ---- Private / internal IP addresses ------------------------------------

  const privateAddresses = [
    { ip: "127.0.0.1", label: "localhost IPv4" },
    { ip: "127.0.0.255", label: "loopback range" },
    { ip: "10.0.0.1", label: "10.x private (Class A)" },
    { ip: "10.255.255.255", label: "10.x private (Class A high)" },
    { ip: "192.168.0.1", label: "192.168.x private (Class C)" },
    { ip: "192.168.255.255", label: "192.168.x private (Class C high)" },
    { ip: "172.16.0.1", label: "172.16.x private (Class B low)" },
    { ip: "172.31.255.255", label: "172.31.x private (Class B high)" },
    { ip: "0.0.0.0", label: "all-zeros address" },
    { ip: "169.254.169.254", label: "AWS metadata endpoint" },
    { ip: "localhost", label: "localhost hostname" },
  ];

  for (const { ip, label } of privateAddresses) {
    it(`rejects job URL pointing to ${label} (${ip})`, async () => {
      const token = await createToken({ sub: randomUUID() });
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tasks",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        payload: JSON.stringify({ jobUrl: `https://${ip}/jobs/view/123` }),
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe("VALIDATION_ERROR");
      expect(res.json().message).toContain("private");
    });
  }

  // ---- Localhost variants -------------------------------------------------

  const localhostVariants = [
    { url: "http://localhost:8080/admin", label: "localhost with port" },
    { url: "http://127.0.0.1:3000/internal", label: "loopback with port" },
    { url: "https://localhost/api/secret", label: "localhost https" },
    { url: "http://0.0.0.0:9090/metrics", label: "0.0.0.0 with port" },
  ];

  for (const { url, label } of localhostVariants) {
    it(`rejects localhost variant: ${label}`, async () => {
      const token = await createToken({ sub: randomUUID() });
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tasks",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        payload: JSON.stringify({ jobUrl: url }),
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe("VALIDATION_ERROR");
    });
  }

  // ---- Dangerous protocols ------------------------------------------------

  it("rejects file:// protocol in job URL", async () => {
    const token = await createToken({ sub: randomUUID() });
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tasks",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      payload: JSON.stringify({ jobUrl: "file:///etc/passwd" }),
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("VALIDATION_ERROR");
  });

  it("rejects ftp:// protocol in job URL", async () => {
    const token = await createToken({ sub: randomUUID() });
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tasks",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      payload: JSON.stringify({ jobUrl: "ftp://internal.server/data" }),
    });
    expect(res.statusCode).toBe(400);
  });

  it("rejects gopher:// protocol in job URL", async () => {
    const token = await createToken({ sub: randomUUID() });
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tasks",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      payload: JSON.stringify({ jobUrl: "gopher://evil.com:25/xHELO" }),
    });
    expect(res.statusCode).toBe(400);
  });

  // ---- Boundary / valid cases ---------------------------------------------

  it("accepts a valid public job URL", async () => {
    const token = await createToken({ sub: randomUUID() });
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tasks",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      payload: JSON.stringify({ jobUrl: "https://www.linkedin.com/jobs/view/1234567890" }),
    });
    expect(res.statusCode).not.toBe(400);
  });

  it("accepts 172.15.x.x (outside private range)", async () => {
    const token = await createToken({ sub: randomUUID() });
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tasks",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      payload: JSON.stringify({ jobUrl: "https://172.15.0.1/jobs/view/123" }),
    });
    expect(res.statusCode).not.toBe(400);
  });

  it("accepts 172.32.x.x (outside private range)", async () => {
    const token = await createToken({ sub: randomUUID() });
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tasks",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      payload: JSON.stringify({ jobUrl: "https://172.32.0.1/jobs/view/123" }),
    });
    expect(res.statusCode).not.toBe(400);
  });

  it("rejects malformed URL in job URL field", async () => {
    const token = await createToken({ sub: randomUUID() });
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tasks",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      payload: JSON.stringify({ jobUrl: "not-a-url-at-all" }),
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("VALIDATION_ERROR");
  });
});
