import { initContract } from "@ts-rest/core";
import { z } from "zod";
import {
  notificationListQuery,
  notificationListResponse,
  markReadResponse,
  errorResponse,
} from "@valet/shared/schemas";

const c = initContract();

export const notificationContract = c.router({
  list: {
    method: "GET",
    path: "/api/v1/notifications",
    query: notificationListQuery,
    responses: {
      200: notificationListResponse,
    },
    summary: "List notifications for the current user",
  },
  markRead: {
    method: "PUT",
    path: "/api/v1/notifications/:id/read",
    pathParams: z.object({ id: z.string().uuid() }),
    body: z.object({}),
    responses: {
      200: markReadResponse,
      404: errorResponse,
    },
    summary: "Mark a notification as read",
  },
  markAllRead: {
    method: "POST",
    path: "/api/v1/notifications/read-all",
    body: z.object({}),
    responses: {
      200: markReadResponse,
    },
    summary: "Mark all notifications as read",
  },
});
