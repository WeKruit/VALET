import { z } from "zod";

// ─── Autonomy Enums ───
export const autonomyLevel = z.enum(["full", "assisted", "copilot_only"]);

export const emailReadiness = z.enum(["full_autonomy_ready", "assisted_only", "not_ready"]);

export const mailboxReadiness = z.enum(["connected", "manual_verification_only", "not_configured"]);

export const platformReadinessValue = z.enum([
  "ready",
  "credentials_required",
  "manual_login_required",
  "verification_likely",
]);

export const platformReadiness = z.record(z.string(), platformReadinessValue);

export const submissionBehavior = z.enum(["review_before_submit", "auto_submit"]);

export const resumeRephraseMode = z.enum(["off", "honest", "ats_max"]);

// ─── Composite Schemas ───
export const autonomyReadinessSchema = z.object({
  level: autonomyLevel,
  blockingReasons: z.array(z.string()),
  emailReadiness: emailReadiness,
  mailboxReadiness: mailboxReadiness,
  platformReadiness: platformReadiness,
});

export const tailoringSummarySchema = z.object({
  matchScoreBefore: z.number().min(0).max(1),
  matchScoreAfter: z.number().min(0).max(1),
  changedSections: z.array(z.string()),
});

// ─── Inferred Types ───
export type AutonomyLevel = z.infer<typeof autonomyLevel>;
export type EmailReadiness = z.infer<typeof emailReadiness>;
export type MailboxReadiness = z.infer<typeof mailboxReadiness>;
export type PlatformReadinessValue = z.infer<typeof platformReadinessValue>;
export type PlatformReadiness = z.infer<typeof platformReadiness>;
export type SubmissionBehavior = z.infer<typeof submissionBehavior>;
export type ResumeRephraseMode = z.infer<typeof resumeRephraseMode>;
export type AutonomyReadiness = z.infer<typeof autonomyReadinessSchema>;
export type TailoringSummary = z.infer<typeof tailoringSummarySchema>;
