import { initContract } from "@ts-rest/core";
import { z } from "zod";
import {
  updateUserProfileRequest,
  updatePreferencesRequest,
  updateJobPreferencesRequest,
  updateNotificationPreferencesRequest,
  userProfileResponse,
  userPreferences,
  jobPreferences,
  notificationPreferences,
  sessionListResponse,
  sessionDeleteResponse,
  sessionClearAllResponse,
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
  getJobPreferences: {
    method: "GET",
    path: "/api/v1/users/me/job-preferences",
    responses: {
      200: jobPreferences,
    },
    summary: "Get the user's job preferences",
  },
  updateJobPreferences: {
    method: "PUT",
    path: "/api/v1/users/me/job-preferences",
    body: updateJobPreferencesRequest,
    responses: {
      200: jobPreferences,
      400: errorResponse,
    },
    summary: "Update the user's job preferences",
  },
  getNotificationPreferences: {
    method: "GET",
    path: "/api/v1/users/me/notification-preferences",
    responses: {
      200: notificationPreferences,
    },
    summary: "Get the user's notification preferences",
  },
  updateNotificationPreferences: {
    method: "PUT",
    path: "/api/v1/users/me/notification-preferences",
    body: updateNotificationPreferencesRequest,
    responses: {
      200: notificationPreferences,
      400: errorResponse,
    },
    summary: "Update the user's notification preferences",
  },
  listSessions: {
    method: "GET",
    path: "/api/v1/users/me/sessions",
    responses: {
      200: sessionListResponse,
    },
    summary: "List browser sessions for the current user",
  },
  deleteSession: {
    method: "DELETE",
    path: "/api/v1/users/me/sessions/:domain",
    pathParams: z.object({ domain: z.string() }),
    body: z.object({}),
    responses: {
      200: sessionDeleteResponse,
      404: errorResponse,
    },
    summary: "Delete a browser session by domain",
  },
  clearAllSessions: {
    method: "DELETE",
    path: "/api/v1/users/me/sessions",
    body: z.object({}),
    responses: {
      200: sessionClearAllResponse,
    },
    summary: "Clear all browser sessions for the current user",
  },
});
