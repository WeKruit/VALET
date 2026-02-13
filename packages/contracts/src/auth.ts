import { initContract } from "@ts-rest/core";
import {
  googleAuthRequest,
  refreshTokenRequest,
  authTokenResponse,
  refreshTokenResponse,
  userResponse,
  errorResponse,
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
});
