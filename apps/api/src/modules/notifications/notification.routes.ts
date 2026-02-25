import { initServer } from "@ts-rest/fastify";
import { notificationContract } from "@valet/contracts";
import type { AppCradle } from "../../plugins/container.js";
import { requireAbility } from "../../common/middleware/authorize.js";

const s = initServer();

export const notificationRouter = s.router(notificationContract, {
  list: async ({ query, request }) => {
    await requireAbility("read", "Settings")(request);
    const { notificationService } = request.diScope.cradle as AppCradle;
    const result = await notificationService.list(request.userId, {
      page: query.page,
      pageSize: query.pageSize,
      unreadOnly: query.unreadOnly,
    });
    return { status: 200, body: result };
  },

  markRead: async ({ params, request }) => {
    await requireAbility("update", "Settings")(request);
    const { notificationService } = request.diScope.cradle as AppCradle;
    const result = await notificationService.markRead(params.id, request.userId);
    return { status: 200, body: result };
  },

  markAllRead: async ({ request }) => {
    await requireAbility("update", "Settings")(request);
    const { notificationService } = request.diScope.cradle as AppCradle;
    const result = await notificationService.markAllRead(request.userId);
    return { status: 200, body: result };
  },
});
