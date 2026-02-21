import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import Redis from "ioredis";
import { xreadEvents, xreadBlock, type ParsedProgressEvent } from "../../lib/redis-streams.js";

/**
 * SSE endpoint for real-time execution progress streaming.
 *
 * GET /api/v1/tasks/:taskId/events
 *
 * Streams progress events from Redis Streams in real-time as Server-Sent Events.
 * Supports reconnection via the standard Last-Event-ID header, which maps to
 * the Redis Stream message ID.
 *
 * This sits alongside the existing WebSocket handler (which handles status
 * changes like completed/failed/needs_human) — SSE is for granular progress only.
 */
export async function taskEventsSSERoute(fastify: FastifyInstance) {
  fastify.get(
    "/api/v1/tasks/:taskId/events",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.userId;
      if (!userId) {
        return reply.status(401).send({ error: "Unauthorized" });
      }

      const { taskId } = request.params as { taskId: string };
      const { taskService } = request.diScope.cradle;

      // Verify task belongs to user and has a GH job
      let jobId: string;
      try {
        const task = await taskService.getById(taskId, userId);
        if (!task?.ghJob?.jobId) {
          return reply.status(404).send({ error: "No active execution found for this task" });
        }
        jobId = task.ghJob.jobId;
      } catch {
        return reply.status(404).send({ error: "Task not found" });
      }

      // Create a dedicated Redis connection for blocking reads.
      // ioredis XREAD BLOCK ties up the connection, so we need a separate one.
      const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";
      let sseRedis: Redis;
      try {
        sseRedis = new Redis(redisUrl, {
          maxRetriesPerRequest: 3,
          lazyConnect: true,
          ...(redisUrl.startsWith("rediss://") && { tls: {} }),
        });
        await sseRedis.connect();
      } catch (err) {
        request.log.error(err, "Failed to create SSE Redis connection");
        return reply.status(503).send({ error: "Real-time streaming temporarily unavailable" });
      }

      // Set SSE response headers
      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no", // Disable nginx buffering
      });

      // Resume from Last-Event-ID if client is reconnecting
      const lastEventId = (request.headers["last-event-id"] as string) || "0-0";
      let cursor = lastEventId;

      // Send any events that accumulated since last connection
      try {
        const catchup = await xreadEvents(sseRedis, jobId, cursor, 200);
        for (const event of catchup) {
          writeSSE(reply, event.id, event);
          cursor = event.id;
        }
      } catch (err) {
        request.log.warn(err, "SSE catchup read failed");
      }

      // Heartbeat to keep connection alive (every 15s)
      const heartbeat = setInterval(() => {
        try {
          reply.raw.write(":heartbeat\n\n");
        } catch {
          // Connection may be closed
        }
      }, 15_000);

      // Polling loop: block-read from Redis Streams
      let closed = false;

      const cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        sseRedis.quit().catch(() => {});
      };

      request.raw.on("close", cleanup);
      request.raw.on("error", cleanup);

      // Non-blocking poll loop with XREAD BLOCK
      const poll = async () => {
        while (!closed) {
          try {
            const events = await xreadBlock(
              sseRedis,
              jobId,
              cursor,
              5000, // Block for 5 seconds max
              50,
            );

            for (const event of events) {
              if (closed) break;
              writeSSE(reply, event.id, event);
              cursor = event.id;

              // If we got a "completed" or "failed" step, send a final event and close
              if (event.step === "completed" || event.step === "failed") {
                reply.raw.write(`event: done\ndata: ${JSON.stringify({ step: event.step })}\n\n`);
                cleanup();
                reply.raw.end();
                return;
              }
            }
          } catch (err) {
            if (closed) return;
            // Log but continue — transient Redis errors shouldn't kill the stream
            request.log.warn(err, "SSE poll error");
            // Brief backoff before retry
            await new Promise((r) => setTimeout(r, 1000));
          }
        }
      };

      // Start polling (don't await — runs in background until client disconnects)
      poll().catch((err) => {
        if (!closed) {
          request.log.error(err, "SSE poll fatal error");
          cleanup();
          reply.raw.end();
        }
      });

      // Prevent Fastify from trying to send a response (we're streaming)
      return reply;
    },
  );
}

// -- Helpers --

function writeSSE(reply: FastifyReply, id: string, data: ParsedProgressEvent) {
  try {
    reply.raw.write(`id: ${id}\nevent: progress\ndata: ${JSON.stringify(data)}\n\n`);
  } catch {
    // Connection closed
  }
}
