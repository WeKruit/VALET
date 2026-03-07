import crypto from "node:crypto";
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type {
  GHCallbackPayload,
  GHDeployWebhookPayload,
  GHDesktopReleasePayload,
} from "./ghosthands.types.js";
import type { TaskStatus } from "@valet/shared/schemas";
import { publishToUser } from "../../websocket/handler.js";
import { streamKey } from "../../lib/redis-streams.js";
import { browserSessionTokenStore } from "../tasks/browser-session-token-store.js";

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

  // TODO: Remove query param auth after GH callbackNotifier sends X-GH-Service-Key header
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

      const { taskRepo, ghJobRepo, sandboxRepo, redis, referralService, creditService } =
        request.diScope.cradle;
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
        pending: "queued",
        queued: "queued",
        running: "in_progress",
        paused: "waiting_human",
        awaiting_review: "waiting_human",
        needs_human: "waiting_human",
        completed: "completed",
        failed: "failed",
        cancelled: "cancelled",
        expired: "failed",
        resumed: "in_progress", // legacy compatibility
      };

      const mappedStatus = statusMap[payload.status];
      if (!mappedStatus) {
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

      // Keep test-task semantics: GH queue/running callbacks should preserve "testing"
      // until a terminal status arrives.
      const existingTask = await taskRepo.findByIdAdmin(valetTaskId);
      const taskStatus: TaskStatus =
        existingTask?.status === "testing" &&
        (mappedStatus === "queued" || mappedStatus === "in_progress")
          ? "testing"
          : mappedStatus;
      const leftWaitingHuman =
        existingTask?.status === "waiting_human" &&
        (taskStatus === "testing" ||
          taskStatus === "in_progress" ||
          taskStatus === "completed" ||
          taskStatus === "failed" ||
          taskStatus === "cancelled");
      const transitionedFromWaitingHuman = existingTask?.status === "waiting_human";
      const isWaitingGhStatus =
        payload.status === "paused" ||
        payload.status === "needs_human" ||
        payload.status === "awaiting_review";

      // EC7: Atomic status update — single UPDATE ... WHERE status NOT IN (terminal).
      // No read-then-write race; the DB enforces the guard in one round-trip.
      const task = await taskRepo.updateStatusGuarded(valetTaskId, taskStatus);

      if (!task) {
        // Task is already in a terminal state or doesn't exist
        request.log.warn(
          { valetTaskId, incomingGhStatus: payload.status },
          "Callback skipped — task in terminal state or not found",
        );
        return reply.status(200).send({ received: true, skipped: true });
      }

      // Invalidate browser-session tokens when task leaves waiting_human
      // (resumed, completed, failed, cancelled). Prevents stale tokens
      // from connecting to a different paused job on the same worker.
      if (taskStatus !== "waiting_human") {
        browserSessionTokenStore.invalidateByTaskId(valetTaskId);
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
      if (isWaitingGhStatus && payload.interaction) {
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
      if (payload.status === "resumed" || leftWaitingHuman) {
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

      // WEK-162: Store kasm_url from callback in job metadata
      if (payload.kasm_url) {
        ghJobUpdate.metadata = {
          ...((ghJobUpdate.metadata as Record<string, unknown>) ?? {}),
          kasm_url: payload.kasm_url,
        };
      }

      // Store browser_session_available in job metadata
      if (payload.browser_session_available != null) {
        ghJobUpdate.metadata = {
          ...((ghJobUpdate.metadata as Record<string, unknown>) ?? {}),
          browser_session_available: payload.browser_session_available,
        };
      }

      {
        const now = new Date();
        if (payload.status === "running") {
          ghJobUpdate.startedAt = now;
          ghJobUpdate.lastHeartbeat = now;
        }
        if (
          payload.status === "completed" ||
          payload.status === "failed" ||
          payload.status === "cancelled" ||
          payload.status === "expired"
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
        if (isWaitingGhStatus) {
          if (payload.interaction) {
            const mappedInteractionType =
              interactionTypeMap[payload.interaction.type] ?? payload.interaction.type;
            ghJobUpdate.interactionType = mappedInteractionType;
            ghJobUpdate.interactionData = payload.interaction as unknown as Record<string, unknown>;
          }
          ghJobUpdate.pausedAt = now;
        }
        if (payload.status === "resumed" || leftWaitingHuman) {
          ghJobUpdate.interactionType = null;
          ghJobUpdate.interactionData = null;
          ghJobUpdate.pausedAt = null;
        }
        if (payload.worker_id) {
          ghJobUpdate.workerId = payload.worker_id;
        }
      }

      const ghJobMetadataUpdate = {
        statusMessage: ghJobUpdate.statusMessage as string | null | undefined,
        errorCode: ghJobUpdate.errorCode as string | null | undefined,
        errorDetails: ghJobUpdate.errorDetails as Record<string, unknown> | null | undefined,
        startedAt: ghJobUpdate.startedAt as Date | null | undefined,
        completedAt: ghJobUpdate.completedAt as Date | null | undefined,
        lastHeartbeat: ghJobUpdate.lastHeartbeat as Date | null | undefined,
        resultData: ghJobUpdate.resultData as Record<string, unknown> | null | undefined,
        resultSummary: ghJobUpdate.resultSummary as string | null | undefined,
        actionCount: ghJobUpdate.actionCount as number | null | undefined,
        totalTokens: ghJobUpdate.totalTokens as number | null | undefined,
        llmCostCents: ghJobUpdate.llmCostCents as number | null | undefined,
        interactionType: ghJobUpdate.interactionType as string | null | undefined,
        interactionData: ghJobUpdate.interactionData as Record<string, unknown> | null | undefined,
        pausedAt: ghJobUpdate.pausedAt as Date | null | undefined,
        workerId: ghJobUpdate.workerId as string | null | undefined,
        metadata: ghJobUpdate.metadata as Record<string, unknown> | null | undefined,
      };

      // Attempt with one immediate retry on failure
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const updated = await ghJobRepo.updateStatusIfNotTerminal(
            payload.job_id,
            ghJobUpdate as Parameters<typeof ghJobRepo.updateStatusIfNotTerminal>[1],
          );
          if (!updated) {
            const existingJob = await ghJobRepo.findById(payload.job_id);
            if (existingJob?.status === payload.status) {
              await ghJobRepo.updateFields(payload.job_id, ghJobMetadataUpdate);
              request.log.info(
                { jobId: payload.job_id, incomingStatus: payload.status },
                "Merged gh_automation_jobs metadata onto existing terminal job",
              );
            } else {
              request.log.warn(
                {
                  jobId: payload.job_id,
                  incomingStatus: payload.status,
                  currentStatus: existingJob?.status ?? null,
                },
                "Skipped gh_automation_jobs sync because job is already terminal with a different status",
              );
            }
          }
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

      // ── Publish to Redis Stream (SSE bridge) ─────────────────
      // The SSE endpoint (task-events-sse.routes.ts) reads from Redis Streams
      // via XREAD. GH can't publish directly to VALET's Redis, so the webhook
      // handler bridges GH events → Redis Streams for real-time SSE delivery.
      const sseKey = streamKey(payload.job_id);
      await redis
        .xadd(
          sseKey,
          "*",
          "event_type",
          payload.status,
          "job_id",
          payload.job_id,
          "task_id",
          valetTaskId,
          "status",
          taskStatus,
          "message",
          payload.result_summary ?? payload.error_message ?? "",
          "payload",
          JSON.stringify(payload),
        )
        .catch((err: unknown) => {
          request.log.warn(
            { err, jobId: payload.job_id },
            "Failed to publish event to Redis stream",
          );
        });
      // TTL so old streams get cleaned up (1 hour)
      await redis.expire(sseKey, 3600).catch(() => {});

      // Publish WebSocket events based on status
      if (taskStatus === "waiting_human" && payload.interaction) {
        // HITL blocker: publish task_needs_human with interaction data
        const wsMappedType =
          interactionTypeMap[payload.interaction.type] ?? payload.interaction.type;

        // WEK-147: Prefer kasm_url from callback (direct KasmVNC), fallback to sandbox noVNC URL
        let vncUrl: string | undefined;
        let vncType: "kasmvnc" | "kasm" | "novnc" | undefined;
        if (payload.kasm_url) {
          vncUrl = payload.kasm_url;
          // Direct KasmVNC (:6901) vs legacy Kasm Workspaces (/api/public)
          vncType = payload.kasm_url.includes(":6901")
            ? "kasmvnc"
            : payload.kasm_url.includes("/api/public")
              ? "kasm"
              : "kasmvnc";
        } else if (task.sandboxId) {
          try {
            const sandbox = await sandboxRepo.findById(task.sandboxId);
            if (sandbox?.novncUrl) {
              vncUrl = sandbox.novncUrl;
              vncType = "novnc";
            }
          } catch (err) {
            request.log.warn(
              { err, sandboxId: task.sandboxId },
              "Failed to look up sandbox VNC URL for HITL message (non-critical)",
            );
          }
        }

        await publishToUser(redis, task.userId, {
          type: "task_needs_human",
          taskId: task.id,
          status: taskStatus,
          ...(vncUrl ? { vncUrl, vncType } : {}),
          browserSessionAvailable: payload.browser_session_available ?? false,
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
      } else if (
        taskStatus === "in_progress" &&
        (payload.status === "resumed" || transitionedFromWaitingHuman)
      ) {
        // Resumed from HITL: publish task_resumed.
        // New GH status model reports "running" after unblock; "resumed" is legacy.
        await publishToUser(redis, task.userId, {
          type: "task_resumed",
          taskId: task.id,
          status: taskStatus,
        });
      } else if (
        taskStatus === "in_progress" ||
        taskStatus === "queued" ||
        taskStatus === "testing" ||
        taskStatus === "waiting_human"
      ) {
        // WEK-71: Progress is now computed from gh_job_events (single source of truth).
        // No longer persist progress/currentStep to the tasks table from callbacks.
        // The frontend reads live progress via getById() -> computeProgressFromEvents().
        await publishToUser(redis, task.userId, {
          type: "task_update",
          taskId: task.id,
          status: taskStatus,
        });
      } else {
        // Standard task_update for terminal task statuses.
        // WEK-71: Progress is computed from gh_job_events at read time.
        // No progress writes to tasks table.
        const errorMessage = payload.error_message ?? payload.error?.message ?? "Unknown error";
        const stepLabel =
          taskStatus === "completed"
            ? (payload.result_summary ?? "Application submitted")
            : taskStatus === "failed"
              ? payload.status === "expired"
                ? "Expired: job timed out before execution"
                : `Failed: ${errorMessage}`
              : "Cancelled";
        await publishToUser(redis, task.userId, {
          type: "task_update",
          taskId: task.id,
          status: taskStatus,
          progress: taskStatus === "completed" ? 100 : undefined,
          currentStep: stepLabel,
          result: resultObj,
          error: errorObj,
        });
      }

      // ── Referral activation on first completed task ─────────────
      if (taskStatus === "completed" && process.env.FEATURE_REFERRALS === "true") {
        try {
          const activated = await referralService.activateReferral(task.userId);
          if (activated) {
            const rewardAmount = 25;
            await creditService.grantCredits(
              activated.referrerUserId,
              rewardAmount,
              "referral_reward",
              {
                description: "Referral reward: referred user completed first task",
                referenceType: "referral",
                referenceId: valetTaskId,
                idempotencyKey: `referral-activate-${valetTaskId}`,
              },
            );
            await referralService.updateRewardCreditsIssued(activated.id, rewardAmount);
            request.log.info(
              {
                referrerUserId: activated.referrerUserId,
                referralId: activated.id,
                referredUserId: task.userId,
                taskId: valetTaskId,
              },
              "Referral activated and reward credits granted",
            );
          }
        } catch (err) {
          request.log.error(
            { err, userId: task.userId, taskId: valetTaskId },
            "Failed to process referral activation (non-critical)",
          );
        }
      }

      // ── Credit refund on early task failure ─────────────────────
      if (
        taskStatus === "failed" &&
        process.env.FEATURE_CREDITS_ENFORCEMENT === "true" &&
        existingTask
      ) {
        const ageMs = Date.now() - existingTask.createdAt.getTime();
        const fiveMinutes = 5 * 60 * 1000;
        const neverStarted = !existingTask.startedAt;
        if (ageMs < fiveMinutes || neverStarted) {
          try {
            await creditService.refundTask(
              task.userId,
              valetTaskId,
              `task-refund-${valetTaskId}`,
              neverStarted
                ? "Refund: task failed before starting"
                : "Refund: task failed within 5 minutes",
            );
            request.log.info(
              { userId: task.userId, taskId: valetTaskId, ageMs, neverStarted },
              "Credit refunded for early task failure",
            );
          } catch (err) {
            request.log.error(
              { err, userId: task.userId, taskId: valetTaskId },
              "Failed to refund credit for early failure (non-critical)",
            );
          }
        }
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

  // ── Desktop release webhook ─────────────────────────────────
  fastify.post(
    "/api/v1/webhooks/ghosthands/desktop-release",
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
        request.log.warn("GhostHands desktop-release webhook: signature mismatch");
        return reply.status(401).send({ error: "Invalid signature" });
      }

      const payload = request.body as GHDesktopReleasePayload;

      // Accept dual-URL payload (dmg_arm64/dmg_x64) or legacy single-URL (dmg_url)
      const dmgArm64 = payload.dmg_arm64 ?? payload.dmg_url;
      if (!payload?.version || !dmgArm64) {
        return reply.status(400).send({
          error: "Bad Request",
          message: "Missing required fields: version, dmg_arm64 (or dmg_url)",
        });
      }

      request.log.info(
        {
          event: payload.event,
          version: payload.version,
          dmgArm64,
          dmgX64: payload.dmg_x64 ?? null,
          exeX64: payload.exe_x64 ?? null,
          commitSha: payload.commit_sha,
        },
        "GhostHands desktop-release webhook received",
      );

      // Store latest release in Redis (snake_case → camelCase)
      const { redis } = request.diScope.cradle;
      const releaseData = {
        version: payload.version,
        dmgArm64Url: dmgArm64,
        dmgX64Url: payload.dmg_x64 ?? null,
        exeX64Url: payload.exe_x64 ?? null,
        releaseUrl: payload.release_url,
        releasedAt: payload.timestamp,
        commitSha: payload.commit_sha,
        repository: payload.repository,
      };

      await redis.set("desktop:latest-release", JSON.stringify(releaseData));

      return reply.status(200).send({ received: true, version: payload.version });
    },
  );
}
