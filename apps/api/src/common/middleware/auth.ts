import type { FastifyRequest, FastifyReply } from "fastify";
import * as jose from "jose";
import { eq } from "drizzle-orm";
import { users } from "@valet/db";
import { AppError } from "../errors.js";
import {
  SECURITY_EVENT_TYPES,
  type SecurityEventType,
} from "../../services/security-logger.service.js";

const ROLE_CACHE_TTL_SECONDS = 60;

declare module "fastify" {
  interface FastifyRequest {
    userId: string;
    userEmail: string;
    userRole: string;
  }
}

const PUBLIC_EXACT_PATHS = [
  "/api/v1/auth/google",
  "/api/v1/auth/google/callback",
  "/api/v1/auth/refresh",
  "/api/v1/auth/register",
  "/api/v1/auth/login",
  "/api/v1/auth/verify-email",
  "/api/v1/auth/forgot-password",
  "/api/v1/auth/reset-password",
  "/api/v1/auth/desktop/exchange-supabase",
  "/api/v1/auth/desktop/google",
  "/api/v1/auth/desktop/refresh",
  "/api/v1/auth/desktop/logout",
  "/api/v1/health",
  "/api/v1/health/version",
  "/api/v1/billing/webhook",
  "/api/v1/webhooks/ghosthands",
  "/api/v1/webhooks/ghosthands/deploy",
  "/api/v1/webhooks/ghosthands/desktop-release",
  "/api/v1/desktop/latest",
  "/api/v1/early-access",
];

const PUBLIC_PREFIX_PATHS = ["/api/v1/ws", "/docs"];

/** Routes that bypass JWT auth and authenticate with X-Local-Worker-Session tokens instead. */
const SELF_AUTH_PATTERNS = [
  /^\/api\/v1\/tasks\/[^/]+\/events\/stream$/,
  /^\/api\/v1\/local-workers\/claim$/,
  /^\/api\/v1\/local-workers\/[^/]+\/heartbeat$/,
  /^\/api\/v1\/local-workers\/jobs\/[^/]+\/events$/,
  /^\/api\/v1\/local-workers\/jobs\/[^/]+\/awaiting-review$/,
  /^\/api\/v1\/local-workers\/jobs\/[^/]+\/complete$/,
  /^\/api\/v1\/local-workers\/jobs\/[^/]+\/fail$/,
  /^\/api\/v1\/local-workers\/jobs\/[^/]+\/release$/,
  /^\/api\/v1\/local-workers\/jobs\/[^/]+\/cancel$/,
];

export async function authMiddleware(request: FastifyRequest, _reply: FastifyReply) {
  const path = request.url.split("?")[0];
  if (!path) return;

  if (
    PUBLIC_EXACT_PATHS.includes(path) ||
    PUBLIC_PREFIX_PATHS.some((p) => path === p || path.startsWith(p + "/")) ||
    SELF_AUTH_PATTERNS.some((re) => re.test(path))
  ) {
    return;
  }

  const securityDetails = {
    ip: request.ip,
    userAgent: request.headers["user-agent"],
    path: path,
    method: request.method,
  };

  const authHeader = request.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    logSecurityEvent(request, SECURITY_EVENT_TYPES.AUTH_FAILURE, {
      ...securityDetails,
      reason: "Missing or invalid authorization header",
    });
    throw AppError.unauthorized("Missing or invalid authorization header");
  }

  const token = authHeader.slice(7);
  try {
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      throw AppError.unauthorized("Server configuration error");
    }
    const secret = new TextEncoder().encode(jwtSecret);
    const { payload } = await jose.jwtVerify(token, secret, {
      algorithms: ["HS256"],
    });

    if (!payload.sub || !payload.email) {
      logSecurityEvent(request, SECURITY_EVENT_TYPES.AUTH_FAILURE, {
        ...securityDetails,
        reason: "Invalid token payload (missing sub or email)",
      });
      throw AppError.unauthorized("Invalid token payload");
    }

    request.userId = payload.sub;
    request.userEmail = payload.email as string;

    // Resolve role from Redis cache or DB to avoid stale JWT roles after promotion
    const jwtRole = (payload.role as string) ?? "user";
    request.userRole = await resolveCurrentRole(request, payload.sub, jwtRole);
  } catch (err) {
    if (err instanceof AppError) throw err;
    logSecurityEvent(request, SECURITY_EVENT_TYPES.AUTH_FAILURE, {
      ...securityDetails,
      reason: "Invalid or expired token",
    });
    throw AppError.unauthorized("Invalid or expired token");
  }
}

async function resolveCurrentRole(
  request: FastifyRequest,
  userId: string,
  jwtRole: string,
): Promise<string> {
  try {
    const redis = request.server.redis;
    const cacheKey = `role:cache:${userId}`;

    // Check Redis cache first
    const cached = await redis.get(cacheKey);
    if (cached) return cached;

    // Cache miss — query DB
    const db = request.server.db;
    const rows = await db
      .select({ role: users.role })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    const dbRole = rows[0]?.role ?? jwtRole;
    await redis.set(cacheKey, dbRole, "EX", ROLE_CACHE_TTL_SECONDS);
    return dbRole;
  } catch {
    // Graceful degradation — fall back to JWT role
    return jwtRole;
  }
}

function logSecurityEvent(
  request: FastifyRequest,
  type: SecurityEventType,
  details: Record<string, unknown>,
): void {
  try {
    const { securityLogger } = request.diScope.cradle;
    securityLogger.logEvent(type, details);
  } catch {
    // DI container may not be available in all contexts (e.g., tests).
    // Fall back to raw logger.
    request.log.warn({ security: true, event: type, ...details }, `Security event: ${type}`);
  }
}
