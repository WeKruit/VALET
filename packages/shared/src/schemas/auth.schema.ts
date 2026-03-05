import { z } from "zod";
import { userSchema } from "./user.schema.js";

export const googleAuthRequest = z.object({
  code: z.string().min(1),
  redirectUri: z.string().url(),
});

/** Empty body — refresh token is read from httpOnly cookie */
export const refreshTokenRequest = z.object({});

export const authTokenResponse = z.object({
  accessToken: z.string(),
  tokenType: z.literal("Bearer"),
  expiresIn: z.number(),
  user: userSchema,
});

export const refreshTokenResponse = z.object({
  accessToken: z.string(),
  tokenType: z.literal("Bearer"),
  expiresIn: z.number(),
});

/** Empty body — refresh token is read from httpOnly cookie */
export const logoutRequest = z.object({});

export const successResponse = z.object({
  success: z.boolean(),
});

// ─── Email/Password Auth Schemas ───

export const registerRequest = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  name: z.string().min(1).max(255),
});

export const loginRequest = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const forgotPasswordRequest = z.object({
  email: z.string().email(),
});

export const resetPasswordRequest = z.object({
  token: z.string().min(1),
  password: z.string().min(8).max(128),
});

export const verifyEmailRequest = z.object({
  token: z.string().min(1),
});

export const messageResponse = z.object({
  message: z.string(),
});

// ─── Desktop Auth Schemas ───

export const desktopExchangeSupabaseRequest = z.object({
  supabaseAccessToken: z.string().min(1).max(4096),
});

export const desktopGoogleAuthRequest = z.object({
  code: z.string().min(1),
  redirectUri: z.string().url(),
  codeVerifier: z.string().min(43).max(128).optional(),
});

export const desktopRefreshRequest = z.object({
  refreshToken: z.string().min(1).max(4096), // JWTs shouldn't exceed this
});

export const desktopLogoutRequest = z.object({
  refreshToken: z.string().min(1).max(4096), // JWTs shouldn't exceed this
});

export const desktopAuthTokenResponse = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  tokenType: z.literal("Bearer"),
  expiresIn: z.number(),
  user: z.object({
    id: z.string(),
    email: z.string(),
    name: z.string(),
    avatarUrl: z.string().nullable(),
    role: z.string(),
  }),
});

export const desktopRefreshTokenResponse = z.object({
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
export type LogoutRequest = z.infer<typeof logoutRequest>;
export type SuccessResponse = z.infer<typeof successResponse>;
export type RegisterRequest = z.infer<typeof registerRequest>;
export type LoginRequest = z.infer<typeof loginRequest>;
export type ForgotPasswordRequest = z.infer<typeof forgotPasswordRequest>;
export type ResetPasswordRequest = z.infer<typeof resetPasswordRequest>;
export type VerifyEmailRequest = z.infer<typeof verifyEmailRequest>;
export type MessageResponse = z.infer<typeof messageResponse>;
export type DesktopExchangeSupabaseRequest = z.infer<typeof desktopExchangeSupabaseRequest>;
export type DesktopGoogleAuthRequest = z.infer<typeof desktopGoogleAuthRequest>;
export type DesktopRefreshRequest = z.infer<typeof desktopRefreshRequest>;
export type DesktopLogoutRequest = z.infer<typeof desktopLogoutRequest>;
export type DesktopAuthTokenResponse = z.infer<typeof desktopAuthTokenResponse>;
export type DesktopRefreshTokenResponse = z.infer<typeof desktopRefreshTokenResponse>;
