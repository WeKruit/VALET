import { describe, it, expect, vi, beforeAll } from "vitest";
import * as jose from "jose";
import { AuthService } from "./auth.service.js";

const JWT_SECRET = "test-jwt-secret-at-least-32-chars-long!!";
const JWT_REFRESH_SECRET = "test-jwt-refresh-secret-at-least-32-chars!!";

function makeDbSelect(rows: { role: string }[]) {
  return vi.fn().mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue(rows),
      }),
    }),
  });
}

function makeDbSelectThatThrows() {
  return vi.fn().mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockRejectedValue(new Error("DB connection refused")),
      }),
    }),
  });
}

function buildAuthService(dbSelect: ReturnType<typeof vi.fn>) {
  const redis = {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue("OK"),
  };

  const db = { select: dbSelect } as any;
  const emailService = {
    sendVerificationEmail: vi.fn(),
    sendPasswordReset: vi.fn(),
    sendWelcome: vi.fn(),
  };

  const service = new AuthService({ db, redis: redis as any, emailService });
  return { service, redis, db };
}

async function signRefreshToken(claims: Record<string, unknown>): Promise<string> {
  const secret = new TextEncoder().encode(JWT_REFRESH_SECRET);
  return new jose.SignJWT(claims)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .setIssuer("valet-api")
    .sign(secret);
}

beforeAll(() => {
  process.env.JWT_SECRET = JWT_SECRET;
  process.env.JWT_REFRESH_SECRET = JWT_REFRESH_SECRET;
});

describe("AuthService.refreshTokens", () => {
  it("issues new access token with DB role, not stale JWT role", async () => {
    const dbSelect = makeDbSelect([{ role: "admin" }]);
    const { service } = buildAuthService(dbSelect);

    const token = await signRefreshToken({
      sub: "user-123",
      email: "test@example.com",
      role: "user",
      tokenVersion: 0,
    });

    const result = await service.refreshTokens(token);

    // Decode the new access token and verify the role came from DB
    const jwtSecret = new TextEncoder().encode(JWT_SECRET);
    const { payload } = await jose.jwtVerify(result.accessToken, jwtSecret);
    expect(payload.role).toBe("admin");
    expect(payload.sub).toBe("user-123");

    // Also verify the new refresh token carries the DB role
    const refreshSecret = new TextEncoder().encode(JWT_REFRESH_SECRET);
    const { payload: refreshPayload } = await jose.jwtVerify(result.refreshToken, refreshSecret);
    expect(refreshPayload.role).toBe("admin");
  });

  it("falls back to JWT role when DB is unreachable", async () => {
    const dbSelect = makeDbSelectThatThrows();
    const { service } = buildAuthService(dbSelect);

    const token = await signRefreshToken({
      sub: "user-456",
      email: "fallback@example.com",
      role: "user",
      tokenVersion: 0,
    });

    const result = await service.refreshTokens(token);

    const jwtSecret = new TextEncoder().encode(JWT_SECRET);
    const { payload } = await jose.jwtVerify(result.accessToken, jwtSecret);
    expect(payload.role).toBe("user");
  });

  it("rejects a replayed (already-consumed) refresh token", async () => {
    const dbSelect = makeDbSelect([{ role: "user" }]);
    const { service, redis } = buildAuthService(dbSelect);

    // Simulate token already consumed: SET NX returns null
    redis.set.mockResolvedValue(null);

    const token = await signRefreshToken({
      sub: "user-789",
      email: "replay@example.com",
      role: "user",
      tokenVersion: 0,
    });

    await expect(service.refreshTokens(token)).rejects.toThrow("Token has been revoked");
  });

  it("rejects a revoked token version", async () => {
    const dbSelect = makeDbSelect([{ role: "user" }]);
    const { service, redis } = buildAuthService(dbSelect);

    // token:version:user-abc is at version 5, but the JWT has version 0
    redis.get.mockResolvedValue("5");

    const token = await signRefreshToken({
      sub: "user-abc",
      email: "revoked@example.com",
      role: "user",
      tokenVersion: 0,
    });

    await expect(service.refreshTokens(token)).rejects.toThrow();
  });
});
