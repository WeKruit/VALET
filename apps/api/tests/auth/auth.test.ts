/**
 * Auth regression tests (A-01 through A-11).
 *
 * Self-contained Fastify app that mirrors the production auth flow
 * using mocked services and DI container.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import * as jose from "jose";
import { randomUUID } from "node:crypto";

const TEST_JWT_SECRET = "test-jwt-secret-do-not-use-in-production";
const TEST_JWT_REFRESH_SECRET = "test-jwt-refresh-secret";
const SECRET_KEY = new TextEncoder().encode(TEST_JWT_SECRET);
const REFRESH_SECRET_KEY = new TextEncoder().encode(TEST_JWT_REFRESH_SECRET);

// ---- Token helpers --------------------------------------------------------

async function createAccessToken(claims: {
  sub: string;
  email: string;
  role?: string;
  name?: string;
}) {
  return new jose.SignJWT({
    email: claims.email,
    name: claims.name ?? "Test User",
    role: claims.role ?? "user",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime("1h")
    .setIssuer("valet-api")
    .sign(SECRET_KEY);
}

async function createExpiredToken(claims: { sub: string; email: string }) {
  return new jose.SignJWT({ email: claims.email })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime(new Date(Date.now() - 3600_000))
    .sign(SECRET_KEY);
}

async function createTokenWithWrongSecret(claims: { sub: string; email: string }) {
  const wrongKey = new TextEncoder().encode("wrong-secret-key-no-match");
  return new jose.SignJWT({ email: claims.email })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(wrongKey);
}

async function createRefreshToken(claims: { sub: string; email: string }) {
  return new jose.SignJWT({ email: claims.email, role: "user" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime("7d")
    .setIssuer("valet-api")
    .sign(REFRESH_SECRET_KEY);
}

// ---- Test users -----------------------------------------------------------

const ALICE = {
  id: randomUUID(),
  email: "alice@example.com",
  name: "Alice Smith",
  role: "user" as const,
  avatarUrl: null,
  subscriptionTier: "free" as const,
  onboardingComplete: false,
  copilotAppsCompleted: 0,
  autopilotUnlocked: false,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const ADMIN = {
  id: randomUUID(),
  email: "admin@example.com",
  name: "Admin User",
  role: "admin" as const,
  avatarUrl: null,
  subscriptionTier: "pro" as const,
  onboardingComplete: true,
  copilotAppsCompleted: 5,
  autopilotUnlocked: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

// ---- Mock services --------------------------------------------------------

function createMockCradle() {
  const users = new Map<string, typeof ALICE>();
  users.set(ALICE.id, ALICE);
  users.set(ADMIN.id, ADMIN);

  return {
    authService: {
      authenticateWithGoogle: async (code: string, _redirectUri: string) => {
        if (code === "valid-google-code") {
          return {
            tokens: {
              accessToken: "mock-access-token",
              refreshToken: "mock-refresh-token",
              expiresIn: 900,
            },
            user: ALICE,
            isNewUser: false,
          };
        }
        throw new Error("Invalid Google auth code");
      },
      refreshTokens: async (refreshToken: string) => {
        // Verify the refresh token
        try {
          await jose.jwtVerify(refreshToken, REFRESH_SECRET_KEY, {
            algorithms: ["HS256"],
          });
          return {
            accessToken: "mock-new-access-token",
            refreshToken: "mock-new-refresh-token",
            expiresIn: 900,
          };
        } catch {
          throw new Error("Invalid or expired refresh token");
        }
      },
      blacklistToken: async () => {},
    },
    userService: {
      getById: async (id: string) => users.get(id) ?? null,
    },
    emailService: {
      sendWelcome: async () => {},
    },
    taskService: {
      listAll: async () => ({
        data: [],
        pagination: { page: 1, pageSize: 25, total: 0, totalPages: 0 },
      }),
    },
    securityLogger: {
      logEvent: () => {},
    },
  };
}

// ---- Build test app -------------------------------------------------------

async function buildAuthTestApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });

  const cookie = await import("@fastify/cookie");
  await app.register(cookie.default);

  const cradle = createMockCradle();

  // Decorate request with diScope mock
  app.decorateRequest("diScope", null);
  app.decorateRequest("userId", "");
  app.decorateRequest("userEmail", "");
  app.decorateRequest("userRole", "user");

  app.addHook("onRequest", async (request) => {
    (request as any).diScope = { cradle };
  });

  // Auth middleware — mirrors production auth.ts
  const PUBLIC_EXACT_PATHS = ["/api/v1/auth/google", "/api/v1/auth/refresh", "/api/v1/health"];

  app.addHook("onRequest", async (request) => {
    const path = request.url.split("?")[0]!;
    if (PUBLIC_EXACT_PATHS.includes(path)) return;

    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      throw {
        statusCode: 401,
        code: "UNAUTHORIZED",
        message: "Missing or invalid authorization header",
      };
    }

    const token = authHeader.slice(7);
    try {
      const { payload } = await jose.jwtVerify(token, SECRET_KEY, {
        algorithms: ["HS256"],
      });
      if (!payload.sub || !payload.email) {
        throw { statusCode: 401, code: "UNAUTHORIZED", message: "Invalid token payload" };
      }
      request.userId = payload.sub;
      request.userEmail = payload.email as string;
      request.userRole = (payload.role as string) ?? "user";
    } catch (err: any) {
      if (err.statusCode === 401) throw err;
      throw { statusCode: 401, code: "UNAUTHORIZED", message: "Invalid or expired token" };
    }
  });

  // Error handler
  app.setErrorHandler((error, _request, reply) => {
    const status = (error as any).statusCode ?? 500;
    const code = (error as any).code ?? "INTERNAL_ERROR";
    reply.status(status).send({
      error: code,
      message: error.message ?? "An unexpected error occurred",
    });
  });

  // ---- Routes ---------------------------------------------------------------

  // A-01 / A-02: POST /api/v1/auth/google
  app.post("/api/v1/auth/google", async (request, reply) => {
    const { authService, emailService: _emailService } = (request as any).diScope.cradle;
    const body = request.body as { code: string; redirectUri: string };

    try {
      const result = await authService.authenticateWithGoogle(body.code, body.redirectUri);

      reply.setCookie("valet_refresh", result.tokens.refreshToken, {
        httpOnly: true,
        secure: true,
        sameSite: "strict",
        path: "/api/v1/auth",
        maxAge: 7 * 24 * 60 * 60,
      });

      return {
        accessToken: result.tokens.accessToken,
        tokenType: "Bearer",
        expiresIn: result.tokens.expiresIn,
        user: result.user,
      };
    } catch {
      return reply.status(401).send({
        error: "UNAUTHORIZED",
        message: "Failed to authenticate with Google",
      });
    }
  });

  // A-06 / A-07: POST /api/v1/auth/refresh
  app.post("/api/v1/auth/refresh", async (request, reply) => {
    const { authService } = (request as any).diScope.cradle;
    const refreshToken = request.cookies["valet_refresh"];

    if (!refreshToken) {
      return reply.status(401).send({
        error: "UNAUTHORIZED",
        message: "Missing refresh token",
      });
    }

    try {
      const tokens = await authService.refreshTokens(refreshToken);

      reply.setCookie("valet_refresh", tokens.refreshToken, {
        httpOnly: true,
        secure: true,
        sameSite: "strict",
        path: "/api/v1/auth",
        maxAge: 7 * 24 * 60 * 60,
      });

      return {
        accessToken: tokens.accessToken,
        tokenType: "Bearer",
        expiresIn: tokens.expiresIn,
      };
    } catch {
      reply.clearCookie("valet_refresh", { path: "/api/v1/auth" });
      return reply.status(401).send({
        error: "UNAUTHORIZED",
        message: "Invalid or expired refresh token",
      });
    }
  });

  // A-08: GET /api/v1/auth/me
  app.get("/api/v1/auth/me", async (request, reply) => {
    const { userService } = (request as any).diScope.cradle;
    const user = await userService.getById(request.userId);
    if (!user) {
      return reply.status(401).send({
        error: "UNAUTHORIZED",
        message: "User not found",
      });
    }
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
      role: user.role,
    };
  });

  // A-10 / A-11: GET /api/v1/admin/tasks
  app.get("/api/v1/admin/tasks", async (request, reply) => {
    if (request.userRole !== "admin" && request.userRole !== "superadmin") {
      return reply.status(403).send({
        error: "FORBIDDEN",
        message: "Admin access required",
      });
    }

    const { taskService } = (request as any).diScope.cradle;
    const result = await taskService.listAll();
    return reply.status(200).send(result);
  });

  // Protected route for testing auth guards
  app.get("/api/v1/tasks", async (request) => {
    return { tasks: [], userId: request.userId };
  });

  await app.ready();
  return app;
}

// ---- Tests -----------------------------------------------------------------

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildAuthTestApp();
});

afterAll(async () => {
  await app.close();
});

describe("Auth Regression Tests", () => {
  // A-01: POST /api/v1/auth/google returns tokens with valid code
  it("A-01: POST /api/v1/auth/google returns tokens with valid code", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/google",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({
        code: "valid-google-code",
        redirectUri: "http://localhost:5173/login",
      }),
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.accessToken).toBeDefined();
    expect(body.tokenType).toBe("Bearer");
    expect(body.expiresIn).toBeGreaterThan(0);
    expect(body.user).toBeDefined();

    // Check Set-Cookie header
    const setCookie = res.headers["set-cookie"];
    expect(setCookie).toBeDefined();
    const cookieStr = Array.isArray(setCookie) ? setCookie[0] : setCookie;
    expect(cookieStr).toContain("valet_refresh");
  });

  // A-02: POST /api/v1/auth/google rejects invalid code
  it("A-02: POST /api/v1/auth/google rejects invalid code", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/google",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({
        code: "invalid-code-xyz",
        redirectUri: "http://localhost:5173/login",
      }),
    });

    expect(res.statusCode).toBe(401);
    expect(res.json().error).toBe("UNAUTHORIZED");
  });

  // A-03: Protected routes return 401 without token
  it("A-03: Protected routes return 401 without token", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/tasks",
    });

    expect(res.statusCode).toBe(401);
    expect(res.json().error).toBe("UNAUTHORIZED");
  });

  // A-04: Protected routes return 401 with expired token
  it("A-04: Protected routes return 401 with expired token", async () => {
    const token = await createExpiredToken({
      sub: ALICE.id,
      email: ALICE.email,
    });
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/tasks",
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(401);
  });

  // A-05: Protected routes return 401 with wrong-secret JWT
  it("A-05: Protected routes return 401 with wrong-secret JWT", async () => {
    const token = await createTokenWithWrongSecret({
      sub: ALICE.id,
      email: ALICE.email,
    });
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/tasks",
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(401);
  });

  // A-06: POST /api/v1/auth/refresh issues new access token
  it("A-06: POST /api/v1/auth/refresh issues new access token", async () => {
    const refreshToken = await createRefreshToken({
      sub: ALICE.id,
      email: ALICE.email,
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/refresh",
      headers: {
        cookie: `valet_refresh=${refreshToken}`,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.accessToken).toBeDefined();
    expect(body.tokenType).toBe("Bearer");
    expect(body.expiresIn).toBeGreaterThan(0);

    // Should set new refresh cookie
    const setCookie = res.headers["set-cookie"];
    expect(setCookie).toBeDefined();
  });

  // A-07: POST /api/v1/auth/refresh rejects invalid refresh token
  it("A-07: POST /api/v1/auth/refresh rejects invalid refresh token", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/refresh",
      headers: {
        cookie: "valet_refresh=not-a-valid-refresh-token",
      },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json().error).toBe("UNAUTHORIZED");
  });

  // A-07b: POST /api/v1/auth/refresh rejects missing cookie
  it("A-07b: POST /api/v1/auth/refresh rejects missing refresh cookie", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/refresh",
    });

    expect(res.statusCode).toBe(401);
    expect(res.json().error).toBe("UNAUTHORIZED");
  });

  // A-08: GET /api/v1/auth/me returns current user profile
  it("A-08: GET /api/v1/auth/me returns current user profile", async () => {
    const token = await createAccessToken({
      sub: ALICE.id,
      email: ALICE.email,
    });

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/auth/me",
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.id).toBe(ALICE.id);
    expect(body.email).toBe(ALICE.email);
    expect(body.name).toBe(ALICE.name);
  });

  // A-10: GET /api/v1/admin/tasks requires admin role
  it("A-10: GET /api/v1/admin/tasks requires admin role", async () => {
    const token = await createAccessToken({
      sub: ALICE.id,
      email: ALICE.email,
      role: "user",
    });

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/admin/tasks",
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe("FORBIDDEN");
  });

  // A-11: GET /api/v1/admin/tasks lists all tasks for admin
  it("A-11: GET /api/v1/admin/tasks lists all tasks for admin", async () => {
    const token = await createAccessToken({
      sub: ADMIN.id,
      email: ADMIN.email,
      role: "admin",
    });

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/admin/tasks",
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data).toBeDefined();
    expect(body.pagination).toBeDefined();
  });
});
