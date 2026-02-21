/**
 * Job Application Workflow V2
 *
 * Integrates the real browser automation stack:
 *   - SandboxController for browser lifecycle and CDP mutex
 *   - EngineOrchestrator for fallback cascade (Stagehand DOM -> CUA -> Magnitude)
 *   - ExecutionEngine + ManualManager for Reuse/Explore self-learning
 *   - EventLogger for event persistence
 *   - Redis pub/sub for real-time progress to frontend
 *
 * DAG structure:
 *   start-browser -> navigate-and-analyze -> fill-fields -> check-captcha* -> review-or-submit* -> verify -> cleanup
 *                                                             (* = durableTask)
 *
 * Closure-scoped SandboxController + EngineOrchestrator are shared across tasks
 * via Hatchet's StickyStrategy.SOFT, ensuring all tasks for a workflow run
 * execute on the same worker.
 */

import type { Hatchet } from "@hatchet-dev/typescript-sdk";
import { StickyStrategy } from "@hatchet-dev/typescript-sdk/workflow.js";
import { ConcurrencyLimitStrategy } from "@hatchet-dev/typescript-sdk/protoc/v1/workflows.js";
import type { Context, DurableContext } from "@hatchet-dev/typescript-sdk/v1/client/worker/context.js";
import type { JsonValue } from "@hatchet-dev/typescript-sdk/v1/types.js";
import type Redis from "ioredis";
import { eq, and } from "drizzle-orm";
import pino from "pino";
import { resumes, type Database } from "@valet/db";
import type { UserData } from "@valet/shared/types";
import type {
  ISandboxController,
  ISandboxProvider,
  IEngineOrchestrator,
  IBrowserEngine,
  SandboxProviderType,
  SandboxControllerConfig,
  ApplicationPhase,
} from "@valet/shared/types";
import type { EventLogger } from "../services/event-logger.js";
import { SandboxController } from "../services/sandbox-controller.js";
import { EngineOrchestrator } from "../services/engine-orchestrator.js";
import { ManualManager } from "../services/manual-manager.js";
import { ExecutionEngine } from "../services/execution-engine.js";

const logger = pino({ name: "job-application-v2" });

// ---------------------------------------------------------------------------
// Workflow Input / Output Types
// ---------------------------------------------------------------------------

interface WorkflowInput {
  [key: string]: JsonValue;
  taskId: string;
  jobUrl: string;
  userId: string;
  resumeId: string;
  mode: "copilot" | "autopilot";
  tier: 1 | 2 | 3;
  subscriptionTier: string;
}

interface StartBrowserOutput {
  cdpUrl: string;
  engineType: string;
  interventionUrl: string | null;
  tier: number;
  providerType: string;
}

interface AnalyzeOutput {
  platform: string;
  totalFields: number;
  formUrl: string;
}

interface FillOutput {
  stepsCompleted: number;
  totalSteps: number;
  overallConfidence: number;
  requiresReview: boolean;
  executionMode: "reuse" | "explore";
  manualId: string | null;
  resumeUploaded: boolean;
}

interface CaptchaOutput {
  captchaDetected: boolean;
  captchaSolved: boolean;
}

interface SubmitOutput {
  submitted: boolean;
  reviewApproved: boolean;
}

interface VerifyOutput {
  success: boolean;
  confirmationId: string | null;
  screenshotUrl: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function publishProgress(
  redis: Redis,
  userId: string,
  message: Record<string, unknown>,
) {
  return redis.publish(`tasks:${userId}`, JSON.stringify(message));
}

function publishStateChange(
  redis: Redis,
  userId: string,
  taskId: string,
  from: ApplicationPhase,
  to: ApplicationPhase,
) {
  return publishProgress(redis, userId, {
    type: "state_change",
    taskId,
    from,
    to,
    timestamp: new Date().toISOString(),
  });
}

function publishStepProgress(
  redis: Redis,
  userId: string,
  taskId: string,
  step: string,
  pct: number,
  message: string,
) {
  return publishProgress(redis, userId, {
    type: "progress",
    taskId,
    step,
    pct,
    message,
  });
}

/**
 * Map subscription tier to sandbox provider type.
 * Tier 4 (extension/free) never triggers this workflow.
 */
function tierToProviderType(tier: 1 | 2 | 3): SandboxProviderType {
  switch (tier) {
    case 1:
      return "adspower-ec2";
    case 2:
      return "browserbase";
    case 3:
      return "fly-machine";
  }
}

/** Build sandbox controller config for the given tier. */
function buildControllerConfig(
  tier: 1 | 2 | 3,
  enableIntervention: boolean,
): SandboxControllerConfig {
  return {
    providerType: tierToProviderType(tier),
    engines: {
      stagehand: {
        maxFailures: 3,
        operationTimeoutMs: 30_000,
        confidenceThreshold: 0.7,
        retryCount: 2,
      },
      magnitude: {
        maxFailures: 2,
        operationTimeoutMs: 60_000,
        confidenceThreshold: 0.6,
        retryCount: 1,
      },
    },
    stagehandModel: "claude-sonnet-4-5-20250929",
    enableHumanIntervention: enableIntervention,
  };
}

/**
 * Build UserData from the resume's parsed data for form filling.
 */
async function buildUserDataFromResume(
  db: Database,
  userId: string,
  resumeId: string,
): Promise<UserData> {
  const rows = await db
    .select()
    .from(resumes)
    .where(and(eq(resumes.id, resumeId), eq(resumes.userId, userId)))
    .limit(1);

  const resume = rows[0];
  if (!resume?.parsedData) {
    logger.warn({ resumeId, userId }, "Resume not found or not yet parsed");
    return { firstName: "", lastName: "", email: "", phone: "" };
  }

  const parsed = resume.parsedData as Record<string, unknown>;
  const fullName = String(parsed.fullName ?? "");
  const nameParts = fullName.trim().split(/\s+/);
  const firstName = nameParts[0] ?? "";
  const lastName = nameParts.slice(1).join(" ") || "";

  const workHistory =
    (parsed.workHistory as Array<Record<string, unknown>>) ?? [];
  const totalYears = workHistory.reduce((sum, job) => {
    const start = job.startDate
      ? new Date(String(job.startDate)).getFullYear()
      : null;
    const end = job.endDate
      ? new Date(String(job.endDate)).getFullYear()
      : new Date().getFullYear();
    return sum + (start && end ? end - start : 0);
  }, 0);

  return {
    firstName,
    lastName,
    email: String(parsed.email ?? ""),
    phone: String(parsed.phone ?? ""),
    location: parsed.location ? String(parsed.location) : undefined,
    resumeUrl: resume.fileKey,
    yearsOfExperience: totalYears > 0 ? totalYears : undefined,
    skills: Array.isArray(parsed.skills)
      ? parsed.skills.map(String)
      : undefined,
    education:
      Array.isArray(parsed.education) && parsed.education.length > 0
        ? String(
            (parsed.education[0] as Record<string, unknown>).degree ?? "",
          )
        : undefined,
  };
}

// ---------------------------------------------------------------------------
// Workflow Registration
// ---------------------------------------------------------------------------

export function registerJobApplicationWorkflowV2(
  hatchet: Hatchet,
  redis: Redis,
  eventLogger: EventLogger,
  db: Database,
  providers: Map<SandboxProviderType, ISandboxProvider>,
) {
  // ─── Closure-scoped state (shared across tasks via StickyStrategy.SOFT) ───
  let sandbox: ISandboxController | null = null;
  let orchestrator: IEngineOrchestrator | null = null;
  let executionEngine: ExecutionEngine | null = null;

  const workflow = hatchet.workflow<WorkflowInput>({
    name: "job-application-v2",
    onEvents: ["task:created"],
    sticky: StickyStrategy.SOFT,
    concurrency: [
      {
        maxRuns: 3,
        limitStrategy: ConcurrencyLimitStrategy.GROUP_ROUND_ROBIN,
        expression: "input.userId",
      },
    ],
  });

  // ─── Task 1: start-browser ───────────────────────────────────────────────

  const startBrowser = workflow.task({
    name: "start-browser",
    executionTimeout: "120s",
    retries: 2,
    backoff: { maxSeconds: 10, factor: 2 },
    fn: async (
      input: WorkflowInput,
      _ctx: Context<WorkflowInput>,
    ): Promise<StartBrowserOutput> => {
      const browserEngine = process.env.BROWSER_ENGINE ?? "adspower";
      logger.info(
        { taskId: input.taskId, tier: input.tier, browserEngine },
        "Starting browser",
      );

      await eventLogger.log(input.taskId, "checkpoint", {
        subType: "workflow_started",
        jobUrl: input.jobUrl,
        mode: input.mode,
        tier: input.tier,
        subscriptionTier: input.subscriptionTier,
      });

      await publishStateChange(
        redis,
        input.userId,
        input.taskId,
        "provisioning",
        "provisioning",
      );

      // Determine provider from tier
      const providerType = tierToProviderType(input.tier as 1 | 2 | 3);
      const provider = providers.get(providerType);
      if (!provider) {
        throw new Error(
          `No provider registered for type: ${providerType} (tier ${input.tier})`,
        );
      }

      // Build config and create SandboxController
      const config = buildControllerConfig(
        input.tier as 1 | 2 | 3,
        input.mode === "copilot",
      );

      sandbox = new SandboxController(config, provider, {
        userId: input.userId,
        platform: "unknown",
        taskId: input.taskId,
        enableIntervention: input.mode === "copilot",
      });

      // Start session and connect engine
      await sandbox.startSession();
      await sandbox.connectEngine("stagehand");

      // Create orchestrator with the sandbox controller
      orchestrator = new EngineOrchestrator(sandbox);

      // Create execution engine for self-learning
      const manualManager = new ManualManager(db);
      executionEngine = new ExecutionEngine(manualManager, eventLogger);

      await publishStepProgress(
        redis,
        input.userId,
        input.taskId,
        "start-browser",
        10,
        "Browser started",
      );

      return {
        cdpUrl: sandbox.getCdpUrl() ?? "",
        engineType: sandbox.getCurrentEngine(),
        interventionUrl: sandbox.getInterventionUrl(),
        tier: input.tier,
        providerType,
      };
    },
  });

  // ─── Task 2: navigate-and-analyze ────────────────────────────────────────

  const navigateAndAnalyze = workflow.task({
    name: "navigate-and-analyze",
    executionTimeout: "60s",
    retries: 1,
    parents: [startBrowser],
    fn: async (
      input: WorkflowInput,
      _ctx: Context<WorkflowInput>,
    ): Promise<AnalyzeOutput> => {
      logger.info(
        { taskId: input.taskId, jobUrl: input.jobUrl },
        "Navigating and analyzing form",
      );

      if (!sandbox || !orchestrator) {
        throw new Error("SandboxController or EngineOrchestrator not initialized");
      }

      await publishStateChange(
        redis,
        input.userId,
        input.taskId,
        "provisioning",
        "navigating",
      );

      // Navigate to the job URL
      const engine = sandbox.getEngineHandle()?.engine;
      if (!engine) {
        throw new Error("No engine connected");
      }

      await engine.navigate(input.jobUrl);

      await publishStateChange(
        redis,
        input.userId,
        input.taskId,
        "navigating",
        "analyzing",
      );

      // Detect platform via the engine
      const platformResult = await engine.extract<{
        platform: string;
        isEasyApply: boolean;
      }>(
        "Identify the ATS platform of this job application page. Common platforms: LinkedIn, Greenhouse, Lever, Workday.",
        {
          type: "object",
          properties: {
            platform: {
              type: "string",
              enum: ["linkedin", "greenhouse", "lever", "workday", "unknown"],
            },
            isEasyApply: { type: "boolean" },
          },
        },
      );

      // Observe interactive form elements
      const formElements = await engine.observe(
        "Find all interactive form fields on this page (inputs, textareas, selects, file uploads, buttons).",
      );

      const platform = platformResult.data.platform ?? "unknown";

      await eventLogger.log(input.taskId, "state_change", {
        from: "navigating",
        to: "analyzing",
        platform,
        totalFields: formElements.length,
      });

      await publishStepProgress(
        redis,
        input.userId,
        input.taskId,
        "navigate-and-analyze",
        25,
        `Detected ${platform} with ${formElements.length} fields`,
      );

      return {
        platform,
        totalFields: formElements.length,
        formUrl: input.jobUrl,
      };
    },
  });

  // ─── Task 3: fill-fields ────────────────────────────────────────────────

  const fillFields = workflow.task({
    name: "fill-fields",
    executionTimeout: "300s",
    retries: 0,
    parents: [navigateAndAnalyze],
    fn: async (
      input: WorkflowInput,
      ctx: Context<WorkflowInput>,
    ): Promise<FillOutput> => {
      const analyzeResult = (await ctx.parentOutput(navigateAndAnalyze)) as AnalyzeOutput;

      logger.info(
        {
          taskId: input.taskId,
          platform: analyzeResult.platform,
          totalFields: analyzeResult.totalFields,
        },
        "Filling form fields",
      );

      if (!sandbox || !executionEngine) {
        throw new Error("SandboxController or ExecutionEngine not initialized");
      }

      await publishStateChange(
        redis,
        input.userId,
        input.taskId,
        "analyzing",
        "filling",
      );

      // Build user data from the resume
      const userData = await buildUserDataFromResume(
        db,
        input.userId,
        input.resumeId,
      );

      // Build flat data maps for the execution engine
      const userDataMap: Record<string, string> = {
        firstName: userData.firstName,
        lastName: userData.lastName,
        email: userData.email,
        phone: userData.phone,
      };
      if (userData.location) userDataMap.location = userData.location;
      if (userData.resumeUrl) userDataMap.resumeUrl = userData.resumeUrl;
      if (userData.linkedinUrl) userDataMap.linkedinUrl = userData.linkedinUrl;
      if (userData.portfolioUrl) {
        userDataMap.portfolioUrl = userData.portfolioUrl;
      }
      if (userData.yearsOfExperience != null) {
        userDataMap.yearsOfExperience = String(userData.yearsOfExperience);
      }
      if (userData.education) userDataMap.education = userData.education;
      if (userData.skills) userDataMap.skills = userData.skills.join(", ");

      const qaAnswers = userData.qaAnswers ?? {};

      // Use the ExecutionEngine (Reuse vs Explore)
      // The engine will use IAgentBrowser internally. For now, we create a
      // bridge adapter that delegates to the SandboxController's engine.
      const engine = sandbox.getEngineHandle()?.engine;
      if (!engine) {
        throw new Error("No engine connected for fill-fields");
      }

      const agentBrowserAdapter = createAgentBrowserAdapter(engine);

      const execResult = await executionEngine.execute(
        {
          url: input.jobUrl,
          platform: analyzeResult.platform,
          userData: userDataMap,
          qaAnswers,
        },
        agentBrowserAdapter,
      );

      // Log fill completion
      await eventLogger.log(input.taskId, "checkpoint", {
        subType: "fill_completed",
        mode: execResult.mode,
        stepsCompleted: execResult.stepsCompleted,
        totalSteps: execResult.totalSteps,
        success: execResult.success,
        manualId: execResult.manualId,
        durationMs: execResult.durationMs,
      });

      await publishStepProgress(
        redis,
        input.userId,
        input.taskId,
        "fill-fields",
        60,
        `Filled fields (${execResult.mode} mode, ${execResult.stepsCompleted}/${execResult.totalSteps} steps)`,
      );

      const requiresReview = input.mode === "copilot";

      // In copilot mode, send field review to frontend
      if (requiresReview) {
        await publishProgress(redis, input.userId, {
          type: "field_review",
          taskId: input.taskId,
          mode: execResult.mode,
          stepsCompleted: execResult.stepsCompleted,
          success: execResult.success,
        });
      }

      return {
        stepsCompleted: execResult.stepsCompleted,
        totalSteps: execResult.totalSteps,
        overallConfidence: execResult.success ? 0.85 : 0.3,
        requiresReview,
        executionMode: execResult.mode,
        manualId: execResult.manualId ?? null,
        resumeUploaded: true, // TODO: track real resume upload status
      };
    },
  });

  // ─── Task 4: check-captcha (durable) ────────────────────────────────────

  const checkCaptcha = workflow.durableTask({
    name: "check-captcha",
    executionTimeout: "600s",
    retries: 0,
    parents: [fillFields],
    fn: async (
      input: WorkflowInput,
      ctx: DurableContext<WorkflowInput>,
    ): Promise<CaptchaOutput> => {
      logger.info({ taskId: input.taskId }, "Checking for CAPTCHA");

      if (!sandbox) {
        throw new Error("SandboxController not initialized");
      }

      const engine = sandbox.getEngineHandle()?.engine;
      if (!engine) {
        throw new Error("No engine connected for CAPTCHA check");
      }

      // Use the engine to detect CAPTCHA elements on the page
      const captchaCheck = await engine.extract<{
        hasCaptcha: boolean;
        captchaType: string | null;
      }>(
        "Check if there is a CAPTCHA or human verification challenge visible on this page.",
        {
          type: "object",
          properties: {
            hasCaptcha: { type: "boolean" },
            captchaType: {
              type: "string",
              nullable: true,
              enum: [
                "recaptcha_v2",
                "recaptcha_v3",
                "hcaptcha",
                "cloudflare_turnstile",
                null,
              ],
            },
          },
        },
      );

      const captchaDetected = captchaCheck.data.hasCaptcha;

      if (captchaDetected) {
        await eventLogger.log(input.taskId, "captcha_detected", {
          type: captchaCheck.data.captchaType ?? "unknown",
        });

        // Capture screenshot for the user
        const screenshot = await engine.screenshot();
        // TODO: Upload screenshot to S3 and get URL
        const screenshotUrl = null;

        const interventionUrl = sandbox.getInterventionUrl();

        await publishProgress(redis, input.userId, {
          type: "human_needed",
          taskId: input.taskId,
          reason: "CAPTCHA detected",
          captchaType: captchaCheck.data.captchaType,
          interventionUrl,
          screenshotUrl,
        });

        await publishStateChange(
          redis,
          input.userId,
          input.taskId,
          "filling",
          "waiting_human",
        );

        // Durable wait for CAPTCHA to be solved
        await ctx.waitFor({ eventKey: "captcha_solved" });

        await eventLogger.log(input.taskId, "checkpoint", {
          subType: "captcha_solved",
          solvedBy: "user",
        });

        await publishStateChange(
          redis,
          input.userId,
          input.taskId,
          "waiting_human",
          "filling",
        );
      }

      await publishStepProgress(
        redis,
        input.userId,
        input.taskId,
        "check-captcha",
        75,
        captchaDetected
          ? "CAPTCHA solved, continuing"
          : "No CAPTCHA detected",
      );

      return { captchaDetected, captchaSolved: true };
    },
  });

  // ─── Task 5: review-or-submit (durable) ─────────────────────────────────

  const reviewOrSubmit = workflow.durableTask({
    name: "review-or-submit",
    executionTimeout: "300s",
    retries: 0,
    parents: [checkCaptcha],
    fn: async (
      input: WorkflowInput,
      ctx: DurableContext<WorkflowInput>,
    ): Promise<SubmitOutput> => {
      const fillResult = (await ctx.parentOutput(fillFields)) as FillOutput;

      if (!sandbox) {
        throw new Error("SandboxController not initialized");
      }

      const engine = sandbox.getEngineHandle()?.engine;
      if (!engine) {
        throw new Error("No engine connected for submit");
      }

      let reviewApproved = false;

      // ─── Copilot mode: wait for user review ───
      if (fillResult.requiresReview) {
        logger.info(
          { taskId: input.taskId },
          "Waiting for user review approval (copilot mode)",
        );

        await eventLogger.log(input.taskId, "human_takeover", {
          subType: "review_requested",
          overallConfidence: fillResult.overallConfidence,
        });

        await publishStateChange(
          redis,
          input.userId,
          input.taskId,
          "filling",
          "reviewing",
        );

        await publishProgress(redis, input.userId, {
          type: "review_pending",
          taskId: input.taskId,
          message: "Waiting for your review before submitting",
        });

        // Durable pause - wait for user approval
        await ctx.waitFor({ eventKey: "review_approved" });

        await eventLogger.log(input.taskId, "checkpoint", {
          subType: "review_approved",
        });

        reviewApproved = true;
      } else {
        // ─── Autopilot mode: run quality gates ───
        logger.info(
          { taskId: input.taskId },
          "Running quality gates (autopilot mode)",
        );

        const gatesPassed =
          fillResult.overallConfidence >= 0.7 &&
          fillResult.resumeUploaded &&
          fillResult.stepsCompleted > 0;

        if (!gatesPassed) {
          logger.warn(
            {
              taskId: input.taskId,
              confidence: fillResult.overallConfidence,
              resumeUploaded: fillResult.resumeUploaded,
            },
            "Quality gates failed, escalating to human review",
          );

          await eventLogger.log(input.taskId, "human_takeover", {
            subType: "quality_gates_failed",
            overallConfidence: fillResult.overallConfidence,
          });

          await publishStateChange(
            redis,
            input.userId,
            input.taskId,
            "filling",
            "waiting_human",
          );

          await publishProgress(redis, input.userId, {
            type: "human_needed",
            taskId: input.taskId,
            reason: "Quality gates failed - review required before submission",
          });

          await ctx.waitFor({ eventKey: "review_approved" });

          await eventLogger.log(input.taskId, "checkpoint", {
            subType: "review_approved_after_gate_failure",
          });
        }

        reviewApproved = true;
      }

      // ─── Submit the application ───
      await publishStateChange(
        redis,
        input.userId,
        input.taskId,
        "reviewing",
        "submitting",
      );

      logger.info({ taskId: input.taskId }, "Submitting application");

      // Use the engine to click the submit button
      const submitResult = await engine.act(
        "Click the submit button to submit this job application. Look for buttons labeled 'Submit', 'Submit Application', 'Apply', or similar.",
      );

      if (!submitResult.success) {
        logger.error(
          { taskId: input.taskId, message: submitResult.message },
          "Submit action failed",
        );
      }

      await publishStepProgress(
        redis,
        input.userId,
        input.taskId,
        "review-or-submit",
        85,
        submitResult.success
          ? "Application submitted"
          : "Submission may have failed",
      );

      return {
        submitted: submitResult.success,
        reviewApproved,
      };
    },
  });

  // ─── Task 6: verify ─────────────────────────────────────────────────────

  const verify = workflow.task({
    name: "verify",
    executionTimeout: "30s",
    retries: 2,
    parents: [reviewOrSubmit],
    fn: async (
      input: WorkflowInput,
      _ctx: Context<WorkflowInput>,
    ): Promise<VerifyOutput> => {
      logger.info({ taskId: input.taskId }, "Verifying submission");

      if (!sandbox) {
        throw new Error("SandboxController not initialized");
      }

      const engine = sandbox.getEngineHandle()?.engine;
      if (!engine) {
        // Engine may have disconnected - treat as partial success
        logger.warn(
          { taskId: input.taskId },
          "No engine connected for verification, skipping",
        );
        return { success: true, confirmationId: null, screenshotUrl: null };
      }

      await publishStateChange(
        redis,
        input.userId,
        input.taskId,
        "submitting",
        "verifying",
      );

      // Check the current page for confirmation indicators
      const verification = await engine.extract<{
        hasConfirmation: boolean;
        confirmationId: string | null;
        confirmationMessage: string | null;
      }>(
        "Check if this page shows a confirmation that a job application was successfully submitted. Look for: 'Thank you', 'Application received', 'Successfully submitted', confirmation numbers, or a success page.",
        {
          type: "object",
          properties: {
            hasConfirmation: { type: "boolean" },
            confirmationId: { type: "string", nullable: true },
            confirmationMessage: { type: "string", nullable: true },
          },
        },
      );

      // Capture post-submission screenshot
      let screenshotUrl: string | null = null;
      try {
        const _screenshot = await engine.screenshot();
        // TODO: Upload to S3 and set screenshotUrl
      } catch (err) {
        logger.warn(
          { error: String(err) },
          "Failed to capture verification screenshot",
        );
      }

      const success = verification.data.hasConfirmation;

      await eventLogger.log(input.taskId, "checkpoint", {
        subType: "workflow_completed",
        submitted: success,
        confirmationId: verification.data.confirmationId,
        confirmationMessage: verification.data.confirmationMessage,
      });

      await publishProgress(redis, input.userId, {
        type: "completed",
        taskId: input.taskId,
        success,
        confirmationId: verification.data.confirmationId,
        screenshotUrl,
      });

      await publishStateChange(
        redis,
        input.userId,
        input.taskId,
        "verifying",
        success ? "completed" : "failed",
      );

      return {
        success,
        confirmationId: verification.data.confirmationId ?? null,
        screenshotUrl,
      };
    },
  });

  // ─── Task 7: cleanup ────────────────────────────────────────────────────

  workflow.task({
    name: "cleanup",
    executionTimeout: "30s",
    retries: 0,
    parents: [verify],
    fn: async (
      input: WorkflowInput,
      _ctx: Context<WorkflowInput>,
    ): Promise<{ cleaned: boolean }> => {
      logger.info({ taskId: input.taskId }, "Cleaning up resources");

      try {
        if (sandbox) {
          await sandbox.destroy();
          sandbox = null;
        }
      } catch (err) {
        logger.warn(
          { error: String(err) },
          "Error destroying sandbox during cleanup",
        );
      }

      orchestrator = null;
      executionEngine = null;

      logger.info({ taskId: input.taskId }, "Cleanup completed");
      return { cleaned: true };
    },
  });

  // ─── onFailure handler ──────────────────────────────────────────────────

  workflow.onFailure({
    name: "handle-failure",
    fn: async (
      input: WorkflowInput,
      _ctx: Context<WorkflowInput>,
    ): Promise<{ handled: boolean }> => {
      logger.error(
        { taskId: input.taskId },
        "Workflow failed, running failure handler",
      );

      // Capture error screenshot if browser is still alive
      try {
        if (sandbox?.getEngineHandle()?.engine?.isConnected()) {
          const _screenshot = await sandbox.getEngineHandle()!.engine!.screenshot();
          // TODO: Upload to S3
        }
      } catch {
        // Best-effort screenshot capture
      }

      // Destroy sandbox controller (release all resources)
      try {
        if (sandbox) {
          await sandbox.destroy();
          sandbox = null;
        }
      } catch (err) {
        logger.warn(
          { error: String(err) },
          "Error destroying sandbox in failure handler",
        );
      }

      orchestrator = null;
      executionEngine = null;

      // Publish failure event
      await publishStateChange(
        redis,
        input.userId,
        input.taskId,
        "failed",
        "failed",
      );

      await eventLogger.log(input.taskId, "checkpoint", {
        subType: "workflow_failed",
      });

      return { handled: true };
    },
  });

  return workflow;
}

// ---------------------------------------------------------------------------
// Bridge adapter: IBrowserEngine -> IAgentBrowser
// ---------------------------------------------------------------------------

import type { IAgentBrowser } from "../services/execution-engine.js";

/**
 * Creates a lightweight IAgentBrowser adapter from an IBrowserEngine.
 * This bridges between the ExecutionEngine's interface and the real engine.
 */
function createAgentBrowserAdapter(engine: IBrowserEngine): IAgentBrowser {
  return {
    async humanClick(selector: string) {
      await engine.act(`Click the element matching selector: ${selector}`);
    },

    async humanType(selector: string, value: string) {
      await engine.act(
        `Type "${value}" into the input field matching selector: ${selector}`,
      );
    },

    async selectOption(selector: string, value: string) {
      await engine.act(
        `Select the option "${value}" in the dropdown matching selector: ${selector}`,
      );
    },

    async uploadFile(selector: string, filePath: string) {
      await engine.act(
        `Upload the file at "${filePath}" using the file input matching selector: ${selector}`,
      );
    },

    async navigate(url: string) {
      await engine.navigate(url);
    },

    async scroll(direction: "up" | "down", _amount?: number) {
      await engine.act(`Scroll ${direction} on the page`);
    },

    async waitForSelector(selector: string, timeoutMs?: number) {
      try {
        const elements = await engine.observe(
          `Find the element matching selector: ${selector}`,
        );
        return elements.length > 0;
      } catch {
        return false;
      }
    },

    async stagehandAct(instruction: string) {
      const result = await engine.act(instruction);
      return {
        success: result.success,
        action: instruction,
        selector: null,
        description: result.message,
      };
    },

    async getCurrentUrl() {
      return engine.getCurrentUrl();
    },
  };
}
