/**
 * @deprecated These schemas are no longer used by the API. Secrets are now
 * managed via shared SSH keys stored in GitHub Secrets. Kept for reference only.
 * See core-docs/architecture/08-secrets-simplified.md.
 */
import { z } from "zod";

// ─── Enums ───
/** @deprecated */
export const secretType = z.enum(["ssh_key", "env_vars", "api_key"]);

// ─── Request DTOs ───
export const secretStoreSchema = z.object({
  secretType: secretType,
  value: z.string().min(1).max(65536),
  expiresAt: z.coerce.date().optional(),
});

export const secretRotateSchema = z.object({
  value: z.string().min(1).max(65536),
});

// ─── Response DTOs ───
export const secretListItemSchema = z.object({
  secretType: secretType,
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  expiresAt: z.coerce.date().nullable().optional(),
});

export const secretListResponse = z.object({
  data: z.array(secretListItemSchema),
});

export const secretStoreResponse = z.object({
  secretType: secretType,
  createdAt: z.coerce.date(),
});

// ─── Inferred Types ───
export type SecretType = z.infer<typeof secretType>;
export type SecretStoreRequest = z.infer<typeof secretStoreSchema>;
export type SecretRotateRequest = z.infer<typeof secretRotateSchema>;
export type SecretListItem = z.infer<typeof secretListItemSchema>;
export type SecretListResponse = z.infer<typeof secretListResponse>;
export type SecretStoreResponse = z.infer<typeof secretStoreResponse>;
