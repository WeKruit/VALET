import { z } from "zod";
import { userSchema } from "./user.schema.js";

export const googleAuthRequest = z.object({
  code: z.string().min(1),
  redirectUri: z.string().url(),
});

export const refreshTokenRequest = z.object({
  refreshToken: z.string().min(1),
});

export const authTokenResponse = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  tokenType: z.literal("Bearer"),
  expiresIn: z.number(),
  user: userSchema,
});

export const refreshTokenResponse = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  tokenType: z.literal("Bearer"),
  expiresIn: z.number(),
});

// ─── Inferred Types ───
export type GoogleAuthRequest = z.infer<typeof googleAuthRequest>;
export type RefreshTokenRequest = z.infer<typeof refreshTokenRequest>;
export type AuthTokenResponse = z.infer<typeof authTokenResponse>;
export type RefreshTokenResponse = z.infer<typeof refreshTokenResponse>;
