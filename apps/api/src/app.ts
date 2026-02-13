import Fastify from "fastify";
import multipart from "@fastify/multipart";
import { initServer } from "@ts-rest/fastify";
import { errorHandler } from "./common/middleware/error-handler.js";
import { authMiddleware } from "./common/middleware/auth.js";
import { requestLogger } from "./common/middleware/request-logger.js";
import { registerRateLimit } from "./common/middleware/rate-limit.js";
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
import gdprRoutes from "./modules/gdpr/gdpr.routes.js";

export async function buildApp() {
  const fastify = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? "info",
      transport:
        process.env.NODE_ENV === "development"
          ? { target: "pino-pretty" }
          : undefined,
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

  // Plugins
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

  // Standalone multipart upload route (outside ts-rest to avoid body-parsing conflicts)
  await fastify.register(resumeUploadRoute);

  // GDPR routes (non-ts-rest, standalone Fastify routes)
  await fastify.register(gdprRoutes);

  // WebSocket
  await registerWebSocket(fastify);

  return fastify;
}
