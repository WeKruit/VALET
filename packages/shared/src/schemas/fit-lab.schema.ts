import { z } from "zod";

// ─── Request Schemas ───

export const analyzeJobRequest = z
  .object({
    jobUrl: z.string().url().optional(),
    jobDescription: z.string().min(1).optional(),
  })
  .refine((data) => data.jobUrl || data.jobDescription, {
    message: "Either jobUrl or jobDescription is required",
  });

export const compareResumeRequest = z
  .object({
    resumeId: z.string().uuid(),
    jobUrl: z.string().url().optional(),
    jobDescription: z.string().min(1).optional(),
  })
  .refine((data) => data.jobUrl || data.jobDescription, {
    message: "Either jobUrl or jobDescription is required",
  });

export const createVariantRequest = z.object({
  resumeId: z.string().uuid(),
  jobUrl: z.string().url(),
  jobDescription: z.string().min(1),
  rephraseMode: z.enum(["off", "honest", "ats_max"]),
  taskId: z.string().uuid().optional(),
});

// ─── Response Schemas ───

export const jobRequirement = z.object({
  text: z.string(),
  category: z.enum([
    "hard_skill",
    "soft_skill",
    "experience",
    "education",
    "certification",
    "other",
  ]),
  importance: z.enum(["required", "preferred", "nice_to_have"]),
});

export const jobAnalysisResponse = z.object({
  title: z.string(),
  company: z.string().nullable(),
  location: z.string().nullable(),
  requirements: z.array(jobRequirement),
  responsibilities: z.array(z.string()),
  rawText: z.string(),
});

export const keywordGap = z.object({
  keyword: z.string(),
  importance: z.enum(["required", "preferred", "nice_to_have"]),
  category: z.enum([
    "hard_skill",
    "soft_skill",
    "experience",
    "education",
    "certification",
    "other",
  ]),
  injectable: z.boolean(),
  suggestion: z.string().nullable(),
});

export const compareResumeResponse = z.object({
  matchScore: z.number().min(0).max(1),
  matchedRequirements: z.array(z.string()),
  missingRequirements: z.array(z.string()),
  keywordGaps: z.array(keywordGap),
  strengthSummary: z.string(),
  improvementSummary: z.string(),
});

export const resumeVariantResponse = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  baseResumeId: z.string().uuid(),
  taskId: z.string().uuid().nullable(),
  jobUrl: z.string(),
  variantData: z.record(z.unknown()),
  diffData: z.record(z.unknown()),
  matchScoreBefore: z.number().nullable(),
  matchScoreAfter: z.number().nullable(),
  keywordGaps: z.array(keywordGap).nullable(),
  rephraseMode: z.string(),
  createdAt: z.coerce.date(),
});

export const resumeVariantListResponse = z.object({
  data: z.array(resumeVariantResponse),
});

// ─── Inferred Types ───
export type AnalyzeJobRequest = z.infer<typeof analyzeJobRequest>;
export type CompareResumeRequest = z.infer<typeof compareResumeRequest>;
export type CreateVariantRequest = z.infer<typeof createVariantRequest>;
export type JobRequirement = z.infer<typeof jobRequirement>;
export type JobAnalysisResponse = z.infer<typeof jobAnalysisResponse>;
export type KeywordGap = z.infer<typeof keywordGap>;
export type CompareResumeResponse = z.infer<typeof compareResumeResponse>;
export type ResumeVariantResponse = z.infer<typeof resumeVariantResponse>;
export type ResumeVariantListResponse = z.infer<typeof resumeVariantListResponse>;
