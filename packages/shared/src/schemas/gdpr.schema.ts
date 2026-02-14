import { z } from "zod";

export const gdprExportResponse = z.object({
  user: z.object({
    id: z.string().uuid(),
    email: z.string().email(),
    name: z.string(),
    phone: z.string().nullable(),
    location: z.string().nullable(),
    linkedinUrl: z.string().nullable(),
    githubUrl: z.string().nullable(),
    portfolioUrl: z.string().nullable(),
    createdAt: z.string(),
  }),
  resumes: z.array(
    z.object({
      id: z.string().uuid(),
      filename: z.string(),
      parsedData: z.unknown().nullable(),
      createdAt: z.string(),
    }),
  ),
  qaBankEntries: z.array(
    z.object({
      category: z.string(),
      question: z.string(),
      answer: z.string(),
      usageMode: z.string(),
      createdAt: z.string(),
    }),
  ),
  applications: z.array(
    z.object({
      id: z.string().uuid(),
      jobUrl: z.string(),
      platform: z.string(),
      status: z.string(),
      jobTitle: z.string().nullable(),
      companyName: z.string().nullable(),
      matchScore: z.number().nullable(),
      createdAt: z.string(),
      completedAt: z.string().nullable(),
    }),
  ),
  consentRecords: z.array(
    z.object({
      type: z.string(),
      version: z.string(),
      grantedAt: z.string(),
    }),
  ),
  exportMetadata: z.object({
    exportedAt: z.string(),
    format: z.literal("json"),
    requestedBy: z.string().uuid(),
  }),
});

export const gdprDeleteResponse = z.object({
  message: z.string(),
  deletionScheduledAt: z.string(),
  gracePeriodDays: z.number(),
  permanentDeletionAt: z.string(),
});

export const gdprCancelDeletionResponse = z.object({
  message: z.string(),
  accountStatus: z.literal("active"),
});

// ─── Inferred Types ───
export type GdprExportResponse = z.infer<typeof gdprExportResponse>;
export type GdprDeleteResponse = z.infer<typeof gdprDeleteResponse>;
export type GdprCancelDeletionResponse = z.infer<typeof gdprCancelDeletionResponse>;
