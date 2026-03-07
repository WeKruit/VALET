import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SignJWT } from "jose";
import { parseLocalWorkerRuntimeToken, verifyRuntimeAccessToken } from "../llm-runtime-auth.js";

function makeRuntimeToken(payload: Record<string, unknown>): string {
  return `lwrt_v1_${Buffer.from(JSON.stringify(payload)).toString("base64url")}`;
}

describe("llm-runtime-auth", () => {
  beforeEach(() => {
    process.env.JWT_SECRET = "test-jwt-secret-with-sufficient-length";
  });

  afterEach(() => {
    delete process.env.JWT_SECRET;
  });

  it("parses managed runtime tokens", () => {
    const parsed = parseLocalWorkerRuntimeToken(
      makeRuntimeToken({
        kind: "desktop_local_worker",
        accessToken: "jwt-token",
        sessionToken: "worker-session",
        leaseId: "lease-123",
      }),
    );

    expect(parsed).toEqual({
      kind: "desktop_local_worker",
      accessToken: "jwt-token",
      sessionToken: "worker-session",
      leaseId: "lease-123",
    });
  });

  it("rejects malformed managed runtime tokens", () => {
    expect(() => parseLocalWorkerRuntimeToken("bad-token")).toThrow(
      "Missing managed runtime token prefix",
    );
  });

  it("verifies embedded Desktop access tokens", async () => {
    const jwt = await new SignJWT({ email: "ada@example.com", role: "user" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("user-123")
      .sign(new TextEncoder().encode(process.env.JWT_SECRET!));

    await expect(verifyRuntimeAccessToken(jwt)).resolves.toEqual({
      userId: "user-123",
      email: "ada@example.com",
    });
  });
});
