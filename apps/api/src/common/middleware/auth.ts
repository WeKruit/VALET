import type { FastifyRequest, FastifyReply } from "fastify";
import * as jose from "jose";
import { AppError } from "../errors.js";
import { SECURITY_EVENT_TYPES, type SecurityEventType } from "../../services/security-logger.service.js";

declare module "fastify" {
  interface FastifyRequest {
    userId: string;
    userEmail: string;
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
  "/api/v1/health",
  "/api/v1/billing/webhook",
];

const PUBLIC_PREFIX_PATHS = ["/api/v1/ws", "/docs"];

export async function authMiddleware(
  request: FastifyRequest,
  _reply: FastifyReply,
) {
  const path = request.url.split("?")[0];
  if (!path) return;

  if (
    PUBLIC_EXACT_PATHS.includes(path) ||
    PUBLIC_PREFIX_PATHS.some((p) => path === p || path.startsWith(p + "/"))
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
  } catch (err) {
    if (err instanceof AppError) throw err;
    logSecurityEvent(request, SECURITY_EVENT_TYPES.AUTH_FAILURE, {
      ...securityDetails,
      reason: "Invalid or expired token",
    });
    throw AppError.unauthorized("Invalid or expired token");
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
