import { describe, it, expect } from "vitest";
import { SandboxProviderFactory } from "../../../providers/provider-factory.js";
import type { SandboxProvider } from "../../../providers/sandbox-provider.interface.js";
import type { SandboxRecord } from "../../../sandbox.repository.js";

function makeMockProvider(type: "ec2" | "macos" | "local_docker"): SandboxProvider {
  return {
    type,
    startMachine: async () => ({ success: true, message: "started" }),
    stopMachine: async () => ({ success: true, message: "stopped" }),
    getMachineStatus: async () => ({ state: "running" as const }),
    getAgentUrl: () => `http://127.0.0.1:8000`,
    pingAgent: async () => true,
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

describe("SandboxProviderFactory", () => {
  it("resolves ec2 provider by default when sandbox has no machineType", () => {
    const ec2 = makeMockProvider("ec2");
    const macos = makeMockProvider("macos");
    const factory = new SandboxProviderFactory([ec2, macos]);

    // SANDBOX_FIXTURE has machineType: "ec2", so it resolves the ec2 provider
    const provider = factory.getProvider(SANDBOX_FIXTURE);
    expect(provider.type).toBe("ec2");
  });

  it("resolves provider by machineType on the sandbox record", () => {
    const ec2 = makeMockProvider("ec2");
    const macos = makeMockProvider("macos");
    const factory = new SandboxProviderFactory([ec2, macos]);

    const macSandbox: SandboxRecord = { ...SANDBOX_FIXTURE, machineType: "macos" };
    const provider = factory.getProvider(macSandbox);
    expect(provider.type).toBe("macos");
  });

  it("throws when no provider is registered for the machine type", () => {
    const ec2 = makeMockProvider("ec2");
    const factory = new SandboxProviderFactory([ec2]);

    const macSandbox: SandboxRecord = { ...SANDBOX_FIXTURE, machineType: "macos" };
    expect(() => factory.getProvider(macSandbox)).toThrow(
      "No sandbox provider registered for machine type: macos",
    );
  });

  it("getByType resolves the correct provider", () => {
    const ec2 = makeMockProvider("ec2");
    const macos = makeMockProvider("macos");
    const factory = new SandboxProviderFactory([ec2, macos]);

    expect(factory.getByType("ec2").type).toBe("ec2");
    expect(factory.getByType("macos").type).toBe("macos");
  });

  it("getByType throws for unregistered type", () => {
    const ec2 = makeMockProvider("ec2");
    const factory = new SandboxProviderFactory([ec2]);

    expect(() => factory.getByType("local_docker")).toThrow(
      "No sandbox provider registered for machine type: local_docker",
    );
  });

  it("handles multiple providers without collision", () => {
    const ec2 = makeMockProvider("ec2");
    const macos = makeMockProvider("macos");
    const docker = makeMockProvider("local_docker");
    const factory = new SandboxProviderFactory([ec2, macos, docker]);

    expect(factory.getByType("ec2")).toBe(ec2);
    expect(factory.getByType("macos")).toBe(macos);
    expect(factory.getByType("local_docker")).toBe(docker);
  });
});
