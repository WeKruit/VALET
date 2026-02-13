import { z } from "zod";

export const subscriptionTier = z.enum(["free", "starter", "pro", "enterprise"]);

export const userSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  name: z.string().min(1),
  avatarUrl: z.string().url().nullable(),
  subscriptionTier: subscriptionTier,
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export const userPreferences = z.object({
  submissionMode: z.enum(["review_before_submit", "auto_submit"]).default("review_before_submit"),
  confidenceThreshold: z.number().min(0).max(100).default(90),
  dailyLimit: z.number().int().min(1).max(100).default(20),
  minDelayMinutes: z.number().min(0).max(60).default(2),
});

export const updateUserProfileRequest = z.object({
  phone: z.string().max(50).optional(),
  location: z.string().max(255).optional(),
  linkedinUrl: z.string().url().optional(),
  githubUrl: z.string().url().optional(),
  portfolioUrl: z.string().url().optional(),
  skills: z.array(z.string()).optional(),
});

export const updatePreferencesRequest = userPreferences.partial();

export const userResponse = userSchema;

export const userProfileResponse = userSchema.extend({
  phone: z.string().nullable(),
  location: z.string().nullable(),
  linkedinUrl: z.string().nullable(),
  githubUrl: z.string().nullable(),
  portfolioUrl: z.string().nullable(),
  workHistory: z.array(z.unknown()),
  education: z.array(z.unknown()),
  skills: z.array(z.string()),
  preferences: userPreferences,
});

// ─── Inferred Types ───
export type SubscriptionTier = z.infer<typeof subscriptionTier>;
export type User = z.infer<typeof userSchema>;
export type UserPreferences = z.infer<typeof userPreferences>;
export type UpdateUserProfileRequest = z.infer<typeof updateUserProfileRequest>;
export type UpdatePreferencesRequest = z.infer<typeof updatePreferencesRequest>;
export type UserResponse = z.infer<typeof userResponse>;
export type UserProfileResponse = z.infer<typeof userProfileResponse>;
