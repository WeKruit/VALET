import { randomUUID } from "node:crypto";
import type { FastifyBaseLogger } from "fastify";
import type Redis from "ioredis";
import type { UserService } from "../users/user.service.js";
import type { CreditService } from "../credits/credit.service.js";
import type { ReferralService } from "../referrals/referral.service.js";
import type { ResumeService } from "../resumes/resume.service.js";
import type { TaskService } from "../tasks/task.service.js";
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

  constructor({
    redis,
    logger,
    userService,
    creditService,
    referralService,
    resumeService,
    taskService,
  }: {
    redis: Redis;
    logger: FastifyBaseLogger;
    userService: UserService;
    creditService: CreditService;
    referralService: ReferralService;
    resumeService: ResumeService;
    taskService: TaskService;
  }) {
    this.redis = redis;
    this.logger = logger;
    this.userService = userService;
    this.creditService = creditService;
    this.referralService = referralService;
    this.resumeService = resumeService;
    this.taskService = taskService;
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

    return {
      token,
      expiresAt: expiresAt.toISOString(),
      deepLink: `ghosthands://handoff/${token}`,
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

  async bootstrap(userId: string): Promise<DesktopBootstrapResponse> {
    const [user, credits, referrals, resumes, tasksResult, automation] = await Promise.all([
      this.userService.getById(userId),
      this.creditService.getBalance(userId),
      this.referralService.getStats(userId),
      this.resumeService.listByUser(userId),
      this.taskService.list(userId, {
        page: 1,
        pageSize: 10,
        sortBy: "createdAt",
        sortOrder: "desc",
      }),
      getAnthropicProxyReadiness(this.logger),
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
    };
  }
}
