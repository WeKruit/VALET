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
import startupValidatorPlugin from "./plugins/startup-validator.js";
import securityPlugin from "./plugins/security.js";
import swaggerPlugin from "./plugins/swagger.js";
import caslPlugin from "./plugins/casl.js";
import { registerWebSocket } from "./websocket/handler.js";
import { registerBrowserSessionWs } from "./modules/tasks/browser-session-ws.routes.js";
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
import { workerAdminRoutes } from "./modules/ghosthands/worker.admin-routes.js";
import { dashboardRouter } from "./modules/dashboard/dashboard.routes.js";
import { notificationRouter } from "./modules/notifications/notification.routes.js";
import { sandboxRouter } from "./modules/sandboxes/sandbox.routes.js";
import { modelRouter } from "./modules/models/model.routes.js";
import { taskAdminRoutes } from "./modules/tasks/task.admin-routes.js";
import { deployAdminRoutes } from "./modules/sandboxes/deploy.admin-routes.js";
import { secretsAdminRoutes } from "./modules/secrets/secrets.admin-routes.js";
import { syncAdminRoutes } from "./modules/sync/sync.routes.js";
import { taskUserRoutes } from "./modules/tasks/task.user-routes.js";
import { taskEventsSSERoutes } from "./modules/tasks/task-events-sse.routes.js";
import { earlyAccessRouter } from "./modules/early-access/early-access.routes.js";
import { earlyAccessAdminRouter } from "./modules/early-access/early-access.admin-routes.js";
import { emailTemplatesAdminRouter } from "./modules/email-templates/email-templates.admin-routes.js";
import { credentialRouter } from "./modules/credentials/credential.routes.js";
import { fitLabRouter } from "./modules/fit-lab/fit-lab.routes.js";
import { insightsRouter } from "./modules/insights/insights.routes.js";
import { jobLeadRouter } from "./modules/job-leads/job-lead.routes.js";
import { localWorkerRoutes } from "./modules/local-workers/local-worker.routes.js";

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
  await fastify.register(startupValidatorPlugin);
  await fastify.register(swaggerPlugin);
  await registerRateLimit(fastify);

  // Auth middleware
  fastify.addHook("onRequest", authMiddleware);
  await fastify.register(caslPlugin);
  fastify.addHook("onRequest", requestLogger);

  // Per-route rate limits (after auth so request.userId is available)
  await registerRouteRateLimits(fastify);

  // Health check
  fastify.get("/api/v1/health", async () => ({
    status: "ok" as const,
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version ?? "0.0.1",
  }));

  // Version endpoint — returns build metadata baked in at deploy time
  fastify.get("/api/v1/health/version", async () => ({
    commit_sha: process.env.COMMIT_SHA ?? "unknown",
    build_time: process.env.BUILD_TIME ?? "unknown",
    node_version: process.version,
    app: "valet-api",
  }));

  // Startup validation results — exposes config checks run at boot
  fastify.get("/api/v1/health/startup", async () => {
    const results = fastify.configValidation ?? [];
    const fails = results.filter((r) => r.status === "fail").length;
    const warns = results.filter((r) => r.status === "warn").length;
    const passes = results.filter((r) => r.status === "pass").length;
    return {
      status: fails > 0 ? ("degraded" as const) : ("ok" as const),
      summary: { passes, warns, fails },
      checks: results,
      timestamp: new Date().toISOString(),
    };
  });

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
  fastify.register(s.plugin(modelRouter));
  fastify.register(s.plugin(earlyAccessRouter));
  fastify.register(s.plugin(earlyAccessAdminRouter));
  fastify.register(s.plugin(emailTemplatesAdminRouter));
  fastify.register(s.plugin(credentialRouter));
  fastify.register(s.plugin(fitLabRouter));
  fastify.register(s.plugin(insightsRouter));
  fastify.register(s.plugin(jobLeadRouter));

  // Standalone multipart upload route (outside ts-rest to avoid body-parsing conflicts)
  await fastify.register(resumeUploadRoute);

  // Standalone webhook routes (outside ts-rest — needs raw body + no auth)
  await fastify.register(billingWebhookRoute);
  await fastify.register(ghosthandsWebhookRoute);

  // Admin routes (need auth via onRequest hook, so registered after auth middleware)
  await fastify.register(taskAdminRoutes);
  await fastify.register(ghosthandsMonitoringRoutes);
  await fastify.register(workerAdminRoutes);
  await fastify.register(deployAdminRoutes);
  await fastify.register(secretsAdminRoutes);
  await fastify.register(syncAdminRoutes);

  // User-facing standalone routes (outside ts-rest, needs auth)
  await fastify.register(taskUserRoutes);
  await fastify.register(localWorkerRoutes);

  // SSE streaming route (handles its own JWT auth via query param)
  await fastify.register(taskEventsSSERoutes);

  // WebSocket
  await registerWebSocket(fastify);

  // Browser session WebSocket (must be after @fastify/websocket registration)
  await registerBrowserSessionWs(fastify);

  // Start monitors after server is ready
  fastify.addHook("onReady", async () => {
    const {
      sandboxHealthMonitor,
      autoStopMonitor,
      autoScaleMonitor,
      pgBossService,
      staleTaskReconciliation,
      instanceDiscoveryService,
    } = diContainer.cradle;
    sandboxHealthMonitor.start();
    autoStopMonitor.start();
    autoScaleMonitor.start();
    staleTaskReconciliation.start();
    instanceDiscoveryService.start();
    // Start pg-boss (non-blocking — logs warning if DATABASE_DIRECT_URL not set)
    await pgBossService.start().catch((err) => {
      fastify.log.error({ err }, "pg-boss failed to start — queue dispatch disabled");
    });
  });

  // Stop monitors and pg-boss on close
  fastify.addHook("onClose", async () => {
    const {
      sandboxHealthMonitor,
      autoStopMonitor,
      autoScaleMonitor,
      pgBossService,
      staleTaskReconciliation,
      instanceDiscoveryService,
    } = diContainer.cradle;
    sandboxHealthMonitor.stop();
    autoStopMonitor.stop();
    autoScaleMonitor.stop();
    staleTaskReconciliation.stop();
    instanceDiscoveryService.stop();
    await pgBossService.stop();
  });

  return fastify;
}
