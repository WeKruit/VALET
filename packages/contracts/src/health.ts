import { initContract } from "@ts-rest/core";
import { z } from "zod";

const c = initContract();

export const healthContract = c.router({
  check: {
    method: "GET",
    path: "/api/v1/health",
    responses: {
      200: z.object({
        status: z.literal("ok"),
        timestamp: z.string().datetime(),
        version: z.string(),
      }),
    },
    summary: "Health check endpoint",
  },
});
