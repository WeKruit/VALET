import crypto from "node:crypto";
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { GHCallbackPayload, GHDeployWebhookPayload } from "./ghosthands.types.js";
import type { TaskStatus } from "@valet/shared/schemas";
import { publishToUser } from "../../websocket/handler.js";

/**
 * Verify shared service key from GhostHands (X-GH-Service-Key header).
 */
function verifyServiceKey(request: FastifyRequest): boolean {
  const serviceKey = request.headers["x-gh-service-key"] as string | undefined;
  const expectedKey = process.env.GH_SERVICE_SECRET;
  if (!expectedKey || !serviceKey) return false;
  return crypto.timingSafeEqual(Buffer.from(serviceKey), Buffer.from(expectedKey));
}

/**
 * Verify HMAC-SHA256 webhook signature.
 * The GH CI computes: echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "$SECRET"
 * Header: X-GH-Webhook-Signature: sha256=<hex>
 *
 * NOTE: The body is re-serialized from parsed JSON. If jq on the CI side
 * outputs pretty-printed JSON, the signature won't match JSON.stringify output.
 * The GH CI should use `jq -cn` for compact JSON to ensure matching.
 */
function verifyWebhookSignature(body: unknown, signatureHeader: string, secret: string): boolean {
  const expected = signatureHeader.replace("sha256=", "");
  if (!expected || expected.length !== 64) return false;
  const bodyStr = typeof body === "string" ? body : JSON.stringify(body);
  const computed = crypto.createHmac("sha256", secret).update(bodyStr).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(computed, "hex"));
}

/**
 * Standalone Fastify routes for GhostHands webhooks.
 * Registered outside ts-rest because:
 * 1. Must bypass auth middleware (GhostHands sends requests without JWT)
 * 2. Is a service-to-service webhook, not a user-facing endpoint
 */
export async function ghosthandsWebhookRoute(fastify: FastifyInstance) {
  // ── Job callback webhook ─────────────────────────────────────
  fastify.post(
    "/api/v1/webhooks/ghosthands",
    async (request: FastifyRequest, reply: FastifyReply) => {
      // Verify service-to-service auth
      if (!verifyServiceKey(request)) {
        request.log.warn("GhostHands callback: invalid or missing service key");
        return reply.status(401).send({ error: "Unauthorized" });
      }

      const { taskRepo, redis } = request.diScope.cradle;
      const payload = request.body as GHCallbackPayload;

      if (!payload?.valet_task_id || !payload?.status) {
        return reply.status(400).send({
          error: "Bad Request",
          message: "Missing required fields: valet_task_id, status",
        });
      }

      request.log.info(
        {
          jobId: payload.job_id,
          valetTaskId: payload.valet_task_id,
          status: payload.status,
        },
        "GhostHands callback received",
      );

      // Map GhostHands status to VALET task status
      const statusMap: Record<string, TaskStatus> = {
        completed: "completed",
        failed: "failed",
        cancelled: "cancelled",
      };

      const taskStatus = statusMap[payload.status];
      if (!taskStatus) {
        request.log.warn(
          { ghStatus: payload.status },
          "Unknown GhostHands status, ignoring callback",
        );
        return reply.status(200).send({ received: true });
      }

      // Update the task record
      const task = await taskRepo.updateStatus(payload.valet_task_id, taskStatus);

      if (!task) {
        request.log.warn(
          { valetTaskId: payload.valet_task_id },
          "Task not found for GhostHands callback",
        );
        return reply.status(404).send({
          error: "Not Found",
          message: `Task ${payload.valet_task_id} not found`,
        });
      }

      // Store result/error data in the task's screenshots jsonb field
      if (payload.result || payload.error) {
        await taskRepo.updateGhosthandsResult(payload.valet_task_id, {
          ghJobId: payload.job_id,
          result: payload.result ? { ...payload.result } : null,
          error: payload.error ? { ...payload.error } : null,
          completedAt: payload.timestamps.completed_at ?? null,
        });
      }

      // Publish progress update to WebSocket clients via Redis
      await publishToUser(redis, task.userId, {
        type: "task_update",
        taskId: task.id,
        status: taskStatus,
        progress: taskStatus === "completed" ? 100 : task.progress,
        currentStep:
          taskStatus === "completed"
            ? "Application submitted"
            : taskStatus === "failed"
              ? `Failed: ${payload.error?.message ?? "Unknown error"}`
              : "Cancelled",
        result: payload.result ?? null,
        error: payload.error ?? null,
      });

      return reply.status(200).send({ received: true });
    },
  );

  // ── Deploy notification webhook ──────────────────────────────
  fastify.post(
    "/api/v1/webhooks/ghosthands/deploy",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const webhookSecret = process.env.VALET_DEPLOY_WEBHOOK_SECRET;
      if (!webhookSecret) {
        request.log.warn("VALET_DEPLOY_WEBHOOK_SECRET not configured");
        return reply.status(503).send({ error: "Webhook not configured" });
      }

      // Verify HMAC signature
      const signatureHeader = request.headers["x-gh-webhook-signature"] as string | undefined;
      if (!signatureHeader) {
        return reply.status(401).send({ error: "Missing signature header" });
      }

      if (!verifyWebhookSignature(request.body, signatureHeader, webhookSecret)) {
        request.log.warn("GhostHands deploy webhook: signature mismatch");
        return reply.status(401).send({ error: "Invalid signature" });
      }

      const payload = request.body as GHDeployWebhookPayload;
      const environment = (request.headers["x-gh-environment"] as string) ?? payload.environment;

      request.log.info(
        {
          event: payload.event,
          environment,
          imageTag: payload.image_tag,
          commitSha: payload.commit_sha,
          commitMessage: payload.commit_message,
        },
        "GhostHands deploy webhook received",
      );

      // Create deploy record and notify admins
      const { deployService } = request.diScope.cradle;
      const envMap: Record<string, "dev" | "staging" | "prod"> = {
        development: "dev",
        staging: "staging",
        production: "prod",
      };
      const deploy = await deployService.createFromWebhook({
        imageTag: payload.image_tag,
        commitSha: payload.commit_sha,
        commitMessage: payload.commit_message,
        branch: payload.branch,
        environment: envMap[environment] ?? "staging",
        repository: payload.repository,
        runUrl: payload.run_url,
      });

      return reply.status(200).send({
        received: true,
        deploy_id: deploy.id,
        environment,
        image_tag: payload.image_tag,
        message: "Deploy notification created and admins notified",
      });
    },
  );
}
