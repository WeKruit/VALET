import { initServer } from "@ts-rest/fastify";
import { userContract } from "@valet/contracts";
import { AppError } from "../../common/errors.js";

const s = initServer();

function toProfileResponse(user: Record<string, unknown>) {
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
    workHistory: (Array.isArray(user.workHistory) ? user.workHistory : []) as unknown[],
    education: (Array.isArray(user.education) ? user.education : []) as unknown[],
    skills: (Array.isArray(user.skills) ? user.skills : []) as string[],
    preferences: (user.preferences ?? {
      submissionMode: "review_before_submit" as const,
      confidenceThreshold: 90,
      dailyLimit: 20,
      minDelayMinutes: 2,
    }) as {
      submissionMode: "review_before_submit" | "auto_submit";
      confidenceThreshold: number;
      dailyLimit: number;
      minDelayMinutes: number;
    },
  };
}

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
});
