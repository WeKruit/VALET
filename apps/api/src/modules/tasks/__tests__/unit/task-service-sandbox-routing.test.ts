import { describe, it, expect, vi, beforeEach } from "vitest";

// Stub environment for queue dispatch
vi.stubEnv("TASK_DISPATCH_MODE", "queue");

// Mock the websocket handler
vi.mock("../../../../websocket/handler.js", () => ({
  publishToUser: vi.fn().mockResolvedValue(undefined),
}));

import { TaskService } from "../../task.service.js";

function makeMockDeps() {
  return {
    taskRepo: {
      create: vi.fn().mockResolvedValue({
        id: "task-uuid-1",
        userId: "user-uuid-1",
        jobUrl: "https://example.com/job",
        platform: "workday",
        status: "created",
        mode: "autopilot",
        progress: 0,
        currentStep: null,
        completedAt: null,
        createdAt: new Date(),
      }),
      updateWorkflowRunId: vi.fn().mockResolvedValue(undefined),
      updateStatus: vi.fn().mockResolvedValue(undefined),
      updateGhosthandsResult: vi.fn().mockResolvedValue(undefined),
    },
    resumeRepo: {
      findById: vi.fn().mockResolvedValue({ fileKey: "resumes/test.pdf", parsedData: null }),
    },
    qaBankRepo: {
      findByUserId: vi.fn().mockResolvedValue([]),
    },
    ghosthandsClient: {
      submitApplication: vi.fn().mockResolvedValue({ job_id: "gh-job-uuid-1" }),
    },
    ghJobRepo: {
      createJob: vi.fn().mockResolvedValue({
        id: "gh-job-uuid-1",
        metadata: {},
      }),
      updateStatus: vi.fn().mockResolvedValue(undefined),
    },
    ghJobEventRepo: {},
    ghSessionRepo: {},
    taskQueueService: {
      isAvailable: true,
      enqueueApplyJob: vi.fn().mockResolvedValue("pgboss-job-uuid-1"),
    },
    redis: {
      publish: vi.fn().mockResolvedValue(1),
    },
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
    sandboxRepo: {
      findById: vi.fn(),
      resolveWorkerId: vi.fn(),
    },
    userSandboxRepo: {
      findByUserId: vi.fn(),
      findBestAvailableSandbox: vi.fn(),
      assign: vi.fn().mockResolvedValue(undefined),
    },
  };
}

describe("TaskService — sandbox routing", () => {
  let deps: ReturnType<typeof makeMockDeps>;
  let service: TaskService;

  const baseBody = {
    jobUrl: "https://example.com/job",
    mode: "autopilot" as const,
    resumeId: "resume-uuid-1",
  };

  beforeEach(() => {
    deps = makeMockDeps();
    service = new TaskService(deps as never);
  });

  describe("user with healthy assignment", () => {
    it("routes to assigned sandbox", async () => {
      deps.userSandboxRepo.findByUserId.mockResolvedValue({
        userId: "user-uuid-1",
        sandboxId: "sandbox-uuid-1",
      });
      deps.sandboxRepo.findById.mockResolvedValue({
        id: "sandbox-uuid-1",
        status: "active",
        healthStatus: "healthy",
      });
      deps.sandboxRepo.resolveWorkerId.mockResolvedValue("gh-worker-uuid-1");

      await service.create(baseBody, "user-uuid-1");

      // Task should be created with the sandbox ID
      expect(deps.taskRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ sandboxId: "sandbox-uuid-1" }),
      );
      // Queue should target the resolved worker
      expect(deps.taskQueueService.enqueueApplyJob).toHaveBeenCalledWith(expect.anything(), {
        targetWorkerId: "gh-worker-uuid-1",
      });
    });
  });

  describe("user with unhealthy assignment", () => {
    it("auto-reassigns to a new sandbox", async () => {
      // Existing assignment points to unhealthy sandbox
      deps.userSandboxRepo.findByUserId.mockResolvedValue({
        userId: "user-uuid-1",
        sandboxId: "sandbox-dead",
      });
      deps.sandboxRepo.findById.mockResolvedValue({
        id: "sandbox-dead",
        status: "active",
        healthStatus: "unhealthy",
      });
      // Auto-assign finds a new sandbox
      deps.userSandboxRepo.findBestAvailableSandbox.mockResolvedValue("sandbox-uuid-2");
      deps.sandboxRepo.resolveWorkerId.mockResolvedValue("gh-worker-uuid-2");

      await service.create(baseBody, "user-uuid-1");

      // Should auto-assign the new sandbox
      expect(deps.userSandboxRepo.assign).toHaveBeenCalledWith("user-uuid-1", "sandbox-uuid-2");
      expect(deps.taskRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ sandboxId: "sandbox-uuid-2" }),
      );
    });
  });

  describe("user with no assignment", () => {
    it("auto-assigns to best available sandbox", async () => {
      deps.userSandboxRepo.findByUserId.mockResolvedValue(null);
      deps.userSandboxRepo.findBestAvailableSandbox.mockResolvedValue("sandbox-uuid-3");
      deps.sandboxRepo.resolveWorkerId.mockResolvedValue("gh-worker-uuid-3");

      await service.create(baseBody, "user-uuid-1");

      expect(deps.userSandboxRepo.assign).toHaveBeenCalledWith("user-uuid-1", "sandbox-uuid-3");
      expect(deps.taskRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ sandboxId: "sandbox-uuid-3" }),
      );
      expect(deps.taskQueueService.enqueueApplyJob).toHaveBeenCalledWith(expect.anything(), {
        targetWorkerId: "gh-worker-uuid-3",
      });
    });
  });

  describe("no sandboxes available", () => {
    it("falls back to general queue", async () => {
      deps.userSandboxRepo.findByUserId.mockResolvedValue(null);
      deps.userSandboxRepo.findBestAvailableSandbox.mockResolvedValue(null);

      await service.create(baseBody, "user-uuid-1");

      // sandboxId should be undefined (no routing)
      expect(deps.taskRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ sandboxId: undefined }),
      );
      // Queue should use general queue (no targetWorkerId)
      expect(deps.taskQueueService.enqueueApplyJob).toHaveBeenCalledWith(expect.anything(), {
        targetWorkerId: undefined,
      });
    });
  });

  describe("admin explicit targetWorkerId", () => {
    it("bypasses user resolution and uses strict affinity", async () => {
      deps.sandboxRepo.resolveWorkerId.mockResolvedValue("gh-worker-uuid-admin");

      await service.create({ ...baseBody, targetWorkerId: "sandbox-admin-uuid" }, "user-uuid-1");

      // Should NOT call userSandboxRepo at all
      expect(deps.userSandboxRepo.findByUserId).not.toHaveBeenCalled();
      // Task created with admin's sandbox
      expect(deps.taskRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ sandboxId: "sandbox-admin-uuid" }),
      );
      // Queue should target the resolved worker
      expect(deps.taskQueueService.enqueueApplyJob).toHaveBeenCalledWith(expect.anything(), {
        targetWorkerId: "gh-worker-uuid-admin",
      });
    });
  });

  describe("worker resolution fails", () => {
    it("falls back to general queue", async () => {
      deps.userSandboxRepo.findByUserId.mockResolvedValue({
        userId: "user-uuid-1",
        sandboxId: "sandbox-uuid-1",
      });
      deps.sandboxRepo.findById.mockResolvedValue({
        id: "sandbox-uuid-1",
        status: "active",
        healthStatus: "healthy",
      });
      // No active worker found
      deps.sandboxRepo.resolveWorkerId.mockResolvedValue(null);

      await service.create(baseBody, "user-uuid-1");

      // Task is still tagged with sandbox ID
      expect(deps.taskRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ sandboxId: "sandbox-uuid-1" }),
      );
      // But queue uses general queue (no targetWorkerId)
      expect(deps.taskQueueService.enqueueApplyJob).toHaveBeenCalledWith(expect.anything(), {
        targetWorkerId: undefined,
      });
      // Warning logged
      expect(deps.logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ sandboxId: "sandbox-uuid-1" }),
        expect.stringContaining("No active worker"),
      );
    });
  });
});
