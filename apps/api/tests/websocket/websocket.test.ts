/**
 * WebSocket regression tests (WS-01 through WS-03).
 *
 * Uses a real Fastify + @fastify/websocket server with in-memory Redis mock
 * to test WebSocket connection auth and message delivery.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import websocket from "@fastify/websocket";
import * as jose from "jose";
import { randomUUID } from "node:crypto";
import { WebSocket } from "ws";

const TEST_JWT_SECRET = "test-jwt-secret-do-not-use-in-production";
const SECRET_KEY = new TextEncoder().encode(TEST_JWT_SECRET);

// ---- Token helper ----------------------------------------------------------

async function createAccessToken(claims: { sub: string; email: string }) {
  return new jose.SignJWT({ email: claims.email })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(SECRET_KEY);
}

// ---- In-memory pub/sub (replaces Redis) ------------------------------------

type PsubCallback = (pattern: string, channel: string, message: string) => void;

class InMemoryPubSub {
  private subscribers: Map<string, PsubCallback[]> = new Map();

  async psubscribe(pattern: string) {
    if (!this.subscribers.has(pattern)) {
      this.subscribers.set(pattern, []);
    }
  }

  onPmessage(callback: PsubCallback) {
    // Register for all patterns
    for (const [_pattern, callbacks] of this.subscribers) {
      callbacks.push(callback);
    }
    // Also register for future patterns
    this._globalCallback = callback;
  }

  private _globalCallback: PsubCallback | null = null;

  publish(channel: string, message: string) {
    // Match against all subscribed patterns
    for (const [pattern, callbacks] of this.subscribers) {
      // Simple glob matching: "tasks:*" matches "tasks:user123"
      const regex = new RegExp("^" + pattern.replace(/\*/g, ".*") + "$");
      if (regex.test(channel)) {
        for (const cb of callbacks) {
          cb(pattern, channel, message);
        }
      }
    }
    if (this._globalCallback) {
      this._globalCallback("tasks:*", channel, message);
    }
  }

  async punsubscribe() {}
  async quit() {}
}

// ---- Shared state for connected clients ------------------------------------

interface ConnectedClient {
  ws: any;
  userId: string;
}

const clients = new Map<any, ConnectedClient>();
const pubsub = new InMemoryPubSub();

// ---- Build test app --------------------------------------------------------

async function buildWsTestApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });

  await app.register(websocket);

  // Set up pub/sub listener
  await pubsub.psubscribe("tasks:*");
  pubsub.onPmessage((_pattern, channel, message) => {
    const userId = channel.split(":")[1];
    if (!userId) return;

    for (const client of clients.values()) {
      if (client.userId === userId && client.ws.readyState === 1) {
        client.ws.send(message);
      }
    }
  });

  app.get("/api/v1/ws", { websocket: true }, async (socket, request) => {
    const url = new URL(request.url, `http://${request.headers.host}`);
    const token = url.searchParams.get("token");

    if (!token) {
      socket.close(4001, "Missing token");
      return;
    }

    try {
      const { payload } = await jose.jwtVerify(token, SECRET_KEY, {
        algorithms: ["HS256"],
      });

      if (!payload.sub) {
        socket.close(4001, "Invalid token");
        return;
      }

      const client: ConnectedClient = {
        ws: socket,
        userId: payload.sub,
      };
      clients.set(socket, client);

      socket.on("close", () => {
        clients.delete(socket);
      });

      socket.on("error", () => {
        clients.delete(socket);
      });
    } catch {
      socket.close(4001, "Invalid or expired token");
    }
  });

  app.addHook("onClose", async () => {
    for (const client of clients.values()) {
      client.ws.close(1001, "Server shutting down");
    }
    clients.clear();
  });

  await app.ready();
  return app;
}

// ---- Helper: connect WebSocket and wait for open/close ---------------------

/**
 * Connect to a WebSocket and wait to see if it stays open or gets closed.
 * If the server closes with an app-level code (4xxx), we capture it.
 */
function connectWs(
  url: string,
  opts?: { timeout?: number },
): Promise<{ ws: WebSocket; closeCode?: number; closeReason?: string }> {
  return new Promise((resolve, reject) => {
    const timeout = opts?.timeout ?? 3000;
    const ws = new WebSocket(url);
    let settled = false;

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        // If we got here, connection is still open (success case for auth tests)
        if (ws.readyState === WebSocket.OPEN) {
          resolve({ ws });
        } else {
          ws.close();
          reject(new Error("WebSocket connection timed out"));
        }
      }
    }, timeout);

    ws.on("close", (code, reason) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve({ ws, closeCode: code, closeReason: reason.toString() });
      }
    });

    ws.on("error", (err) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(err);
      }
    });
  });
}

/**
 * Connect and expect the connection to remain open (for authenticated tests).
 */
function connectWsExpectOpen(url: string, opts?: { timeout?: number }): Promise<{ ws: WebSocket }> {
  return new Promise((resolve, reject) => {
    const timeout = opts?.timeout ?? 3000;
    const ws = new WebSocket(url);
    let settled = false;

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        ws.close();
        reject(new Error("WebSocket connection timed out waiting for open"));
      }
    }, timeout);

    ws.on("open", () => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve({ ws });
      }
    });

    ws.on("close", (code, reason) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(new Error(`WebSocket closed unexpectedly: ${code} ${reason}`));
      }
    });

    ws.on("error", (err) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(err);
      }
    });
  });
}

function waitForMessage(ws: WebSocket, timeout = 3000): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("Timed out waiting for WebSocket message"));
    }, timeout);

    ws.on("message", (data) => {
      clearTimeout(timer);
      resolve(data.toString());
    });
  });
}

// ---- Tests -----------------------------------------------------------------

let app: FastifyInstance;
let serverAddress: string;

beforeAll(async () => {
  app = await buildWsTestApp();
  // Listen on a random port
  const address = await app.listen({ port: 0, host: "127.0.0.1" });
  serverAddress = address.replace("http://", "ws://");
});

afterAll(async () => {
  await app.close();
});

describe("WebSocket Regression Tests", () => {
  // WS-01: WS connection with valid token succeeds
  it("WS-01: WS connection with valid token succeeds", async () => {
    const userId = randomUUID();
    const token = await createAccessToken({
      sub: userId,
      email: "ws-test@example.com",
    });

    const { ws } = await connectWsExpectOpen(`${serverAddress}/api/v1/ws?token=${token}`);

    // Connection should succeed (no 4001 close)
    expect(ws.readyState).toBe(WebSocket.OPEN);

    ws.close();
  });

  // WS-02: WS connection without token rejected
  it("WS-02: WS connection without token is rejected with 4001", async () => {
    const result = await connectWs(`${serverAddress}/api/v1/ws`);

    expect(result.closeCode).toBe(4001);
    expect(result.closeReason).toContain("Missing token");
  });

  // WS-02b: WS connection with invalid token rejected
  it("WS-02b: WS connection with invalid token is rejected with 4001", async () => {
    const result = await connectWs(`${serverAddress}/api/v1/ws?token=not-a-valid-jwt-token`);

    expect(result.closeCode).toBe(4001);
  });

  // WS-03: Task update delivered via WebSocket
  it("WS-03: Task update is delivered via WebSocket", async () => {
    const userId = randomUUID();
    const token = await createAccessToken({
      sub: userId,
      email: "ws-delivery@example.com",
    });

    const { ws } = await connectWsExpectOpen(`${serverAddress}/api/v1/ws?token=${token}`);

    // Give the server a moment to register the client
    await new Promise((r) => setTimeout(r, 100));

    // Set up message listener BEFORE publishing
    const messagePromise = waitForMessage(ws);

    // Simulate a task update by publishing to the Redis channel
    const updatePayload = {
      type: "task_update",
      taskId: randomUUID(),
      status: "completed",
      progress: 100,
      currentStep: "Application submitted",
    };
    pubsub.publish(`tasks:${userId}`, JSON.stringify(updatePayload));

    // Wait for the message to arrive
    const rawMessage = await messagePromise;
    const message = JSON.parse(rawMessage);

    expect(message.type).toBe("task_update");
    expect(message.status).toBe("completed");
    expect(message.progress).toBe(100);
    expect(message.taskId).toBeDefined();

    ws.close();
  });
});
