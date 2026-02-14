import { initServer } from "@ts-rest/fastify";
import { userContract } from "@valet/contracts";
import type { WorkHistoryEntry, EducationEntry, JobPreferences, NotificationPreferences } from "@valet/shared/schemas";
import { AppError } from "../../common/errors.js";

const s = initServer();

function toProfileResponse(user: Record<string, unknown>) {
  const prefs = (user.preferences ?? {}) as Record<string, unknown>;
  const { jobPreferences: jp, notificationPreferences: np, ...automationPrefs } = prefs;

  return {
    id: user.id as string,
    email: user.email as string,
    name: user.name as string,
    avatarUrl: (user.avatarUrl as string | null) ?? null,
    subscriptionTier: (user.subscriptionTier as string) as "free" | "starter" | "pro" | "enterprise",
    createdAt: user.createdAt as Date,
    updatedAt: user.updatedAt as Date,
    phone: (user.phone as string | null) ?? null,
    location: (user.location as string | null) ?? null,
    linkedinUrl: (user.linkedinUrl as string | null) ?? null,
    githubUrl: (user.githubUrl as string | null) ?? null,
    portfolioUrl: (user.portfolioUrl as string | null) ?? null,
    workHistory: (Array.isArray(user.workHistory) ? user.workHistory : []) as WorkHistoryEntry[],
    education: (Array.isArray(user.education) ? user.education : []) as EducationEntry[],
    skills: (Array.isArray(user.skills) ? user.skills : []) as string[],
    preferences: {
      submissionMode: (automationPrefs.submissionMode as string) ?? "review_before_submit",
      confidenceThreshold: (automationPrefs.confidenceThreshold as number) ?? 90,
      dailyLimit: (automationPrefs.dailyLimit as number) ?? 20,
      minDelayMinutes: (automationPrefs.minDelayMinutes as number) ?? 2,
    } as {
      submissionMode: "review_before_submit" | "auto_submit";
      confidenceThreshold: number;
      dailyLimit: number;
      minDelayMinutes: number;
    },
    jobPreferences: (jp as JobPreferences | undefined) ?? undefined,
    notificationPreferences: (np as NotificationPreferences | undefined) ?? undefined,
  };
}

const DEFAULT_JOB_PREFERENCES: JobPreferences = {
  targetJobTitles: [],
  preferredLocations: [],
  remotePreference: "any",
  excludedCompanies: [],
  preferredIndustries: [],
};

const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  taskCompleted: true,
  taskFailed: true,
  resumeParsed: true,
};

export const userRouter = s.router(userContract, {
  getProfile: async ({ request }) => {
    const { userService } = request.diScope.cradle;
    const user = await userService.getById(request.userId);
    if (!user) throw AppError.notFound("User not found");
    return { status: 200, body: toProfileResponse(user as unknown as Record<string, unknown>) };
  },

  updateProfile: async ({ body, request }) => {
    const { userService } = request.diScope.cradle;
    const user = await userService.updateProfile(request.userId, body);
    return { status: 200, body: toProfileResponse(user as unknown as Record<string, unknown>) };
  },

  getPreferences: async ({ request }) => {
    const { userService } = request.diScope.cradle;
    const preferences = await userService.getPreferences(request.userId);
    return { status: 200, body: preferences };
  },

  updatePreferences: async ({ body, request }) => {
    const { userService } = request.diScope.cradle;
    const preferences = await userService.updatePreferences(request.userId, body);
    return { status: 200, body: preferences };
  },

  getJobPreferences: async ({ request }) => {
    const { userService } = request.diScope.cradle;
    const prefs = await userService.getJobPreferences(request.userId);
    return { status: 200, body: prefs ?? DEFAULT_JOB_PREFERENCES };
  },

  updateJobPreferences: async ({ body, request }) => {
    const { userService } = request.diScope.cradle;
    const prefs = await userService.updateJobPreferences(request.userId, body);
    return { status: 200, body: prefs };
  },

  getNotificationPreferences: async ({ request }) => {
    const { userService } = request.diScope.cradle;
    const prefs = await userService.getNotificationPreferences(request.userId);
    return { status: 200, body: prefs ?? DEFAULT_NOTIFICATION_PREFERENCES };
  },

  updateNotificationPreferences: async ({ body, request }) => {
    const { userService } = request.diScope.cradle;
    const prefs = await userService.updateNotificationPreferences(request.userId, body);
    return { status: 200, body: prefs };
  },
});
