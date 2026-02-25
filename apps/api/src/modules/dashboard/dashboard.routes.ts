import { initServer } from "@ts-rest/fastify";
import { dashboardContract } from "@valet/contracts";
import { requireAbility } from "../../common/middleware/authorize.js";

const s = initServer();

export const dashboardRouter = s.router(dashboardContract, {
  stats: async ({ request }) => {
    await requireAbility("read", "Dashboard")(request);
    const { dashboardService } = request.diScope.cradle;
    const stats = await dashboardService.getStats(request.userId);
    return { status: 200 as const, body: stats };
  },

  trends: async ({ request }) => {
    await requireAbility("read", "Dashboard")(request);
    const { dashboardService } = request.diScope.cradle;
    const trends = await dashboardService.getTrends(request.userId);
    return { status: 200 as const, body: trends };
  },

  breakdown: async ({ request }) => {
    await requireAbility("read", "Dashboard")(request);
    const { dashboardService } = request.diScope.cradle;
    const breakdown = await dashboardService.getBreakdown(request.userId);
    return { status: 200 as const, body: breakdown };
  },
});
