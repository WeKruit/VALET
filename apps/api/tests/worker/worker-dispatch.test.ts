/**
 * Worker Dispatch Tests (WK-01 to WK-15)
 *
 * Tests the TaskService dispatch logic and its interaction with GhostHandsClient.
 * All external dependencies (repos, GH client, Redis) are mocked.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock dependencies ────────────────────────────────────────────────────────

const mockTaskRepo = {
  create: vi.fn(),
  findById: vi.fn(),
  findByWorkflowRunId: vi.fn(),
  updateStatus: vi.fn(),
  updateWorkflowRunId: vi.fn(),
  updateGhosthandsResult: vi.fn(),
  updateProgress: vi.fn(),
  cancel: vi.fn(),
  findAllForExport: vi.fn(),
  findMany: vi.fn(),
  findManyAdmin: vi.fn(),
  findByIdAdmin: vi.fn(),
  getStats: vi.fn(),
  updateExternalStatus: vi.fn(),
  findStuckJobs: vi.fn(),
  updateInteractionData: vi.fn(),
  clearInteractionData: vi.fn(),
  updateLlmUsage: vi.fn(),
};

const mockResumeRepo = {
  findById: vi.fn(),
};

const mockQaBankRepo = {
  findByUserId: vi.fn(),
};

const mockGhosthandsClient = {
  submitApplication: vi.fn(),
  submitGenericTask: vi.fn(),
  getJobStatus: vi.fn(),
  cancelJob: vi.fn(),
  retryJob: vi.fn(),
  resumeJob: vi.fn(),
  listSessions: vi.fn(),
  clearSession: vi.fn(),
  clearAllSessions: vi.fn(),
};

const mockGhJobRepo = {
  findById: vi.fn(),
  updateStatus: vi.fn(),
};

const mockGhSessionRepo = {
  findByUserId: vi.fn(),
  deleteByUserAndDomain: vi.fn(),
  deleteAllByUser: vi.fn(),
};

const mockRedis = {
  publish: vi.fn(),
} as any;

const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  fatal: vi.fn(),
  trace: vi.fn(),
  child: vi.fn().mockReturnThis(),
  silent: vi.fn(),
  level: "info",
} as any;

// ── Import and instantiate ───────────────────────────────────────────────────

// Mock the publishToUser function before importing TaskService
vi.mock("../../src/websocket/handler.js", () => ({
  publishToUser: vi.fn(),
}));

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let TaskService: typeof import("../../src/modules/tasks/task.service.js").TaskService;

beforeEach(async () => {
  vi.clearAllMocks();

  // Set up env vars
  process.env.GH_SERVICE_SECRET = "test-service-secret";
  process.env.API_URL = "http://localhost:8000";

  const mod = await import("../../src/modules/tasks/task.service.js");
  TaskService = mod.TaskService;
});

function createService() {
  return new TaskService({
    taskRepo: mockTaskRepo as any,
    resumeRepo: mockResumeRepo as any,
    qaBankRepo: mockQaBankRepo as any,
    ghosthandsClient: mockGhosthandsClient as any,
    ghJobRepo: mockGhJobRepo as any,
    ghSessionRepo: mockGhSessionRepo as any,
    redis: mockRedis,
    logger: mockLogger,
  });
}

describe("Worker Dispatch Tests", () => {
  // WK-01: Job dispatch sends correct payload to GH API
  describe("WK-01: Job dispatch sends correct payload to GH API", () => {
    it("sends POST to GH with valet_task_id, target_url, callback_url, profile", async () => {
      const service = createService();

      mockTaskRepo.create.mockResolvedValue({
        id: "task-1",
        userId: "user-1",
        jobUrl: "https://linkedin.com/jobs/123",
        platform: "linkedin",
        status: "created",
      });

      mockResumeRepo.findById.mockResolvedValue({
        id: "resume-1",
        fileKey: "resumes/test.pdf",
        parsedData: {
          fullName: "John Doe",
          email: "john@test.com",
          phone: "+1234567890",
          education: [{ school: "MIT", degree: "BS", fieldOfStudy: "CS", endDate: "2020" }],
          workHistory: [{ company: "Acme", title: "Engineer", startDate: "2020-01" }],
          skills: ["TypeScript", "React"],
        },
      });

      mockQaBankRepo.findByUserId.mockResolvedValue([]);

      mockGhosthandsClient.submitApplication.mockResolvedValue({
        job_id: "gh-job-1",
        valet_task_id: "task-1",
        status: "queued",
        created_at: "2025-01-01T00:00:00Z",
      });

      mockTaskRepo.updateWorkflowRunId.mockResolvedValue(undefined);
      mockTaskRepo.updateStatus.mockResolvedValue(undefined);

      await service.create(
        {
          jobUrl: "https://linkedin.com/jobs/123",
          mode: "autopilot",
          resumeId: "resume-1",
          notes: "Test application",
        },
        "user-1",
      );

      expect(mockGhosthandsClient.submitApplication).toHaveBeenCalledOnce();
      const callArgs = mockGhosthandsClient.submitApplication.mock.calls[0]![0];
      expect(callArgs.valet_task_id).toBe("task-1");
      expect(callArgs.target_url).toBe("https://linkedin.com/jobs/123");
      expect(callArgs.callback_url).toContain("/api/v1/webhooks/ghosthands");
      expect(callArgs.profile.first_name).toBe("John");
      expect(callArgs.profile.last_name).toBe("Doe");
      expect(callArgs.profile.email).toBe("john@test.com");
      expect(callArgs.resume.storage_path).toBe("resumes/test.pdf");
    });
  });

  // WK-02: Job dispatch stores workflowRunId on task
  describe("WK-02: Job dispatch stores workflowRunId on task", () => {
    it("updates task.workflowRunId to GH job ID after successful dispatch", async () => {
      const service = createService();

      mockTaskRepo.create.mockResolvedValue({
        id: "task-2",
        userId: "user-1",
        jobUrl: "https://example.com/job",
        platform: "unknown",
        status: "created",
      });
      mockResumeRepo.findById.mockResolvedValue({ id: "r1", fileKey: "key", parsedData: null });
      mockQaBankRepo.findByUserId.mockResolvedValue([]);
      mockGhosthandsClient.submitApplication.mockResolvedValue({
        job_id: "gh-workflow-run-99",
        valet_task_id: "task-2",
        status: "queued",
        created_at: "2025-01-01T00:00:00Z",
      });
      mockTaskRepo.updateWorkflowRunId.mockResolvedValue(undefined);
      mockTaskRepo.updateStatus.mockResolvedValue(undefined);

      await service.create(
        { jobUrl: "https://example.com/job", mode: "copilot", resumeId: "r1" },
        "user-1",
      );

      expect(mockTaskRepo.updateWorkflowRunId).toHaveBeenCalledWith("task-2", "gh-workflow-run-99");
    });
  });

  // WK-03: GH API unavailable marks task as failed
  describe("WK-03: GH API unavailable marks task as failed", () => {
    it("sets task status to failed with error GH_SUBMIT_FAILED", async () => {
      const service = createService();

      mockTaskRepo.create.mockResolvedValue({
        id: "task-3",
        userId: "user-1",
        jobUrl: "https://example.com/job",
        platform: "unknown",
        status: "created",
      });
      mockResumeRepo.findById.mockResolvedValue({ id: "r1", fileKey: "key", parsedData: null });
      mockQaBankRepo.findByUserId.mockResolvedValue([]);
      mockGhosthandsClient.submitApplication.mockRejectedValue(
        new Error("GhostHands API error: 503 Service Unavailable"),
      );

      await service.create(
        { jobUrl: "https://example.com/job", mode: "autopilot", resumeId: "r1" },
        "user-1",
      );

      expect(mockTaskRepo.updateStatus).toHaveBeenCalledWith("task-3", "failed");
      expect(mockTaskRepo.updateGhosthandsResult).toHaveBeenCalledWith(
        "task-3",
        expect.objectContaining({
          error: expect.objectContaining({ code: "GH_SUBMIT_FAILED" }),
        }),
      );
    });
  });

  // WK-10: Callback URL includes service token
  describe("WK-10: Callback URL includes service token", () => {
    it("URL ends with ?token=<GH_SERVICE_SECRET>", async () => {
      const service = createService();

      mockTaskRepo.create.mockResolvedValue({
        id: "task-10",
        userId: "user-1",
        jobUrl: "https://example.com/job",
        platform: "unknown",
        status: "created",
      });
      mockResumeRepo.findById.mockResolvedValue({ id: "r1", fileKey: "key", parsedData: null });
      mockQaBankRepo.findByUserId.mockResolvedValue([]);
      mockGhosthandsClient.submitApplication.mockResolvedValue({
        job_id: "gh-job-10",
        valet_task_id: "task-10",
        status: "queued",
        created_at: "2025-01-01T00:00:00Z",
      });
      mockTaskRepo.updateWorkflowRunId.mockResolvedValue(undefined);
      mockTaskRepo.updateStatus.mockResolvedValue(undefined);

      await service.create(
        { jobUrl: "https://example.com/job", mode: "autopilot", resumeId: "r1" },
        "user-1",
      );

      const callArgs = mockGhosthandsClient.submitApplication.mock.calls[0]![0];
      expect(callArgs.callback_url).toContain("?token=test-service-secret");
    });
  });

  // WK-11: Profile builder extracts resume fields
  describe("WK-11: Profile builder extracts resume fields", () => {
    it("returns first_name, last_name, email, education, work_history, skills", async () => {
      const service = createService();

      mockTaskRepo.create.mockResolvedValue({
        id: "task-11",
        userId: "user-1",
        jobUrl: "https://example.com/job",
        platform: "unknown",
        status: "created",
      });

      mockResumeRepo.findById.mockResolvedValue({
        id: "r1",
        fileKey: "resumes/test.pdf",
        parsedData: {
          fullName: "Jane Smith",
          email: "jane@test.com",
          phone: "+1555555",
          education: [{ school: "Stanford", degree: "MS", fieldOfStudy: "AI", endDate: "2022-06" }],
          workHistory: [
            {
              company: "Google",
              title: "SWE",
              startDate: "2022-07",
              endDate: "2024-01",
              description: "Built things",
            },
          ],
          skills: ["Python", "ML", "TensorFlow"],
          websites: ["https://linkedin.com/in/janesmith", "https://janesmith.dev"],
        },
      });

      mockQaBankRepo.findByUserId.mockResolvedValue([]);
      mockGhosthandsClient.submitApplication.mockResolvedValue({
        job_id: "gh-job-11",
        valet_task_id: "task-11",
        status: "queued",
        created_at: "2025-01-01T00:00:00Z",
      });
      mockTaskRepo.updateWorkflowRunId.mockResolvedValue(undefined);
      mockTaskRepo.updateStatus.mockResolvedValue(undefined);

      await service.create(
        { jobUrl: "https://example.com/job", mode: "autopilot", resumeId: "r1" },
        "user-1",
      );

      const callArgs = mockGhosthandsClient.submitApplication.mock.calls[0]![0];
      const profile = callArgs.profile;

      expect(profile.first_name).toBe("Jane");
      expect(profile.last_name).toBe("Smith");
      expect(profile.email).toBe("jane@test.com");
      expect(profile.education).toHaveLength(1);
      expect(profile.education[0].institution).toBe("Stanford");
      expect(profile.education[0].degree).toBe("MS");
      expect(profile.education[0].field).toBe("AI");
      expect(profile.work_history).toHaveLength(1);
      expect(profile.work_history[0].company).toBe("Google");
      expect(profile.work_history[0].title).toBe("SWE");
      expect(profile.skills).toEqual(["Python", "ML", "TensorFlow"]);
      expect(profile.linkedin_url).toBe("https://linkedin.com/in/janesmith");
      expect(profile.portfolio_url).toBe("https://janesmith.dev");
    });
  });

  // WK-12: Profile builder handles null parsed data
  describe("WK-12: Profile builder handles null parsed data", () => {
    it("returns empty strings when parsedData is null", async () => {
      const service = createService();

      mockTaskRepo.create.mockResolvedValue({
        id: "task-12",
        userId: "user-1",
        jobUrl: "https://example.com/job",
        platform: "unknown",
        status: "created",
      });

      mockResumeRepo.findById.mockResolvedValue({
        id: "r1",
        fileKey: "resumes/test.pdf",
        parsedData: null,
      });

      mockQaBankRepo.findByUserId.mockResolvedValue([]);
      mockGhosthandsClient.submitApplication.mockResolvedValue({
        job_id: "gh-job-12",
        valet_task_id: "task-12",
        status: "queued",
        created_at: "2025-01-01T00:00:00Z",
      });
      mockTaskRepo.updateWorkflowRunId.mockResolvedValue(undefined);
      mockTaskRepo.updateStatus.mockResolvedValue(undefined);

      await service.create(
        { jobUrl: "https://example.com/job", mode: "autopilot", resumeId: "r1" },
        "user-1",
      );

      const callArgs = mockGhosthandsClient.submitApplication.mock.calls[0]![0];
      const profile = callArgs.profile;

      expect(profile.first_name).toBe("");
      expect(profile.last_name).toBe("");
      expect(profile.email).toBe("");
    });
  });

  // WK-13: QA bank answers included in dispatch
  describe("WK-13: QA bank answers included in dispatch", () => {
    it("qa_answers field populated in GH request", async () => {
      const service = createService();

      mockTaskRepo.create.mockResolvedValue({
        id: "task-13",
        userId: "user-1",
        jobUrl: "https://example.com/job",
        platform: "unknown",
        status: "created",
      });

      mockResumeRepo.findById.mockResolvedValue({ id: "r1", fileKey: "key", parsedData: null });

      mockQaBankRepo.findByUserId.mockResolvedValue([
        { question: "Are you authorized to work?", answer: "Yes", usageMode: "always_use" },
        { question: "Expected salary?", answer: "$120k", usageMode: "always_use" },
        { question: "Willing to relocate?", answer: "No", usageMode: "ask_each_time" },
      ]);

      mockGhosthandsClient.submitApplication.mockResolvedValue({
        job_id: "gh-job-13",
        valet_task_id: "task-13",
        status: "queued",
        created_at: "2025-01-01T00:00:00Z",
      });
      mockTaskRepo.updateWorkflowRunId.mockResolvedValue(undefined);
      mockTaskRepo.updateStatus.mockResolvedValue(undefined);

      await service.create(
        { jobUrl: "https://example.com/job", mode: "autopilot", resumeId: "r1" },
        "user-1",
      );

      const callArgs = mockGhosthandsClient.submitApplication.mock.calls[0]![0];
      // Only "always_use" entries should be included
      expect(callArgs.qa_answers).toEqual({
        "Are you authorized to work?": "Yes",
        "Expected salary?": "$120k",
      });
      // "ask_each_time" should NOT be included
      expect(callArgs.qa_answers["Willing to relocate?"]).toBeUndefined();
    });
  });

  // WK-14: Retry calls ghosthandsClient.retryJob()
  describe("WK-14: Retry calls ghosthandsClient.retryJob()", () => {
    it("GH retryJob called with correct job ID", async () => {
      const service = createService();

      mockTaskRepo.findById.mockResolvedValue({
        id: "task-14",
        userId: "user-1",
        status: "failed",
        workflowRunId: "gh-job-14",
      });

      mockGhosthandsClient.retryJob.mockResolvedValue(undefined);
      mockTaskRepo.updateStatus.mockResolvedValue(undefined);
      mockTaskRepo.updateProgress.mockResolvedValue(undefined);

      // Return updated task on second findById call
      mockTaskRepo.findById.mockResolvedValueOnce({
        id: "task-14",
        userId: "user-1",
        status: "failed",
        workflowRunId: "gh-job-14",
      });
      mockTaskRepo.findById.mockResolvedValueOnce({
        id: "task-14",
        userId: "user-1",
        status: "queued",
        workflowRunId: "gh-job-14",
      });

      await service.retry("task-14", "user-1");

      expect(mockGhosthandsClient.retryJob).toHaveBeenCalledWith("gh-job-14");
    });
  });

  // WK-15: Cancel calls ghosthandsClient.cancelJob()
  describe("WK-15: Cancel calls ghosthandsClient.cancelJob()", () => {
    it("GH cancelJob called with correct job ID", async () => {
      const service = createService();

      mockTaskRepo.findById.mockResolvedValue({
        id: "task-15",
        userId: "user-1",
        status: "in_progress",
        workflowRunId: "gh-job-15",
      });

      mockTaskRepo.cancel.mockResolvedValue(undefined);
      mockGhosthandsClient.cancelJob.mockResolvedValue(undefined);

      await service.cancel("task-15", "user-1");

      expect(mockGhosthandsClient.cancelJob).toHaveBeenCalledWith("gh-job-15");
    });

    it("logs warning but proceeds when cancelJob errors", async () => {
      const service = createService();

      mockTaskRepo.findById.mockResolvedValue({
        id: "task-15b",
        userId: "user-1",
        status: "in_progress",
        workflowRunId: "gh-job-15b",
      });

      mockTaskRepo.cancel.mockResolvedValue(undefined);
      mockGhosthandsClient.cancelJob.mockRejectedValue(new Error("GH unreachable"));

      // Should not throw even when cancelJob fails
      await expect(service.cancel("task-15b", "user-1")).resolves.not.toThrow();

      expect(mockGhosthandsClient.cancelJob).toHaveBeenCalledWith("gh-job-15b");
      expect(mockLogger.warn).toHaveBeenCalled();
    });
  });
});
