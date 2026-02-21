import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { KasmSandboxProvider } from "../../../providers/kasm-sandbox.provider.js";
import type { KasmClient } from "../../../kasm/kasm.client.js";
import type { SandboxRecord } from "../../../sandbox.repository.js";

function makeMockKasmClient() {
  return {
    requestKasm: vi.fn().mockResolvedValue({
      kasm_id: "kasm-uuid-123",
      status: "starting",
      share_id: "share-456",
      username: "user1",
      kasm_url: "https://kasm.example.com/session/kasm-uuid-123",
      session_token: "token-abc",
      operational_status: "starting",
      hostname: "10.0.1.50",
      port_map: { "3100": { port: 32001, path: "/" } },
    }),
    getKasmStatus: vi.fn().mockResolvedValue({
      kasm: {
        kasm_id: "kasm-uuid-123",
        status: "running",
        operational_status: "running",
        hostname: "10.0.1.50",
        port_map: { "3100": { port: 32001, path: "/" } },
        kasm_url: "https://kasm.example.com/session/kasm-uuid-123",
        image: { image_id: "img-001", friendly_name: "GH Worker" },
      },
    }),
    destroyKasm: vi.fn().mockResolvedValue(undefined),
    keepalive: vi.fn().mockResolvedValue(undefined),
    getKasms: vi.fn().mockResolvedValue([]),
    getImages: vi.fn().mockResolvedValue([]),
  };
}

const SANDBOX_FIXTURE: SandboxRecord = {
  id: "11111111-1111-1111-1111-111111111111",
  name: "kasm-sandbox-1",
  environment: "staging",
  instanceId: "kasm-uuid-123",
  instanceType: "kasm",
  publicIp: "10.0.1.50",
  privateIp: null,
  status: "active",
  healthStatus: "healthy",
  lastHealthCheckAt: new Date(),
  capacity: 1,
  currentLoad: 0,
  sshKeyName: null,
  novncUrl: "https://kasm.example.com/session/kasm-uuid-123",
  adspowerVersion: null,
  browserEngine: "chromium",
  browserConfig: null,
  tags: {
    kasm_image_id: "img-001",
    kasm_user_id: "usr-001",
    kasm_port_map: { "3100": { port: 32001, path: "/" } },
  },
  ec2Status: "running",
  lastStartedAt: null,
  lastStoppedAt: null,
  autoStopEnabled: false,
  idleMinutesBeforeStop: 30,
  machineType: "kasm",
  agentVersion: null,
  agentLastSeenAt: null,
  ghImageTag: null,
  ghImageUpdatedAt: null,
  deployedCommitSha: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("KasmSandboxProvider", () => {
  let kasmClient: ReturnType<typeof makeMockKasmClient>;
  let provider: KasmSandboxProvider;

  beforeEach(() => {
    kasmClient = makeMockKasmClient();
    provider = new KasmSandboxProvider({
      kasmClient: kasmClient as unknown as KasmClient,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("has type 'kasm'", () => {
    expect(provider.type).toBe("kasm");
  });

  describe("startMachine", () => {
    it("creates a Kasm session and returns metadata", async () => {
      const result = await provider.startMachine(SANDBOX_FIXTURE);

      expect(result.success).toBe(true);
      expect(result.newStatus).toBe("pending");
      expect(result.metadata).toBeDefined();
      expect(result.metadata?.kasm_id).toBe("kasm-uuid-123");
      expect(result.metadata?.kasm_url).toBe("https://kasm.example.com/session/kasm-uuid-123");
      expect(result.metadata?.hostname).toBe("10.0.1.50");
      expect(kasmClient.requestKasm).toHaveBeenCalledWith({
        image_id: "img-001",
        user_id: "usr-001",
      });
    });
  });

  describe("stopMachine", () => {
    it("destroys the Kasm session", async () => {
      const result = await provider.stopMachine(SANDBOX_FIXTURE);

      expect(result.success).toBe(true);
      expect(kasmClient.destroyKasm).toHaveBeenCalledWith("kasm-uuid-123");
    });

    it("returns failure when no instanceId", async () => {
      const noInstance = { ...SANDBOX_FIXTURE, instanceId: "" };
      const result = await provider.stopMachine(noInstance);

      expect(result.success).toBe(false);
    });
  });

  describe("getMachineStatus", () => {
    it("maps 'running' operational status", async () => {
      const status = await provider.getMachineStatus(SANDBOX_FIXTURE);

      expect(status.state).toBe("running");
      expect(status.publicIp).toBe("10.0.1.50");
    });

    it("maps 'starting' to 'starting'", async () => {
      kasmClient.getKasmStatus.mockResolvedValue({
        kasm: {
          ...kasmClient.getKasmStatus.mock.results[0]?.value?.kasm,
          kasm_id: "kasm-uuid-123",
          status: "starting",
          operational_status: "starting",
          hostname: "10.0.1.50",
          port_map: {},
          kasm_url: "",
          image: { image_id: "img-001", friendly_name: "test" },
        },
      });

      const status = await provider.getMachineStatus(SANDBOX_FIXTURE);
      expect(status.state).toBe("starting");
    });

    it("returns 'stopped' when Kasm API fails (session destroyed)", async () => {
      kasmClient.getKasmStatus.mockRejectedValue(new Error("Not found"));

      const status = await provider.getMachineStatus(SANDBOX_FIXTURE);
      expect(status.state).toBe("stopped");
    });

    it("returns 'unknown' when no instanceId", async () => {
      const noInstance = { ...SANDBOX_FIXTURE, instanceId: "" };
      const status = await provider.getMachineStatus(noInstance);
      expect(status.state).toBe("unknown");
    });
  });

  describe("getAgentUrl", () => {
    it("resolves URL from port map in tags", () => {
      const url = provider.getAgentUrl(SANDBOX_FIXTURE);
      expect(url).toBe("http://10.0.1.50:32001");
    });

    it("falls back to publicIp:3100 when no port map", () => {
      const noPortMap = { ...SANDBOX_FIXTURE, tags: {} };
      const url = provider.getAgentUrl(noPortMap);
      expect(url).toBe("http://10.0.1.50:3100");
    });

    it("throws when no IP available", () => {
      const noIp = { ...SANDBOX_FIXTURE, publicIp: null, tags: {} };
      expect(() => provider.getAgentUrl(noIp)).toThrow("has no reachable agent URL");
    });
  });

  describe("pingAgent", () => {
    it("returns true when agent responds OK", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));

      const result = await provider.pingAgent(SANDBOX_FIXTURE);
      expect(result).toBe(true);
    });

    it("falls back to Kasm status when agent unreachable", async () => {
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));

      const result = await provider.pingAgent(SANDBOX_FIXTURE);
      // Kasm status returns "running" from mock, so should be true
      expect(result).toBe(true);
    });
  });

  describe("keepalive", () => {
    it("sends keepalive to Kasm API", async () => {
      await provider.keepalive(SANDBOX_FIXTURE);
      expect(kasmClient.keepalive).toHaveBeenCalledWith("kasm-uuid-123");
    });
  });
});
