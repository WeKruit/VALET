import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  StaleTaskReconciliationMonitor,
  type ReconciliationSummary,
} from "../../stale-task-reconciliation.js";

// Mock the publishToUser function
vi.mock("../../../../websocket/handler.js", () => ({
  publishToUser: vi.fn().mockResolvedValue(undefined),
}));

import { publishToUser } from "../../../../websocket/handler.js";
const mockPublishToUser = vi.mocked(publishToUser);

function makeMockTaskService() {
  return {
    findStuckJobs: vi.fn().mockResolvedValue([]),
    syncGhJobStatus: vi.fn().mockResolvedValue({
      taskUpdated: false,
      ghJobUpdated: false,
      previousTaskStatus: "in_progress",
      newTaskStatus: "in_progress",
    }),
  };
}

function makeMockTaskRepo() {
  return {
    updateStatus: vi.fn().mockResolvedValue(null),
    updateGhosthandsResult: vi.fn().mockResolvedValue(undefined),
  };
}

function makeMockRedis() {
  return {
    publish: vi.fn().mockResolvedValue(1),
  };
}

function makeMockLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    fatal: vi.fn(),
    trace: vi.fn(),
    child: vi.fn(),
    silent: vi.fn(),
    level: "info",
  };
}

function makeStuckTask(
  overrides: Partial<{
    id: string;
    workflowRunId: string | null;
    updatedAt: Date;
    status: string;
  }> = {},
) {
  return {
    id: overrides.id ?? "task-1",
    userId: "user-1",
    jobUrl: "https://example.com/job",
    platform: "workday",
    status: overrides.status ?? "in_progress",
    workflowRunId: "workflowRunId" in overrides ? overrides.workflowRunId! : "wf-1",
    updatedAt: overrides.updatedAt ?? new Date(Date.now() - 35 * 60 * 1000),
    ghJob: null,
  };
}

describe("StaleTaskReconciliationMonitor", () => {
  let taskService: ReturnType<typeof makeMockTaskService>;
  let taskRepo: ReturnType<typeof makeMockTaskRepo>;
  let redis: ReturnType<typeof makeMockRedis>;
  let logger: ReturnType<typeof makeMockLogger>;
  let monitor: StaleTaskReconciliationMonitor;

  beforeEach(() => {
    vi.useFakeTimers();
    taskService = makeMockTaskService();
    taskRepo = makeMockTaskRepo();
    redis = makeMockRedis();
    logger = makeMockLogger();
    mockPublishToUser.mockClear();
    monitor = new StaleTaskReconciliationMonitor({
      taskService: taskService as never,
      taskRepo: taskRepo as never,
      redis: redis as never,
      logger: logger as never,
    });
  });

  afterEach(() => {
    monitor.stop();
    vi.useRealTimers();
  });

  describe("reconcileStaleJobs()", () => {
    it("returns zeroes when no stuck tasks", async () => {
      const result = await monitor.reconcileStaleJobs();
      expect(result).toEqual<ReconciliationSummary>({
        checked: 0,
        reconciled: 0,
        timedOut: 0,
        skipped: 0,
        errors: 0,
      });
      expect(taskService.findStuckJobs).toHaveBeenCalledWith(30);
    });

    it("reconciles a task whose GH status changed", async () => {
      taskService.findStuckJobs.mockResolvedValue([makeStuckTask()]);
      taskService.syncGhJobStatus.mockResolvedValue({
        taskUpdated: true,
        ghJobUpdated: true,
        previousTaskStatus: "in_progress",
        newTaskStatus: "completed",
      });
      const result = await monitor.reconcileStaleJobs();
      expect(result.checked).toBe(1);
      expect(result.reconciled).toBe(1);
      expect(result.errors).toBe(0);
    });

    it("skips tasks where GH status is unchanged", async () => {
      taskService.findStuckJobs.mockResolvedValue([makeStuckTask()]);
      taskService.syncGhJobStatus.mockResolvedValue({ taskUpdated: false, ghJobUpdated: false });
      const result = await monitor.reconcileStaleJobs();
      expect(result.skipped).toBe(1);
      expect(result.reconciled).toBe(0);
    });

    it("skips tasks with no workflowRunId under timeout", async () => {
      taskService.findStuckJobs.mockResolvedValue([makeStuckTask({ workflowRunId: null })]);
      const result = await monitor.reconcileStaleJobs();
      expect(result.skipped).toBe(1);
      expect(taskService.syncGhJobStatus).not.toHaveBeenCalled();
    });

    it("times out tasks with no workflowRunId past 2 hours", async () => {
      taskService.findStuckJobs.mockResolvedValue([
        makeStuckTask({ workflowRunId: null, updatedAt: new Date(Date.now() - 150 * 60 * 1000) }),
      ]);
      const result = await monitor.reconcileStaleJobs();
      expect(result.timedOut).toBe(1);
      expect(taskRepo.updateStatus).toHaveBeenCalledWith("task-1", "failed");
      expect(taskRepo.updateGhosthandsResult).toHaveBeenCalledWith(
        "task-1",
        expect.objectContaining({
          ghJobId: "",
          error: expect.objectContaining({ code: "reconciliation_timeout" }),
        }),
      );
      // Verify WebSocket notification was sent
      expect(mockPublishToUser).toHaveBeenCalledWith(
        expect.anything(),
        "user-1",
        expect.objectContaining({
          type: "task_update",
          taskId: "task-1",
          status: "failed",
          error: expect.objectContaining({ code: "reconciliation_timeout" }),
        }),
      );
    });

    it("times out tasks when GH sync fails and past 2 hours", async () => {
      taskService.findStuckJobs.mockResolvedValue([
        makeStuckTask({ updatedAt: new Date(Date.now() - 150 * 60 * 1000) }),
      ]);
      taskService.syncGhJobStatus.mockResolvedValue({ error: "GH unreachable" });
      const result = await monitor.reconcileStaleJobs();
      expect(result.timedOut).toBe(1);
      expect(result.reconciled).toBe(0);
      // ghJobId should use the task's workflowRunId, not empty string
      expect(taskRepo.updateGhosthandsResult).toHaveBeenCalledWith(
        "task-1",
        expect.objectContaining({
          ghJobId: "wf-1",
        }),
      );
      // WebSocket notification sent
      expect(mockPublishToUser).toHaveBeenCalledWith(
        expect.anything(),
        "user-1",
        expect.objectContaining({ type: "task_update", taskId: "task-1", status: "failed" }),
      );
    });

    it("retries later when GH sync fails but under timeout", async () => {
      taskService.findStuckJobs.mockResolvedValue([makeStuckTask()]);
      taskService.syncGhJobStatus.mockResolvedValue({ error: "GH unreachable" });
      const result = await monitor.reconcileStaleJobs();
      expect(result.skipped).toBe(1);
      expect(result.timedOut).toBe(0);
      expect(taskRepo.updateStatus).not.toHaveBeenCalled();
    });

    it("handles multiple tasks in a single run", async () => {
      taskService.findStuckJobs.mockResolvedValue([
        makeStuckTask({ id: "t1" }),
        makeStuckTask({ id: "t2" }),
        makeStuckTask({
          id: "t3",
          workflowRunId: null,
          updatedAt: new Date(Date.now() - 150 * 60 * 1000),
        }),
      ]);
      taskService.syncGhJobStatus
        .mockResolvedValueOnce({
          taskUpdated: true,
          ghJobUpdated: true,
          previousTaskStatus: "in_progress",
          newTaskStatus: "completed",
        })
        .mockResolvedValueOnce({ taskUpdated: false, ghJobUpdated: false });
      const result = await monitor.reconcileStaleJobs();
      expect(result.checked).toBe(3);
      expect(result.reconciled).toBe(1);
      expect(result.skipped).toBe(1);
      expect(result.timedOut).toBe(1);
    });

    it("counts errors for individual task failures", async () => {
      taskService.findStuckJobs.mockResolvedValue([makeStuckTask()]);
      taskService.syncGhJobStatus.mockRejectedValue(new Error("boom"));
      const result = await monitor.reconcileStaleJobs();
      expect(result.errors).toBe(1);
      expect(result.reconciled).toBe(0);
    });

    it("handles findStuckJobs failure gracefully", async () => {
      taskService.findStuckJobs.mockRejectedValue(new Error("DB down"));
      const result = await monitor.reconcileStaleJobs();
      expect(result.checked).toBe(0);
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe("mutex", () => {
    it("skips when already running", async () => {
      let resolveStuck: (v: unknown[]) => void;
      taskService.findStuckJobs.mockReturnValue(
        new Promise((r) => {
          resolveStuck = r;
        }),
      );
      const first = monitor.reconcileStaleJobs();
      const second = await monitor.reconcileStaleJobs();
      expect(second.skipped).toBe(1);
      expect(second.checked).toBe(0);
      resolveStuck!([]);
      await first;
    });
  });

  describe("start()/stop()", () => {
    it("starts interval and runs immediately", async () => {
      monitor.start();
      expect(taskService.findStuckJobs).toHaveBeenCalledTimes(1);
    });

    it("fires on interval", async () => {
      monitor.start();
      expect(taskService.findStuckJobs).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
      expect(taskService.findStuckJobs).toHaveBeenCalledTimes(2);
    });

    it("stop prevents further ticks", async () => {
      monitor.start();
      expect(taskService.findStuckJobs).toHaveBeenCalledTimes(1);
      monitor.stop();
      await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
      expect(taskService.findStuckJobs).toHaveBeenCalledTimes(1);
    });
  });
});
