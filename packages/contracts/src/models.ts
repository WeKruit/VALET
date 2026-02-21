import { initContract } from "@ts-rest/core";
import { z } from "zod";

const c = initContract();

const modelInfoSchema = z.object({
  alias: z.string().optional(),
  model: z.string(),
  provider: z.string(),
  provider_name: z.string().optional(),
  vision: z.boolean().optional(),
  cost: z
    .object({
      input: z.number().optional(),
      output: z.number().optional(),
      unit: z.string().optional(),
    })
    .optional(),
  note: z.string().optional(),
});

const presetSchema = z.object({
  name: z.string(),
  description: z.string(),
  model: z.string(),
});

const modelCatalogResponse = z.object({
  models: z.array(modelInfoSchema),
  presets: z.array(presetSchema).optional(),
  default: z.string().optional(),
  total: z.number().optional(),
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
