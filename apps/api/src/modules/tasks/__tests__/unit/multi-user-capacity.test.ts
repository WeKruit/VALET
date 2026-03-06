import { describe, it, expect, vi, beforeEach } from "vitest";

// Stub environment for queue dispatch
vi.stubEnv("TASK_DISPATCH_MODE", "queue");

// Mock the websocket handler
vi.mock("../../../../websocket/handler.js", () => ({
  publishToUser: vi.fn().mockResolvedValue(undefined),
}));

import { TaskService } from "../../task.service.js";

/**
 * Stateful mock that simulates sandbox assignment and load tracking
 * across multiple TaskService.create() calls.
 */
function makeStatefulMocks(opts: {
  sandboxes: { id: string; capacity: number; status: string; healthStatus: string }[];
}) {
  const assignments = new Map<string, string>(); // userId → sandboxId
  const sandboxLoads = new Map<string, number>(); // sandboxId → currentAssignments
  const sandboxMap = new Map<string, (typeof opts.sandboxes)[0]>();

  for (const sb of opts.sandboxes) {
    sandboxLoads.set(sb.id, 0);
    sandboxMap.set(sb.id, sb);
  }

  return {
    taskRepo: {
      create: vi.fn().mockImplementation((data: Record<string, unknown>) => ({
        id: `task-${Math.random().toString(36).slice(2, 8)}`,
        userId: data.userId,
        jobUrl: data.jobUrl,
        platform: "workday",
        status: "created",
        mode: "autopilot",
        progress: 0,
        sandboxId: data.sandboxId,
        currentStep: null,
        completedAt: null,
        createdAt: new Date(),
      })),
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
      submitApplication: vi.fn().mockResolvedValue({ job_id: `gh-job-${Date.now()}` }),
    },
    ghJobRepo: {
      createJob: vi.fn().mockResolvedValue({ id: `gh-job-${Date.now()}`, metadata: {} }),
      updateStatus: vi.fn().mockResolvedValue(undefined),
    },
    ghJobEventRepo: {},
    ghSessionRepo: {},
    taskQueueService: {
      isAvailable: true,
      enqueueApplyJob: vi.fn().mockResolvedValue("pgboss-job-uuid"),
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
      findById: vi.fn().mockImplementation((id: string) => {
        const sb = sandboxMap.get(id);
        return sb ?? null;
      }),
      resolveWorkerId: vi.fn().mockImplementation((id: string) => {
        const sb = sandboxMap.get(id);
        return sb && sb.status === "active" && sb.healthStatus === "healthy"
          ? `worker-${id}`
          : null;
      }),
    },
    userSandboxRepo: {
      findByUserId: vi.fn().mockImplementation((userId: string) => {
        const sandboxId = assignments.get(userId);
        return sandboxId ? { userId, sandboxId } : null;
      }),
      findBestAvailableSandbox: vi.fn().mockImplementation(() => {
        let best: string | null = null;
        let bestRatio = Infinity;
        for (const sb of opts.sandboxes) {
          if (sb.status !== "active" || sb.healthStatus !== "healthy") continue;
          const load = sandboxLoads.get(sb.id) ?? 0;
          if (load >= sb.capacity) continue;
          const ratio = load / sb.capacity;
          if (ratio < bestRatio) {
            best = sb.id;
            bestRatio = ratio;
          }
        }
        return best;
      }),
      assign: vi.fn().mockImplementation((userId: string, sandboxId: string) => {
        // If user was previously assigned, decrement old sandbox load
        const prev = assignments.get(userId);
        if (prev) {
          sandboxLoads.set(prev, Math.max(0, (sandboxLoads.get(prev) ?? 0) - 1));
        }
        assignments.set(userId, sandboxId);
        sandboxLoads.set(sandboxId, (sandboxLoads.get(sandboxId) ?? 0) + 1);
        return {
          userId,
          sandboxId,
          id: `assign-${userId}`,
          assignedAt: new Date(),
          assignedBy: null,
        };
      }),
    },
    // Expose internal state for assertions
    _state: { assignments, sandboxLoads, sandboxMap },
  };
}

describe("TaskService — multi-user capacity scenarios", () => {
  const baseBody = {
    jobUrl: "https://boards.greenhouse.io/example/jobs/123",
    mode: "autopilot" as const,
    resumeId: "resume-uuid-1",
    executionTarget: "cloud" as const,
  };

  describe("3 sandboxes, capacity=5 each (15 total slots)", () => {
    let deps: ReturnType<typeof makeStatefulMocks>;
    let service: TaskService;

    beforeEach(() => {
      deps = makeStatefulMocks({
        sandboxes: [
          { id: "sb-1", capacity: 5, status: "active", healthStatus: "healthy" },
          { id: "sb-2", capacity: 5, status: "active", healthStatus: "healthy" },
          { id: "sb-3", capacity: 5, status: "active", healthStatus: "healthy" },
        ],
      });
      service = new TaskService(deps as never);
    });

    it("first 3 users assigned to 3 different sandboxes (load-balanced)", async () => {
      await service.create(baseBody, "user-1", "admin");
      await service.create(baseBody, "user-2", "admin");
      await service.create(baseBody, "user-3", "admin");

      // Each user should be assigned to a unique sandbox (all have 0 load initially)
      const assignedSandboxes = new Set([
        deps._state.assignments.get("user-1"),
        deps._state.assignments.get("user-2"),
        deps._state.assignments.get("user-3"),
      ]);
      expect(assignedSandboxes.size).toBe(3);
      expect(deps.userSandboxRepo.assign).toHaveBeenCalledTimes(3);
    });

    it("users 4-5 assigned to existing sandboxes (capacity=5 allows sharing)", async () => {
      // Fill first 3 users
      await service.create(baseBody, "user-1", "admin");
      await service.create(baseBody, "user-2", "admin");
      await service.create(baseBody, "user-3", "admin");

      // Users 4-5 should be assigned to sandboxes that have lowest load
      await service.create(baseBody, "user-4", "admin");
      await service.create(baseBody, "user-5", "admin");

      expect(deps._state.assignments.size).toBe(5);
      // All users should have assignments
      for (let i = 1; i <= 5; i++) {
        expect(deps._state.assignments.has(`user-${i}`)).toBe(true);
      }
      // Total load across all sandboxes should equal 5
      let totalLoad = 0;
      for (const load of deps._state.sandboxLoads.values()) {
        totalLoad += load;
      }
      expect(totalLoad).toBe(5);
    });

    it("returning user with healthy assignment skips findBestAvailableSandbox", async () => {
      // First call: user gets assigned
      await service.create(baseBody, "user-1", "admin");
      const firstSandbox = deps._state.assignments.get("user-1");
      expect(firstSandbox).toBeDefined();

      vi.clearAllMocks();

      // Second call: user already has healthy assignment → reuse
      await service.create(baseBody, "user-1", "admin");

      // findBestAvailableSandbox should NOT be called (user already assigned)
      expect(deps.userSandboxRepo.findBestAvailableSandbox).not.toHaveBeenCalled();
      // assign should NOT be called again
      expect(deps.userSandboxRepo.assign).not.toHaveBeenCalled();
    });

    it("all 15 slots full → new user falls back to general queue", async () => {
      // Fill all 15 slots
      for (let i = 1; i <= 15; i++) {
        await service.create(baseBody, `user-${i}`, "admin");
      }

      // Verify all sandboxes are at capacity
      for (const [, load] of deps._state.sandboxLoads) {
        expect(load).toBe(5);
      }

      vi.clearAllMocks();

      // User 16: no capacity left → falls back to general queue
      await service.create(baseBody, "user-16", "admin");

      // findBestAvailableSandbox returns null (all full)
      expect(deps.userSandboxRepo.findBestAvailableSandbox).toHaveBeenCalled();
      // Task should be created without sandboxId (general queue fallback)
      expect(deps.taskRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ sandboxId: undefined }),
      );
      // Queue should target general queue (no specific worker)
      expect(deps.taskQueueService.enqueueApplyJob).toHaveBeenCalledWith(expect.anything(), {
        targetWorkerId: undefined,
      });
    });

    it("10th user gets assigned to least-loaded sandbox", async () => {
      // Fill 9 users (3 per sandbox)
      for (let i = 1; i <= 9; i++) {
        await service.create(baseBody, `user-${i}`, "admin");
      }

      // All sandboxes should have 3 assignments each
      for (const [, load] of deps._state.sandboxLoads) {
        expect(load).toBe(3);
      }

      // User 10 should get assigned (capacity=5, load=3 → space available)
      await service.create(baseBody, "user-10", "admin");
      expect(deps._state.assignments.has("user-10")).toBe(true);
      expect(deps.userSandboxRepo.assign).toHaveBeenCalled();
    });

    it("user auto-reassigns when sandbox is terminated", async () => {
      // User 1 gets assigned
      await service.create(baseBody, "user-1", "admin");
      const originalSandbox = deps._state.assignments.get("user-1");
      expect(originalSandbox).toBeDefined();

      // Simulate sandbox termination: mark unhealthy
      const sb = deps._state.sandboxMap.get(originalSandbox!);
      if (sb) sb.healthStatus = "unhealthy";

      vi.clearAllMocks();

      // Next task for user-1 should trigger auto-reassign
      await service.create(baseBody, "user-1", "admin");

      // findBestAvailableSandbox should be called (existing assignment is unhealthy)
      expect(deps.userSandboxRepo.findBestAvailableSandbox).toHaveBeenCalled();
      // User should be reassigned to a different healthy sandbox
      expect(deps.userSandboxRepo.assign).toHaveBeenCalled();
      const newSandbox = deps._state.assignments.get("user-1");
      expect(newSandbox).not.toBe(originalSandbox);
    });

    it("user with unhealthy (degraded) sandbox auto-reassigns", async () => {
      await service.create(baseBody, "user-1", "admin");
      const originalSandbox = deps._state.assignments.get("user-1");

      // Mark sandbox as degraded
      const sb = deps._state.sandboxMap.get(originalSandbox!);
      if (sb) sb.healthStatus = "degraded";

      vi.clearAllMocks();

      await service.create(baseBody, "user-1", "admin");

      // Should try to reassign since healthStatus !== "healthy"
      expect(deps.userSandboxRepo.findBestAvailableSandbox).toHaveBeenCalled();
      expect(deps.userSandboxRepo.assign).toHaveBeenCalled();
    });

    it("10 concurrent create() calls all get valid routing", async () => {
      const promises = Array.from({ length: 10 }, (_, i) =>
        service.create(baseBody, `concurrent-user-${i}`, "admin"),
      );

      const results = await Promise.all(promises);

      // All 10 tasks should be created successfully
      expect(results).toHaveLength(10);
      expect(deps.taskRepo.create).toHaveBeenCalledTimes(10);

      // All 10 users should have sandbox assignments (capacity=15, only 10 users)
      for (let i = 0; i < 10; i++) {
        expect(deps._state.assignments.has(`concurrent-user-${i}`)).toBe(true);
      }
    });
  });
});
