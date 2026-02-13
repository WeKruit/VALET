import { initServer } from "@ts-rest/fastify";
import { dashboardContract } from "@valet/contracts";

const s = initServer();

export const dashboardRouter = s.router(dashboardContract, {
  stats: async ({ request }) => {
    const { dashboardService } = request.diScope.cradle;
    const stats = await dashboardService.getStats(request.userId);
    return { status: 200 as const, body: stats };
  },

  trends: async ({ request }) => {
    const { dashboardService } = request.diScope.cradle;
    const trends = await dashboardService.getTrends(request.userId);
    return { status: 200 as const, body: trends };
  },

  breakdown: async ({ request }) => {
    const { dashboardService } = request.diScope.cradle;
    const breakdown = await dashboardService.getBreakdown(request.userId);
    return { status: 200 as const, body: breakdown };
  },
});
