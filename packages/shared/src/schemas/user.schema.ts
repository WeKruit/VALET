import { z } from "zod";
import { workHistoryEntry, educationEntry } from "./resume.schema.js";

export const userRole = z.enum(["user", "admin", "superadmin"]);

export const subscriptionTier = z.enum(["free", "starter", "pro", "enterprise"]);

export const userSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  name: z.string().min(1),
  avatarUrl: z.string().url().nullable(),
  role: userRole,
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
  workHistory: z.array(workHistoryEntry).optional(),
  education: z.array(educationEntry).optional(),
});

export const remotePreference = z.enum(["remote", "hybrid", "onsite", "any"]);

export const salaryRange = z.object({
  min: z.number().min(0),
  max: z.number().min(0),
  currency: z.string().max(3).default("USD"),
});

export const jobPreferences = z.object({
  targetJobTitles: z.array(z.string()).default([]),
  preferredLocations: z.array(z.string()).default([]),
  salaryRange: salaryRange.optional(),
  remotePreference: remotePreference.default("any"),
  excludedCompanies: z.array(z.string()).default([]),
  preferredIndustries: z.array(z.string()).default([]),
});

export const notificationPreferences = z.object({
  taskCompleted: z.boolean().default(true),
  taskFailed: z.boolean().default(true),
  resumeParsed: z.boolean().default(true),
});

export const updatePreferencesRequest = userPreferences.partial();

export const updateJobPreferencesRequest = jobPreferences.partial();

export const updateNotificationPreferencesRequest = notificationPreferences.partial();

export const userResponse = userSchema;

export const userProfileResponse = userSchema.extend({
  phone: z.string().nullable(),
  location: z.string().nullable(),
  linkedinUrl: z.string().nullable(),
  githubUrl: z.string().nullable(),
  portfolioUrl: z.string().nullable(),
  workHistory: z.array(workHistoryEntry),
  education: z.array(educationEntry),
  skills: z.array(z.string()),
  preferences: userPreferences,
  jobPreferences: jobPreferences.optional(),
  notificationPreferences: notificationPreferences.optional(),
});

// ─── Inferred Types ───
export type UserRole = z.infer<typeof userRole>;
export type SubscriptionTier = z.infer<typeof subscriptionTier>;
export type User = z.infer<typeof userSchema>;
export type UserPreferences = z.infer<typeof userPreferences>;
export type RemotePreference = z.infer<typeof remotePreference>;
export type SalaryRange = z.infer<typeof salaryRange>;
export type JobPreferences = z.infer<typeof jobPreferences>;
export type NotificationPreferences = z.infer<typeof notificationPreferences>;
export type UpdateUserProfileRequest = z.infer<typeof updateUserProfileRequest>;
export type UpdatePreferencesRequest = z.infer<typeof updatePreferencesRequest>;
export type UpdateJobPreferencesRequest = z.infer<typeof updateJobPreferencesRequest>;
export type UpdateNotificationPreferencesRequest = z.infer<typeof updateNotificationPreferencesRequest>;
export type UserResponse = z.infer<typeof userResponse>;
export type UserProfileResponse = z.infer<typeof userProfileResponse>;
