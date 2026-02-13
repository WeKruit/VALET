import type { FastifyInstance } from "fastify";
import websocket from "@fastify/websocket";
import type { WebSocket } from "ws";
import * as jose from "jose";
import Redis from "ioredis";
import { WS_CONFIG } from "@valet/shared/constants";

interface ConnectedClient {
  ws: WebSocket;
  userId: string;
  subscribedTasks: Set<string>;
}

const clients = new Map<WebSocket, ConnectedClient>();

export async function registerWebSocket(fastify: FastifyInstance) {
  await fastify.register(websocket);

  const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";
  const subscriber = new Redis(redisUrl, {
    ...(redisUrl.startsWith("rediss://") && { tls: {} }),
  });

  subscriber.on("pmessage", (_pattern, channel, message) => {
    // channel format: tasks:{userId}
    const userId = channel.split(":")[1];
    if (!userId) return;

    for (const client of clients.values()) {
      if (client.userId === userId && client.ws.readyState === 1) {
        client.ws.send(message);
      }
    }
  });

  await subscriber.psubscribe("tasks:*");

  fastify.get(
    "/api/v1/ws",
    { websocket: true },
    async (socket, request) => {
      const url = new URL(request.url, `http://${request.headers.host}`);
      const token = url.searchParams.get("token");

      if (!token) {
        socket.close(4001, "Missing token");
        return;
      }

      try {
        const secret = new TextEncoder().encode(
          process.env.JWT_SECRET ?? "",
        );
        const { payload } = await jose.jwtVerify(token, secret, {
          algorithms: ["HS256"],
        });

        if (!payload.sub) {
          socket.close(4001, "Invalid token");
          return;
        }

        const client: ConnectedClient = {
          ws: socket,
          userId: payload.sub,
          subscribedTasks: new Set(),
        };
        clients.set(socket, client);

        fastify.log.info(
          { userId: payload.sub },
          "WebSocket client connected",
        );

        // Handle incoming messages (subscribe/unsubscribe to tasks)
        socket.on("message", (rawMessage) => {
          try {
            const msg = JSON.parse(rawMessage.toString()) as {
              action: string;
              taskId?: string;
            };
            if (msg.action === "subscribe" && msg.taskId) {
              client.subscribedTasks.add(msg.taskId);
            } else if (msg.action === "unsubscribe" && msg.taskId) {
              client.subscribedTasks.delete(msg.taskId);
            }
          } catch {
            // Ignore malformed messages
          }
        });

        // Heartbeat
        const heartbeat = setInterval(() => {
          if (socket.readyState === 1) {
            socket.ping();
          }
        }, WS_CONFIG.HEARTBEAT_INTERVAL_MS);

        socket.on("close", () => {
          clearInterval(heartbeat);
          clients.delete(socket);
          fastify.log.info(
            { userId: payload.sub },
            "WebSocket client disconnected",
          );
        });

        socket.on("error", (err) => {
          fastify.log.error(err, "WebSocket error");
          clearInterval(heartbeat);
          clients.delete(socket);
        });
      } catch {
        socket.close(4001, "Invalid or expired token");
      }
    },
  );

  fastify.addHook("onClose", async () => {
    await subscriber.punsubscribe("tasks:*");
    await subscriber.quit();
    for (const client of clients.values()) {
      client.ws.close(1001, "Server shutting down");
    }
    clients.clear();
  });
}

/**
 * Publish a WebSocket message to a user's channel via Redis Pub/Sub.
 * Called by the worker or API to relay events.
 */
export async function publishToUser(
  redis: Redis,
  userId: string,
  message: Record<string, unknown>,
) {
  await redis.publish(`tasks:${userId}`, JSON.stringify(message));
}
