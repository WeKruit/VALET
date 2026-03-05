import { z } from "zod";

// ─── Platform Credentials ───

export const platformCredentialResponse = z.object({
  id: z.string().uuid(),
  platform: z.string(),
  domain: z.string().nullable(),
  loginIdentifier: z.string(),
  status: z.string(),
  lastVerifiedAt: z.coerce.date().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export const platformCredentialListResponse = z.object({
  data: z.array(platformCredentialResponse),
});

export const createPlatformCredentialBody = z.object({
  platform: z.string().min(1),
  domain: z.string().nullable().optional(),
  loginIdentifier: z.string().min(1),
  secret: z.string().min(1),
});

export const updatePlatformCredentialBody = z.object({
  loginIdentifier: z.string().min(1).optional(),
  secret: z.string().min(1).optional(),
  domain: z.string().nullable().optional(),
});

// ─── Mailbox Credentials ───

export const mailboxCredentialResponse = z.object({
  id: z.string().uuid(),
  provider: z.string(),
  emailAddress: z.string(),
  accessMode: z.string(),
  twoFactorEnabled: z.boolean(),
  status: z.string(),
  lastVerifiedAt: z.coerce.date().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export const mailboxCredentialListResponse = z.object({
  data: z.array(mailboxCredentialResponse),
});

export const createMailboxCredentialBody = z.object({
  provider: z.string().min(1),
  emailAddress: z.string().email(),
  secret: z.string().min(1),
  accessMode: z.string().min(1),
  twoFactorEnabled: z.boolean().optional(),
});

export const updateMailboxCredentialBody = z.object({
  secret: z.string().min(1).optional(),
  accessMode: z.string().min(1).optional(),
  twoFactorEnabled: z.boolean().optional(),
});

// ─── Readiness Check ───

export const credentialPlatformReadiness = z.object({
  platform: z.string(),
  hasCredential: z.boolean(),
  status: z.string(),
  lastVerifiedAt: z.coerce.date().nullable(),
});

export const credentialReadinessResponse = z.object({
  platforms: z.array(credentialPlatformReadiness),
  mailbox: z.object({
    hasCredential: z.boolean(),
    status: z.string(),
  }),
  overallReady: z.boolean(),
});

// ─── Inferred Types ───

export type PlatformCredentialResponse = z.infer<typeof platformCredentialResponse>;
export type PlatformCredentialListResponse = z.infer<typeof platformCredentialListResponse>;
export type CreatePlatformCredentialBody = z.infer<typeof createPlatformCredentialBody>;
export type UpdatePlatformCredentialBody = z.infer<typeof updatePlatformCredentialBody>;

export type MailboxCredentialResponse = z.infer<typeof mailboxCredentialResponse>;
export type MailboxCredentialListResponse = z.infer<typeof mailboxCredentialListResponse>;
export type CreateMailboxCredentialBody = z.infer<typeof createMailboxCredentialBody>;
export type UpdateMailboxCredentialBody = z.infer<typeof updateMailboxCredentialBody>;

export type CredentialPlatformReadiness = z.infer<typeof credentialPlatformReadiness>;
export type CredentialReadinessResponse = z.infer<typeof credentialReadinessResponse>;
