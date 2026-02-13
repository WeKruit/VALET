import { z } from "zod";

export const resumeStatus = z.enum(["uploading", "parsing", "parsed", "parse_failed"]);

export const resumeSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  filename: z.string(),
  mimeType: z.string(),
  fileSizeBytes: z.number(),
  isDefault: z.boolean(),
  status: resumeStatus,
  parsingConfidence: z.number().min(0).max(1).nullable(),
  createdAt: z.coerce.date(),
  parsedAt: z.coerce.date().nullable(),
});

export const resumeUploadResponse = z.object({
  id: z.string().uuid(),
  status: resumeStatus,
});

export const resumeResponse = resumeSchema;

export const resumeListResponse = z.object({
  data: z.array(resumeResponse),
});

// ─── Inferred Types ───
export type ResumeStatus = z.infer<typeof resumeStatus>;
export type Resume = z.infer<typeof resumeSchema>;
export type ResumeUploadResponse = z.infer<typeof resumeUploadResponse>;
export type ResumeResponse = z.infer<typeof resumeResponse>;
export type ResumeListResponse = z.infer<typeof resumeListResponse>;
