import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { MachineTypeBadge } from "./machine-type-badge";

describe("MachineTypeBadge", () => {
  it("renders EC2 for ec2 type", () => {
    render(<MachineTypeBadge machineType="ec2" />);
    expect(screen.getByText("EC2")).toBeInTheDocument();
  });

  it("renders macOS for macos type", () => {
    render(<MachineTypeBadge machineType="macos" />);
    expect(screen.getByText("macOS")).toBeInTheDocument();
  });

  it("renders Local for local_docker type", () => {
    render(<MachineTypeBadge machineType="local_docker" />);
    expect(screen.getByText("Local")).toBeInTheDocument();
  });

  it("defaults to EC2 when null", () => {
    render(<MachineTypeBadge machineType={null} />);
    expect(screen.getByText("EC2")).toBeInTheDocument();
  });

  it("defaults to EC2 when undefined", () => {
    render(<MachineTypeBadge />);
    expect(screen.getByText("EC2")).toBeInTheDocument();
  });
});
