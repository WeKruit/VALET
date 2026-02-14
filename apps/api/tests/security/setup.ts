/**
 * Shared test app builder for security tests.
 *
 * Creates a self-contained Fastify instance that mirrors production
 * security middleware (helmet, CORS, rate-limit, auth) without
 * requiring a real database or DI container.
 *
 * Uses `jose` for JWT operations (same library as production auth).
 */
import Fastify, { type FastifyInstance } from "fastify";
import * as jose from "jose";
import { randomUUID } from "node:crypto";

export const TEST_JWT_SECRET = "test-jwt-secret-do-not-use-in-production";
export const SECRET_KEY = new TextEncoder().encode(TEST_JWT_SECRET);

// ---- Token helpers --------------------------------------------------------

/** Create a signed JWT for a test user. */
export async function createToken(
  claims: { sub: string; email?: string; name?: string },
  expiresIn = "1h",
) {
  const builder = new jose.SignJWT({
    email: claims.email ?? "test@example.com",
    name: claims.name ?? "Test User",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.sub)
    .setIssuedAt();

  if (expiresIn.startsWith("-")) {
    builder.setExpirationTime(new Date(Date.now() - 3600_000));
  } else {
    builder.setExpirationTime(expiresIn);
  }

  return builder.sign(SECRET_KEY);
}

/** Create a JWT signed with the wrong secret. */
export async function createTokenWithWrongSecret(sub: string) {
  const wrongKey = new TextEncoder().encode("wrong-secret-key-that-does-not-match");
  return new jose.SignJWT({ email: "test@example.com", name: "Test" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(sub)
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(wrongKey);
}

/** Create a JWT missing the `sub` claim. */
export async function createTokenWithoutSub() {
  return new jose.SignJWT({ email: "test@example.com", name: "Test" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(SECRET_KEY);
}

/** Create a JWT missing the `email` claim. */
export async function createTokenWithoutEmail() {
  return new jose.SignJWT({ name: "Test" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(randomUUID())
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(SECRET_KEY);
}

/** Return a token for a random user (convenience). */
export async function authedToken() {
  return createToken({ sub: randomUUID() });
}

// ---- Private IP patterns (mirrors production SSRF validation) -------------

export const PRIVATE_IP_PATTERNS = [
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^0\./,
  /^169\.254\./,
  /^fc00:/i,
  /^fd/i,
  /^::1$/,
  /^localhost$/i,
  /^0\.0\.0\.0$/,
];

// ---- Build test app -------------------------------------------------------

export async function buildTestApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, bodyLimit: 10 * 1024 * 1024 });

  // -- Security headers (mirrors plugins/security.ts) --
  const helmet = await import("@fastify/helmet");
  await app.register(helmet.default, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'", "wss:"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        objectSrc: ["'none'"],
        frameSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
    hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    crossOriginOpenerPolicy: { policy: "same-origin" },
    crossOriginResourcePolicy: { policy: "same-origin" },
    noSniff: true,
    xssFilter: true,
    hidePoweredBy: true,
  });

  // -- CORS --
  const cors = await import("@fastify/cors");
  await app.register(cors.default, {
    origin: "http://localhost:5173",
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Request-ID"],
    exposedHeaders: ["X-Request-ID", "X-RateLimit-Remaining"],
    maxAge: 86400,
  });

  // -- Rate limiting --
  const rateLimit = await import("@fastify/rate-limit");
  await app.register(rateLimit.default, {
    max: 100,
    timeWindow: "1 minute",
    keyGenerator: (request) => (request as any).userId ?? request.ip,
    errorResponseBuilder: (_req, context) => ({
      statusCode: context.statusCode,
      code: "RATE_LIMIT_EXCEEDED",
      error: "RATE_LIMIT_EXCEEDED",
      message: "Too many requests. Please try again later.",
    }),
  });

  // -- Cookie plugin (must be registered before routes that set cookies) --
  const cookie = await import("@fastify/cookie");
  await app.register(cookie.default);

  // -- Auth middleware (mirrors common/middleware/auth.ts) --
  app.addHook("onRequest", async (request, _reply) => {
    const path = request.url.split("?")[0];
    const publicPaths = ["/api/v1/auth/google", "/api/v1/auth/refresh", "/api/v1/health"];
    const isPublic = publicPaths.some((p) => path!.startsWith(p));

    const authHeader = request.headers.authorization;

    // On public routes, optionally extract userId for rate-limit keying
    if (isPublic) {
      if (authHeader?.startsWith("Bearer ")) {
        try {
          const token = authHeader.slice(7);
          const { payload } = await jose.jwtVerify(token, SECRET_KEY, { algorithms: ["HS256"] });
          if (payload.sub) {
            (request as any).userId = payload.sub;
          }
        } catch {
          // Ignore token errors on public routes
        }
      }
      return;
    }

    if (!authHeader?.startsWith("Bearer ")) {
      throw { statusCode: 401, code: "UNAUTHORIZED", message: "Missing or invalid authorization header" };
    }

    const token = authHeader.slice(7);
    try {
      const { payload } = await jose.jwtVerify(token, SECRET_KEY, { algorithms: ["HS256"] });
      if (!payload.sub || !payload.email) {
        throw { statusCode: 401, code: "UNAUTHORIZED", message: "Invalid token payload" };
      }
      (request as any).userId = payload.sub;
      (request as any).userEmail = payload.email;
    } catch (err: any) {
      if (err.statusCode === 401) throw err;
      throw { statusCode: 401, code: "UNAUTHORIZED", message: "Invalid or expired token" };
    }
  });

  // -- Error handler --
  app.setErrorHandler((error, _request, reply) => {
    const status = (error as any).statusCode ?? 500;
    const code = (error as any).code ?? "INTERNAL_ERROR";
    reply.status(status).send({
      error: code,
      message: error.message ?? "An unexpected error occurred",
    });
  });

  // ---- Test routes ----------------------------------------------------------

  // Public
  app.get("/api/v1/health", async () => ({ status: "ok" }));

  // Public auth routes
  app.post("/api/v1/auth/google", async (_request, reply) => {
    // Simulates refresh-token cookie setting
    reply.setCookie("refreshToken", "mock-refresh-token", {
      httpOnly: true,
      secure: true,
      sameSite: "strict",
      path: "/api/v1/auth/refresh",
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });
    return {
      accessToken: "mock-access-token",
      tokenType: "Bearer",
      expiresIn: 3600,
    };
  });

  app.post("/api/v1/auth/refresh", async (_request, reply) => {
    reply.setCookie("refreshToken", "mock-new-refresh-token", {
      httpOnly: true,
      secure: true,
      sameSite: "strict",
      path: "/api/v1/auth/refresh",
      maxAge: 60 * 60 * 24 * 7,
    });
    return {
      accessToken: "mock-new-access-token",
      tokenType: "Bearer",
      expiresIn: 3600,
    };
  });

  // Protected - list tasks
  app.get("/api/v1/tasks", async (request) => {
    return { tasks: [], userId: (request as any).userId };
  });

  // Protected - get task by ID (userId-scoped: returns 404 not 403)
  app.get("/api/v1/tasks/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = (request as any).userId;

    // Simulated task ownership table
    const tasks: Record<string, string> = {
      "task-owned-by-alice": "alice-user-id",
      "task-owned-by-bob": "bob-user-id",
    };

    const taskOwner = tasks[id];
    if (!taskOwner || taskOwner !== userId) {
      return reply.status(404).send({ error: "NOT_FOUND", message: "Task not found" });
    }
    return { id, userId, status: "completed" };
  });

  // Protected - create task (for XSS/injection/SSRF tests)
  app.post("/api/v1/tasks", async (request, reply) => {
    const body = request.body as any;

    // SSRF: reject private/internal addresses and dangerous protocols in jobUrl
    if (body?.jobUrl) {
      let parsedUrl: URL;
      try {
        parsedUrl = new URL(body.jobUrl);
      } catch {
        return reply.status(400).send({
          error: "VALIDATION_ERROR",
          message: "Invalid job URL",
        });
      }

      // Reject non-http(s) protocols (file://, ftp://, etc.)
      if (!["http:", "https:"].includes(parsedUrl.protocol)) {
        return reply.status(400).send({
          error: "VALIDATION_ERROR",
          message: "Job URL must use http or https protocol",
        });
      }

      const hostname = parsedUrl.hostname;
      if (PRIVATE_IP_PATTERNS.some((p) => p.test(hostname))) {
        return reply.status(400).send({
          error: "VALIDATION_ERROR",
          message: "Job URL must not point to a private or internal address",
        });
      }
    }

    return {
      id: randomUUID(),
      jobUrl: body?.jobUrl ?? "",
      notes: body?.notes ?? "",
      userId: (request as any).userId,
      status: "created",
    };
  });

  // Protected - file upload simulation for path traversal tests
  app.post("/api/v1/resumes/upload", async (request, reply) => {
    const body = request.body as any;
    const filename = body?.filename ?? "";

    if (filename.includes("..") || filename.includes("/") || filename.includes("\\")) {
      return reply.status(400).send({
        error: "VALIDATION_ERROR",
        message: "Invalid filename",
      });
    }

    return { id: randomUUID(), filename, status: "uploading" };
  });

  // Protected - user profile (for "missing user in DB" simulation)
  app.get("/api/v1/auth/me", async (request, reply) => {
    const userId = (request as any).userId;
    // Simulate user lookup — only known test users exist
    const knownUsers = ["alice-user-id", "bob-user-id"];
    if (!knownUsers.includes(userId)) {
      return reply.status(401).send({
        error: "UNAUTHORIZED",
        message: "User not found",
      });
    }
    return { id: userId, email: (request as any).userEmail };
  });

  await app.ready();
  return app;
}
