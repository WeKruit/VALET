import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { adminOnly } from "../../common/middleware/admin.js";

/**
 * Admin routes for task management (stuck jobs, sync, cleanup).
 * Registered as standalone Fastify routes outside ts-rest.
 */
export async function taskAdminRoutes(fastify: FastifyInstance) {
  // ── List stuck jobs ────────────────────────────────────────
  fastify.get("/api/v1/admin/tasks/stuck", async (request: FastifyRequest, reply: FastifyReply) => {
    await adminOnly(request);

    const { taskService } = request.diScope.cradle;
    const minutes = Number((request.query as Record<string, string>).minutes) || 30;
    const stuck = await taskService.findStuckJobs(minutes);

    return reply.status(200).send({
      count: stuck.length,
      stuckMinutes: minutes,
      tasks: stuck.map((t) => ({
        id: t.id,
        userId: t.userId,
        jobUrl: t.jobUrl,
        platform: t.platform,
        status: t.status,
        workflowRunId: t.workflowRunId,
        updatedAt: t.updatedAt,
        ghJob: t.ghJob,
      })),
    });
  });

  // ── Sync task with GhostHands ──────────────────────────────
  fastify.post(
    "/api/v1/admin/tasks/:taskId/sync",
    async (request: FastifyRequest, reply: FastifyReply) => {
      await adminOnly(request);

      const { taskService } = request.diScope.cradle;
      const { taskId } = request.params as { taskId: string };
      const result = await taskService.syncTaskWithGh(taskId);

      if (!result) {
        return reply.status(404).send({ error: "Task not found or has no GH job" });
      }

      return reply.status(200).send(result);
    },
  );

  // ── Bulk sync all stuck jobs ───────────────────────────────
  fastify.post(
    "/api/v1/admin/tasks/sync-stuck",
    async (request: FastifyRequest, reply: FastifyReply) => {
      await adminOnly(request);

      const { taskService } = request.diScope.cradle;
      const minutes = Number((request.body as Record<string, unknown>)?.minutes) || 30;
      const stuck = await taskService.findStuckJobs(minutes);

      const results = [];
      for (const task of stuck) {
        if (task.workflowRunId) {
          const syncResult = await taskService.syncTaskWithGh(task.id);
          results.push(syncResult);
        }
      }

      return reply.status(200).send({
        total: stuck.length,
        synced: results.filter((r) => r && !("error" in r)).length,
        results,
      });
    },
  );
}
