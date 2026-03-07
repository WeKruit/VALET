import { Readable } from "node:stream";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { getAnthropicProxyConfig } from "./anthropic-proxy-config.js";
import { parseLocalWorkerRuntimeToken, verifyRuntimeAccessToken } from "./llm-runtime-auth.js";
import { LocalWorkerBrokerError } from "./local-worker-broker.service.js";

const nonEmptyString = z.string().trim().min(1);

const registerBodySchema = z.object({
  desktopWorkerId: nonEmptyString,
  deviceId: nonEmptyString,
  appVersion: nonEmptyString,
});

const submitBodySchema = z.object({
  desktopWorkerId: nonEmptyString,
  targetUrl: nonEmptyString,
  profile: z.record(z.string(), z.unknown()),
  resumePath: z.string().trim().min(1).optional(),
  uiLabel: z.string().trim().min(1).optional(),
});

const claimBodySchema = z.object({
  desktopWorkerId: nonEmptyString,
});

const heartbeatParamsSchema = z.object({
  desktopWorkerId: nonEmptyString,
});

const heartbeatBodySchema = z.object({
  activeJobId: z.string().trim().min(1).optional(),
  leaseId: z.string().trim().min(1).optional(),
});

const jobParamsSchema = z.object({
  jobId: nonEmptyString,
});

const eventsBodySchema = z.object({
  leaseId: nonEmptyString,
  events: z.array(z.record(z.string(), z.unknown())).max(100),
});

const awaitingReviewBodySchema = z.object({
  leaseId: nonEmptyString,
  summary: z.string().trim().min(1).optional(),
});

const completeBodySchema = z.object({
  leaseId: nonEmptyString,
  result: z.record(z.string(), z.unknown()).optional(),
  summary: z.string().trim().min(1).optional(),
});

const failBodySchema = z.object({
  leaseId: nonEmptyString,
  error: nonEmptyString,
  code: z.string().trim().min(1).optional(),
  details: z.record(z.string(), z.unknown()).optional(),
});

const releaseBodySchema = z.object({
  leaseId: nonEmptyString,
  reason: nonEmptyString,
});

const cancelBodySchema = z.object({
  leaseId: nonEmptyString,
});

const HOP_BY_HOP_HEADERS = new Set([
  "authorization",
  "connection",
  "content-length",
  "host",
  "transfer-encoding",
  "x-api-key",
  "x-local-worker-session",
]);

function workerSessionToken(request: FastifyRequest): string {
  const token = request.headers["x-local-worker-session"];
  return Array.isArray(token) ? (token[0] ?? "") : (token ?? "");
}

function runtimeToken(request: FastifyRequest): string {
  const token = request.headers["x-api-key"];
  return Array.isArray(token) ? (token[0] ?? "") : (token ?? "");
}

function buildAnthropicUpstreamHeaders(request: FastifyRequest, providerApiKey: string): Headers {
  const headers = new Headers();

  for (const [key, value] of Object.entries(request.headers)) {
    if (!value || HOP_BY_HOP_HEADERS.has(key)) continue;
    if (Array.isArray(value)) {
      headers.set(key, value.join(", "));
    } else {
      headers.set(key, value);
    }
  }

  headers.set("x-api-key", providerApiKey);
  if (!headers.has("anthropic-version")) {
    headers.set("anthropic-version", "2023-06-01");
  }

  return headers;
}

function copyResponseHeaders(reply: FastifyReply, response: Response): void {
  for (const [key, value] of response.headers.entries()) {
    if (HOP_BY_HOP_HEADERS.has(key)) continue;
    reply.header(key, value);
  }
  reply.header("X-Accel-Buffering", "no");
}

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function parseOrThrow<T>(schema: z.ZodSchema<T>, input: unknown): T {
  return schema.parse(input);
}

function sendBrokerError(reply: FastifyReply, error: unknown, fallback: string) {
  if (error instanceof LocalWorkerBrokerError) {
    return reply.status(error.statusCode).send({
      error: error.message,
      code: error.code,
    });
  }

  if (error instanceof z.ZodError) {
    return reply.status(400).send({
      error: "Invalid request payload",
      details: error.flatten(),
    });
  }

  return reply.status(503).send({
    error: error instanceof Error ? error.message : fallback,
  });
}

export async function localWorkerRoutes(fastify: FastifyInstance) {
  fastify.post(
    "/api/v1/local-workers/anthropic/v1/messages",
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const token = runtimeToken(request);
        if (!token) {
          return reply.status(401).send({ error: "Missing managed runtime token" });
        }

        const decoded = parseLocalWorkerRuntimeToken(token);
        const auth = await verifyRuntimeAccessToken(decoded.accessToken);
        const { localWorkerBrokerService } = request.diScope.cradle;
        await localWorkerBrokerService.requireCurrentLease(
          decoded.sessionToken,
          decoded.leaseId,
          auth.userId,
        );

        const config = await getAnthropicProxyConfig(request.log);
        const requestedModel =
          isObject(request.body) && typeof request.body.model === "string"
            ? request.body.model
            : null;
        if (requestedModel && !config.allowedModels.includes(requestedModel)) {
          return reply.status(400).send({
            error: `Model "${requestedModel}" is not allowed for managed Desktop inference`,
          });
        }

        const controller = new AbortController();
        request.raw.on("close", () => controller.abort());

        const upstream = await fetch(`${config.baseUrl.replace(/\/+$/, "")}/v1/messages`, {
          method: "POST",
          headers: buildAnthropicUpstreamHeaders(request, config.apiKey),
          body: request.body == null ? undefined : JSON.stringify(request.body),
          signal: controller.signal,
        });

        reply.code(upstream.status);
        copyResponseHeaders(reply, upstream);

        if (!upstream.body) {
          return reply.send(await upstream.text());
        }

        return reply.send(Readable.fromWeb(upstream.body as never));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (
          message.includes("Managed runtime token") ||
          message.includes("managed runtime token") ||
          message.includes("JWT") ||
          message.includes("JOSE")
        ) {
          return reply.status(401).send({ error: message });
        }
        return sendBrokerError(reply, error, "Failed to proxy managed Anthropic request");
      }
    },
  );

  fastify.post(
    "/api/v1/local-workers/register",
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.userId) {
        return reply.status(401).send({ error: "Unauthorized" });
      }

      try {
        const { localWorkerBrokerService } = request.diScope.cradle;
        const body = parseOrThrow(registerBodySchema, request.body);
        const result = await localWorkerBrokerService.registerWorker({
          userId: request.userId,
          desktopWorkerId: body.desktopWorkerId,
          deviceId: body.deviceId,
          appVersion: body.appVersion,
        });
        return reply.status(200).send(result);
      } catch (error) {
        return sendBrokerError(reply, error, "Failed to register local worker");
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
        const body = parseOrThrow(submitBodySchema, request.body);
        const result = await localWorkerBrokerService.submitSmartApply({
          userId: request.userId,
          desktopWorkerId: body.desktopWorkerId,
          targetUrl: body.targetUrl,
          profile: body.profile,
          resumePath: body.resumePath,
          uiLabel: body.uiLabel ?? "smart_apply",
        });
        return reply.status(200).send(result);
      } catch (error) {
        return sendBrokerError(reply, error, "Failed to submit local worker job");
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
        const body = parseOrThrow(claimBodySchema, request.body);
        const token = workerSessionToken(request);
        if (!token) {
          return reply.status(401).send({ error: "Missing worker session token" });
        }
        const result = await localWorkerBrokerService.claim({
          userId: request.userId,
          desktopWorkerId: body.desktopWorkerId,
          sessionToken: token,
        });
        return reply.status(200).send(result);
      } catch (error) {
        return sendBrokerError(reply, error, "Failed to claim local worker job");
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
        const params = parseOrThrow(heartbeatParamsSchema, request.params);
        const body = parseOrThrow(heartbeatBodySchema, request.body ?? {});
        const token = workerSessionToken(request);
        if (!token) {
          return reply.status(401).send({ error: "Missing worker session token" });
        }
        await localWorkerBrokerService.heartbeat({
          userId: request.userId,
          desktopWorkerId: params.desktopWorkerId,
          sessionToken: token,
          activeJobId: body.activeJobId,
          leaseId: body.leaseId,
        });
        return reply.status(200).send({ ok: true });
      } catch (error) {
        return sendBrokerError(reply, error, "Heartbeat failed");
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
        const params = parseOrThrow(jobParamsSchema, request.params);
        const body = parseOrThrow(eventsBodySchema, request.body);
        const token = workerSessionToken(request);
        if (!token) {
          return reply.status(401).send({ error: "Missing worker session token" });
        }
        await localWorkerBrokerService.recordEvents({
          userId: request.userId,
          sessionToken: token,
          jobId: params.jobId,
          leaseId: body.leaseId,
          events: body.events,
        });
        return reply.status(200).send({ ok: true });
      } catch (error) {
        return sendBrokerError(reply, error, "Failed to record local worker events");
      }
    },
  );

  fastify.post(
    "/api/v1/local-workers/jobs/:jobId/awaiting-review",
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.userId) {
        return reply.status(401).send({ error: "Unauthorized" });
      }

      try {
        const { localWorkerBrokerService } = request.diScope.cradle;
        const params = parseOrThrow(jobParamsSchema, request.params);
        const body = parseOrThrow(awaitingReviewBodySchema, request.body);
        const token = workerSessionToken(request);
        if (!token) {
          return reply.status(401).send({ error: "Missing worker session token" });
        }
        await localWorkerBrokerService.moveToAwaitingReview({
          userId: request.userId,
          sessionToken: token,
          jobId: params.jobId,
          leaseId: body.leaseId,
          summary: body.summary,
        });
        return reply.status(200).send({ ok: true });
      } catch (error) {
        return sendBrokerError(reply, error, "Failed to move job to awaiting review");
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
        const params = parseOrThrow(jobParamsSchema, request.params);
        const body = parseOrThrow(completeBodySchema, request.body);
        const token = workerSessionToken(request);
        if (!token) {
          return reply.status(401).send({ error: "Missing worker session token" });
        }
        const result = await localWorkerBrokerService.complete({
          userId: request.userId,
          sessionToken: token,
          jobId: params.jobId,
          leaseId: body.leaseId,
          result: body.result,
          summary: body.summary,
        });
        return reply.status(200).send({ ok: true, ...result });
      } catch (error) {
        return sendBrokerError(reply, error, "Failed to complete local worker job");
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
        const params = parseOrThrow(jobParamsSchema, request.params);
        const body = parseOrThrow(failBodySchema, request.body);
        const token = workerSessionToken(request);
        if (!token) {
          return reply.status(401).send({ error: "Missing worker session token" });
        }
        const result = await localWorkerBrokerService.fail({
          userId: request.userId,
          sessionToken: token,
          jobId: params.jobId,
          leaseId: body.leaseId,
          error: body.error,
          code: body.code,
          details: body.details,
        });
        return reply.status(200).send({ ok: true, ...result });
      } catch (error) {
        return sendBrokerError(reply, error, "Failed to fail local worker job");
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
        const params = parseOrThrow(jobParamsSchema, request.params);
        const body = parseOrThrow(releaseBodySchema, request.body);
        const token = workerSessionToken(request);
        if (!token) {
          return reply.status(401).send({ error: "Missing worker session token" });
        }
        await localWorkerBrokerService.release({
          userId: request.userId,
          sessionToken: token,
          jobId: params.jobId,
          leaseId: body.leaseId,
          reason: body.reason,
        });
        return reply.status(200).send({ ok: true });
      } catch (error) {
        return sendBrokerError(reply, error, "Failed to release local worker job");
      }
    },
  );

  fastify.post(
    "/api/v1/local-workers/jobs/:jobId/cancel",
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.userId) {
        return reply.status(401).send({ error: "Unauthorized" });
      }

      try {
        const { localWorkerBrokerService } = request.diScope.cradle;
        const params = parseOrThrow(jobParamsSchema, request.params);
        const body = parseOrThrow(cancelBodySchema, request.body);
        const token = workerSessionToken(request);
        if (!token) {
          return reply.status(401).send({ error: "Missing worker session token" });
        }
        await localWorkerBrokerService.cancel({
          userId: request.userId,
          sessionToken: token,
          jobId: params.jobId,
          leaseId: body.leaseId,
        });
        return reply.status(200).send({ cancelled: true });
      } catch (error) {
        return sendBrokerError(reply, error, "Failed to cancel local worker job");
      }
    },
  );
}
