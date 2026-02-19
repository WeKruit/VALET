import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { SummaryCards } from "./summary-cards";
import type { Sandbox } from "../types";

function makeSandbox(overrides: Partial<Sandbox> = {}): Sandbox {
  return {
    id: crypto.randomUUID(),
    name: "test-sandbox",
    environment: "prod",
    instanceId: "i-abc123",
    instanceType: "t3.medium",
    publicIp: "1.2.3.4",
    privateIp: null,
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
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe("SummaryCards", () => {
  it("renders correct counts", () => {
    const sandboxes = [
      makeSandbox({ ec2Status: "running", healthStatus: "healthy" }),
      makeSandbox({ ec2Status: "running", healthStatus: "degraded" }),
      makeSandbox({ ec2Status: "stopped", healthStatus: "unhealthy" }),
    ];

    render(<SummaryCards sandboxes={sandboxes} />);

    expect(screen.getByText("3")).toBeInTheDocument(); // Total
    expect(screen.getByText("2")).toBeInTheDocument(); // Running
    // Both Stopped and Healthy show "1"
    const ones = screen.getAllByText("1");
    expect(ones.length).toBe(2);
    expect(screen.getByText("Total")).toBeInTheDocument();
    expect(screen.getByText("Running")).toBeInTheDocument();
    expect(screen.getByText("Stopped")).toBeInTheDocument();
    expect(screen.getByText("Healthy")).toBeInTheDocument();
  });

  it("renders zeros when empty", () => {
    render(<SummaryCards sandboxes={[]} />);
    const zeros = screen.getAllByText("0");
    expect(zeros.length).toBe(4);
  });
});
