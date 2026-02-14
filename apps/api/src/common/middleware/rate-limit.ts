import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import rateLimit from "@fastify/rate-limit";
import { SECURITY_EVENT_TYPES } from "../../services/security-logger.service.js";

export async function registerRateLimit(fastify: FastifyInstance) {
  await fastify.register(rateLimit, {
    max: 100,
    timeWindow: "1 minute",
    keyGenerator: (request) => {
      return request.userId ?? request.ip;
    },
    errorResponseBuilder: () => ({
      error: "RATE_LIMIT_EXCEEDED",
      message: "Too many requests. Please try again later.",
    }),
  });
}

interface RouteLimit {
  /** URL path prefix to match */
  path: string;
  /** HTTP method to match */
  method: string;
  /** Max requests within the time window */
  max: number;
  /** Time window in seconds */
  windowSecs: number;
  /** Redis key prefix (must be unique per route) */
  keyPrefix: string;
  /** Error message when limit exceeded */
  message: string;
  /** Use IP instead of userId for key generation */
  keyByIp?: boolean;
}

const ROUTE_LIMITS: RouteLimit[] = [
  {
    path: "/api/v1/resumes/upload",
    method: "POST",
    max: 10,
    windowSecs: 3600,
    keyPrefix: "rl:resume-upload",
    message: "Resume upload limit reached. Maximum 10 per hour.",
  },
  {
    path: "/api/v1/tasks",
    method: "POST",
    max: 20,
    windowSecs: 3600,
    keyPrefix: "rl:task-create",
    message: "Task creation limit reached. Maximum 20 per hour.",
  },
  {
    path: "/api/v1/auth/google",
    method: "POST",
    max: 5,
    windowSecs: 900,
    keyPrefix: "rl:oauth",
    message: "Too many authentication attempts. Try again in 15 minutes.",
    keyByIp: true,
  },
  {
    path: "/api/v1/qa-bank/discover",
    method: "POST",
    max: 10,
    windowSecs: 3600,
    keyPrefix: "rl:qa-discover",
    message: "Q&A discover limit reached. Maximum 10 per hour.",
  },
];

/**
 * Per-route rate limits using Redis INCR/EXPIRE.
 * Registered as an onRequest hook so it runs after auth middleware
 * has populated request.userId.
 */
export async function registerRouteRateLimits(fastify: FastifyInstance) {
  fastify.addHook(
    "onRequest",
    async (request: FastifyRequest, reply: FastifyReply) => {
      for (const limit of ROUTE_LIMITS) {
        if (
          request.method !== limit.method ||
          request.url.split("?")[0] !== limit.path
        ) {
          continue;
        }

        const id = limit.keyByIp
          ? request.ip
          : (request.userId ?? request.ip);
        const key = `${limit.keyPrefix}:${id}`;

        const redis = request.server.redis;
        const count = await redis.incr(key);
        if (count === 1) {
          await redis.expire(key, limit.windowSecs);
        }

        if (count > limit.max) {
          try {
            const { securityLogger } = request.diScope.cradle;
            securityLogger.logEvent(SECURITY_EVENT_TYPES.RATE_LIMIT_HIT, {
              userId: request.userId,
              ip: request.ip,
              userAgent: request.headers["user-agent"],
              path: limit.path,
              method: limit.method,
              reason: limit.message,
            });
          } catch {
            request.log.warn(
              { security: true, event: SECURITY_EVENT_TYPES.RATE_LIMIT_HIT, path: limit.path },
              `Security event: ${SECURITY_EVENT_TYPES.RATE_LIMIT_HIT}`,
            );
          }
          reply
            .code(429)
            .header("Retry-After", String(limit.windowSecs))
            .send({
              error: "RATE_LIMIT_EXCEEDED",
              message: limit.message,
            });
          return;
        }

        break;
      }
    },
  );
}
