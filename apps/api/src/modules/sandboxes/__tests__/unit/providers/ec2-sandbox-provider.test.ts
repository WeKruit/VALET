import { describe, it, expect, vi, beforeEach } from "vitest";
import { Ec2SandboxProvider } from "../../../providers/ec2-sandbox.provider.js";
import type { EC2Service } from "../../../ec2.service.js";
import type { SandboxRecord } from "../../../sandbox.repository.js";

function makeMockEc2Service() {
  return {
    startInstance: vi.fn<(instanceId: string) => Promise<void>>().mockResolvedValue(undefined),
    stopInstance: vi.fn<(instanceId: string) => Promise<void>>().mockResolvedValue(undefined),
    getInstanceStatus: vi
      .fn<(instanceId: string) => Promise<string>>()
      .mockResolvedValue("running"),
    waitForStatus: vi
      .fn<(instanceId: string, target: string) => Promise<string>>()
      .mockResolvedValue("running"),
  };
}

const SANDBOX_FIXTURE: SandboxRecord = {
  id: "11111111-1111-1111-1111-111111111111",
  name: "test-sandbox",
  environment: "staging",
  instanceId: "i-0123456789abcdef0",
  instanceType: "t3.medium",
  publicIp: "34.197.248.80",
  privateIp: "10.0.1.100",
  status: "active",
  healthStatus: "healthy",
  lastHealthCheckAt: new Date(),
  capacity: 5,
  currentLoad: 0,
  sshKeyName: null,
  novncUrl: null,
  adspowerVersion: null,
  browserEngine: "adspower",
  browserConfig: null,
  tags: null,
  ec2Status: "running",
  lastStartedAt: null,
  lastStoppedAt: null,
  autoStopEnabled: false,
  idleMinutesBeforeStop: 30,
  machineType: "ec2",
  agentVersion: null,
  agentLastSeenAt: null,
  ghImageTag: null,
  ghImageUpdatedAt: null,
  deployedCommitSha: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("Ec2SandboxProvider", () => {
  let ec2Service: ReturnType<typeof makeMockEc2Service>;
  let provider: Ec2SandboxProvider;

  beforeEach(() => {
    ec2Service = makeMockEc2Service();
    provider = new Ec2SandboxProvider({ ec2Service: ec2Service as unknown as EC2Service });
  });

  it("has type 'ec2'", () => {
    expect(provider.type).toBe("ec2");
  });

  describe("startMachine", () => {
    it("delegates to ec2Service.startInstance", async () => {
      const result = await provider.startMachine(SANDBOX_FIXTURE);

      expect(ec2Service.startInstance).toHaveBeenCalledWith("i-0123456789abcdef0");
      expect(result.success).toBe(true);
      expect(result.newStatus).toBe("pending");
    });
  });

  describe("stopMachine", () => {
    it("delegates to ec2Service.stopInstance", async () => {
      const result = await provider.stopMachine(SANDBOX_FIXTURE);

      expect(ec2Service.stopInstance).toHaveBeenCalledWith("i-0123456789abcdef0");
      expect(result.success).toBe(true);
      expect(result.newStatus).toBe("stopping");
    });
  });

  describe("getMachineStatus", () => {
    it("maps 'running' to 'running'", async () => {
      ec2Service.getInstanceStatus.mockResolvedValue("running");
      const status = await provider.getMachineStatus(SANDBOX_FIXTURE);
      expect(status.state).toBe("running");
    });

    it("maps 'pending' to 'starting'", async () => {
      ec2Service.getInstanceStatus.mockResolvedValue("pending");
      const status = await provider.getMachineStatus(SANDBOX_FIXTURE);
      expect(status.state).toBe("starting");
    });

    it("maps 'stopping' to 'stopping'", async () => {
      ec2Service.getInstanceStatus.mockResolvedValue("stopping");
      const status = await provider.getMachineStatus(SANDBOX_FIXTURE);
      expect(status.state).toBe("stopping");
    });

    it("maps 'stopped' to 'stopped'", async () => {
      ec2Service.getInstanceStatus.mockResolvedValue("stopped");
      const status = await provider.getMachineStatus(SANDBOX_FIXTURE);
      expect(status.state).toBe("stopped");
    });

    it("maps 'shutting-down' to 'stopping'", async () => {
      ec2Service.getInstanceStatus.mockResolvedValue("shutting-down");
      const status = await provider.getMachineStatus(SANDBOX_FIXTURE);
      expect(status.state).toBe("stopping");
    });

    it("maps 'terminated' to 'terminated'", async () => {
      ec2Service.getInstanceStatus.mockResolvedValue("terminated");
      const status = await provider.getMachineStatus(SANDBOX_FIXTURE);
      expect(status.state).toBe("terminated");
    });

    it("maps unknown status to 'unknown'", async () => {
      ec2Service.getInstanceStatus.mockResolvedValue("something-else");
      const status = await provider.getMachineStatus(SANDBOX_FIXTURE);
      expect(status.state).toBe("unknown");
    });

    it("includes public and private IP from sandbox record", async () => {
      const status = await provider.getMachineStatus(SANDBOX_FIXTURE);
      expect(status.publicIp).toBe("34.197.248.80");
      expect(status.privateIp).toBe("10.0.1.100");
    });
  });

  describe("getAgentUrl", () => {
    it("returns HTTP URL with port 8000", () => {
      const url = provider.getAgentUrl(SANDBOX_FIXTURE);
      expect(url).toBe("http://34.197.248.80:8000");
    });

    it("throws when sandbox has no public IP", () => {
      const noIpSandbox = { ...SANDBOX_FIXTURE, publicIp: null };
      expect(() => provider.getAgentUrl(noIpSandbox)).toThrow("has no public IP");
    });
  });

  describe("pingAgent", () => {
    it("returns true when agent responds OK", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));

      const result = await provider.pingAgent(SANDBOX_FIXTURE);
      expect(result).toBe(true);

      vi.unstubAllGlobals();
    });

    it("returns false when agent responds with error", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));

      const result = await provider.pingAgent(SANDBOX_FIXTURE);
      expect(result).toBe(false);

      vi.unstubAllGlobals();
    });

    it("returns false when fetch throws (unreachable)", async () => {
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));

      const result = await provider.pingAgent(SANDBOX_FIXTURE);
      expect(result).toBe(false);

      vi.unstubAllGlobals();
    });

    it("returns false when sandbox has no public IP", async () => {
      const noIpSandbox = { ...SANDBOX_FIXTURE, publicIp: null };
      const result = await provider.pingAgent(noIpSandbox);
      expect(result).toBe(false);
    });
  });
});
