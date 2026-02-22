import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { adminOnly } from "../../common/middleware/admin.js";

/**
 * Admin routes for task management (stuck jobs, sync, cleanup).
 * Registered as standalone Fastify routes outside ts-rest.
 */
export async function taskAdminRoutes(fastify: FastifyInstance) {
  // ── List all tasks (admin view) ──────────────────────────────
  fastify.get("/api/v1/admin/tasks", async (request: FastifyRequest, reply: FastifyReply) => {
    await adminOnly(request);

    const { taskService } = request.diScope.cradle;
    const q = request.query as Record<string, string>;
    const result = await taskService.listAll({
      page: Number(q.page) || 1,
      pageSize: Math.min(Number(q.pageSize) || 25, 100),
      status: q.status || undefined,
      platform: q.platform || undefined,
      search: q.search || undefined,
      userId: q.userId || undefined,
      sortBy: q.sortBy || "createdAt",
      sortOrder: q.sortOrder || "desc",
    });

    return reply.status(200).send(result);
  });

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
      const result = await taskService.syncGhJobStatus(taskId);

      if ("error" in result) {
        return reply.status(404).send({ error: result.error });
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
          const syncResult = await taskService.syncGhJobStatus(task.id);
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

  // ── Manually trigger stale task reconciliation ───────────────
  fastify.post(
    "/api/v1/admin/tasks/reconcile",
    async (request: FastifyRequest, reply: FastifyReply) => {
      await adminOnly(request);

      const { staleTaskReconciliation } = request.diScope.cradle;
      const summary = await staleTaskReconciliation.reconcileStaleJobs();

      return reply.status(200).send(summary);
    },
  );
}
