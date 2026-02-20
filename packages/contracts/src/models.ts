import { initContract } from "@ts-rest/core";
import { z } from "zod";

const c = initContract();

const modelInfoSchema = z.object({
  id: z.string(),
  name: z.string(),
  provider: z.string(),
  purpose: z.enum(["reasoning", "vision", "general"]),
  context_window: z.number().optional(),
  supports_vision: z.boolean().optional(),
});

const modelCatalogResponse = z.object({
  models: z.array(modelInfoSchema),
  default_reasoning_model: z.string().optional(),
  default_vision_model: z.string().optional(),
});

export const modelContract = c.router({
  getModels: {
    method: "GET",
    path: "/api/v1/models",
    responses: {
      200: modelCatalogResponse,
      502: z.object({ error: z.string(), message: z.string() }),
    },
    summary: "Get available AI model catalog (proxied from GhostHands)",
  },
});
