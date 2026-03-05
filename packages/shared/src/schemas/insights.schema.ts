import { z } from "zod";

// ─── Velocity (tasks over time) ───

export const velocityDataPoint = z.object({
  date: z.string(),
  total: z.number(),
  completed: z.number(),
  failed: z.number(),
});

export const velocityResponse = z.object({
  period: z.enum(["7d", "30d", "90d"]),
  dataPoints: z.array(velocityDataPoint),
  totalTasks: z.number(),
  avgPerDay: z.number(),
});

export const velocityQuery = z.object({
  period: z.enum(["7d", "30d", "90d"]).default("30d"),
});

// ─── Conversion by platform ───

export const platformConversionEntry = z.object({
  platform: z.string(),
  total: z.number(),
  completed: z.number(),
  failed: z.number(),
  conversionRate: z.number(),
});

export const conversionResponse = z.object({
  platforms: z.array(platformConversionEntry),
});

// ─── Response rates (external status distribution) ───

export const responseRateEntry = z.object({
  externalStatus: z.string(),
  count: z.number(),
  percentage: z.number(),
});

export const responseRatesResponse = z.object({
  totalWithStatus: z.number(),
  totalWithoutStatus: z.number(),
  rates: z.array(responseRateEntry),
});

// ─── Resume variant performance ───

export const resumePerformanceEntry = z.object({
  resumeId: z.string().uuid(),
  resumeFilename: z.string(),
  variantCount: z.number(),
  avgMatchScoreBefore: z.number().nullable(),
  avgMatchScoreAfter: z.number().nullable(),
  avgImprovement: z.number().nullable(),
});

export const resumePerformanceResponse = z.object({
  resumes: z.array(resumePerformanceEntry),
});

// ─── Inferred Types ───
export type VelocityDataPoint = z.infer<typeof velocityDataPoint>;
export type VelocityResponse = z.infer<typeof velocityResponse>;
export type VelocityQuery = z.infer<typeof velocityQuery>;
export type PlatformConversionEntry = z.infer<typeof platformConversionEntry>;
export type ConversionResponse = z.infer<typeof conversionResponse>;
export type ResponseRateEntry = z.infer<typeof responseRateEntry>;
export type ResponseRatesResponse = z.infer<typeof responseRatesResponse>;
export type ResumePerformanceEntry = z.infer<typeof resumePerformanceEntry>;
export type ResumePerformanceResponse = z.infer<typeof resumePerformanceResponse>;
