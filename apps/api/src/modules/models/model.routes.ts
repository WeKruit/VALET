import { initServer } from "@ts-rest/fastify";
import { modelContract } from "@valet/contracts";
import type { GHModelCatalog } from "../ghosthands/ghosthands.types.js";

const s = initServer();

let cachedModels: GHModelCatalog | null = null;
let cacheExpiry = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

export const modelRouter = s.router(modelContract, {
  getModels: async ({ request }) => {
    const { ghosthandsClient, logger } = request.diScope.cradle;

    const now = Date.now();
    if (cachedModels && now < cacheExpiry) {
      return { status: 200 as const, body: cachedModels };
    }

    try {
      const catalog = await ghosthandsClient.getModels();
      cachedModels = catalog;
      cacheExpiry = now + CACHE_TTL_MS;
      return { status: 200 as const, body: catalog };
    } catch (err) {
      logger.error({ err }, "Failed to fetch model catalog from GhostHands");
      return {
        status: 502 as const,
        body: {
          error: "UPSTREAM_ERROR",
          message: "Failed to fetch model catalog from GhostHands",
        },
      };
    }
  },
});
