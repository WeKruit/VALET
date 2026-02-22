import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import * as jose from "jose";
import { streamKey, parseStreamFields } from "../../lib/redis-streams.js";

// Per-user SSE connection tracking (exported for testing)
export const activeConnections = new Map<string, number>();
const MAX_CONNECTIONS_PER_USER = 5;

function getAllowedOrigins(): string[] {
  const envOrigins = process.env.CORS_ORIGIN;
  if (envOrigins) {
    return envOrigins
      .split(",")
      .map((o) => o.trim())
      .filter(Boolean);
  }
  return ["http://localhost:5173"];
}

function getCorsHeaders(request: FastifyRequest): Record<string, string> {
  const origin = request.headers.origin;
  const allowed = getAllowedOrigins();
  if (origin && allowed.includes(origin)) {
    return {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Credentials": "true",
    };
  }
  return {};
}

export async function taskEventsSSERoutes(fastify: FastifyInstance) {
  fastify.get(
    "/api/v1/tasks/:taskId/events/stream",
    async (request: FastifyRequest, reply: FastifyReply) => {
      // 1. Auth via query param
      const url = new URL(request.url, `http://${request.headers.host}`);
      const token = url.searchParams.get("token");
      if (!token) {
        return reply.status(401).send({ error: "Missing token query parameter" });
      }

      const jwtSecret = process.env.JWT_SECRET;
      if (!jwtSecret) {
        return reply.status(500).send({ error: "Server configuration error" });
      }

      let userId: string;
      try {
        const secret = new TextEncoder().encode(jwtSecret);
        const { payload } = await jose.jwtVerify(token, secret, {
          algorithms: ["HS256"],
        });
        if (!payload.sub) {
          return reply.status(401).send({ error: "Invalid token" });
        }
        userId = payload.sub;
      } catch {
        return reply.status(401).send({ error: "Invalid or expired token" });
      }

      // 2. Connection limit
      const current = activeConnections.get(userId) ?? 0;
      if (current >= MAX_CONNECTIONS_PER_USER) {
        return reply.status(429).send({ error: "Too many concurrent SSE connections" });
      }
      activeConnections.set(userId, current + 1);

      // 3. Verify task ownership
      const { taskId } = request.params as { taskId: string };
      const { taskService } = request.diScope.cradle;

      let jobId: string | undefined;
      try {
        const task = await taskService.getById(taskId, userId);
        jobId = task?.ghJob?.jobId;
      } catch {
        activeConnections.set(userId, (activeConnections.get(userId) ?? 1) - 1);
        return reply.status(404).send({ error: "Task not found" });
      }

      if (!jobId) {
        activeConnections.set(userId, (activeConnections.get(userId) ?? 1) - 1);
        reply.raw.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
          ...getCorsHeaders(request),
        });
        reply.raw.write(": no GH job associated with this task\n\n");
        reply.raw.end();
        return;
      }

      // 4. Set up SSE stream
      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
        ...getCorsHeaders(request),
      });

      // 5. Duplicate Redis for blocking XREAD
      const redis = request.server.redis.duplicate({ maxRetriesPerRequest: null });
      const key = streamKey(jobId);
      let lastId = (request.headers["last-event-id"] as string) || "$";
      let closed = false;

      // Cleanup on disconnect
      request.raw.on("close", () => {
        closed = true;
        const count = activeConnections.get(userId) ?? 1;
        if (count <= 1) {
          activeConnections.delete(userId);
        } else {
          activeConnections.set(userId, count - 1);
        }
        redis.disconnect();
      });

      // Keepalive timer
      const keepalive = setInterval(() => {
        if (!closed) {
          try {
            reply.raw.write(": keepalive\n\n");
          } catch {
            closed = true;
          }
        }
      }, 15000);

      // 6. XREAD loop
      try {
        while (!closed) {
          const result = await redis.xread("COUNT", "10", "BLOCK", "5000", "STREAMS", key, lastId);

          if (!result || closed) continue;

          for (const [, messages] of result) {
            for (const [msgId, fields] of messages) {
              if (closed) break;
              const data = parseStreamFields(fields);
              reply.raw.write(`id: ${msgId}\nevent: progress\ndata: ${JSON.stringify(data)}\n\n`);
              lastId = msgId;
            }
          }
        }
      } catch (err) {
        if (!closed) {
          request.log.warn({ err }, "SSE XREAD error");
        }
      } finally {
        clearInterval(keepalive);
        if (!closed) {
          reply.raw.end();
        }
      }
    },
  );
}
