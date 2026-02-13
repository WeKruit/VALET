import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import * as Sentry from "@sentry/node";

export default fp(async (fastify: FastifyInstance) => {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    fastify.log.info("SENTRY_DSN not set — error tracking disabled");
    return;
  }

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? "development",
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.2 : 1.0,
    beforeSend(event) {
      // Strip sensitive headers
      if (event.request?.headers) {
        delete event.request.headers.cookie;
        delete event.request.headers.authorization;
      }
      return event;
    },
  });

  // Capture unhandled errors via Fastify's error handler
  fastify.addHook("onError", (_request, _reply, error, done) => {
    Sentry.captureException(error);
    done();
  });

  fastify.addHook("onClose", async () => {
    await Sentry.close(2000);
  });

  fastify.log.info("Sentry error tracking initialized");
});
