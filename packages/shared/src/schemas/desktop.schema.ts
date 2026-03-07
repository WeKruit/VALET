import { z } from "zod";

// ─── Request Schemas ───

export const createHandoffRequest = z.object({
  urls: z.array(z.string().url()).min(1),
  resumeId: z.string().uuid(),
  quality: z.string().optional(),
  notes: z.string().optional(),
});

// ─── Response Schemas ───

export const createHandoffResponse = z.object({
  token: z.string(),
  expiresAt: z.string(),
  deepLink: z.string(),
});

export const consumeHandoffResponse = z.object({
  urls: z.array(z.string()),
  resumeId: z.string(),
  quality: z.string().nullable(),
  notes: z.string().nullable(),
  createdBy: z.string(),
  createdAt: z.string(),
});

// ─── Bootstrap Response ───

export const bootstrapResume = z.object({
  id: z.string().uuid(),
  filename: z.string(),
  fileKey: z.string(),
  parsedAt: z.string().nullable(),
});

export const bootstrapTaskSummary = z.object({
  id: z.string().uuid(),
  jobUrl: z.string(),
  status: z.string(),
  createdAt: z.string(),
});

export const desktopBootstrapResponse = z.object({
  user: z.object({
    id: z.string().uuid(),
    email: z.string(),
    name: z.string(),
    role: z.string(),
  }),
  onboarding: z.object({
    completed: z.boolean(),
    hasDefaultResume: z.boolean(),
  }),
  credits: z.object({
    balance: z.number(),
    enforcementEnabled: z.boolean(),
    trialExpiry: z.string().nullable(),
  }),
  referrals: z.object({
    code: z.string(),
    pendingCount: z.number(),
    activatedCount: z.number(),
    rewardedCount: z.number(),
  }),
  defaultResume: bootstrapResume.nullable(),
  recentTasks: z.array(bootstrapTaskSummary),
  automation: z.object({
    llmRuntimeReady: z.boolean(),
    message: z.string().nullable(),
  }),
});

// ─── Inferred Types ───
export type CreateHandoffRequest = z.infer<typeof createHandoffRequest>;
export type CreateHandoffResponse = z.infer<typeof createHandoffResponse>;
export type ConsumeHandoffResponse = z.infer<typeof consumeHandoffResponse>;
export type DesktopBootstrapResponse = z.infer<typeof desktopBootstrapResponse>;
export type BootstrapTaskSummary = z.infer<typeof bootstrapTaskSummary>;
export type BootstrapResume = z.infer<typeof bootstrapResume>;
