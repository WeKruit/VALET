import { initContract } from "@ts-rest/core";
import { z } from "zod";
import {
  taskEventListResponse,
  taskEventListQuery,
  errorResponse,
} from "@valet/shared/schemas";

const c = initContract();

export const taskEventContract = c.router({
  list: {
    method: "GET",
    path: "/api/v1/tasks/:taskId/events",
    pathParams: z.object({ taskId: z.string().uuid() }),
    query: taskEventListQuery,
    responses: {
      200: taskEventListResponse,
      404: errorResponse,
    },
    summary: "List events for a specific task",
  },
});
