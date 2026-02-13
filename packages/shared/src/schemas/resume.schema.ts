import { z } from "zod";

export const resumeStatus = z.enum(["uploading", "parsing", "parsed", "parse_failed"]);

export const parsedResumeData = z
  .object({
    fullName: z.string().optional(),
    email: z.string().optional(),
    phone: z.string().optional(),
    location: z.string().optional(),
    summary: z.string().optional(),
    skills: z.array(z.string()).optional(),
    education: z
      .array(
        z.object({
          school: z.string(),
          degree: z.string(),
          fieldOfStudy: z.string().optional(),
          gpa: z.string().nullable().optional(),
          startDate: z.string().nullable().optional(),
          endDate: z.string().nullable().optional(),
          expectedGraduation: z.string().nullable().optional(),
          honors: z.string().nullable().optional(),
        }),
      )
      .optional(),
    workHistory: z
      .array(
        z.object({
          title: z.string(),
          company: z.string(),
          location: z.string().optional(),
          startDate: z.string().nullable().optional(),
          endDate: z.string().nullable().optional(),
          description: z.string().optional(),
          bullets: z.array(z.string()).optional(),
          achievements: z.array(z.string()).optional(),
        }),
      )
      .optional(),
    projects: z
      .array(
        z.object({
          name: z.string(),
          description: z.string().optional(),
          technologies: z.array(z.string()).optional(),
          url: z.string().optional(),
          startDate: z.string().nullable().optional(),
          endDate: z.string().nullable().optional(),
        }),
      )
      .optional(),
    certifications: z.array(z.string()).optional(),
    languages: z.array(z.string()).optional(),
    interests: z.array(z.string()).optional(),
    awards: z
      .array(
        z.object({
          title: z.string(),
          issuer: z.string().optional(),
          date: z.string().optional(),
        }),
      )
      .optional(),
    volunteerWork: z
      .array(
        z.object({
          organization: z.string(),
          role: z.string().optional(),
          description: z.string().optional(),
          startDate: z.string().nullable().optional(),
          endDate: z.string().nullable().optional(),
        }),
      )
      .optional(),
    totalYearsExperience: z.number().nullable().optional(),
    workAuthorization: z.string().nullable().optional(),
    websites: z.array(z.string()).optional(),
  })
  .nullable();

export const resumeSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  filename: z.string(),
  mimeType: z.string(),
  fileSizeBytes: z.number(),
  isDefault: z.boolean(),
  status: resumeStatus,
  parsedData: parsedResumeData.optional(),
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
