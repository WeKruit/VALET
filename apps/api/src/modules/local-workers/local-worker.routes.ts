import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

function sessionToken(request: FastifyRequest): string {
  const token = request.headers["x-local-worker-session"];
  return Array.isArray(token) ? (token[0] ?? "") : (token ?? "");
}

export async function localWorkerRoutes(fastify: FastifyInstance) {
  fastify.post(
    "/api/v1/local-workers/register",
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.userId) {
        return reply.status(401).send({ error: "Unauthorized" });
      }

      try {
        const { localWorkerBrokerService } = request.diScope.cradle;
        const body = (request.body as Record<string, unknown>) ?? {};
        const result = await localWorkerBrokerService.registerWorker({
          userId: request.userId,
          desktopWorkerId:
            typeof body.desktopWorkerId === "string" ? body.desktopWorkerId : "desktop-worker",
          deviceId: typeof body.deviceId === "string" ? body.deviceId : "desktop-device",
          appVersion: typeof body.appVersion === "string" ? body.appVersion : "unknown",
        });
        return reply.status(200).send(result);
      } catch (error) {
        return reply.status(503).send({
          error: error instanceof Error ? error.message : "Failed to register local worker",
        });
      }
    },
  );

  fastify.post(
    "/api/v1/local-workers/jobs/submit",
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.userId) {
        return reply.status(401).send({ error: "Unauthorized" });
      }

      try {
        const { localWorkerBrokerService } = request.diScope.cradle;
        const body = (request.body as Record<string, unknown>) ?? {};
        const result = await localWorkerBrokerService.submitSmartApply({
          userId: request.userId,
          desktopWorkerId: String(body.desktopWorkerId ?? ""),
          targetUrl: String(body.targetUrl ?? ""),
          profile: (body.profile as Record<string, unknown>) ?? {},
          resumePath: typeof body.resumePath === "string" ? body.resumePath : undefined,
          uiLabel: typeof body.uiLabel === "string" ? body.uiLabel : "smart_apply",
        });
        return reply.status(200).send(result);
      } catch (error) {
        return reply.status(503).send({
          error: error instanceof Error ? error.message : "Failed to submit local worker job",
        });
      }
    },
  );

  fastify.post(
    "/api/v1/local-workers/claim",
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.userId) {
        return reply.status(401).send({ error: "Unauthorized" });
      }

      try {
        const { localWorkerBrokerService } = request.diScope.cradle;
        const body = (request.body as Record<string, unknown>) ?? {};
        const result = await localWorkerBrokerService.claim({
          userId: request.userId,
          desktopWorkerId: String(body.desktopWorkerId ?? ""),
          sessionToken: sessionToken(request),
        });
        return reply.status(200).send(result);
      } catch (error) {
        return reply.status(503).send({
          error: error instanceof Error ? error.message : "Failed to claim local worker job",
        });
      }
    },
  );

  fastify.post(
    "/api/v1/local-workers/:desktopWorkerId/heartbeat",
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.userId) {
        return reply.status(401).send({ error: "Unauthorized" });
      }

      try {
        const { localWorkerBrokerService } = request.diScope.cradle;
        const { desktopWorkerId } = request.params as { desktopWorkerId: string };
        const body = (request.body as Record<string, unknown>) ?? {};
        await localWorkerBrokerService.heartbeat({
          userId: request.userId,
          desktopWorkerId,
          sessionToken: sessionToken(request),
          activeJobId: typeof body.activeJobId === "string" ? body.activeJobId : undefined,
        });
        return reply.status(200).send({ ok: true });
      } catch (error) {
        return reply.status(503).send({
          error: error instanceof Error ? error.message : "Heartbeat failed",
        });
      }
    },
  );

  fastify.post(
    "/api/v1/local-workers/jobs/:jobId/events",
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.userId) {
        return reply.status(401).send({ error: "Unauthorized" });
      }

      try {
        const { localWorkerBrokerService } = request.diScope.cradle;
        const { jobId } = request.params as { jobId: string };
        const body = (request.body as Record<string, unknown>) ?? {};
        await localWorkerBrokerService.recordEvents({
          userId: request.userId,
          sessionToken: sessionToken(request),
          jobId,
          events: Array.isArray(body.events) ? (body.events as Array<Record<string, unknown>>) : [],
        });
        return reply.status(200).send({ ok: true });
      } catch (error) {
        return reply.status(503).send({
          error: error instanceof Error ? error.message : "Failed to record local worker events",
        });
      }
    },
  );

  fastify.post(
    "/api/v1/local-workers/jobs/:jobId/complete",
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.userId) {
        return reply.status(401).send({ error: "Unauthorized" });
      }

      try {
        const { localWorkerBrokerService } = request.diScope.cradle;
        const { jobId } = request.params as { jobId: string };
        const body = (request.body as Record<string, unknown>) ?? {};
        await localWorkerBrokerService.complete({
          userId: request.userId,
          sessionToken: sessionToken(request),
          jobId,
          result: (body.result as Record<string, unknown>) ?? undefined,
          summary: typeof body.summary === "string" ? body.summary : undefined,
        });
        return reply.status(200).send({ ok: true });
      } catch (error) {
        return reply.status(503).send({
          error: error instanceof Error ? error.message : "Failed to complete local worker job",
        });
      }
    },
  );

  fastify.post(
    "/api/v1/local-workers/jobs/:jobId/fail",
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.userId) {
        return reply.status(401).send({ error: "Unauthorized" });
      }

      try {
        const { localWorkerBrokerService } = request.diScope.cradle;
        const { jobId } = request.params as { jobId: string };
        const body = (request.body as Record<string, unknown>) ?? {};
        await localWorkerBrokerService.fail({
          userId: request.userId,
          sessionToken: sessionToken(request),
          jobId,
          error: String(body.error ?? "Local worker job failed"),
          code: typeof body.code === "string" ? body.code : undefined,
          details: (body.details as Record<string, unknown>) ?? undefined,
        });
        return reply.status(200).send({ ok: true });
      } catch (error) {
        return reply.status(503).send({
          error: error instanceof Error ? error.message : "Failed to fail local worker job",
        });
      }
    },
  );

  fastify.post(
    "/api/v1/local-workers/jobs/:jobId/release",
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.userId) {
        return reply.status(401).send({ error: "Unauthorized" });
      }

      try {
        const { localWorkerBrokerService } = request.diScope.cradle;
        const { jobId } = request.params as { jobId: string };
        const body = (request.body as Record<string, unknown>) ?? {};
        await localWorkerBrokerService.release({
          userId: request.userId,
          sessionToken: sessionToken(request),
          jobId,
          reason: typeof body.reason === "string" ? body.reason : "Released by desktop worker",
        });
        return reply.status(200).send({ ok: true });
      } catch (error) {
        return reply.status(503).send({
          error: error instanceof Error ? error.message : "Failed to release local worker job",
        });
      }
    },
  );
}
