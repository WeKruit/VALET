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

describe("TaskService — getVncUrl()", () => {
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

  it("returns kasmvnc type when kasm_url contains :6901", async () => {
    deps.taskRepo.findById.mockResolvedValue({
      id: "task-1",
      status: "in_progress",
      workflowRunId: "gh-job-1",
      sandboxId: "sb-1",
    });
    deps.ghJobRepo.findById.mockResolvedValue({
      id: "gh-job-1",
      metadata: { kasm_url: "https://10.0.0.1:6901" },
    });

    const result = await service.getVncUrl("task-1", "user-1");
    expect(result).toEqual({
      url: "https://10.0.0.1:6901",
      readOnly: true,
      type: "kasmvnc",
    });
  });

  it("returns kasm type when kasm_url contains /api/public", async () => {
    deps.taskRepo.findById.mockResolvedValue({
      id: "task-1",
      status: "in_progress",
      workflowRunId: "gh-job-1",
      sandboxId: "sb-1",
    });
    deps.ghJobRepo.findById.mockResolvedValue({
      id: "gh-job-1",
      metadata: { kasm_url: "https://kasm.example.com/api/public/session/abc" },
    });

    const result = await service.getVncUrl("task-1", "user-1");
    expect(result).toEqual({
      url: "https://kasm.example.com/api/public/session/abc",
      readOnly: true,
      type: "kasm",
    });
  });

  it("resolves relative kasm_url against KASM_API_URL", async () => {
    vi.stubEnv("KASM_API_URL", "https://kasm.example.com/api/public");

    deps.taskRepo.findById.mockResolvedValue({
      id: "task-1",
      status: "in_progress",
      workflowRunId: "gh-job-1",
      sandboxId: "sb-1",
    });
    deps.ghJobRepo.findById.mockResolvedValue({
      id: "gh-job-1",
      metadata: { kasm_url: "/#/connect/session/abc123" },
    });

    const result = await service.getVncUrl("task-1", "user-1");
    expect(result).toEqual({
      url: "https://kasm.example.com/#/connect/session/abc123",
      readOnly: true,
      type: "kasm",
    });
  });

  it("constructs https://{IP}:6901 from sandbox publicIp (path 2)", async () => {
    deps.taskRepo.findById.mockResolvedValue({
      id: "task-1",
      status: "in_progress",
      workflowRunId: "gh-job-1",
      sandboxId: "sb-1",
    });
    // No kasm_url in GH job metadata
    deps.ghJobRepo.findById.mockResolvedValue({
      id: "gh-job-1",
      metadata: {},
    });
    deps.sandboxRepo.findById.mockResolvedValue({
      id: "sb-1",
      publicIp: "34.197.248.80",
    });

    const result = await service.getVncUrl("task-1", "user-1");
    expect(result).toEqual({
      url: "https://34.197.248.80:6901",
      readOnly: true,
      type: "kasmvnc",
    });
  });

  it("returns sandbox novncUrl when no publicIp (path 3 fallback)", async () => {
    deps.taskRepo.findById.mockResolvedValue({
      id: "task-1",
      status: "in_progress",
      workflowRunId: "gh-job-1",
      sandboxId: "sb-1",
    });
    deps.ghJobRepo.findById.mockResolvedValue({
      id: "gh-job-1",
      metadata: {},
    });
    deps.sandboxRepo.findById.mockResolvedValue({
      id: "sb-1",
      publicIp: null,
      novncUrl: "https://novnc.example.com/vnc_lite.html?host=sb-1",
    });

    const result = await service.getVncUrl("task-1", "user-1");
    expect(result).toEqual({
      url: "https://novnc.example.com/vnc_lite.html?host=sb-1",
      readOnly: true,
      type: "novnc",
    });
  });

  it("readOnly=true for in_progress task", async () => {
    deps.taskRepo.findById.mockResolvedValue({
      id: "task-1",
      status: "in_progress",
      workflowRunId: "gh-job-1",
      sandboxId: "sb-1",
    });
    deps.ghJobRepo.findById.mockResolvedValue({
      id: "gh-job-1",
      metadata: { kasm_url: "https://10.0.0.1:6901" },
    });

    const result = await service.getVncUrl("task-1", "user-1");
    expect(result?.readOnly).toBe(true);
  });

  it("readOnly=false for waiting_human task (interactive Take Control)", async () => {
    deps.taskRepo.findById.mockResolvedValue({
      id: "task-1",
      status: "waiting_human",
      workflowRunId: "gh-job-1",
      sandboxId: "sb-1",
    });
    deps.ghJobRepo.findById.mockResolvedValue({
      id: "gh-job-1",
      metadata: { kasm_url: "https://10.0.0.1:6901" },
    });

    const result = await service.getVncUrl("task-1", "user-1");
    expect(result?.readOnly).toBe(false);
  });

  it("readOnly=true for completed task", async () => {
    deps.taskRepo.findById.mockResolvedValue({
      id: "task-1",
      status: "completed",
      workflowRunId: "gh-job-1",
      sandboxId: "sb-1",
    });
    deps.ghJobRepo.findById.mockResolvedValue({
      id: "gh-job-1",
      metadata: { kasm_url: "https://10.0.0.1:6901" },
    });

    const result = await service.getVncUrl("task-1", "user-1");
    expect(result?.readOnly).toBe(true);
  });

  it("returns null when no VNC source available", async () => {
    deps.taskRepo.findById.mockResolvedValue({
      id: "task-1",
      status: "in_progress",
      workflowRunId: null, // no GH job
      sandboxId: null, // no sandbox
    });

    const result = await service.getVncUrl("task-1", "user-1");
    expect(result).toBeNull();
  });

  it("throws TaskNotFoundError for missing task", async () => {
    deps.taskRepo.findById.mockResolvedValue(null);

    await expect(service.getVncUrl("nonexistent", "user-1")).rejects.toThrow(TaskNotFoundError);
  });
});
