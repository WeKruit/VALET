import { randomUUID } from "node:crypto";
import type Redis from "ioredis";
import type { UserService } from "../users/user.service.js";
import type { CreditService } from "../credits/credit.service.js";
import type { ReferralService } from "../referrals/referral.service.js";
import type { ResumeService } from "../resumes/resume.service.js";
import type { TaskService } from "../tasks/task.service.js";
import type { DesktopBootstrapResponse } from "@valet/shared/schemas";

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
  private userService: UserService;
  private creditService: CreditService;
  private referralService: ReferralService;
  private resumeService: ResumeService;
  private taskService: TaskService;

  constructor({
    redis,
    userService,
    creditService,
    referralService,
    resumeService,
    taskService,
  }: {
    redis: Redis;
    userService: UserService;
    creditService: CreditService;
    referralService: ReferralService;
    resumeService: ResumeService;
    taskService: TaskService;
  }) {
    this.redis = redis;
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

  async consumeHandoff(token: string): Promise<HandoffData | null> {
    const key = `${HANDOFF_PREFIX}${token}`;
    const raw = await this.redis.get(key);
    if (!raw) return null;

    await this.redis.del(key);
    return JSON.parse(raw) as HandoffData;
  }

  async bootstrap(userId: string): Promise<DesktopBootstrapResponse> {
    const [user, credits, referrals, resumes, tasksResult] = await Promise.all([
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

    return {
      user: {
        id: userRecord.id as string,
        email: userRecord.email as string,
        name: userRecord.name as string,
        role: userRecord.role as string,
      },
      onboarding: {
        completed: userRecord.onboardingCompletedAt != null,
        hasDefaultResume: defaultResumeData != null,
      },
      credits: {
        balance: credits.balance,
        enforcementEnabled: credits.enforcementEnabled,
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
    };
  }
}
