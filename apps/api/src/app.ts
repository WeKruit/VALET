import Fastify from "fastify";
import cookie from "@fastify/cookie";
import multipart from "@fastify/multipart";
import { initServer } from "@ts-rest/fastify";
import { diContainer } from "@fastify/awilix";
import { errorHandler } from "./common/middleware/error-handler.js";
import { authMiddleware } from "./common/middleware/auth.js";
import { requestLogger } from "./common/middleware/request-logger.js";
import { registerRateLimit, registerRouteRateLimits } from "./common/middleware/rate-limit.js";
import sentryPlugin from "./plugins/sentry.js";
import databasePlugin from "./plugins/database.js";
import redisPlugin from "./plugins/redis.js";
import containerPlugin from "./plugins/container.js";
import securityPlugin from "./plugins/security.js";
import swaggerPlugin from "./plugins/swagger.js";
import { registerWebSocket } from "./websocket/handler.js";
import { authRouter } from "./modules/auth/auth.routes.js";
import { taskRouter } from "./modules/tasks/task.routes.js";
import { taskEventRouter } from "./modules/task-events/task-event.routes.js";
import { userRouter } from "./modules/users/user.routes.js";
import { resumeRouter, resumeUploadRoute } from "./modules/resumes/resume.routes.js";
import { qaBankRouter } from "./modules/qa-bank/qa-bank.routes.js";
import { consentRouter } from "./modules/consent/consent.routes.js";
import { gdprRouter } from "./modules/gdpr/gdpr.routes.js";
import { billingRouter, billingWebhookRoute } from "./modules/billing/billing.routes.js";
import { ghosthandsWebhookRoute } from "./modules/ghosthands/ghosthands.webhook.js";
import { ghosthandsMonitoringRoutes } from "./modules/ghosthands/ghosthands.monitoring.js";
import { dashboardRouter } from "./modules/dashboard/dashboard.routes.js";
import { notificationRouter } from "./modules/notifications/notification.routes.js";
import { sandboxRouter } from "./modules/sandboxes/sandbox.routes.js";
import { taskAdminRoutes } from "./modules/tasks/task.admin-routes.js";
import { deployAdminRoutes } from "./modules/sandboxes/deploy.admin-routes.js";

export async function buildApp() {
  const fastify = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? "info",
      transport: process.env.NODE_ENV === "development" ? { target: "pino-pretty" } : undefined,
    },
  });

  // Global error handler
  fastify.setErrorHandler(errorHandler);

  // Catch raw socket errors (ECONNRESET, EPIPE) before they become uncaught exceptions
  fastify.server.on("clientError", (err, socket) => {
    fastify.log.warn({ err: err.message }, "Client socket error");
    if (!socket.destroyed) {
      socket.destroy();
    }
  });

  // Sentry must be registered before other plugins to capture all errors
  await fastify.register(sentryPlugin);

  // Plugins
  await fastify.register(cookie);
  await fastify.register(securityPlugin);
  await fastify.register(multipart, {
    limits: { fileSize: 10 * 1024 * 1024 },
  });
  await fastify.register(databasePlugin);
  await fastify.register(redisPlugin);
  await fastify.register(containerPlugin);
  await fastify.register(swaggerPlugin);
  await registerRateLimit(fastify);

  // Auth middleware
  fastify.addHook("onRequest", authMiddleware);
  fastify.addHook("onRequest", requestLogger);

  // Per-route rate limits (after auth so request.userId is available)
  await registerRouteRateLimits(fastify);

  // Health check
  fastify.get("/api/v1/health", async () => ({
    status: "ok" as const,
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version ?? "0.0.1",
  }));

  // Register ts-rest routers
  const s = initServer();
  fastify.register(s.plugin(authRouter));
  fastify.register(s.plugin(taskRouter));
  fastify.register(s.plugin(taskEventRouter));
  fastify.register(s.plugin(userRouter));
  fastify.register(s.plugin(resumeRouter));
  fastify.register(s.plugin(qaBankRouter));
  fastify.register(s.plugin(consentRouter));
  fastify.register(s.plugin(gdprRouter));
  fastify.register(s.plugin(billingRouter));
  fastify.register(s.plugin(dashboardRouter));
  fastify.register(s.plugin(notificationRouter));
  fastify.register(s.plugin(sandboxRouter));

  // Standalone multipart upload route (outside ts-rest to avoid body-parsing conflicts)
  await fastify.register(resumeUploadRoute);

  // Standalone webhook routes (outside ts-rest — needs raw body + no auth)
  await fastify.register(billingWebhookRoute);
  await fastify.register(ghosthandsWebhookRoute);

  // Admin routes (need auth via onRequest hook, so registered after auth middleware)
  await fastify.register(taskAdminRoutes);
  await fastify.register(ghosthandsMonitoringRoutes);
  await fastify.register(deployAdminRoutes);

  // WebSocket
  await registerWebSocket(fastify);

  // Start sandbox health monitor and auto-stop monitor after server is ready
  fastify.addHook("onReady", async () => {
    const { sandboxHealthMonitor, autoStopMonitor } = diContainer.cradle;
    sandboxHealthMonitor.start();
    autoStopMonitor.start();
  });

  // Stop monitors on close
  fastify.addHook("onClose", async () => {
    const { sandboxHealthMonitor, autoStopMonitor } = diContainer.cradle;
    sandboxHealthMonitor.stop();
    autoStopMonitor.stop();
  });

  return fastify;
}
