import { afterEach, describe, expect, it, vi } from "vitest";
import { TaskService } from "../../src/modules/tasks/task.service.js";
import {
  fromGhUserDataToLocalProfile,
  LOCAL_WORKER_PROFILE_SCHEMA_VERSION,
  parseLocalWorkerProfileFromInputData,
} from "../../src/modules/local-workers/local-worker-contracts.js";

describe("local-worker-contracts", () => {
  it("maps legacy snake_case user_data into local worker profile", () => {
    const profile = fromGhUserDataToLocalProfile({
      first_name: "Jane",
      last_name: "Smith",
      email: "jane@example.com",
      phone: "555-0100",
      linkedin_url: "https://linkedin.com/in/jane",
      education: [
        {
          institution: "MIT",
          degree: "BS",
          field: "CS",
          graduation_year: 2024,
        },
      ],
      work_history: [
        {
          company: "Acme",
          title: "Engineer",
          start_date: "2024-01",
          description: "Shipping",
        },
      ],
    });

    expect(profile.firstName).toBe("Jane");
    expect(profile.lastName).toBe("Smith");
    expect(profile.linkedIn).toBe("https://linkedin.com/in/jane");
    expect(profile.education[0]?.school).toBe("MIT");
    expect(profile.experience[0]?.startDate).toBe("2024-01");
  });

  it("prefers canonical local_worker_profile when present", () => {
    const resolved = parseLocalWorkerProfileFromInputData({
      local_worker_profile: {
        firstName: "Canonical",
        lastName: "User",
        email: "canonical@example.com",
        phone: "",
        education: [],
        experience: [],
      },
      user_data: {
        first_name: "Legacy",
        last_name: "Ignored",
        email: "legacy@example.com",
      },
    });

    expect(resolved.source).toBe("canonical");
    expect(resolved.profile.firstName).toBe("Canonical");
  });

  it("throws when canonical local_worker_profile is invalid", () => {
    expect(() =>
      parseLocalWorkerProfileFromInputData({
        local_worker_profile: {
          firstName: "Broken",
          lastName: "Payload",
          email: "broken@example.com",
          phone: 1234,
          education: [],
          experience: [],
        },
      }),
    ).toThrow(/local_worker_profile invalid/i);
  });

  it("rejects unknown profile schema versions", () => {
    expect(() =>
      parseLocalWorkerProfileFromInputData({
        profile_schema_version: "local_worker_profile.v2",
        local_worker_profile: {
          firstName: "Future",
          lastName: "Schema",
          email: "future@example.com",
          phone: "",
          education: [],
          experience: [],
        },
      }),
    ).toThrow(/Unsupported local worker profile schema version/i);
  });

  it("rejects schema-versioned payloads that omit local_worker_profile", () => {
    expect(() =>
      parseLocalWorkerProfileFromInputData({
        profile_schema_version: LOCAL_WORKER_PROFILE_SCHEMA_VERSION,
        user_data: {
          first_name: "Legacy",
          last_name: "Only",
          email: "legacy@example.com",
        },
      }),
    ).toThrow(/requires local_worker_profile/i);
  });
});

describe("TaskService desktop queue payload", () => {
  const originalDispatchMode = process.env.TASK_DISPATCH_MODE;
  const originalCreditsFlag = process.env.FEATURE_CREDITS_ENFORCEMENT;

  afterEach(() => {
    process.env.TASK_DISPATCH_MODE = originalDispatchMode;
    process.env.FEATURE_CREDITS_ENFORCEMENT = originalCreditsFlag;
  });

  it("stores canonical profile + schema version + desktop resume ID on desktop tasks", async () => {
    process.env.TASK_DISPATCH_MODE = "queue";
    process.env.FEATURE_CREDITS_ENFORCEMENT = "false";

    const createJob = vi.fn().mockResolvedValue({
      id: "gh-job-1",
      status: "queued",
      metadata: {},
    });

    const service = new TaskService({
      taskRepo: {
        create: vi.fn().mockResolvedValue({
          id: "task-1",
          jobUrl: "https://boards.greenhouse.io/example/jobs/123",
          platform: "greenhouse",
          status: "created",
        }),
        updateWorkflowRunId: vi.fn(),
        updateStatus: vi.fn(),
        updateGhosthandsResult: vi.fn(),
      },
      resumeRepo: {
        findById: vi.fn().mockResolvedValue({
          fileKey: "resumes/test.pdf",
          parsedData: {
            fullName: "Jane Smith",
            email: "jane@example.com",
            phone: "555-0100",
            workHistory: [
              {
                company: "Acme",
                title: "Engineer",
                startDate: "2024-01",
                description: "Shipping",
              },
            ],
            education: [
              {
                school: "MIT",
                degree: "BS",
                fieldOfStudy: "CS",
                endDate: "2024",
              },
            ],
          },
        }),
      },
      qaBankRepo: {
        findByUserId: vi.fn().mockResolvedValue([]),
      },
      ghosthandsClient: {
        submitApplication: vi.fn(),
      },
      ghJobRepo: {
        createJob,
        updateStatus: vi.fn(),
      },
      ghJobEventRepo: {},
      ghSessionRepo: {},
      taskQueueService: {
        isAvailable: true,
        enqueueApplyJob: vi.fn().mockResolvedValue("pg-boss-job-1"),
      },
      redis: {
        get: vi
          .fn()
          .mockResolvedValue(JSON.stringify({ userId: "user-1", expiresAt: Date.now() + 60_000 })),
        publish: vi.fn(),
      },
      logger: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
      sandboxRepo: {
        resolveWorkerId: vi.fn().mockResolvedValue(undefined),
      },
      userSandboxRepo: {
        findByUserId: vi.fn().mockResolvedValue(null),
        findBestAvailableSandbox: vi.fn().mockResolvedValue(null),
        assign: vi.fn(),
      },
      atmFleetClient: {},
      submissionProofRepo: {},
      creditService: {
        getBalance: vi.fn().mockResolvedValue({ balance: 10 }),
      },
      userRepo: {
        findById: vi.fn().mockResolvedValue(null),
      },
      localWorkerBrokerService: {},
    } as any);

    await service.create(
      {
        jobUrl: "https://boards.greenhouse.io/example/jobs/123",
        mode: "copilot",
        resumeId: "resume-123",
        executionTarget: "desktop",
        desktopWorkerId: "desktop-worker-1",
      },
      "user-1",
      "admin",
    );

    expect(createJob).toHaveBeenCalledTimes(1);
    const call = createJob.mock.calls[0]?.[0] as { inputData: Record<string, unknown> };
    expect(call.inputData.profile_schema_version).toBe(LOCAL_WORKER_PROFILE_SCHEMA_VERSION);
    expect(call.inputData.desktop_resume_id).toBe("resume-123");
    expect(call.inputData.local_worker_profile).toMatchObject({
      firstName: "Jane",
      lastName: "Smith",
      email: "jane@example.com",
    });
    expect(call.inputData.user_data).toMatchObject({
      first_name: "Jane",
      last_name: "Smith",
      email: "jane@example.com",
    });
  });

  it("syncs the task to the terminal GH status when cancel loses the race", async () => {
    process.env.TASK_DISPATCH_MODE = "queue";
    process.env.FEATURE_CREDITS_ENFORCEMENT = "false";

    const taskRepo = {
      findById: vi.fn().mockResolvedValue({
        id: "task-1",
        status: "queued",
        workflowRunId: "gh-job-1",
      }),
      updateStatusGuarded: vi.fn().mockResolvedValue({
        id: "task-1",
        status: "completed",
      }),
    };
    const ghJobRepo = {
      updateStatusIfNotTerminal: vi.fn().mockResolvedValue(null),
      notifyCancel: vi.fn(),
      findById: vi.fn().mockResolvedValue({
        id: "gh-job-1",
        status: "completed",
      }),
    };
    const taskQueueService = {
      isAvailable: true,
      cancelJob: vi.fn(),
    };
    const ghosthandsClient = {
      cancelJob: vi.fn(),
    };

    const service = new TaskService({
      taskRepo,
      resumeRepo: {},
      qaBankRepo: {},
      ghosthandsClient,
      ghJobRepo,
      ghJobEventRepo: {},
      ghSessionRepo: {},
      taskQueueService,
      redis: {},
      logger: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
      sandboxRepo: {},
      userSandboxRepo: {},
      atmFleetClient: {},
      submissionProofRepo: {},
      creditService: {},
      userRepo: {},
      localWorkerBrokerService: {},
    } as any);

    await service.cancel("task-1", "user-1");

    expect(taskRepo.updateStatusGuarded).toHaveBeenCalledWith("task-1", "completed");
    expect(ghJobRepo.notifyCancel).not.toHaveBeenCalled();
    expect(taskQueueService.cancelJob).not.toHaveBeenCalled();
    expect(ghosthandsClient.cancelJob).not.toHaveBeenCalled();
  });
});
