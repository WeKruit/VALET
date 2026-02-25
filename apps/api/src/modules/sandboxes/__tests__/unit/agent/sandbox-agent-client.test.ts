import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SandboxAgentClient, AgentError } from "../../../agent/sandbox-agent.client.js";

const AGENT_URL = "http://10.0.0.1:8000";
const DEPLOY_SECRET = "test-deploy-secret";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function textResponse(body: string, status: number): Response {
  return new Response(body, { status });
}

describe("SandboxAgentClient", () => {
  let client: SandboxAgentClient;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    client = new SandboxAgentClient(DEPLOY_SECRET);
    mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function expectAuthHeaders() {
    const call = mockFetch.mock.calls[0];
    const options = call?.[1] as globalThis.RequestInit | undefined;
    const headers = options?.headers as Record<string, string>;
    expect(headers?.["Content-Type"]).toBe("application/json");
    expect(headers?.["X-Deploy-Secret"]).toBe(DEPLOY_SECRET);
  }

  // -- deploy -----------------------------------------------------------------

  describe("deploy", () => {
    it("sends POST /deploy with image_tag and returns result", async () => {
      const result = { success: true, message: "Deployed", imageTag: "v1.0.0" };
      mockFetch.mockResolvedValueOnce(jsonResponse(result));

      const res = await client.deploy(AGENT_URL, "v1.0.0");

      expect(res).toEqual(result);
      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, opts] = mockFetch.mock.calls[0]!;
      expect(url).toBe(`${AGENT_URL}/deploy`);
      expect(opts.method).toBe("POST");
      expect(JSON.parse(opts.body as string)).toEqual({ image_tag: "v1.0.0" });
      expectAuthHeaders();
    });

    it("throws AgentError on non-OK response", async () => {
      mockFetch.mockResolvedValueOnce(textResponse("bad request", 400));

      const err = await client.deploy(AGENT_URL, "v1.0.0").catch((e: unknown) => e);
      expect(err).toBeInstanceOf(AgentError);
      expect((err as AgentError).statusCode).toBe(400);
      expect((err as AgentError).message).toMatch(/400/);
    });
  });

  // -- drain ------------------------------------------------------------------

  describe("drain", () => {
    it("sends POST /drain with optional workerId", async () => {
      const result = { success: true, drainedWorkers: 2, message: "Drained" };
      mockFetch.mockResolvedValueOnce(jsonResponse(result));

      const res = await client.drain(AGENT_URL, "worker-1");

      expect(res).toEqual(result);
      const [url, opts] = mockFetch.mock.calls[0]!;
      expect(url).toBe(`${AGENT_URL}/drain`);
      expect(JSON.parse(opts.body as string)).toEqual({ worker_id: "worker-1" });
    });

    it("sends POST /drain without workerId", async () => {
      const result = { success: true, drainedWorkers: 1, message: "Drained" };
      mockFetch.mockResolvedValueOnce(jsonResponse(result));

      await client.drain(AGENT_URL);

      const [, opts] = mockFetch.mock.calls[0]!;
      expect(JSON.parse(opts.body as string)).toEqual({ worker_id: undefined });
    });
  });

  // -- getHealth --------------------------------------------------------------

  describe("getHealth", () => {
    it("sends GET /health and returns response", async () => {
      const health = {
        status: "ok",
        activeWorkers: 2,
        deploySafe: true,
        apiHealthy: true,
        workerStatus: "running",
        currentDeploy: null,
        uptimeMs: 3600000,
      };
      mockFetch.mockResolvedValueOnce(jsonResponse(health));

      const res = await client.getHealth(AGENT_URL);

      expect(res).toEqual(health);
      const [url, opts] = mockFetch.mock.calls[0]!;
      expect(url).toBe(`${AGENT_URL}/health`);
      expect(opts.method).toBeUndefined(); // GET is default
    });

    it("throws AgentError on server error", async () => {
      mockFetch.mockResolvedValueOnce(textResponse("internal error", 500));

      await expect(client.getHealth(AGENT_URL)).rejects.toThrow(AgentError);
    });
  });

  // -- getVersion -------------------------------------------------------------

  describe("getVersion", () => {
    it("sends GET /version and returns response", async () => {
      const version = {
        agentVersion: "1.0.0",
        ghosthandsVersion: "2.0.0",
        dockerVersion: "24.0.7",
        os: "linux",
        arch: "x64",
      };
      mockFetch.mockResolvedValueOnce(jsonResponse(version));

      const res = await client.getVersion(AGENT_URL);

      expect(res).toEqual(version);
      const [url] = mockFetch.mock.calls[0]!;
      expect(url).toBe(`${AGENT_URL}/version`);
    });
  });

  // -- getContainers ----------------------------------------------------------

  describe("getContainers", () => {
    it("sends GET /containers and returns list", async () => {
      const containers = [
        {
          id: "abc123",
          name: "gh-worker",
          image: "gh:latest",
          status: "Up 3 hours",
          state: "running",
          ports: ["3100:3100"],
          createdAt: "2026-02-18T00:00:00Z",
          labels: {},
        },
      ];
      mockFetch.mockResolvedValueOnce(jsonResponse(containers));

      const res = await client.getContainers(AGENT_URL);

      expect(res).toEqual(containers);
    });

    it("returns empty array on 404", async () => {
      mockFetch.mockResolvedValueOnce(textResponse("not found", 404));

      const res = await client.getContainers(AGENT_URL);

      expect(res).toEqual([]);
    });

    it("throws AgentError on 500", async () => {
      mockFetch.mockResolvedValueOnce(textResponse("server error", 500));

      await expect(client.getContainers(AGENT_URL)).rejects.toThrow(AgentError);
    });
  });

  // -- getWorkers -------------------------------------------------------------

  describe("getWorkers", () => {
    it("sends GET /workers and returns list", async () => {
      const workers = [
        {
          workerId: "w-1",
          containerId: "abc",
          containerName: "gh-worker-1",
          status: "idle",
          activeJobs: 0,
          statusPort: 3101,
          uptime: 3600,
          image: "gh:latest",
        },
      ];
      mockFetch.mockResolvedValueOnce(jsonResponse(workers));

      const res = await client.getWorkers(AGENT_URL);

      expect(res).toEqual(workers);
    });

    it("returns empty array on 404", async () => {
      mockFetch.mockResolvedValueOnce(textResponse("not found", 404));

      const res = await client.getWorkers(AGENT_URL);

      expect(res).toEqual([]);
    });

    it("throws AgentError on 500", async () => {
      mockFetch.mockResolvedValueOnce(textResponse("server error", 500));

      await expect(client.getWorkers(AGENT_URL)).rejects.toThrow(AgentError);
    });
  });

  // -- getMetrics -------------------------------------------------------------

  describe("getMetrics", () => {
    it("sends GET /metrics and returns response", async () => {
      const metrics = {
        cpu: { usagePercent: 45, cores: 4 },
        memory: { usedMb: 2048, totalMb: 8192, usagePercent: 25 },
        disk: { usedGb: 20, totalGb: 100, usagePercent: 20 },
        network: { rxBytesPerSec: 1000, txBytesPerSec: 500 },
      };
      mockFetch.mockResolvedValueOnce(jsonResponse(metrics));

      const res = await client.getMetrics(AGENT_URL);

      expect(res).toEqual(metrics);
    });

    it("returns null on 404", async () => {
      mockFetch.mockResolvedValueOnce(textResponse("not found", 404));

      const res = await client.getMetrics(AGENT_URL);

      expect(res).toBeNull();
    });

    it("throws AgentError on 500", async () => {
      mockFetch.mockResolvedValueOnce(textResponse("server error", 500));

      await expect(client.getMetrics(AGENT_URL)).rejects.toThrow(AgentError);
    });
  });

  // -- Phase 2 stubs ----------------------------------------------------------

  describe("Phase 2 stubs", () => {
    it("getLogs throws not implemented", async () => {
      await expect(client.getLogs(AGENT_URL, {})).rejects.toThrow("not implemented yet");
    });

    it("createLogStream throws not implemented", () => {
      expect(() => client.createLogStream(AGENT_URL, {})).toThrow("not implemented yet");
    });

    it("getEnvVars throws not implemented", async () => {
      await expect(client.getEnvVars(AGENT_URL)).rejects.toThrow("not implemented yet");
    });

    it("setEnvVars throws not implemented", async () => {
      await expect(client.setEnvVars(AGENT_URL, { FOO: "bar" })).rejects.toThrow(
        "not implemented yet",
      );
    });

    it("deleteEnvVar throws not implemented", async () => {
      await expect(client.deleteEnvVar(AGENT_URL, "FOO")).rejects.toThrow("not implemented yet");
    });

    it("executeCommand throws not implemented", async () => {
      await expect(client.executeCommand(AGENT_URL, "ls")).rejects.toThrow("not implemented yet");
    });

    it("getScreenshot throws not implemented", async () => {
      await expect(client.getScreenshot(AGENT_URL)).rejects.toThrow("not implemented yet");
    });

    it("buildImage throws not implemented", async () => {
      await expect(client.buildImage(AGENT_URL)).rejects.toThrow("not implemented yet");
    });
  });

  // -- ATM: getAtmDeployHistory ------------------------------------------------

  describe("getAtmDeployHistory", () => {
    const deployRecord = {
      id: "deploy-1",
      imageTag: "v2.0.0",
      previousImageTag: "v1.0.0",
      commitSha: "abc123",
      status: "completed",
      startedAt: "2026-02-24T00:00:00Z",
      completedAt: "2026-02-24T00:05:00Z",
      durationMs: 300000,
      error: null,
      triggeredBy: "ci",
    };

    it("sends GET /deploys and returns deploy records", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse([deployRecord]));

      const res = await client.getAtmDeployHistory(AGENT_URL);

      expect(res).toEqual([deployRecord]);
      const [url] = mockFetch.mock.calls[0]!;
      expect(url).toBe(`${AGENT_URL}/deploys`);
      expectAuthHeaders();
    });

    it("sends GET /deploys?limit=5 when limit is provided", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse([deployRecord]));

      await client.getAtmDeployHistory(AGENT_URL, 5);

      const [url] = mockFetch.mock.calls[0]!;
      expect(url).toBe(`${AGENT_URL}/deploys?limit=5`);
    });

    it("returns empty array on 404 (backward compat)", async () => {
      mockFetch.mockResolvedValueOnce(textResponse("not found", 404));

      const res = await client.getAtmDeployHistory(AGENT_URL);

      expect(res).toEqual([]);
    });

    it("returns empty array on 502 (backward compat)", async () => {
      mockFetch.mockResolvedValueOnce(textResponse("bad gateway", 502));

      const res = await client.getAtmDeployHistory(AGENT_URL);

      expect(res).toEqual([]);
    });

    it("throws AgentError on 500", async () => {
      mockFetch.mockResolvedValueOnce(textResponse("server error", 500));

      await expect(client.getAtmDeployHistory(AGENT_URL)).rejects.toThrow(AgentError);
    });
  });

  // -- ATM: getAtmDeployRecord ------------------------------------------------

  describe("getAtmDeployRecord", () => {
    const deployRecord = {
      id: "deploy-1",
      imageTag: "v2.0.0",
      previousImageTag: null,
      commitSha: null,
      status: "completed",
      startedAt: "2026-02-24T00:00:00Z",
      completedAt: "2026-02-24T00:03:00Z",
      durationMs: 180000,
      error: null,
      triggeredBy: "manual",
    };

    it("sends GET /deploys/:id and returns deploy record", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(deployRecord));

      const res = await client.getAtmDeployRecord(AGENT_URL, "deploy-1");

      expect(res).toEqual(deployRecord);
      const [url] = mockFetch.mock.calls[0]!;
      expect(url).toBe(`${AGENT_URL}/deploys/deploy-1`);
    });

    it("returns null on 404 (backward compat)", async () => {
      mockFetch.mockResolvedValueOnce(textResponse("not found", 404));

      const res = await client.getAtmDeployRecord(AGENT_URL, "deploy-1");

      expect(res).toBeNull();
    });

    it("returns null on 502 (backward compat)", async () => {
      mockFetch.mockResolvedValueOnce(textResponse("bad gateway", 502));

      const res = await client.getAtmDeployRecord(AGENT_URL, "deploy-1");

      expect(res).toBeNull();
    });

    it("throws AgentError on 500", async () => {
      mockFetch.mockResolvedValueOnce(textResponse("server error", 500));

      await expect(client.getAtmDeployRecord(AGENT_URL, "deploy-1")).rejects.toThrow(AgentError);
    });
  });

  // -- ATM: atmRollback -------------------------------------------------------

  describe("atmRollback", () => {
    it("sends POST /rollback and returns result", async () => {
      const result = { success: true, message: "Rolled back", rollbackImageTag: "v1.0.0" };
      mockFetch.mockResolvedValueOnce(jsonResponse(result));

      const res = await client.atmRollback(AGENT_URL);

      expect(res).toEqual(result);
      const [url, opts] = mockFetch.mock.calls[0]!;
      expect(url).toBe(`${AGENT_URL}/rollback`);
      expect(opts.method).toBe("POST");
    });

    it("throws AgentError on failure (no 404 swallow for POST)", async () => {
      mockFetch.mockResolvedValueOnce(textResponse("not found", 404));

      await expect(client.atmRollback(AGENT_URL)).rejects.toThrow(AgentError);
    });
  });

  // -- ATM: getKamalStatus ----------------------------------------------------

  describe("getKamalStatus", () => {
    it("sends GET /kamal/status and returns result", async () => {
      const status = { available: true, locked: false };
      mockFetch.mockResolvedValueOnce(jsonResponse(status));

      const res = await client.getKamalStatus(AGENT_URL);

      expect(res).toEqual(status);
      const [url] = mockFetch.mock.calls[0]!;
      expect(url).toBe(`${AGENT_URL}/kamal/status`);
    });

    it("returns null on 404 (backward compat)", async () => {
      mockFetch.mockResolvedValueOnce(textResponse("not found", 404));

      const res = await client.getKamalStatus(AGENT_URL);

      expect(res).toBeNull();
    });

    it("returns null on 502 (backward compat)", async () => {
      mockFetch.mockResolvedValueOnce(textResponse("bad gateway", 502));

      const res = await client.getKamalStatus(AGENT_URL);

      expect(res).toBeNull();
    });

    it("throws AgentError on 500", async () => {
      mockFetch.mockResolvedValueOnce(textResponse("server error", 500));

      await expect(client.getKamalStatus(AGENT_URL)).rejects.toThrow(AgentError);
    });
  });

  // -- ATM: getKamalAudit -----------------------------------------------------

  describe("getKamalAudit", () => {
    const auditEntry = {
      timestamp: "2026-02-24T00:00:00Z",
      action: "deploy",
      performer: "ci",
      details: "Deployed v2.0.0",
    };

    it("sends GET /kamal/audit and returns entries", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse([auditEntry]));

      const res = await client.getKamalAudit(AGENT_URL);

      expect(res).toEqual([auditEntry]);
      const [url] = mockFetch.mock.calls[0]!;
      expect(url).toBe(`${AGENT_URL}/kamal/audit`);
    });

    it("returns empty array on 404 (backward compat)", async () => {
      mockFetch.mockResolvedValueOnce(textResponse("not found", 404));

      const res = await client.getKamalAudit(AGENT_URL);

      expect(res).toEqual([]);
    });

    it("returns empty array on 502 (backward compat)", async () => {
      mockFetch.mockResolvedValueOnce(textResponse("bad gateway", 502));

      const res = await client.getKamalAudit(AGENT_URL);

      expect(res).toEqual([]);
    });

    it("throws AgentError on 500", async () => {
      mockFetch.mockResolvedValueOnce(textResponse("server error", 500));

      await expect(client.getKamalAudit(AGENT_URL)).rejects.toThrow(AgentError);
    });
  });

  // -- ATM: kamalDeploy -------------------------------------------------------

  describe("kamalDeploy", () => {
    const result = { exitCode: 0, stdout: "Deployed", stderr: "", durationMs: 5000 };

    it("sends POST /deploy/kamal with options", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(result));

      const res = await client.kamalDeploy(AGENT_URL, { destination: "prod", version: "v2.0.0" });

      expect(res).toEqual(result);
      const [url, opts] = mockFetch.mock.calls[0]!;
      expect(url).toBe(`${AGENT_URL}/deploy/kamal`);
      expect(opts.method).toBe("POST");
      expect(JSON.parse(opts.body as string)).toEqual({ destination: "prod", version: "v2.0.0" });
    });

    it("sends POST /deploy/kamal with empty body when no options", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(result));

      await client.kamalDeploy(AGENT_URL);

      const [, opts] = mockFetch.mock.calls[0]!;
      expect(JSON.parse(opts.body as string)).toEqual({});
    });

    it("throws AgentError on failure", async () => {
      mockFetch.mockResolvedValueOnce(textResponse("server error", 500));

      await expect(client.kamalDeploy(AGENT_URL)).rejects.toThrow(AgentError);
    });
  });

  // -- ATM: kamalRollback -----------------------------------------------------

  describe("kamalRollback", () => {
    const result = { exitCode: 0, stdout: "Rolled back", stderr: "", durationMs: 3000 };

    it("sends POST /rollback/kamal with options", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(result));

      const res = await client.kamalRollback(AGENT_URL, { version: "v1.0.0" });

      expect(res).toEqual(result);
      const [url, opts] = mockFetch.mock.calls[0]!;
      expect(url).toBe(`${AGENT_URL}/rollback/kamal`);
      expect(opts.method).toBe("POST");
      expect(JSON.parse(opts.body as string)).toEqual({ version: "v1.0.0" });
    });

    it("throws AgentError on failure", async () => {
      mockFetch.mockResolvedValueOnce(textResponse("server error", 500));

      await expect(client.kamalRollback(AGENT_URL, { version: "v1.0.0" })).rejects.toThrow(
        AgentError,
      );
    });
  });

  // -- ATM: getSecretsStatus --------------------------------------------------

  describe("getSecretsStatus", () => {
    it("sends GET /secrets/status and returns result", async () => {
      const status = {
        connected: true,
        projectId: "proj-1",
        environment: "staging",
        secretCount: 12,
      };
      mockFetch.mockResolvedValueOnce(jsonResponse(status));

      const res = await client.getSecretsStatus(AGENT_URL);

      expect(res).toEqual(status);
      const [url] = mockFetch.mock.calls[0]!;
      expect(url).toBe(`${AGENT_URL}/secrets/status`);
    });

    it("returns null on 404 (backward compat)", async () => {
      mockFetch.mockResolvedValueOnce(textResponse("not found", 404));

      const res = await client.getSecretsStatus(AGENT_URL);

      expect(res).toBeNull();
    });

    it("returns null on 502 (backward compat)", async () => {
      mockFetch.mockResolvedValueOnce(textResponse("bad gateway", 502));

      const res = await client.getSecretsStatus(AGENT_URL);

      expect(res).toBeNull();
    });

    it("throws AgentError on 500", async () => {
      mockFetch.mockResolvedValueOnce(textResponse("server error", 500));

      await expect(client.getSecretsStatus(AGENT_URL)).rejects.toThrow(AgentError);
    });
  });

  // -- ATM: isAtmEnabled ------------------------------------------------------

  describe("isAtmEnabled", () => {
    it("returns true when /deploys responds OK", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse([]));

      const res = await client.isAtmEnabled(AGENT_URL);

      expect(res).toBe(true);
      const [url] = mockFetch.mock.calls[0]!;
      expect(url).toBe(`${AGENT_URL}/deploys?limit=1`);
    });

    it("returns false on 404 (legacy deploy-server)", async () => {
      mockFetch.mockResolvedValueOnce(textResponse("not found", 404));

      const res = await client.isAtmEnabled(AGENT_URL);

      expect(res).toBe(false);
    });

    it("returns false on network error", async () => {
      mockFetch.mockRejectedValueOnce(new Error("ECONNREFUSED"));

      const res = await client.isAtmEnabled(AGENT_URL);

      expect(res).toBe(false);
    });
  });

  // -- AgentError -------------------------------------------------------------

  describe("AgentError", () => {
    it("includes status code and response body", () => {
      const err = new AgentError(502, "Bad Gateway");
      expect(err.statusCode).toBe(502);
      expect(err.responseBody).toBe("Bad Gateway");
      expect(err.message).toBe("Agent 502: Bad Gateway");
      expect(err.name).toBe("AgentError");
    });
  });
});
