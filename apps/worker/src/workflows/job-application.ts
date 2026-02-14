import type { Hatchet } from "@hatchet-dev/typescript-sdk";
import type { Context, DurableContext } from "@hatchet-dev/typescript-sdk/v1/client/worker/context";
import type { JsonValue } from "@hatchet-dev/typescript-sdk/v1/types";
import type Redis from "ioredis";
import { eq, and } from "drizzle-orm";
import pino from "pino";
import { resumes, type Database } from "@valet/db";
import type { UserData } from "@valet/shared/types";
import type { EventLogger } from "../services/event-logger.js";
import { LinkedInMockAdapter } from "../adapters/linkedin.mock.js";

const logger = pino({ name: "job-application-workflow" });

interface WorkflowInput {
  [key: string]: JsonValue;
  taskId: string;
  jobUrl: string;
  userId: string;
  resumeId: string;
  mode: "copilot" | "autopilot";
}

function publishProgress(
  redis: Redis,
  userId: string,
  message: Record<string, unknown>,
) {
  return redis.publish(`tasks:${userId}`, JSON.stringify(message));
}

async function buildUserDataFromResume(
  db: Database | undefined,
  userId: string,
  resumeId: string,
): Promise<UserData> {
  if (!db) {
    logger.warn("No database connection — using empty user data");
    return { firstName: "", lastName: "", email: "", phone: "" };
  }

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

  const workHistory = (parsed.workHistory as Array<Record<string, unknown>>) ?? [];
  const totalYears = workHistory.reduce((sum, job) => {
    const start = job.startDate ? new Date(String(job.startDate)).getFullYear() : null;
    const end = job.endDate ? new Date(String(job.endDate)).getFullYear() : new Date().getFullYear();
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
    skills: Array.isArray(parsed.skills) ? parsed.skills.map(String) : undefined,
    education: Array.isArray(parsed.education) && parsed.education.length > 0
      ? String((parsed.education[0] as Record<string, unknown>).degree ?? "")
      : undefined,
  };
}

export function registerJobApplicationWorkflow(
  hatchet: Hatchet,
  redis: Redis,
  eventLogger: EventLogger,
  db?: Database,
) {
  const adapter = new LinkedInMockAdapter();

  const workflow = hatchet.workflow<WorkflowInput>({
    name: "job-application",
    onEvents: ["task:created"],
  });

  const startBrowser = workflow.task({
    name: "start-browser",
    executionTimeout: "60s",
    fn: async (input: WorkflowInput, _ctx: Context<WorkflowInput>) => {
      logger.info({ taskId: input.taskId }, "Starting browser");

      await eventLogger.log(input.taskId, "checkpoint", {
        subType: "workflow_started",
        jobUrl: input.jobUrl,
        mode: input.mode,
      });

      await publishProgress(redis, input.userId, {
        type: "state_change",
        taskId: input.taskId,
        from: "created",
        to: "provisioning",
        timestamp: new Date().toISOString(),
      });

      // Mock: simulate browser start
      await new Promise((r) => setTimeout(r, 1500));

      await publishProgress(redis, input.userId, {
        type: "progress",
        taskId: input.taskId,
        step: "start-browser",
        pct: 10,
        message: "Browser started",
      });

      return { browserReady: true, cdpUrl: "ws://mock-cdp:9222" };
    },
  });

  const analyzeForm = workflow.task({
    name: "analyze-form",
    executionTimeout: "30s",
    parents: [startBrowser],
    fn: async (input: WorkflowInput, _ctx: Context<WorkflowInput>) => {
      logger.info({ taskId: input.taskId }, "Analyzing form");

      await publishProgress(redis, input.userId, {
        type: "state_change",
        taskId: input.taskId,
        from: "provisioning",
        to: "analyzing",
        timestamp: new Date().toISOString(),
      });

      const detection = await adapter.detectPlatform(input.jobUrl);
      const formFlow = await adapter.getFormFlow(input.jobUrl);

      await eventLogger.log(input.taskId, "state_change", {
        from: "provisioning",
        to: "analyzing",
        platform: detection.platform,
        totalFields: formFlow.pages.reduce(
          (sum, p) => sum + p.fields.length,
          0,
        ),
      });

      await publishProgress(redis, input.userId, {
        type: "progress",
        taskId: input.taskId,
        step: "analyze-form",
        pct: 25,
        message: `Detected ${detection.platform} with ${formFlow.totalPages} pages`,
      });

      return {
        platform: detection.platform,
        formFlow,
        metadata: formFlow.metadata,
      };
    },
  });

  const fillFields = workflow.task({
    name: "fill-fields",
    executionTimeout: "120s",
    parents: [analyzeForm],
    fn: async (input: WorkflowInput, ctx: Context<WorkflowInput>) => {
      const prevData = (await ctx.parentOutput(analyzeForm)) as {
        formFlow: Awaited<ReturnType<typeof adapter.getFormFlow>>;
      };
      logger.info({ taskId: input.taskId }, "Filling form fields");

      await publishProgress(redis, input.userId, {
        type: "state_change",
        taskId: input.taskId,
        from: "analyzing",
        to: "filling",
        timestamp: new Date().toISOString(),
      });

      // Fetch user data from the resume's parsed data
      const userData = await buildUserDataFromResume(db, input.userId, input.resumeId);

      const fillResult = await adapter.fillForm(prevData.formFlow, userData);

      for (const field of fillResult.filledFields) {
        await eventLogger.log(input.taskId, "field_filled", {
          name: field.field.name,
          value: field.value,
          confidence: field.confidence.value,
          source: field.source,
        });
      }

      await publishProgress(redis, input.userId, {
        type: "progress",
        taskId: input.taskId,
        step: "fill-fields",
        pct: 60,
        message: `Filled ${fillResult.filledFields.length} fields`,
      });

      // In Copilot mode, send field review to frontend
      if (input.mode === "copilot") {
        await publishProgress(redis, input.userId, {
          type: "field_review",
          taskId: input.taskId,
          fields: fillResult.filledFields.map((f) => ({
            name: f.field.label,
            value: f.value,
            confidence: f.confidence.value,
            source: f.source,
          })),
        });
      }

      return { fillResult, requiresReview: input.mode === "copilot" };
    },
  });

  const uploadResume = workflow.task({
    name: "upload-resume",
    executionTimeout: "30s",
    parents: [fillFields],
    fn: async (input: WorkflowInput, _ctx: Context<WorkflowInput>) => {
      logger.info({ taskId: input.taskId }, "Uploading resume");

      await publishProgress(redis, input.userId, {
        type: "progress",
        taskId: input.taskId,
        step: "upload-resume",
        pct: 70,
        message: "Uploading resume file",
      });

      // Mock resume upload
      await new Promise((r) => setTimeout(r, 1000));

      return { resumeUploaded: true };
    },
  });

  const checkCaptcha = workflow.durableTask({
    name: "check-captcha",
    executionTimeout: "30s",
    parents: [uploadResume],
    fn: async (input: WorkflowInput, ctx: DurableContext<WorkflowInput>) => {
      logger.info({ taskId: input.taskId }, "Checking for CAPTCHA");

      // Mock: No CAPTCHA detected (5% chance to trigger one)
      const captchaDetected = Math.random() < 0.05;

      if (captchaDetected) {
        await eventLogger.log(input.taskId, "captcha_detected", {
          type: "recaptcha_v2",
        });

        await publishProgress(redis, input.userId, {
          type: "human_needed",
          taskId: input.taskId,
          reason: "CAPTCHA detected",
          vncUrl: "wss://mock-vnc:6901/websockify",
        });

        // Durable wait for CAPTCHA to be solved
        await ctx.waitFor({ eventKey: "captcha_solved" });

        await eventLogger.log(input.taskId, "checkpoint", {
          subType: "captcha_solved",
          solvedBy: "user",
        });
      }

      await publishProgress(redis, input.userId, {
        type: "progress",
        taskId: input.taskId,
        step: "check-captcha",
        pct: 80,
        message: captchaDetected
          ? "CAPTCHA solved, continuing"
          : "No CAPTCHA detected",
      });

      return { captchaDetected, captchaSolved: true };
    },
  });

  const submit = workflow.durableTask({
    name: "submit",
    executionTimeout: "30s",
    parents: [checkCaptcha],
    fn: async (input: WorkflowInput, ctx: DurableContext<WorkflowInput>) => {
      const prevData = (await ctx.parentOutput(fillFields)) as {
        requiresReview: boolean;
      };

      // In Copilot mode, wait for user approval before submitting
      if (prevData.requiresReview) {
        logger.info(
          { taskId: input.taskId },
          "Waiting for user review approval",
        );
        await eventLogger.log(input.taskId, "human_takeover", {
          subType: "review_requested",
        });

        await ctx.waitFor({ eventKey: "review_approved" });

        await eventLogger.log(input.taskId, "checkpoint", {
          subType: "review_approved",
        });
      }

      logger.info({ taskId: input.taskId }, "Submitting application");

      await publishProgress(redis, input.userId, {
        type: "state_change",
        taskId: input.taskId,
        from: "filling",
        to: "submitting",
        timestamp: new Date().toISOString(),
      });

      const submitResult = await adapter.submitApplication(
        {} as Awaited<ReturnType<typeof adapter.getFormFlow>>,
      );

      await publishProgress(redis, input.userId, {
        type: "progress",
        taskId: input.taskId,
        step: "submit",
        pct: 90,
        message: submitResult.success
          ? "Application submitted"
          : "Submission failed",
      });

      return submitResult;
    },
  });

  workflow.task({
    name: "verify",
    executionTimeout: "30s",
    parents: [submit],
    fn: async (input: WorkflowInput, _ctx: Context<WorkflowInput>) => {
      logger.info({ taskId: input.taskId }, "Verifying submission");

      await publishProgress(redis, input.userId, {
        type: "state_change",
        taskId: input.taskId,
        from: "submitting",
        to: "verifying",
        timestamp: new Date().toISOString(),
      });

      const verification = await adapter.verifySubmission(
        {} as Awaited<ReturnType<typeof adapter.getFormFlow>>,
      );

      await eventLogger.log(input.taskId, "checkpoint", {
        subType: "workflow_completed",
        submitted: verification.submitted,
        confirmationId: verification.confirmationId,
      });

      await publishProgress(redis, input.userId, {
        type: "completed",
        taskId: input.taskId,
        confirmationId: verification.confirmationId,
        screenshotUrl: verification.screenshotUrl,
      });

      await publishProgress(redis, input.userId, {
        type: "state_change",
        taskId: input.taskId,
        from: "verifying",
        to: "completed",
        timestamp: new Date().toISOString(),
      });

      return {
        success: verification.submitted,
        confirmationId: verification.confirmationId,
      };
    },
  });

  return workflow;
}
