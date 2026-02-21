import type { SandboxRecord } from "../sandbox.repository.js";

/**
 * Machine-type abstraction for sandbox management.
 * Each provider knows how to communicate with its machine type
 * and perform machine-level operations (e.g., EC2 start/stop).
 */
export interface SandboxProvider {
  /** Machine type identifier */
  readonly type: SandboxMachineType;

  // -- Lifecycle --

  /** Start the machine (EC2: start instance, macOS: wake-on-LAN or no-op) */
  startMachine(sandbox: SandboxRecord): Promise<MachineLifecycleResult>;

  /** Stop the machine gracefully */
  stopMachine(sandbox: SandboxRecord): Promise<MachineLifecycleResult>;

  /** Get the current machine status (separate from agent health) */
  getMachineStatus(sandbox: SandboxRecord): Promise<MachineStatus>;

  // -- Agent Communication --

  /** Resolve the agent's base URL for this sandbox */
  getAgentUrl(sandbox: SandboxRecord): string;

  /** Check if the agent is reachable */
  pingAgent(sandbox: SandboxRecord): Promise<boolean>;

  /** Optional keepalive signal to prevent auto-stop */
  keepalive?(sandbox: SandboxRecord): Promise<void>;
}

export type SandboxMachineType = "ec2" | "macos" | "local_docker" | "kasm";

export interface MachineLifecycleResult {
  success: boolean;
  message: string;
  newStatus?: string;
  metadata?: Record<string, unknown>;
}

export interface MachineStatus {
  state: "running" | "stopped" | "starting" | "stopping" | "terminated" | "unknown";
  publicIp?: string | null;
  privateIp?: string | null;
  machineMetadata?: Record<string, unknown>;
}
