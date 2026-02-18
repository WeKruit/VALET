import crypto from "node:crypto";
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { GHCallbackPayload, GHDeployWebhookPayload } from "./ghosthands.types.js";
import type { TaskStatus } from "@valet/shared/schemas";
import { publishToUser } from "../../websocket/handler.js";

/**
 * Verify shared service key from GhostHands.
 * Checks: X-GH-Service-Key header OR ?token= query param.
 * The query param approach handles GH's callbackNotifier which doesn't send headers.
 */
function verifyServiceKey(request: FastifyRequest): boolean {
  const expectedKey = process.env.GH_SERVICE_SECRET;
  if (!expectedKey) return false;

  // 1. Check header (preferred)
  const headerKey = request.headers["x-gh-service-key"] as string | undefined;
  if (headerKey) {
    try {
      return crypto.timingSafeEqual(Buffer.from(headerKey), Buffer.from(expectedKey));
    } catch {
      return false;
    }
  }

  // 2. Check query param (for GH callbackNotifier which doesn't send auth headers)
  const url = new URL(request.url, `http://${request.headers.host ?? "localhost"}`);
  const tokenParam = url.searchParams.get("token");
  if (tokenParam) {
    try {
      return crypto.timingSafeEqual(Buffer.from(tokenParam), Buffer.from(expectedKey));
    } catch {
      return false;
    }
  }

  return false;
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

      const { taskRepo, ghJobRepo, redis } = request.diScope.cradle;
      const payload = request.body as GHCallbackPayload;

      if (!payload?.job_id || !payload?.status) {
        return reply.status(400).send({
          error: "Bad Request",
          message: "Missing required fields: job_id, status",
        });
      }

      request.log.info(
        {
          jobId: payload.job_id,
          valetTaskId: payload.valet_task_id,
          status: payload.status,
          errorCode: payload.error_code,
          resultSummary: payload.result_summary,
        },
        "GhostHands callback received",
      );

      // Map GhostHands status to VALET task status
      const statusMap: Record<string, TaskStatus> = {
        running: "in_progress",
        completed: "completed",
        failed: "failed",
        cancelled: "cancelled",
        needs_human: "waiting_human",
        resumed: "in_progress",
      };

      const taskStatus = statusMap[payload.status];
      if (!taskStatus) {
        request.log.warn(
          { ghStatus: payload.status },
          "Unknown GhostHands status, ignoring callback",
        );
        return reply.status(200).send({ received: true });
      }

      // Find the task — try valet_task_id first, fall back to job_id lookup
      let valetTaskId = payload.valet_task_id;
      if (!valetTaskId) {
        request.log.warn(
          { jobId: payload.job_id },
          "No valet_task_id in callback, looking up by job_id",
        );
        const taskByJobId = await taskRepo.findByWorkflowRunId(payload.job_id);
        if (taskByJobId) {
          valetTaskId = taskByJobId.id;
          request.log.info(
            { jobId: payload.job_id, resolvedTaskId: valetTaskId },
            "Resolved task via job_id fallback",
          );
        } else {
          request.log.warn({ jobId: payload.job_id }, "No task found by valet_task_id or job_id");
          return reply.status(200).send({ received: true, warning: "task not found" });
        }
      }

      // Update the task record
      const task = await taskRepo.updateStatus(valetTaskId, taskStatus);

      if (!task) {
        request.log.warn({ valetTaskId }, "Task not found for GhostHands callback");
        return reply.status(404).send({
          error: "Not Found",
          message: `Task ${valetTaskId} not found`,
        });
      }

      // HITL-specific data handling
      // Map GH interaction types to VALET's schema (e.g. "2fa" → "two_factor")
      const interactionTypeMap: Record<string, string> = {
        "2fa": "two_factor",
        login: "login_required",
        bot_check: "bot_check",
        rate_limited: "rate_limited",
        rate_limit: "rate_limited", // backwards compat with old GH
        verification: "verification",
        visual_verification: "verification", // backwards compat with old GH
      };
      if (payload.status === "needs_human" && payload.interaction) {
        const mappedType = interactionTypeMap[payload.interaction.type] ?? payload.interaction.type;
        await taskRepo.updateInteractionData(valetTaskId, {
          interactionType: mappedType,
          interactionData: {
            ...(payload.interaction as unknown as Record<string, unknown>),
            type: mappedType,
            description: payload.interaction.description ?? null,
            metadata: payload.interaction.metadata ?? null,
            paused_at: new Date().toISOString(),
          },
        });
      }
      if (payload.status === "resumed") {
        await taskRepo.clearInteractionData(valetTaskId);
      }

      // Normalize result/error from GH's flat format into our storage format
      const resultObj: Record<string, unknown> | null = payload.result_data
        ? {
            ...payload.result_data,
            summary: payload.result_summary,
            screenshot_url: payload.screenshot_url,
          }
        : payload.result
          ? { ...payload.result }
          : null;

      const errorObj: Record<string, unknown> | null = payload.error_code
        ? { code: payload.error_code, message: payload.error_message ?? "Unknown error" }
        : payload.error
          ? { ...payload.error }
          : null;

      const completedAt = payload.completed_at ?? payload.timestamps?.completed_at ?? null;

      // Store result/error + cost data
      if (resultObj || errorObj) {
        await taskRepo.updateGhosthandsResult(valetTaskId, {
          ghJobId: payload.job_id,
          result: resultObj,
          error: errorObj,
          completedAt,
        });
      }

      // Store LLM cost if provided
      if (payload.cost) {
        await taskRepo.updateLlmUsage(valetTaskId, {
          totalCostUsd: payload.cost.total_cost_usd,
          actionCount: payload.cost.action_count,
          totalTokens: payload.cost.total_tokens,
          costBreakdown: (payload.cost_breakdown as Record<string, unknown> | undefined) ?? null,
        });
      }

      // ── Sync gh_automation_jobs table ──────────────────────────
      const ghJobUpdate: Record<string, unknown> = {
        status: payload.status, // keep GH's native status (running, completed, etc.)
        statusMessage: payload.result_summary ?? null,
        resultSummary: payload.result_summary ?? null,
        updatedAt: new Date(),
      };

      {
        const now = new Date();
        if (payload.status === "running") {
          ghJobUpdate.startedAt = now;
          ghJobUpdate.lastHeartbeat = now;
        }
        if (
          payload.status === "completed" ||
          payload.status === "failed" ||
          payload.status === "cancelled"
        ) {
          ghJobUpdate.completedAt = completedAt ? new Date(completedAt) : now;
        }
        if (errorObj) {
          ghJobUpdate.errorCode = errorObj.code as string;
          ghJobUpdate.errorDetails = errorObj;
        }
        if (resultObj) {
          ghJobUpdate.resultData = resultObj;
        }
        if (payload.cost) {
          ghJobUpdate.actionCount = payload.cost.action_count;
          ghJobUpdate.totalTokens = payload.cost.total_tokens;
          ghJobUpdate.llmCostCents = Math.round(payload.cost.total_cost_usd * 100);
          if (payload.cost_breakdown) {
            ghJobUpdate.metadata = {
              ...((ghJobUpdate.metadata as Record<string, unknown>) ?? {}),
              cost_breakdown: payload.cost_breakdown,
            };
          }
        }
        if (payload.status === "needs_human" && payload.interaction) {
          const mappedInteractionType =
            interactionTypeMap[payload.interaction.type] ?? payload.interaction.type;
          ghJobUpdate.interactionType = mappedInteractionType;
          ghJobUpdate.interactionData = payload.interaction as unknown as Record<string, unknown>;
          ghJobUpdate.pausedAt = now;
        }
        if (payload.status === "resumed") {
          ghJobUpdate.interactionType = null;
          ghJobUpdate.interactionData = null;
          ghJobUpdate.pausedAt = null;
        }
        if (payload.worker_id) {
          ghJobUpdate.workerId = payload.worker_id;
        }
      }

      // Attempt with one immediate retry on failure
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          await ghJobRepo.updateStatus(
            payload.job_id,
            ghJobUpdate as Parameters<typeof ghJobRepo.updateStatus>[1],
          );
          break; // success
        } catch (err) {
          if (attempt === 0) {
            request.log.warn(
              { err, jobId: payload.job_id },
              "gh_automation_jobs sync failed, retrying once",
            );
            continue;
          }
          // Final attempt failed — log at ERROR level but don't fail the webhook
          request.log.error(
            { err, jobId: payload.job_id },
            "Failed to sync gh_automation_jobs after retry (non-critical)",
          );
        }
      }

      // Publish WebSocket events based on status
      if (taskStatus === "waiting_human" && payload.interaction) {
        // HITL blocker: publish task_needs_human with interaction data
        const wsMappedType =
          interactionTypeMap[payload.interaction.type] ?? payload.interaction.type;
        await publishToUser(redis, task.userId, {
          type: "task_needs_human",
          taskId: task.id,
          status: taskStatus,
          interaction: {
            type: wsMappedType,
            screenshotUrl: payload.interaction.screenshot_url ?? null,
            pageUrl: payload.interaction.page_url ?? null,
            timeoutSeconds: payload.interaction.timeout_seconds ?? null,
            message: payload.interaction.message ?? null,
            description: payload.interaction.description ?? null,
            metadata: payload.interaction.metadata ?? null,
          },
        });
      } else if (taskStatus === "in_progress" && payload.status === "resumed") {
        // Resumed from HITL: publish task_resumed
        await publishToUser(redis, task.userId, {
          type: "task_resumed",
          taskId: task.id,
          status: taskStatus,
        });
      } else if (taskStatus === "in_progress" && payload.status === "running") {
        // Worker picked up the job: persist progress and publish WS event
        const progress = payload.progress ?? 5;
        const currentStep = payload.result_summary ?? "Processing application";
        await taskRepo.updateProgress(task.id, { progress, currentStep });
        await publishToUser(redis, task.userId, {
          type: "task_update",
          taskId: task.id,
          status: taskStatus,
          progress,
          currentStep,
        });
      } else {
        // Standard task_update for completed/failed/cancelled
        const errorMessage = payload.error_message ?? payload.error?.message ?? "Unknown error";
        const stepLabel =
          taskStatus === "completed"
            ? (payload.result_summary ?? "Application submitted")
            : taskStatus === "failed"
              ? `Failed: ${errorMessage}`
              : "Cancelled";
        // Persist currentStep for terminal states (progress is set by updateStatus for completed)
        await taskRepo.updateProgress(task.id, { currentStep: stepLabel });
        await publishToUser(redis, task.userId, {
          type: "task_update",
          taskId: task.id,
          status: taskStatus,
          progress: taskStatus === "completed" ? 100 : task.progress,
          currentStep: stepLabel,
          result: resultObj,
          error: errorObj,
        });
      }

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
