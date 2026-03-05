import { initContract } from "@ts-rest/core";
import { z } from "zod";

const c = initContract();

export const desktopReleaseContract = c.router({
  latest: {
    method: "GET",
    path: "/api/v1/desktop/latest",
    responses: {
      200: z.object({
        version: z.string(),
        dmgArm64Url: z.string(),
        dmgX64Url: z.string().nullable(),
        exeX64Url: z.string().nullable(),
        releaseUrl: z.string(),
        releasedAt: z.string(),
      }),
      404: z.object({
        error: z.string(),
      }),
    },
    summary: "Get latest desktop app release info (public, no auth)",
  },
});
