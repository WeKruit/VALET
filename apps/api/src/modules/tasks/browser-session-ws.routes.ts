import type { FastifyInstance } from "fastify";
import WebSocket from "ws";
import { browserSessionTokenStore } from "./browser-session-token-store.js";

/**
 * Browser session WebSocket route.
 *
 * User-facing endpoint that translates a simple app-level protocol
 * (frame/click/type/scroll/ping) into raw CDP over a server-side
 * WebSocket to the GH worker's /internal/cdp-proxy.
 *
 * Auth is via the VALET-minted session token in the URL path — no JWT needed.
 *
 * MUST be registered AFTER @fastify/websocket plugin (see registerWebSocket).
 */
export async function registerBrowserSessionWs(fastify: FastifyInstance) {
  fastify.get("/api/v1/ws/browser-session/:token", { websocket: true }, async (socket, request) => {
    const { token } = request.params as { token: string };

    // 1. Validate token
    const session = browserSessionTokenStore.validate(token);
    if (!session) {
      socket.close(4001, "Invalid or expired token");
      return;
    }

    // 2. Connect to GH CDP proxy
    const ghServiceKey = process.env.GHOSTHANDS_SERVICE_KEY ?? process.env.GH_SERVICE_SECRET ?? "";
    const ghWsUrl = `ws://${session.workerIp}:3100/internal/cdp-proxy?key=${encodeURIComponent(ghServiceKey)}`;

    let cdpSocket: WebSocket;
    try {
      cdpSocket = new WebSocket(ghWsUrl);
    } catch {
      socket.send(
        JSON.stringify({ type: "error", message: "Failed to connect to browser session" }),
      );
      socket.close(1011, "Backend connection failed");
      return;
    }

    socket.send(JSON.stringify({ type: "session_state", state: "connecting" }));

    let screenshotInterval: ReturnType<typeof setInterval> | null = null;
    let cdpRequestId = 1;

    cdpSocket.on("open", () => {
      socket.send(JSON.stringify({ type: "session_state", state: "connected" }));

      // Send initial page meta
      socket.send(
        JSON.stringify({
          type: "page_meta",
          url: session.pageUrl ?? "",
          title: session.pageTitle ?? "",
        }),
      );

      // Enable Page domain for navigation events
      cdpSocket.send(JSON.stringify({ id: cdpRequestId++, method: "Page.enable", params: {} }));

      // Start screenshot loop (max 2fps = 500ms interval)
      screenshotInterval = setInterval(() => {
        if (cdpSocket.readyState === WebSocket.OPEN) {
          cdpSocket.send(
            JSON.stringify({
              id: cdpRequestId++,
              method: "Page.captureScreenshot",
              params: { format: "jpeg", quality: 70 },
            }),
          );
        }
      }, 500);
    });

    // Handle CDP responses
    cdpSocket.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString()) as Record<string, unknown>;

        // Screenshot response
        const result = msg.result as Record<string, unknown> | undefined;
        if (result?.data) {
          socket.send(
            JSON.stringify({
              type: "frame",
              data: result.data,
              format: "jpeg",
            }),
          );
        }

        // Page navigation events
        if (msg.method === "Page.frameNavigated") {
          const params = msg.params as Record<string, unknown> | undefined;
          const frame = params?.frame as Record<string, unknown> | undefined;
          if (frame?.url) {
            socket.send(
              JSON.stringify({
                type: "page_meta",
                url: frame.url,
                title: (frame.title as string) ?? "",
              }),
            );
          }
        }
      } catch {
        // Ignore malformed CDP messages
      }
    });

    // Handle user input from browser
    socket.on("message", (rawMsg) => {
      if (cdpSocket.readyState !== WebSocket.OPEN) return;

      try {
        const msg = JSON.parse(rawMsg.toString()) as Record<string, unknown>;

        if (msg.type === "click") {
          const x = msg.x as number;
          const y = msg.y as number;
          cdpSocket.send(
            JSON.stringify({
              id: cdpRequestId++,
              method: "Input.dispatchMouseEvent",
              params: { type: "mousePressed", x, y, button: "left", clickCount: 1 },
            }),
          );
          cdpSocket.send(
            JSON.stringify({
              id: cdpRequestId++,
              method: "Input.dispatchMouseEvent",
              params: { type: "mouseReleased", x, y, button: "left", clickCount: 1 },
            }),
          );
        } else if (msg.type === "type") {
          const text = msg.text as string;
          for (const char of text) {
            cdpSocket.send(
              JSON.stringify({
                id: cdpRequestId++,
                method: "Input.dispatchKeyEvent",
                params: { type: "keyDown", text: char, key: char },
              }),
            );
            cdpSocket.send(
              JSON.stringify({
                id: cdpRequestId++,
                method: "Input.dispatchKeyEvent",
                params: { type: "keyUp", key: char },
              }),
            );
          }
        } else if (msg.type === "scroll") {
          cdpSocket.send(
            JSON.stringify({
              id: cdpRequestId++,
              method: "Input.dispatchMouseEvent",
              params: {
                type: "mouseWheel",
                x: (msg.x as number) ?? 0,
                y: (msg.y as number) ?? 0,
                deltaX: (msg.deltaX as number) ?? 0,
                deltaY: (msg.deltaY as number) ?? 0,
              },
            }),
          );
        } else if (msg.type === "ping") {
          socket.send(JSON.stringify({ type: "pong" }));
        }
      } catch {
        // Ignore malformed messages
      }
    });

    // Cleanup helpers
    function cleanup() {
      if (screenshotInterval) clearInterval(screenshotInterval);
      screenshotInterval = null;
    }

    cdpSocket.on("close", () => {
      cleanup();
      socket.send(JSON.stringify({ type: "session_state", state: "disconnected" }));
      socket.close(1000, "Backend disconnected");
    });

    cdpSocket.on("error", () => {
      cleanup();
      socket.send(JSON.stringify({ type: "error", message: "Browser session error" }));
      socket.close(1011, "Backend error");
    });

    socket.on("close", () => {
      cleanup();
      cdpSocket.close();
    });

    socket.on("error", () => {
      cleanup();
      cdpSocket.close();
    });

    // Token expiry check (every 10s)
    const expiryCheck = setInterval(() => {
      if (!browserSessionTokenStore.validate(token)) {
        cleanup();
        clearInterval(expiryCheck);
        socket.send(JSON.stringify({ type: "session_state", state: "expired" }));
        socket.close(4002, "Session expired");
        cdpSocket.close();
      }
    }, 10_000);

    socket.on("close", () => clearInterval(expiryCheck));
  });
}
