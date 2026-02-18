/**
 * GhostHands HTTP Client Tests
 *
 * Tests the GhostHandsClient class that communicates with the GhostHands API.
 * Uses mocked global fetch to isolate HTTP behavior.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Minimal logger that satisfies FastifyBaseLogger shape
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

// We import after setting up mocks
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let GhostHandsClient: typeof import("../../src/modules/ghosthands/ghosthands.client.js").GhostHandsClient;

beforeEach(async () => {
  vi.restoreAllMocks();
  // Dynamic import to get fresh module
  const mod = await import("../../src/modules/ghosthands/ghosthands.client.js");
  GhostHandsClient = mod.GhostHandsClient;
});

afterEach(() => {
  vi.restoreAllMocks();
});

function createClient(overrides?: { url?: string; key?: string }) {
  return new GhostHandsClient({
    ghosthandsApiUrl: overrides?.url ?? "http://localhost:3100",
    ghosthandsServiceKey: overrides?.key ?? "test-service-secret",
    logger: mockLogger,
  });
}

function mockFetchResponse(status: number, body: unknown, ok?: boolean) {
  return vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
    ok: ok ?? (status >= 200 && status < 300),
    status,
    statusText: status === 200 ? "OK" : status === 201 ? "Created" : "Error",
    json: async () => body,
    text: async () => JSON.stringify(body),
    headers: new Headers(),
  } as Response);
}

describe("GhostHandsClient", () => {
  describe("submitApplication()", () => {
    it("sends correct headers and body format", async () => {
      const client = createClient();
      const fetchSpy = mockFetchResponse(201, {
        job_id: "gh-job-1",
        valet_task_id: "task-1",
        status: "queued",
        created_at: "2025-01-01T00:00:00Z",
      });

      const params = {
        valet_task_id: "task-1",
        valet_user_id: "user-1",
        target_url: "https://example.com/job",
        platform: "linkedin",
        resume: { storage_path: "resumes/test.pdf" },
        profile: { first_name: "John", last_name: "Doe", email: "john@test.com" },
        qa_answers: { "Are you authorized?": "Yes" },
        callback_url: "http://localhost:8000/api/v1/webhooks/ghosthands?token=secret",
      };

      await client.submitApplication(params);

      expect(fetchSpy).toHaveBeenCalledOnce();
      const [url, options] = fetchSpy.mock.calls[0]!;
      expect(url).toBe("http://localhost:3100/api/v1/gh/valet/apply");
      expect(options?.method).toBe("POST");
      expect(options?.headers).toEqual(
        expect.objectContaining({
          "Content-Type": "application/json",
          "X-GH-Service-Key": "test-service-secret",
        }),
      );
      const sentBody = JSON.parse(options?.body as string);
      expect(sentBody.valet_task_id).toBe("task-1");
      expect(sentBody.target_url).toBe("https://example.com/job");
      expect(sentBody.profile.first_name).toBe("John");
      expect(sentBody.qa_answers).toEqual({ "Are you authorized?": "Yes" });
    });

    it("handles 201 response correctly", async () => {
      const client = createClient();
      const responseBody = {
        job_id: "gh-job-123",
        valet_task_id: "task-1",
        status: "queued",
        created_at: "2025-01-01T00:00:00Z",
      };
      mockFetchResponse(201, responseBody);

      const result = await client.submitApplication({
        valet_task_id: "task-1",
        valet_user_id: "user-1",
        target_url: "https://example.com/job",
        platform: "linkedin",
        resume: { storage_path: "resumes/test.pdf" },
        profile: { first_name: "John", last_name: "Doe", email: "john@test.com" },
      });

      expect(result.job_id).toBe("gh-job-123");
      expect(result.valet_task_id).toBe("task-1");
      expect(result.status).toBe("queued");
    });

    it("handles 409 duplicate response (not an error)", async () => {
      const client = createClient();
      const duplicateBody = {
        job_id: "gh-job-existing",
        valet_task_id: "task-1",
        status: "queued",
        created_at: "2025-01-01T00:00:00Z",
        duplicate: true,
      };
      // 409 is not ok, but the client handles it specially
      mockFetchResponse(409, duplicateBody, false);

      const result = await client.submitApplication({
        valet_task_id: "task-1",
        valet_user_id: "user-1",
        target_url: "https://example.com/job",
        platform: "linkedin",
        resume: { storage_path: "resumes/test.pdf" },
        profile: { first_name: "John", last_name: "Doe", email: "john@test.com" },
      });

      expect(result.job_id).toBe("gh-job-existing");
      expect(result.duplicate).toBe(true);
    });

    it("throws on network error", async () => {
      const client = createClient();
      vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("Network unreachable"));

      await expect(
        client.submitApplication({
          valet_task_id: "task-1",
          valet_user_id: "user-1",
          target_url: "https://example.com/job",
          platform: "linkedin",
          resume: { storage_path: "resumes/test.pdf" },
          profile: { first_name: "John", last_name: "Doe", email: "john@test.com" },
        }),
      ).rejects.toThrow("Network unreachable");
    });
  });

  describe("cancelJob()", () => {
    it("sends POST to correct endpoint", async () => {
      const client = createClient();
      const fetchSpy = mockFetchResponse(200, {});

      await client.cancelJob("gh-job-1");

      expect(fetchSpy).toHaveBeenCalledOnce();
      const [url, options] = fetchSpy.mock.calls[0]!;
      expect(url).toBe("http://localhost:3100/api/v1/gh/jobs/gh-job-1/cancel");
      expect(options?.method).toBe("POST");
    });
  });

  describe("retryJob()", () => {
    it("sends POST to correct endpoint", async () => {
      const client = createClient();
      const fetchSpy = mockFetchResponse(200, {});

      await client.retryJob("gh-job-2");

      expect(fetchSpy).toHaveBeenCalledOnce();
      const [url, options] = fetchSpy.mock.calls[0]!;
      expect(url).toBe("http://localhost:3100/api/v1/gh/jobs/gh-job-2/retry");
      expect(options?.method).toBe("POST");
    });
  });

  describe("resumeJob()", () => {
    it("sends correct payload", async () => {
      const client = createClient();
      const fetchSpy = mockFetchResponse(200, {
        job_id: "gh-job-3",
        status: "running",
        message: "Resumed",
      });

      const result = await client.resumeJob("gh-job-3", {
        resolved_by: "human",
        notes: "User solved captcha",
      });

      expect(fetchSpy).toHaveBeenCalledOnce();
      const [url, options] = fetchSpy.mock.calls[0]!;
      expect(url).toBe("http://localhost:3100/api/v1/gh/valet/resume/gh-job-3");
      expect(options?.method).toBe("POST");
      const sentBody = JSON.parse(options?.body as string);
      expect(sentBody.resolved_by).toBe("human");
      expect(sentBody.notes).toBe("User solved captcha");
      expect(result.job_id).toBe("gh-job-3");
    });
  });

  describe("getJobStatus()", () => {
    it("returns parsed response", async () => {
      const client = createClient();
      const statusBody = {
        job_id: "gh-job-4",
        valet_task_id: "task-4",
        status: "completed",
        progress: 100,
        result: { confirmation_id: "CONF-123" },
        timestamps: {
          created_at: "2025-01-01T00:00:00Z",
          started_at: "2025-01-01T00:00:05Z",
          completed_at: "2025-01-01T00:01:00Z",
        },
      };
      mockFetchResponse(200, statusBody);

      const result = await client.getJobStatus("gh-job-4");

      expect(result.job_id).toBe("gh-job-4");
      expect(result.status).toBe("completed");
      expect(result.progress).toBe(100);
      expect(result.result?.confirmation_id).toBe("CONF-123");
      expect(result.timestamps.completed_at).toBe("2025-01-01T00:01:00Z");
    });
  });

  describe("All methods include X-GH-Service-Key header", () => {
    it("submitApplication includes service key", async () => {
      const client = createClient({ key: "my-secret-key" });
      const fetchSpy = mockFetchResponse(201, {
        job_id: "j1",
        valet_task_id: "t1",
        status: "queued",
        created_at: "",
      });

      await client.submitApplication({
        valet_task_id: "t1",
        valet_user_id: "u1",
        target_url: "https://example.com",
        platform: "linkedin",
        resume: { storage_path: "" },
        profile: { first_name: "", last_name: "", email: "" },
      });

      const headers = fetchSpy.mock.calls[0]![1]?.headers as Record<string, string>;
      expect(headers["X-GH-Service-Key"]).toBe("my-secret-key");
    });

    it("cancelJob includes service key", async () => {
      const client = createClient({ key: "my-secret-key" });
      const fetchSpy = mockFetchResponse(200, {});

      await client.cancelJob("j1");

      const headers = fetchSpy.mock.calls[0]![1]?.headers as Record<string, string>;
      expect(headers["X-GH-Service-Key"]).toBe("my-secret-key");
    });

    it("retryJob includes service key", async () => {
      const client = createClient({ key: "my-secret-key" });
      const fetchSpy = mockFetchResponse(200, {});

      await client.retryJob("j1");

      const headers = fetchSpy.mock.calls[0]![1]?.headers as Record<string, string>;
      expect(headers["X-GH-Service-Key"]).toBe("my-secret-key");
    });

    it("resumeJob includes service key", async () => {
      const client = createClient({ key: "my-secret-key" });
      const fetchSpy = mockFetchResponse(200, { job_id: "j1", status: "running" });

      await client.resumeJob("j1");

      const headers = fetchSpy.mock.calls[0]![1]?.headers as Record<string, string>;
      expect(headers["X-GH-Service-Key"]).toBe("my-secret-key");
    });

    it("getJobStatus includes service key", async () => {
      const client = createClient({ key: "my-secret-key" });
      const fetchSpy = mockFetchResponse(200, {
        job_id: "j1",
        valet_task_id: "t1",
        status: "running",
        timestamps: { created_at: "" },
      });

      await client.getJobStatus("j1");

      const headers = fetchSpy.mock.calls[0]![1]?.headers as Record<string, string>;
      expect(headers["X-GH-Service-Key"]).toBe("my-secret-key");
    });
  });
});
