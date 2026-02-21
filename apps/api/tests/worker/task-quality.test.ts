import { describe, it, expect, vi } from "vitest";
import { TaskService } from "../../src/modules/tasks/task.service.js";

function makeMocks() {
  const submitArgs: unknown[] = [];
  return {
    submitArgs,
    taskRepo: {
      create: vi
        .fn()
        .mockResolvedValue({
          id: "task-1",
          jobUrl: "https://example.com",
          platform: "unknown",
          status: "created",
        }),
      updateWorkflowRunId: vi.fn(),
      updateStatus: vi.fn(),
      updateGhosthandsResult: vi.fn(),
    },
    resumeRepo: {
      findById: vi
        .fn()
        .mockResolvedValue({
          fileKey: "resumes/test.pdf",
          parsedData: { fullName: "Test User", email: "test@test.com" },
        }),
    },
    qaBankRepo: {
      findByUserId: vi.fn().mockResolvedValue([]),
    },
    ghosthandsClient: {
      submitApplication: vi.fn().mockImplementation((params: unknown) => {
        submitArgs.push(params);
        return Promise.resolve({
          job_id: "gh-job-1",
          valet_task_id: "task-1",
          status: "queued",
          created_at: new Date().toISOString(),
        });
      }),
    },
    ghJobRepo: {},
    ghSessionRepo: {},
    redis: { publish: vi.fn() },
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  };
}

describe("TaskService.create quality passthrough", () => {
  it("passes explicit quality=balanced to GhostHands", async () => {
    const mocks = makeMocks();
    const service = new TaskService(mocks as any);

    await service.create(
      {
        jobUrl: "https://example.com/job",
        mode: "autopilot",
        resumeId: "resume-1",
        quality: "balanced",
      },
      "user-1",
    );

    expect(mocks.submitArgs).toHaveLength(1);
    expect((mocks.submitArgs[0] as any).quality).toBe("balanced");
  });

  it("passes explicit quality=quality even in autopilot mode", async () => {
    const mocks = makeMocks();
    const service = new TaskService(mocks as any);

    await service.create(
      {
        jobUrl: "https://example.com/job",
        mode: "autopilot",
        resumeId: "resume-1",
        quality: "quality",
      },
      "user-1",
    );

    expect((mocks.submitArgs[0] as any).quality).toBe("quality");
  });

  it("defaults to speed for autopilot when no quality specified", async () => {
    const mocks = makeMocks();
    const service = new TaskService(mocks as any);

    await service.create(
      { jobUrl: "https://example.com/job", mode: "autopilot", resumeId: "resume-1" },
      "user-1",
    );

    expect((mocks.submitArgs[0] as any).quality).toBe("speed");
  });

  it("defaults to quality for copilot when no quality specified", async () => {
    const mocks = makeMocks();
    const service = new TaskService(mocks as any);

    await service.create(
      { jobUrl: "https://example.com/job", mode: "copilot", resumeId: "resume-1" },
      "user-1",
    );

    expect((mocks.submitArgs[0] as any).quality).toBe("quality");
  });
});
