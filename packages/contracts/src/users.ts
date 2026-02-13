import { initContract } from "@ts-rest/core";
import {
  updateUserProfileRequest,
  updatePreferencesRequest,
  userProfileResponse,
  userPreferences,
  errorResponse,
} from "@valet/shared/schemas";

const c = initContract();

export const userContract = c.router({
  getProfile: {
    method: "GET",
    path: "/api/v1/users/me/profile",
    responses: {
      200: userProfileResponse,
      401: errorResponse,
    },
    summary: "Get the authenticated user's full profile",
  },
  updateProfile: {
    method: "PUT",
    path: "/api/v1/users/me/profile",
    body: updateUserProfileRequest,
    responses: {
      200: userProfileResponse,
      400: errorResponse,
    },
    summary: "Update the user's profile fields",
  },
  getPreferences: {
    method: "GET",
    path: "/api/v1/users/me/preferences",
    responses: {
      200: userPreferences,
    },
    summary: "Get the user's automation preferences",
  },
  updatePreferences: {
    method: "PUT",
    path: "/api/v1/users/me/preferences",
    body: updatePreferencesRequest,
    responses: {
      200: userPreferences,
      400: errorResponse,
    },
    summary: "Update the user's automation preferences",
  },
});
