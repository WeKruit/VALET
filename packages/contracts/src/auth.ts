import { initContract } from "@ts-rest/core";
import { z } from "zod";
import {
  googleAuthRequest,
  refreshTokenRequest,
  logoutRequest,
  authTokenResponse,
  refreshTokenResponse,
  successResponse,
  userResponse,
  errorResponse,
  registerRequest,
  loginRequest,
  forgotPasswordRequest,
  resetPasswordRequest,
  verifyEmailRequest,
  messageResponse,
  desktopExchangeSupabaseRequest,
  desktopGoogleAuthRequest,
  desktopRefreshRequest,
  desktopLogoutRequest,
  desktopAuthTokenResponse,
  desktopRefreshTokenResponse,
} from "@valet/shared/schemas";

const c = initContract();

export const authContract = c.router({
  google: {
    method: "POST",
    path: "/api/v1/auth/google",
    body: googleAuthRequest,
    responses: {
      200: authTokenResponse,
      201: authTokenResponse,
      400: errorResponse,
    },
    summary: "Exchange Google OAuth code for JWT tokens",
  },
  register: {
    method: "POST",
    path: "/api/v1/auth/register",
    body: registerRequest,
    responses: {
      201: messageResponse,
      400: errorResponse,
      409: errorResponse,
    },
    summary: "Register a new account with email and password",
  },
  login: {
    method: "POST",
    path: "/api/v1/auth/login",
    body: loginRequest,
    responses: {
      200: authTokenResponse,
      400: errorResponse,
      401: errorResponse,
    },
    summary: "Login with email and password",
  },
  verifyEmail: {
    method: "POST",
    path: "/api/v1/auth/verify-email",
    body: verifyEmailRequest,
    responses: {
      200: messageResponse,
      400: errorResponse,
    },
    summary: "Verify email address with token",
  },
  forgotPassword: {
    method: "POST",
    path: "/api/v1/auth/forgot-password",
    body: forgotPasswordRequest,
    responses: {
      200: messageResponse,
      400: errorResponse,
    },
    summary: "Request a password reset email",
  },
  resetPassword: {
    method: "POST",
    path: "/api/v1/auth/reset-password",
    body: resetPasswordRequest,
    responses: {
      200: messageResponse,
      400: errorResponse,
    },
    summary: "Reset password with token",
  },
  refresh: {
    method: "POST",
    path: "/api/v1/auth/refresh",
    body: refreshTokenRequest,
    responses: {
      200: refreshTokenResponse,
      401: errorResponse,
    },
    summary: "Refresh access token",
  },
  me: {
    method: "GET",
    path: "/api/v1/auth/me",
    responses: {
      200: userResponse,
      401: errorResponse,
    },
    summary: "Get current authenticated user",
  },
  logout: {
    method: "POST",
    path: "/api/v1/auth/logout",
    body: logoutRequest,
    responses: {
      200: successResponse,
      401: errorResponse,
    },
    summary: "Logout and blacklist the current refresh token",
  },
  revokeAll: {
    method: "POST",
    path: "/api/v1/auth/revoke-all",
    body: null,
    responses: {
      200: successResponse,
      401: errorResponse,
    },
    summary: "Revoke all tokens for the current user",
  },

  // ─── Desktop Auth Endpoints ───

  desktopExchangeSupabase: {
    method: "POST",
    path: "/api/v1/auth/desktop/exchange-supabase",
    body: desktopExchangeSupabaseRequest,
    responses: {
      200: desktopAuthTokenResponse,
      401: z.object({ message: z.string() }),
    },
    summary: "Exchange Supabase token for VALET tokens (Desktop bridge auth)",
  },
  desktopGoogle: {
    method: "POST",
    path: "/api/v1/auth/desktop/google",
    body: desktopGoogleAuthRequest,
    responses: {
      200: desktopAuthTokenResponse,
      401: z.object({ message: z.string() }),
    },
    summary: "Desktop Google OAuth (native mode with optional PKCE)",
  },
  desktopRefresh: {
    method: "POST",
    path: "/api/v1/auth/desktop/refresh",
    body: desktopRefreshRequest,
    responses: {
      200: desktopRefreshTokenResponse,
      401: z.object({ message: z.string() }),
    },
    summary: "Refresh VALET tokens (Desktop)",
  },
  desktopLogout: {
    method: "POST",
    path: "/api/v1/auth/desktop/logout",
    body: desktopLogoutRequest,
    responses: {
      200: z.object({ message: z.string() }),
      401: z.object({ message: z.string() }),
    },
    summary: "Revoke refresh token and logout (Desktop)",
  },
});
