import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";

/**
 * User-facing standalone Fastify routes for task features that sit outside ts-rest.
 * These routes require JWT auth (provided by global onRequest hook).
 */
export async function taskUserRoutes(fastify: FastifyInstance) {
  // ── Get GH job events for a user's task ─────────────────────
  // Returns events from gh_job_events table (Sprint 5 activity feed data)
  fastify.get(
    "/api/v1/tasks/:taskId/gh-events",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.userId;
      if (!userId) {
        return reply.status(401).send({ error: "Unauthorized" });
      }

      const { taskService, ghJobEventRepo } = request.diScope.cradle;
      const { taskId } = request.params as { taskId: string };
      const q = request.query as Record<string, string>;
      const limit = Math.min(Number(q.limit) || 100, 500);
      const since = q.since || undefined;
      const milestonesOnly = q.milestones === "true";

      // Verify the task belongs to this user
      try {
        const task = await taskService.getById(taskId, userId);
        if (!task?.ghJob?.jobId) {
          return reply.status(200).send({ events: [] });
        }

        const rawEvents = await ghJobEventRepo.findByJobId(task.ghJob.jobId);

        // Filter by "since" timestamp if provided
        let events = rawEvents.map(
          (e: {
            id: string;
            eventType: string | null;
            fromStatus: string | null;
            toStatus: string | null;
            message: string | null;
            metadata: Record<string, unknown> | null;
            actor: string | null;
            createdAt: Date;
          }) => ({
            id: e.id,
            eventType: e.eventType,
            fromStatus: e.fromStatus,
            toStatus: e.toStatus,
            message: e.message,
            metadata: e.metadata,
            actor: e.actor,
            createdAt: e.createdAt.toISOString(),
          }),
        );

        // Filter to milestone-relevant event types if requested
        if (milestonesOnly) {
          const MILESTONE_TYPES = new Set([
            "job_started",
            "browser_launched",
            "page_navigated",
            "form_detected",
            "step_started",
            "step_completed",
            "cookbook_step_started",
            "cookbook_step_completed",
            "observation_started",
            "mode_switched",
            "job_completed",
            "job_failed",
            "blocker_detected",
            "hitl_paused",
            "hitl_resumed",
          ]);
          events = events.filter((e) => e.eventType && MILESTONE_TYPES.has(e.eventType));
        }

        if (since) {
          const sinceDate = new Date(since);
          events = events.filter((e) => new Date(e.createdAt) > sinceDate);
        }

        // Apply limit
        events = events.slice(-limit);

        return reply.status(200).send({ events });
      } catch {
        return reply.status(404).send({ error: "Task not found" });
      }
    },
  );
}
