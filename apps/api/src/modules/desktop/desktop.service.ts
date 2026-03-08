import { randomUUID } from "node:crypto";
import type { FastifyBaseLogger } from "fastify";
import type Redis from "ioredis";
import type { UserService } from "../users/user.service.js";
import type { CreditService } from "../credits/credit.service.js";
import type { ReferralService } from "../referrals/referral.service.js";
import type { ResumeService } from "../resumes/resume.service.js";
import type { TaskService } from "../tasks/task.service.js";
import type { LaunchDarklyService } from "../../services/launchdarkly.service.js";
import type { AtmDesktopReleaseService } from "../../services/atm-desktop-release.service.js";
import type { DesktopBootstrapResponse } from "@valet/shared/schemas";
import { getAnthropicProxyReadiness } from "../local-workers/anthropic-proxy-config.js";

const HANDOFF_PREFIX = "handoff:";
const HANDOFF_TTL_SECONDS = 15 * 60; // 15 minutes

interface HandoffData {
  urls: string[];
  resumeId: string;
  quality: string | null;
  notes: string | null;
  createdBy: string;
  createdAt: string;
}

export class DesktopService {
  private redis: Redis;
  private logger: FastifyBaseLogger;
  private userService: UserService;
  private creditService: CreditService;
  private referralService: ReferralService;
  private resumeService: ResumeService;
  private taskService: TaskService;
  private launchDarklyService: LaunchDarklyService;
  private atmDesktopReleaseService: AtmDesktopReleaseService;

  constructor({
    redis,
    logger,
    userService,
    creditService,
    referralService,
    resumeService,
    taskService,
    launchDarklyService,
    atmDesktopReleaseService,
  }: {
    redis: Redis;
    logger: FastifyBaseLogger;
    userService: UserService;
    creditService: CreditService;
    referralService: ReferralService;
    resumeService: ResumeService;
    taskService: TaskService;
    launchDarklyService: LaunchDarklyService;
    atmDesktopReleaseService: AtmDesktopReleaseService;
  }) {
    this.redis = redis;
    this.logger = logger;
    this.userService = userService;
    this.creditService = creditService;
    this.referralService = referralService;
    this.resumeService = resumeService;
    this.taskService = taskService;
    this.launchDarklyService = launchDarklyService;
    this.atmDesktopReleaseService = atmDesktopReleaseService;
  }

  async createHandoff(
    userId: string,
    input: { urls: string[]; resumeId: string; quality?: string; notes?: string },
  ) {
    const token = randomUUID();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + HANDOFF_TTL_SECONDS * 1000);

    const data: HandoffData = {
      urls: input.urls,
      resumeId: input.resumeId,
      quality: input.quality ?? null,
      notes: input.notes ?? null,
      createdBy: userId,
      createdAt: now.toISOString(),
    };

    await this.redis.set(
      `${HANDOFF_PREFIX}${token}`,
      JSON.stringify(data),
      "EX",
      HANDOFF_TTL_SECONDS,
    );

    const protocol =
      this.launchDarklyService.getEnvironment() === "staging"
        ? "ghosthands-beta"
        : "ghosthands";

    return {
      token,
      expiresAt: expiresAt.toISOString(),
      deepLink: `${protocol}://handoff/${token}`,
    };
  }

  async consumeHandoff(token: string, userId: string): Promise<HandoffData | null> {
    const key = `${HANDOFF_PREFIX}${token}`;
    for (let attempt = 0; attempt < 3; attempt++) {
      await this.redis.watch(key);
      const raw = await this.redis.get(key);

      if (!raw) {
        await this.redis.unwatch();
        return null;
      }

      const data = JSON.parse(raw) as HandoffData;
      if (data.createdBy !== userId) {
        await this.redis.unwatch();
        return null;
      }

      const tx = this.redis.multi();
      tx.del(key);
      const result = await tx.exec();

      if (result) {
        return data;
      }
    }

    return null;
  }

  async bootstrap(input: {
    userId: string;
    email: string;
    role: string;
    platform?: string | null;
    arch?: string | null;
    appVersion?: string | null;
  }): Promise<DesktopBootstrapResponse> {
    const [user, credits, referrals, resumes, tasksResult, automation] = await Promise.all([
      this.userService.getById(input.userId),
      this.creditService.getBalance(input.userId),
      this.referralService.getStats(input.userId),
      this.resumeService.listByUser(input.userId),
      this.taskService.list(input.userId, {
        page: 1,
        pageSize: 10,
        sortBy: "createdAt",
        sortOrder: "desc",
      }),
      getAnthropicProxyReadiness(this.logger),
    ]);

    const releaseChannel =
      this.launchDarklyService.getEnvironment() === "staging"
        ? "beta"
        : this.launchDarklyService.getEnvironment() === "production"
          ? "stable"
          : "local";
    const flagContext = this.launchDarklyService.buildUserContext({
      key: input.userId,
      email: input.email,
      role: input.role,
      isAdmin: input.role === "admin" || input.role === "superadmin",
      channel: releaseChannel,
      appVersion: input.appVersion ?? undefined,
      platform: input.platform ?? undefined,
      arch: input.arch ?? undefined,
    });
    const [
      killSwitch,
      localWorkerEnabled,
      localWorkerBrokerEnabled,
      smartApplyEnabled,
      managedInferenceRequired,
      releaseState,
    ] = await Promise.all([
      this.launchDarklyService.boolVariation("desktop.kill_switch", flagContext, false),
      this.launchDarklyService.boolVariation("desktop.local_worker.enabled", flagContext, true),
      this.launchDarklyService.boolVariation(
        "desktop.local_worker.broker.enabled",
        flagContext,
        true,
      ),
      this.launchDarklyService.boolVariation("desktop.smart_apply.enabled", flagContext, true),
      this.launchDarklyService.boolVariation(
        "desktop.managed_inference.required",
        flagContext,
        false,
      ),
      this.atmDesktopReleaseService.getLatestRelease(
        releaseChannel === "beta" ? "beta" : "stable",
      ),
    ]);

    const userRecord = user as Record<string, unknown>;
    const defaultResume = resumes.find((r) => (r as Record<string, unknown>).isDefault === true);

    const defaultResumeData = defaultResume
      ? {
          id: (defaultResume as Record<string, unknown>).id as string,
          filename: (defaultResume as Record<string, unknown>).filename as string,
          fileKey: (defaultResume as Record<string, unknown>).fileKey as string,
          parsedAt: (defaultResume as Record<string, unknown>).parsedAt
            ? ((defaultResume as Record<string, unknown>).parsedAt as Date).toISOString()
            : null,
        }
      : null;

    const role = userRecord.role as string;
    const isAdminRole = role === "admin" || role === "superadmin";
    const publicDownloadUrl = process.env.VALET_WEB_URL
      ? `${process.env.VALET_WEB_URL.replace(/\/+$/, "")}/download`
      : null;

    return {
      user: {
        id: userRecord.id as string,
        email: userRecord.email as string,
        name: userRecord.name as string,
        role,
      },
      onboarding: {
        completed: userRecord.onboardingCompletedAt != null,
        hasDefaultResume: defaultResumeData != null && defaultResumeData.parsedAt != null,
      },
      credits: {
        balance: credits.balance,
        enforcementEnabled: isAdminRole ? false : credits.enforcementEnabled,
        trialExpiry: credits.trialExpiry,
      },
      referrals: {
        code: referrals.code,
        pendingCount: referrals.pendingCount,
        activatedCount: referrals.activatedCount,
        rewardedCount: referrals.rewardedCount,
      },
      defaultResume: defaultResumeData,
      recentTasks: tasksResult.data.map((t) => ({
        id: t.id,
        jobUrl: t.jobUrl,
        status: t.status,
        createdAt: t.createdAt.toISOString(),
      })),
      automation,
      desktop: {
        channel: releaseChannel,
        minimumSupportedVersion: releaseState?.minimumSupportedVersion ?? null,
        flags: {
          killSwitch,
          localWorkerEnabled,
          localWorkerBrokerEnabled,
          smartApplyEnabled,
          managedInferenceRequired,
        },
        config: {
          updaterBaseUrl: this.atmDesktopReleaseService.getBaseUrl(),
          publicDownloadUrl,
        },
      },
    };
  }
}
