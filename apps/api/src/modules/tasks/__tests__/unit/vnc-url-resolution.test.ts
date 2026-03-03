import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock the websocket handler
vi.mock("../../../../websocket/handler.js", () => ({
  publishToUser: vi.fn().mockResolvedValue(undefined),
}));

import { TaskService } from "../../task.service.js";
import { TaskNotFoundError } from "../../task.errors.js";

function makeMockDeps() {
  return {
    taskRepo: {
      findById: vi.fn(),
      create: vi.fn(),
      updateStatus: vi.fn(),
      updateWorkflowRunId: vi.fn(),
      updateGhosthandsResult: vi.fn(),
      updateStatusGuarded: vi.fn(),
      updateInteractionData: vi.fn(),
      clearInteractionData: vi.fn(),
      updateLlmUsage: vi.fn(),
      cancel: vi.fn(),
    },
    resumeRepo: {},
    qaBankRepo: {},
    ghosthandsClient: {
      resumeJob: vi.fn(),
    },
    ghJobRepo: {
      findById: vi.fn(),
      createJob: vi.fn(),
      updateStatus: vi.fn(),
    },
    ghJobEventRepo: {},
    ghSessionRepo: {},
    taskQueueService: {
      isAvailable: false,
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
      assign: vi.fn(),
    },
  };
}

describe("TaskService — getVncUrl() compatibility alias", () => {
  let deps: ReturnType<typeof makeMockDeps>;
  let service: TaskService;

  beforeEach(() => {
    deps = makeMockDeps();
    service = new TaskService(deps as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("throws TaskNotFoundError for missing task", async () => {
    deps.taskRepo.findById.mockResolvedValue(null);

    await expect(service.getVncUrl("nonexistent", "user-1")).rejects.toThrow(TaskNotFoundError);
  });

  it("returns null for non-waiting_human tasks (in_progress)", async () => {
    deps.taskRepo.findById.mockResolvedValue({
      id: "task-1",
      status: "in_progress",
      workflowRunId: "gh-job-1",
      sandboxId: "sb-1",
    });

    const result = await service.getVncUrl("task-1", "user-1");
    expect(result).toBeNull();
  });

  it("returns null for completed tasks", async () => {
    deps.taskRepo.findById.mockResolvedValue({
      id: "task-1",
      status: "completed",
      workflowRunId: "gh-job-1",
      sandboxId: "sb-1",
    });

    const result = await service.getVncUrl("task-1", "user-1");
    expect(result).toBeNull();
  });

  it("returns null for failed tasks", async () => {
    deps.taskRepo.findById.mockResolvedValue({
      id: "task-1",
      status: "failed",
      workflowRunId: "gh-job-1",
      sandboxId: "sb-1",
    });

    const result = await service.getVncUrl("task-1", "user-1");
    expect(result).toBeNull();
  });

  it("delegates to createLiveviewSession for waiting_human tasks", async () => {
    const mockSession = {
      url: "https://valet-web-stg.fly.dev/browser-session/abc123",
      expiresAt: new Date(Date.now() + 300_000).toISOString(),
      readOnly: false,
      type: "browser_session" as const,
      mode: "simple_browser" as const,
    };

    // Spy on createLiveviewSession to avoid needing full ATM/GH mock chain
    const createSpy = vi.spyOn(service, "createLiveviewSession").mockResolvedValue(mockSession);

    deps.taskRepo.findById.mockResolvedValue({
      id: "task-1",
      status: "waiting_human",
      workflowRunId: "gh-job-1",
      sandboxId: "sb-1",
    });

    const result = await service.getVncUrl("task-1", "user-1");

    expect(createSpy).toHaveBeenCalledWith("task-1", "user-1");
    expect(result).toEqual({
      url: "https://valet-web-stg.fly.dev/browser-session/abc123",
      readOnly: false,
      type: "browser_session",
    });
  });

  it("returns type browser_session, never raw VNC types", async () => {
    const mockSession = {
      url: "https://valet-web-stg.fly.dev/browser-session/xyz",
      expiresAt: new Date(Date.now() + 300_000).toISOString(),
      readOnly: false,
      type: "browser_session" as const,
      mode: "simple_browser" as const,
    };

    vi.spyOn(service, "createLiveviewSession").mockResolvedValue(mockSession);

    deps.taskRepo.findById.mockResolvedValue({
      id: "task-1",
      status: "waiting_human",
      workflowRunId: "gh-job-1",
      sandboxId: "sb-1",
    });

    const result = await service.getVncUrl("task-1", "user-1");

    // Must never return novnc, kasm, or kasmvnc — always browser_session
    expect(result?.type).toBe("browser_session");
    // URL is a VALET page URL, not a raw worker IP
    expect(result?.url).toContain("/browser-session/");
    expect(result?.url).not.toMatch(/:\d{4}/); // no raw port like :6901 or :6080
  });

  it("returns readOnly=false for waiting_human (interactive)", async () => {
    const mockSession = {
      url: "https://valet-web-stg.fly.dev/browser-session/abc",
      expiresAt: new Date(Date.now() + 300_000).toISOString(),
      readOnly: false,
      type: "browser_session" as const,
      mode: "simple_browser" as const,
    };

    vi.spyOn(service, "createLiveviewSession").mockResolvedValue(mockSession);

    deps.taskRepo.findById.mockResolvedValue({
      id: "task-1",
      status: "waiting_human",
      workflowRunId: "gh-job-1",
      sandboxId: "sb-1",
    });

    const result = await service.getVncUrl("task-1", "user-1");
    expect(result?.readOnly).toBe(false);
  });

  it("returns null when createLiveviewSession throws (browser session unavailable)", async () => {
    vi.spyOn(service, "createLiveviewSession").mockRejectedValue(new Error("Worker unreachable"));

    deps.taskRepo.findById.mockResolvedValue({
      id: "task-1",
      status: "waiting_human",
      workflowRunId: "gh-job-1",
      sandboxId: "sb-1",
    });

    const result = await service.getVncUrl("task-1", "user-1");
    expect(result).toBeNull();
  });

  it("returns null when task has no sandbox (no worker)", async () => {
    deps.taskRepo.findById.mockResolvedValue({
      id: "task-1",
      status: "waiting_human",
      workflowRunId: null,
      sandboxId: null,
    });

    // createLiveviewSession will throw TaskNotFoundError internally due to no sandbox
    const result = await service.getVncUrl("task-1", "user-1");
    expect(result).toBeNull();
  });
});
