import { initServer } from "@ts-rest/fastify";
import { earlyAccessAdminContract } from "@valet/contracts";
import { adminOnly } from "../../common/middleware/admin.js";
import { AppError } from "../../common/errors.js";

const s = initServer();

export const earlyAccessAdminRouter = s.router(earlyAccessAdminContract, {
  list: async ({ query, request }) => {
    await adminOnly(request);
    const { earlyAccessService } = request.diScope.cradle;
    const result = await earlyAccessService.listSubmissions({
      page: query.page,
      limit: query.limit,
      emailStatus: query.emailStatus,
      search: query.search,
    });
    return {
      status: 200 as const,
      body: {
        items: result.items.map((item) => ({
          id: item.id,
          email: item.email,
          name: item.name,
          source: item.source,
          referralCode: item.referralCode ?? null,
          emailStatus: item.emailStatus,
          emailSentAt: item.emailSentAt?.toISOString() ?? null,
          createdAt: item.createdAt.toISOString(),
        })),
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: result.totalPages,
      },
    };
  },

  stats: async ({ request }) => {
    await adminOnly(request);
    const { earlyAccessService } = request.diScope.cradle;
    const stats = await earlyAccessService.getStats();
    return { status: 200 as const, body: stats };
  },

  promote: async ({ params, request }) => {
    await adminOnly(request);
    const { earlyAccessService } = request.diScope.cradle;
    const result = await earlyAccessService.promoteToBeta(params.id);
    return { status: 200 as const, body: result };
  },

  resend: async ({ params, request }) => {
    await adminOnly(request);

    // Rate-limit email resends: max 20 per hour per admin user
    const redis = request.server.redis;
    const rlKey = `rl:admin-resend-email:${request.userId}`;
    const count = await redis.incr(rlKey);
    if (count === 1) await redis.expire(rlKey, 3600);
    if (count > 20) {
      throw AppError.tooManyRequests("Email resend rate limit reached. Maximum 20 per hour.");
    }

    const { earlyAccessService } = request.diScope.cradle;
    const result = await earlyAccessService.resendEmail(params.id);
    return { status: 200 as const, body: result };
  },

  remove: async ({ params, request }) => {
    await adminOnly(request);
    const { earlyAccessService } = request.diScope.cradle;
    const result = await earlyAccessService.removeSubmission(params.id);
    return { status: 200 as const, body: result };
  },
});
