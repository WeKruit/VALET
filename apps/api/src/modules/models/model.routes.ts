import { initServer } from "@ts-rest/fastify";
import { modelContract } from "@valet/contracts";

const s = initServer();

let cachedModels: unknown = null;
let cacheExpiry = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

export const modelRouter = s.router(modelContract, {
  getModels: async ({ request }) => {
    const { ghosthandsClient, logger } = request.diScope.cradle;

    const now = Date.now();
    if (cachedModels && now < cacheExpiry) {
      return { status: 200 as const, body: cachedModels as any };
    }

    try {
      const catalog = await ghosthandsClient.getModels();
      cachedModels = catalog;
      cacheExpiry = now + CACHE_TTL_MS;
      return { status: 200 as const, body: catalog as any };
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
