import { initServer } from "@ts-rest/fastify";
import { notificationContract } from "@valet/contracts";
import type { AppCradle } from "../../plugins/container.js";

const s = initServer();

export const notificationRouter = s.router(notificationContract, {
  list: async ({ query, request }) => {
    const { notificationService } = request.diScope.cradle as AppCradle;
    const result = await notificationService.list(request.userId, {
      page: query.page,
      pageSize: query.pageSize,
      unreadOnly: query.unreadOnly,
    });
    return { status: 200, body: result };
  },

  markRead: async ({ params, request }) => {
    const { notificationService } = request.diScope.cradle as AppCradle;
    const result = await notificationService.markRead(params.id, request.userId);
    return { status: 200, body: result };
  },

  markAllRead: async ({ request }) => {
    const { notificationService } = request.diScope.cradle as AppCradle;
    const result = await notificationService.markAllRead(request.userId);
    return { status: 200, body: result };
  },
});
