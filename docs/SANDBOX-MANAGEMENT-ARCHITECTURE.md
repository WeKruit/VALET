# Universal Sandbox/Worker Management System -- Architecture Design

**Author:** Claude (research + architecture)
**Date:** 2026-02-18
**Status:** Draft -- ready for review

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Current State Analysis](#2-current-state-analysis)
3. [Open-Source Evaluation](#3-open-source-evaluation)
4. [Recommended Approach](#4-recommended-approach)
5. [Interface Definitions](#5-interface-definitions)
6. [Communication Protocol](#6-communication-protocol)
7. [Database Schema Changes](#7-database-schema-changes)
8. [API Endpoints](#8-api-endpoints)
9. [UI Wireframes](#9-ui-wireframes)
10. [Security Architecture](#10-security-architecture)
11. [Implementation Phases](#11-implementation-phases)
12. [Effort Estimates](#12-effort-estimates)

---

## 1. Executive Summary

### Problem

VALET manages a fleet of EC2 instances running GhostHands Docker containers. Today, most operational tasks (viewing logs, setting env vars, building images, taking HITL control) require SSH access. The existing admin UI covers basic CRUD, EC2 start/stop, health checks, deploy triggering, and worker status -- but lacks log streaming, env var management, command execution, and multi-machine-type support.

### Recommendation

**Build a custom agent-based system**, extending the existing deploy-server pattern. The approach:

1. Extend the GhostHands deploy-server (Bun HTTP on port 8000) into a full **Sandbox Agent** with a standardized REST + WebSocket API
2. Add a **SandboxProvider interface** in VALET's API layer that abstracts machine-type-specific communication (EC2 today, macOS tomorrow)
3. Build the admin UI incrementally on top of the existing sandbox pages

This is preferred over adopting an external tool (Portainer, Komodo, etc.) because:

- The existing deploy-server already runs on every EC2 instance and handles deploy + health
- External tools add operational complexity (another service to deploy, monitor, secure)
- The required feature set is narrow and well-defined (not general-purpose Docker management)
- The team needs deep integration with VALET's auth, task system, and HITL flow
- macOS support (future) is not covered by any off-the-shelf Docker management tool

---

## 2. Current State Analysis

### What Already Exists

#### VALET API (`apps/api/src/modules/sandboxes/`)

| File                        | What It Does                                                                                                                               |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `sandbox.service.ts`        | CRUD, health checks, EC2 start/stop, metrics, worker deregistration                                                                        |
| `sandbox.repository.ts`     | DB queries against `sandboxes` table with filtering, pagination, sorting                                                                   |
| `deploy.service.ts`         | Rolling deploy orchestration: drain -> deploy -> health check per sandbox, Redis-backed deploy records, WebSocket broadcast to admin users |
| `ec2.service.ts`            | AWS SDK wrapper: start/stop/describe EC2 instances, poll for status                                                                        |
| `sandbox.routes.ts`         | ts-rest router: list, CRUD, health check, metrics, EC2 controls, trigger task/test, worker status, deploy management                       |
| `deploy.admin-routes.ts`    | Auto-deploy config (per-environment toggle)                                                                                                |
| `sandbox-health-monitor.ts` | 5-minute interval health check loop across all active sandboxes                                                                            |
| `auto-stop-monitor.ts`      | 10-minute interval idle-detection: stops EC2 instances after configurable idle period                                                      |
| `sandbox.errors.ts`         | Custom error classes: NotFound, DuplicateInstance, Unreachable                                                                             |

#### VALET Frontend (`apps/web/src/features/admin/`)

| Component                      | What It Shows                                                                                                                                                                                                                  |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `sandboxes-page.tsx`           | Fleet overview table: name, env, instance type, IP, status, health, load, EC2 status. Filters, search, pagination. Start/stop/health check/terminate from dropdown.                                                            |
| `sandbox-detail-page.tsx`      | Per-sandbox: overview fields, EC2 controls (start/stop with cost info), auto-stop toggle, worker status card, connection info (SSH/noVNC/health URLs), system metrics (CPU/mem/disk), live VNC view, trigger task dialog, tags |
| `worker-status-card.tsx`       | GH API status, Docker container count, health checks, active jobs, queue depth, processed count, active/recent tasks                                                                                                           |
| `deploy-banner.tsx`            | Pending deploy notifications with "Deploy Now" button, active deploy progress per sandbox, link to deploys page                                                                                                                |
| `sandbox-form.tsx`             | Register sandbox dialog: name, instance ID, env, instance type, capacity, browser engine, noVNC URL                                                                                                                            |
| `sandbox-health-indicator.tsx` | Health badge (healthy/degraded/unhealthy) with last-check tooltip                                                                                                                                                              |
| `sandbox-metrics.tsx`          | Load bar (currentLoad/capacity with percentage)                                                                                                                                                                                |
| `sandbox-status-badge.tsx`     | Status badge (active/provisioning/stopping/stopped/terminated/unhealthy)                                                                                                                                                       |
| `sandbox-connection-info.tsx`  | SSH command, noVNC URL, health URL with copy buttons                                                                                                                                                                           |

#### GhostHands Deploy Server (`scripts/deploy-server.ts`)

Bun HTTP server on port 8000 with 4 endpoints:

- `GET /health` -- aggregate health: GH API + worker status + active workers + deploy safety
- `GET /version` -- deploy server version + GH version
- `POST /deploy` -- triggers `deploy.sh` with image tag (auth: X-Deploy-Secret)
- `POST /drain` -- triggers graceful worker drain (auth: X-Deploy-Secret)

#### GhostHands Deploy Script (`scripts/deploy.sh`)

Shell script with commands: `deploy <tag>`, `rollback`, `drain`, `status`, `health`, `worker-status`, `start-worker <id>`, `stop-worker <id>`, `list-workers`.

#### Database Schema (`sandboxes` table)

| Column                   | Type                    | Notes                                                     |
| ------------------------ | ----------------------- | --------------------------------------------------------- |
| id                       | UUID PK                 |                                                           |
| name                     | VARCHAR(255)            |                                                           |
| environment              | ENUM (dev/staging/prod) |                                                           |
| instance_id              | VARCHAR(50) UNIQUE      | AWS instance ID                                           |
| instance_type            | VARCHAR(50)             | e.g. t3.medium                                            |
| public_ip                | VARCHAR(45)             | Nullable                                                  |
| private_ip               | VARCHAR(45)             | Nullable                                                  |
| status                   | ENUM                    | provisioning/active/stopping/stopped/terminated/unhealthy |
| health_status            | ENUM                    | healthy/degraded/unhealthy                                |
| last_health_check_at     | TIMESTAMP               |                                                           |
| capacity                 | INT default 5           |                                                           |
| current_load             | INT default 0           |                                                           |
| ssh_key_name             | VARCHAR(255)            |                                                           |
| novnc_url                | TEXT                    |                                                           |
| adspower_version         | VARCHAR(50)             |                                                           |
| browser_engine           | ENUM                    | chromium/adspower                                         |
| browser_config           | JSONB                   |                                                           |
| tags                     | JSONB                   |                                                           |
| ec2_status               | ENUM                    | pending/running/stopping/stopped/terminated               |
| last_started_at          | TIMESTAMP               |                                                           |
| last_stopped_at          | TIMESTAMP               |                                                           |
| auto_stop_enabled        | BOOLEAN default false   |                                                           |
| idle_minutes_before_stop | INT default 30          |                                                           |
| created_at, updated_at   | TIMESTAMP               |                                                           |

The `sandbox_secrets` table exists but is deprecated.

### What Is Missing

| Capability                 | Current State                | Gap                                   |
| -------------------------- | ---------------------------- | ------------------------------------- |
| **Log viewing**            | Must SSH in                  | No log streaming endpoint or UI       |
| **Env var management**     | Set via CI or SSH            | No API to read/write env vars         |
| **Command execution**      | SSH only                     | No remote command API                 |
| **Docker image building**  | CI pipeline only             | No on-machine build trigger           |
| **Screenshots**            | Stored in Supabase after job | No on-demand screenshot               |
| **HITL browser takeover**  | noVNC link exists            | No integrated live view with controls |
| **Multi-machine-type**     | EC2-only hardcoded           | No provider abstraction               |
| **Deploy history**         | Redis TTL (24h)              | No persistent deploy log              |
| **Audit log**              | None for sandbox ops         | No record of who did what             |
| **Agent version tracking** | `/version` endpoint exists   | Not stored/displayed in UI            |

---

## 3. Open-Source Evaluation

### Tools Evaluated

| Tool                                              | License         | Core Capability                | Embeddable?                          | Multi-OS?         | Verdict                                                                   |
| ------------------------------------------------- | --------------- | ------------------------------ | ------------------------------------ | ----------------- | ------------------------------------------------------------------------- |
| **[Portainer](https://www.portainer.io/)**        | Business Source | Docker/K8s management UI       | No (standalone app)                  | Linux only        | Too heavy, not embeddable, BSL license                                    |
| **[Komodo](https://komo.do/)**                    | GPL-3.0         | Build + deploy + Docker mgmt   | Partial (REST API, TS client on npm) | Linux only        | Closest match but GPL, requires separate Core + Periphery infra, overkill |
| **[Dockge](https://dockge.kuma.pet/)**            | MIT             | Compose stack manager          | No (standalone)                      | Linux only        | Too simple, compose-only, no remote execution                             |
| **[Yacht](https://yacht.sh/)**                    | MIT             | Docker container UI            | No                                   | Linux only        | Simple Docker UI, no fleet management                                     |
| **[Arcane](https://github.com/onmax/arcane)**     | MIT             | Docker container manager       | No                                   | Linux only        | Too new, single-host only                                                 |
| **[Ansible AWX](https://github.com/ansible/awx)** | Apache-2.0      | Config mgmt + remote execution | API only                             | Yes               | Massive infra overhead, Python-based, overkill                            |
| **[Semaphore](https://semaphoreui.com/)**         | MIT             | Ansible UI                     | No                                   | Yes (via Ansible) | Depends on Ansible, not embeddable                                        |
| **[Temporal](https://temporal.io/)**              | MIT             | Workflow orchestration         | Has SDK                              | Yes               | Wrong abstraction (workflows, not machine mgmt)                           |
| **[MeshCentral](https://meshcentral.com/)**       | Apache-2.0      | Remote device management       | No                                   | Yes               | Too general (RDP/VNC/terminal), not Docker-aware                          |

### Why None Fit

1. **License issues**: Portainer is BSL, Komodo is GPL-3.0 (viral). Only MIT/Apache tools are acceptable.
2. **Operational overhead**: Every tool requires deploying and maintaining a separate service (Core, UI, database). VALET already has all of this.
3. **Not embeddable**: None can be embedded as a React component library into an existing app. They are all standalone applications.
4. **Missing features**: None handle the specific combination of: Docker deploy + env var management + log streaming + HITL browser control + multi-OS support.
5. **Integration cost**: Integrating any external tool with VALET's auth, task system, WebSocket events, and HITL flow would cost more than building the agent from scratch.

### What We Can Learn From Them

- **Komodo's architecture** (Core + Periphery agent) is the right pattern. We should follow the same model: VALET = Core, Agent on each machine = Periphery.
- **Komodo's TypeScript client** on npm is a good UX pattern. Our provider interface serves the same purpose.
- **Portainer's Docker API proxy** pattern -- forwarding Docker Engine API calls through an authenticated proxy -- is useful for the `executeCommand` use case.
- **Dockge's log streaming** via WebSocket is the right approach for live logs.

---

## 4. Recommended Approach

### Architecture Overview

```
                     VALET (Fly.io)
                    ┌──────────────────────────────────────────┐
                    │  Fastify API                              │
                    │  ┌──────────────────────────────────────┐ │
                    │  │  SandboxService                       │ │
                    │  │    ├── SandboxProvider (interface)     │ │
                    │  │    │    ├── Ec2SandboxProvider         │ │
                    │  │    │    ├── MacOsSandboxProvider       │ │
                    │  │    │    └── LocalDockerProvider        │ │
                    │  │    ├── SandboxRepository (DB)          │ │
                    │  │    └── AuditLogService                 │ │
                    │  └──────────────────────────────────────┘ │
                    │  ┌──────────────────────────────────────┐ │
                    │  │  WebSocket Hub                        │ │
                    │  │    └── Log streaming relay             │ │
                    │  └──────────────────────────────────────┘ │
                    └──────────────┬───────────────────────────┘
                                   │ HTTPS + WSS
                    ┌──────────────┴───────────────────────────┐
                    │                                           │
         ┌──────────▼──────────┐              ┌────────────────▼─────┐
         │  EC2 Instance        │              │  macOS Machine        │
         │  ┌────────────────┐  │              │  ┌────────────────┐   │
         │  │ Sandbox Agent   │  │              │  │ Sandbox Agent   │   │
         │  │ (Bun, port 8000)│  │              │  │ (Bun, port 8000)│   │
         │  │  ├── /health    │  │              │  │  ├── /health    │   │
         │  │  ├── /deploy    │  │              │  │  ├── /deploy    │   │
         │  │  ├── /logs      │  │              │  │  ├── /logs      │   │
         │  │  ├── /env       │  │              │  │  ├── /env       │   │
         │  │  ├── /exec      │  │              │  │  ├── /exec      │   │
         │  │  ├── /ws        │  │              │  │  ├── /ws        │   │
         │  │  └── /screenshot│  │              │  │  └── /screenshot│   │
         │  └────────────────┘  │              │  └────────────────┘   │
         │  ┌────────────────┐  │              │  ┌────────────────┐   │
         │  │ Docker          │  │              │  │ Docker Desktop  │   │
         │  │  └── GH worker  │  │              │  │  └── GH worker  │   │
         │  └────────────────┘  │              │  └────────────────┘   │
         └─────────────────────┘              └──────────────────────┘
```

### Key Design Decisions

1. **Agent-based, not agentless**: Each machine runs a lightweight Sandbox Agent (evolved from the current deploy-server). This avoids SSH key management, works across firewalls, and supports WebSocket streaming.

2. **Same agent binary, different config**: The agent is the same Bun/TypeScript process regardless of machine type. Machine-specific behavior (Docker path, ECR vs. local registry, etc.) is controlled via environment variables.

3. **Provider pattern on VALET side**: VALET's `SandboxService` uses a `SandboxProvider` interface. The provider handles how to reach the agent (direct HTTP for EC2 with public IP, tunnel for private machines, etc.) and any machine-type-specific API calls (e.g., AWS EC2 start/stop).

4. **HTTP for commands, WebSocket for streaming**: Agent API uses HTTP POST/GET for discrete operations (deploy, env vars, health). WebSocket for streaming data (logs, command output).

5. **Extend, don't replace**: The existing deploy-server already works. We extend it incrementally -- adding endpoints one at a time -- rather than rewriting.

---

## 5. Interface Definitions

### 5.1 SandboxProvider (VALET API side)

```typescript
// apps/api/src/modules/sandboxes/providers/sandbox-provider.interface.ts

/**
 * Machine-type abstraction for sandbox management.
 * Each provider knows how to communicate with its machine type
 * and perform machine-level operations (e.g., EC2 start/stop).
 */
export interface SandboxProvider {
  /** Machine type identifier */
  readonly type: SandboxMachineType;

  // ── Lifecycle ──────────────────────────────────────────

  /** Start the machine (EC2: start instance, macOS: wake-on-LAN or no-op) */
  startMachine(sandbox: SandboxRecord): Promise<MachineLifecycleResult>;

  /** Stop the machine gracefully */
  stopMachine(sandbox: SandboxRecord): Promise<MachineLifecycleResult>;

  /** Get the current machine status (separate from agent health) */
  getMachineStatus(sandbox: SandboxRecord): Promise<MachineStatus>;

  // ── Agent Communication ────────────────────────────────
  // These methods call the Sandbox Agent running on the machine.
  // They are identical across providers (all use HTTP to agent),
  // but the provider resolves the agent URL differently.

  /** Resolve the agent's base URL for this sandbox */
  getAgentUrl(sandbox: SandboxRecord): string;

  /** Check if the agent is reachable */
  pingAgent(sandbox: SandboxRecord): Promise<boolean>;
}

export type SandboxMachineType = "ec2" | "macos" | "local_docker";

export interface MachineLifecycleResult {
  success: boolean;
  message: string;
  newStatus?: string;
}

export interface MachineStatus {
  state: "running" | "stopped" | "starting" | "stopping" | "terminated" | "unknown";
  publicIp?: string | null;
  privateIp?: string | null;
  machineMetadata?: Record<string, unknown>;
}
```

### 5.2 Ec2SandboxProvider

```typescript
// apps/api/src/modules/sandboxes/providers/ec2-sandbox.provider.ts

import type {
  SandboxProvider,
  MachineLifecycleResult,
  MachineStatus,
} from "./sandbox-provider.interface.js";
import type { EC2Service } from "../ec2.service.js";
import type { SandboxRecord } from "../sandbox.repository.js";

export class Ec2SandboxProvider implements SandboxProvider {
  readonly type = "ec2" as const;

  constructor(private ec2Service: EC2Service) {}

  async startMachine(sandbox: SandboxRecord): Promise<MachineLifecycleResult> {
    await this.ec2Service.startInstance(sandbox.instanceId);
    return { success: true, message: "EC2 instance starting", newStatus: "pending" };
  }

  async stopMachine(sandbox: SandboxRecord): Promise<MachineLifecycleResult> {
    await this.ec2Service.stopInstance(sandbox.instanceId);
    return { success: true, message: "EC2 instance stopping", newStatus: "stopping" };
  }

  async getMachineStatus(sandbox: SandboxRecord): Promise<MachineStatus> {
    const ec2Status = await this.ec2Service.getInstanceStatus(sandbox.instanceId);
    const stateMap: Record<string, MachineStatus["state"]> = {
      pending: "starting",
      running: "running",
      "shutting-down": "stopping",
      stopping: "stopping",
      stopped: "stopped",
      terminated: "terminated",
    };
    return {
      state: stateMap[ec2Status] ?? "unknown",
      publicIp: sandbox.publicIp,
      privateIp: sandbox.privateIp,
    };
  }

  getAgentUrl(sandbox: SandboxRecord): string {
    if (!sandbox.publicIp) throw new Error(`Sandbox ${sandbox.id} has no public IP`);
    return `http://${sandbox.publicIp}:8000`;
  }

  async pingAgent(sandbox: SandboxRecord): Promise<boolean> {
    try {
      const resp = await fetch(`${this.getAgentUrl(sandbox)}/health`, {
        signal: AbortSignal.timeout(5_000),
      });
      return resp.ok;
    } catch {
      return false;
    }
  }
}
```

### 5.3 MacOsSandboxProvider (future)

```typescript
// apps/api/src/modules/sandboxes/providers/macos-sandbox.provider.ts

export class MacOsSandboxProvider implements SandboxProvider {
  readonly type = "macos" as const;

  async startMachine(sandbox: SandboxRecord): Promise<MachineLifecycleResult> {
    // macOS machines are always-on or use Wake-on-LAN
    return { success: true, message: "macOS machine is always on" };
  }

  async stopMachine(sandbox: SandboxRecord): Promise<MachineLifecycleResult> {
    // Send shutdown command to agent (agent handles OS-level shutdown)
    const resp = await fetch(`${this.getAgentUrl(sandbox)}/system/shutdown`, {
      method: "POST",
      headers: this.authHeaders(),
    });
    return { success: resp.ok, message: resp.ok ? "Shutdown initiated" : "Shutdown failed" };
  }

  async getMachineStatus(sandbox: SandboxRecord): Promise<MachineStatus> {
    const reachable = await this.pingAgent(sandbox);
    return {
      state: reachable ? "running" : "stopped",
      publicIp: sandbox.publicIp,
      privateIp: sandbox.privateIp,
    };
  }

  getAgentUrl(sandbox: SandboxRecord): string {
    // macOS machines may use a fixed IP or hostname
    const host = sandbox.publicIp ?? sandbox.privateIp;
    if (!host) throw new Error(`Sandbox ${sandbox.id} has no IP configured`);
    return `http://${host}:8000`;
  }

  async pingAgent(sandbox: SandboxRecord): Promise<boolean> {
    try {
      const resp = await fetch(`${this.getAgentUrl(sandbox)}/health`, {
        signal: AbortSignal.timeout(5_000),
      });
      return resp.ok;
    } catch {
      return false;
    }
  }

  private authHeaders(): Record<string, string> {
    return { "X-Deploy-Secret": process.env.GH_DEPLOY_SECRET ?? "" };
  }
}
```

### 5.4 SandboxProviderFactory

```typescript
// apps/api/src/modules/sandboxes/providers/provider-factory.ts

import type { SandboxProvider, SandboxMachineType } from "./sandbox-provider.interface.js";
import type { SandboxRecord } from "../sandbox.repository.js";

export class SandboxProviderFactory {
  private providers: Map<SandboxMachineType, SandboxProvider>;

  constructor(providers: SandboxProvider[]) {
    this.providers = new Map(providers.map((p) => [p.type, p]));
  }

  /** Get the provider for a given sandbox based on its machine_type */
  getProvider(sandbox: SandboxRecord): SandboxProvider {
    const type = (sandbox.machineType ?? "ec2") as SandboxMachineType;
    const provider = this.providers.get(type);
    if (!provider) {
      throw new Error(`No sandbox provider registered for machine type: ${type}`);
    }
    return provider;
  }

  /** Get the provider for a machine type directly */
  getByType(type: SandboxMachineType): SandboxProvider {
    const provider = this.providers.get(type);
    if (!provider) {
      throw new Error(`No sandbox provider registered for machine type: ${type}`);
    }
    return provider;
  }
}
```

### 5.5 SandboxAgentClient (shared across providers)

```typescript
// apps/api/src/modules/sandboxes/agent/sandbox-agent.client.ts

/**
 * HTTP + WebSocket client for communicating with the Sandbox Agent
 * running on each machine. Used by all providers.
 */
export class SandboxAgentClient {
  private deploySecret: string;

  constructor(deploySecret: string) {
    this.deploySecret = deploySecret;
  }

  // ── Docker Operations ──────────────────────────────────

  async deploy(agentUrl: string, imageTag: string): Promise<DeployResult> {
    return this.post(`${agentUrl}/deploy`, { image_tag: imageTag });
  }

  async buildImage(agentUrl: string, tag?: string): Promise<BuildResult> {
    return this.post(`${agentUrl}/build`, { tag });
  }

  async getContainers(agentUrl: string): Promise<ContainerInfo[]> {
    return this.get(`${agentUrl}/containers`);
  }

  // ── Worker Management ──────────────────────────────────

  async startWorker(agentUrl: string, config?: WorkerStartConfig): Promise<WorkerResult> {
    return this.post(`${agentUrl}/workers/start`, config);
  }

  async stopWorker(agentUrl: string, workerId: string, graceful = true): Promise<WorkerResult> {
    return this.post(`${agentUrl}/workers/${workerId}/stop`, { graceful });
  }

  async drainWorker(agentUrl: string, workerId?: string): Promise<DrainResult> {
    return this.post(`${agentUrl}/drain`, { worker_id: workerId });
  }

  async listWorkers(agentUrl: string): Promise<WorkerInfo[]> {
    return this.get(`${agentUrl}/workers`);
  }

  // ── Environment Variables ──────────────────────────────

  async getEnvVars(agentUrl: string): Promise<EnvVarMap> {
    return this.get(`${agentUrl}/env`);
  }

  async setEnvVars(agentUrl: string, vars: Record<string, string>): Promise<void> {
    await this.post(`${agentUrl}/env`, { vars });
  }

  async deleteEnvVar(agentUrl: string, key: string): Promise<void> {
    await this.delete(`${agentUrl}/env/${encodeURIComponent(key)}`);
  }

  // ── Logs ───────────────────────────────────────────────

  async getLogs(agentUrl: string, options: LogOptions): Promise<LogResult> {
    const params = new URLSearchParams();
    if (options.service) params.set("service", options.service);
    if (options.lines) params.set("lines", String(options.lines));
    if (options.since) params.set("since", options.since);
    return this.get(`${agentUrl}/logs?${params}`);
  }

  /** Open a WebSocket connection for streaming logs */
  createLogStream(agentUrl: string, options: LogStreamOptions): WebSocket {
    const wsUrl = agentUrl.replace(/^http/, "ws");
    const params = new URLSearchParams();
    if (options.service) params.set("service", options.service);
    params.set("token", this.deploySecret);
    return new WebSocket(`${wsUrl}/ws/logs?${params}`);
  }

  // ── Health & Metrics ───────────────────────────────────

  async getHealth(agentUrl: string): Promise<AgentHealthResponse> {
    return this.get(`${agentUrl}/health`);
  }

  async getStatus(agentUrl: string): Promise<AgentStatusResponse> {
    return this.get(`${agentUrl}/status`);
  }

  async getMetrics(agentUrl: string): Promise<AgentMetricsResponse> {
    return this.get(`${agentUrl}/metrics`);
  }

  async getVersion(agentUrl: string): Promise<AgentVersionResponse> {
    return this.get(`${agentUrl}/version`);
  }

  // ── Screenshots ────────────────────────────────────────

  async getScreenshot(agentUrl: string): Promise<Buffer> {
    const resp = await fetch(`${agentUrl}/screenshot`, {
      headers: this.authHeaders(),
      signal: AbortSignal.timeout(15_000),
    });
    if (!resp.ok) throw new Error(`Screenshot failed: ${resp.status}`);
    return Buffer.from(await resp.arrayBuffer());
  }

  // ── Command Execution ──────────────────────────────────

  async executeCommand(agentUrl: string, command: string, timeout = 30_000): Promise<ExecResult> {
    return this.post(`${agentUrl}/exec`, { command, timeout_ms: timeout });
  }

  /** Stream command output via WebSocket */
  createExecStream(agentUrl: string, command: string): WebSocket {
    const wsUrl = agentUrl.replace(/^http/, "ws");
    const params = new URLSearchParams();
    params.set("command", command);
    params.set("token", this.deploySecret);
    return new WebSocket(`${wsUrl}/ws/exec?${params}`);
  }

  // ── HITL (Browser Takeover) ────────────────────────────

  /** Get VNC/noVNC connection details for HITL takeover */
  async getTakeoverInfo(agentUrl: string): Promise<TakeoverInfo> {
    return this.get(`${agentUrl}/takeover`);
  }

  // ── Private Helpers ────────────────────────────────────

  private authHeaders(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      "X-Deploy-Secret": this.deploySecret,
    };
  }

  private async get<T>(url: string): Promise<T> {
    const resp = await fetch(url, {
      headers: this.authHeaders(),
      signal: AbortSignal.timeout(10_000),
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      throw new Error(`Agent ${resp.status}: ${text}`);
    }
    return resp.json() as Promise<T>;
  }

  private async post<T>(url: string, body?: unknown): Promise<T> {
    const resp = await fetch(url, {
      method: "POST",
      headers: this.authHeaders(),
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(60_000),
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      throw new Error(`Agent ${resp.status}: ${text}`);
    }
    return resp.json() as Promise<T>;
  }

  private async delete(url: string): Promise<void> {
    const resp = await fetch(url, {
      method: "DELETE",
      headers: this.authHeaders(),
      signal: AbortSignal.timeout(10_000),
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      throw new Error(`Agent ${resp.status}: ${text}`);
    }
  }
}

// ── Response Types ─────────────────────────────────────

export interface DeployResult {
  success: boolean;
  message: string;
  imageTag: string;
  elapsedMs?: number;
}

export interface BuildResult {
  success: boolean;
  message: string;
  imageTag?: string;
  elapsedMs?: number;
}

export interface ContainerInfo {
  id: string;
  name: string;
  image: string;
  status: string;
  state: "running" | "exited" | "created" | "restarting";
  ports: string[];
  createdAt: string;
  labels: Record<string, string>;
}

export interface WorkerStartConfig {
  workerId?: string;
  maxConcurrentJobs?: number;
  envOverrides?: Record<string, string>;
}

export interface WorkerResult {
  success: boolean;
  workerId: string;
  message: string;
}

export interface DrainResult {
  success: boolean;
  drainedWorkers: number;
  message: string;
}

export interface WorkerInfo {
  workerId: string;
  containerId: string;
  containerName: string;
  status: "running" | "idle" | "busy" | "draining" | "stopped";
  activeJobs: number;
  statusPort: number;
  uptime: number;
  image: string;
}

export interface EnvVarMap {
  /** Key-value pairs. Values for sensitive keys are redacted to "***" */
  vars: Record<string, string>;
  /** List of keys that were redacted */
  redactedKeys: string[];
}

export interface LogOptions {
  service?: "api" | "worker" | "deploy-server" | "adspower" | "system";
  lines?: number;
  since?: string; // ISO timestamp
}

export interface LogStreamOptions {
  service?: string;
}

export interface LogResult {
  lines: LogLine[];
  service: string;
  truncated: boolean;
}

export interface LogLine {
  timestamp: string;
  level?: string;
  message: string;
  service: string;
}

export interface AgentHealthResponse {
  status: "ok" | "degraded" | "error";
  activeWorkers: number;
  deploySafe: boolean;
  apiHealthy: boolean;
  workerStatus: string;
  currentDeploy: { imageTag: string; elapsedMs: number } | null;
  uptimeMs: number;
}

export interface AgentStatusResponse {
  agentVersion: string;
  machineType: string;
  hostname: string;
  os: { platform: string; release: string; arch: string };
  docker: { version: string; containers: ContainerInfo[] };
  workers: WorkerInfo[];
  uptime: number;
}

export interface AgentMetricsResponse {
  cpu: { usagePercent: number; cores: number };
  memory: { usedMb: number; totalMb: number; usagePercent: number };
  disk: { usedGb: number; totalGb: number; usagePercent: number };
  network: { rxBytesPerSec: number; txBytesPerSec: number };
}

export interface AgentVersionResponse {
  agentVersion: string;
  ghosthandsVersion: string | null;
  dockerVersion: string;
  os: string;
  arch: string;
}

export interface TakeoverInfo {
  novncUrl: string | null;
  vncPort: number | null;
  websockifyPort: number | null;
  activeSession: { jobId: string; pageUrl: string } | null;
}

export interface ExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  elapsedMs: number;
  truncated: boolean;
}
```

---

## 6. Communication Protocol

### 6.1 Agent API Specification

The Sandbox Agent expands the existing deploy-server to a full management API. All endpoints share the same auth model.

#### Authentication

- **GET endpoints** (health, version, metrics): Unauthenticated (monitoring/health checks)
- **POST/PUT/DELETE endpoints**: Require `X-Deploy-Secret` header with HMAC-verified shared secret
- **WebSocket endpoints**: Require `?token=<secret>` query parameter (headers not supported in browser WebSocket)

#### Endpoints

| Method   | Path                | Auth  | Purpose                        |
| -------- | ------------------- | ----- | ------------------------------ |
| `GET`    | `/health`           | No    | Health check (existing)        |
| `GET`    | `/version`          | No    | Version info (existing)        |
| `GET`    | `/status`           | Yes   | Full system status             |
| `GET`    | `/metrics`          | No    | CPU/mem/disk/network           |
| `POST`   | `/deploy`           | Yes   | Deploy Docker image (existing) |
| `POST`   | `/build`            | Yes   | Build Docker image on machine  |
| `POST`   | `/drain`            | Yes   | Drain workers (existing)       |
| `GET`    | `/containers`       | Yes   | List Docker containers         |
| `GET`    | `/workers`          | Yes   | List GH worker processes       |
| `POST`   | `/workers/start`    | Yes   | Start a new worker             |
| `POST`   | `/workers/:id/stop` | Yes   | Stop a specific worker         |
| `GET`    | `/env`              | Yes   | Get env vars (redacted)        |
| `POST`   | `/env`              | Yes   | Set env vars                   |
| `DELETE` | `/env/:key`         | Yes   | Delete an env var              |
| `GET`    | `/logs`             | Yes   | Get historical logs            |
| `GET`    | `/screenshot`       | Yes   | Capture current browser        |
| `POST`   | `/exec`             | Yes   | Execute command (audit logged) |
| `GET`    | `/takeover`         | Yes   | Get HITL takeover info         |
| `WS`     | `/ws/logs`          | Token | Stream logs in real-time       |
| `WS`     | `/ws/exec`          | Token | Stream command output          |

### 6.2 Log Streaming Protocol

WebSocket at `ws://<agent>:8000/ws/logs?service=worker&token=<secret>`

**Client -> Server messages:**

```json
{ "type": "subscribe", "service": "worker" }
{ "type": "unsubscribe" }
{ "type": "ping" }
```

**Server -> Client messages:**

```json
{ "type": "log", "timestamp": "...", "level": "info", "message": "...", "service": "worker" }
{ "type": "pong" }
{ "type": "error", "message": "..." }
```

Implementation on agent side: the agent tails Docker container logs using `docker logs --follow` (spawned child process) and forwards each line as a WebSocket message.

### 6.3 VALET -> Agent -> VALET Flow

```
Admin clicks "View Logs" in UI
  -> React opens WebSocket to VALET API: wss://valet-api.fly.dev/ws
  -> VALET receives log subscription for sandbox X
  -> VALET SandboxService gets provider for sandbox X
  -> Provider resolves agent URL: http://<ip>:8000
  -> VALET opens WebSocket to agent: ws://<ip>:8000/ws/logs?token=...
  -> Agent tails Docker logs, sends to VALET
  -> VALET relays each log line to admin's WebSocket
  -> Admin sees live logs in UI
```

The relay pattern through VALET is important for:

1. Security: The admin browser never connects directly to the agent (agent may be in private VPC)
2. Auth: VALET handles JWT auth for the admin, agent handles deploy-secret auth for VALET
3. Audit: VALET can log all operations before forwarding

### 6.4 Env Var Management

The agent manages a `.env` file on disk. Reading returns all key-value pairs with sensitive values redacted. Writing merges new values into the file and optionally restarts containers.

**Sensitive key detection** (redacted on read): keys matching patterns `*SECRET*`, `*PASSWORD*`, `*KEY*`, `*TOKEN*`, `*CREDENTIAL*`, `*PRIVATE*`, `DATABASE_URL`, `REDIS_URL`, `SUPABASE*`.

**Write flow:**

1. VALET sends `POST /env` with `{ vars: { KEY: "value" }, restart: true }`
2. Agent reads current `.env`, merges new values, writes atomically (write-to-temp + rename)
3. If `restart: true`, agent runs `docker compose restart`
4. Agent returns success

---

## 7. Database Schema Changes

### 7.1 Modify `sandboxes` Table

Add new columns:

```sql
ALTER TABLE sandboxes
  ADD COLUMN machine_type VARCHAR(20) NOT NULL DEFAULT 'ec2',
  ADD COLUMN agent_version VARCHAR(50),
  ADD COLUMN agent_last_seen_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN gh_image_tag VARCHAR(255),
  ADD COLUMN gh_image_updated_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN deployed_commit_sha VARCHAR(40);
```

Update the `machine_type` enum (or keep as varchar for flexibility):

| Column                | Type                      | Notes                              |
| --------------------- | ------------------------- | ---------------------------------- |
| `machine_type`        | VARCHAR(20) DEFAULT 'ec2' | 'ec2', 'macos', 'local_docker'     |
| `agent_version`       | VARCHAR(50)               | Last reported agent version        |
| `agent_last_seen_at`  | TIMESTAMPTZ               | Last successful agent health check |
| `gh_image_tag`        | VARCHAR(255)              | Currently deployed GH image tag    |
| `gh_image_updated_at` | TIMESTAMPTZ               | When the image was last deployed   |
| `deployed_commit_sha` | VARCHAR(40)               | Commit SHA of deployed code        |

### 7.2 New `sandbox_audit_logs` Table

```sql
CREATE TABLE sandbox_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sandbox_id UUID NOT NULL REFERENCES sandboxes(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(50) NOT NULL,           -- 'deploy', 'start', 'stop', 'set_env', 'exec', 'drain', etc.
  details JSONB DEFAULT '{}',            -- Action-specific metadata
  ip_address VARCHAR(45),                -- Admin's IP address
  user_agent TEXT,                       -- Admin's browser/client
  result VARCHAR(20) DEFAULT 'success',  -- 'success', 'failure', 'error'
  error_message TEXT,                    -- If result is 'failure' or 'error'
  duration_ms INTEGER,                   -- How long the action took
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sandbox_audit_sandbox_id ON sandbox_audit_logs(sandbox_id);
CREATE INDEX idx_sandbox_audit_user_id ON sandbox_audit_logs(user_id);
CREATE INDEX idx_sandbox_audit_action ON sandbox_audit_logs(action);
CREATE INDEX idx_sandbox_audit_created_at ON sandbox_audit_logs(created_at);
```

### 7.3 New `sandbox_deploy_history` Table

Replace the Redis-only deploy records with persistent storage:

```sql
CREATE TABLE sandbox_deploy_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sandbox_id UUID REFERENCES sandboxes(id) ON DELETE SET NULL,
  image_tag VARCHAR(255) NOT NULL,
  commit_sha VARCHAR(40),
  commit_message TEXT,
  branch VARCHAR(255),
  environment VARCHAR(20) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',  -- pending, deploying, completed, failed, rolled_back
  triggered_by UUID REFERENCES users(id) ON DELETE SET NULL,
  deploy_started_at TIMESTAMP WITH TIME ZONE,
  deploy_completed_at TIMESTAMP WITH TIME ZONE,
  deploy_duration_ms INTEGER,
  rollback_of UUID REFERENCES sandbox_deploy_history(id),  -- If this was a rollback
  error_message TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_deploy_history_sandbox_id ON sandbox_deploy_history(sandbox_id);
CREATE INDEX idx_deploy_history_env ON sandbox_deploy_history(environment);
CREATE INDEX idx_deploy_history_status ON sandbox_deploy_history(status);
CREATE INDEX idx_deploy_history_created_at ON sandbox_deploy_history(created_at);
```

---

## 8. API Endpoints

### 8.1 New Sandbox Management Endpoints

These extend the existing `sandboxContract` in `packages/contracts/src/sandbox.ts`:

```typescript
// New endpoints to add to sandboxContract

// ── Agent Operations ───────────────────────────────────

/** Get full agent status (containers, workers, system info) */
getAgentStatus: {
  method: "GET",
  path: "/api/v1/admin/sandboxes/:id/agent-status",
  responses: { 200: agentStatusResponse, 404: errorResponse, 502: errorResponse },
},

/** Get agent version info */
getAgentVersion: {
  method: "GET",
  path: "/api/v1/admin/sandboxes/:id/agent-version",
  responses: { 200: agentVersionResponse, 404: errorResponse },
},

// ── Log Management ─────────────────────────────────────

/** Get historical logs */
getLogs: {
  method: "GET",
  path: "/api/v1/admin/sandboxes/:id/logs",
  query: z.object({
    service: z.enum(["api", "worker", "deploy-server", "adspower", "system"]).optional(),
    lines: z.coerce.number().min(1).max(5000).default(200),
    since: z.string().datetime().optional(),
  }),
  responses: { 200: logResponse, 404: errorResponse, 502: errorResponse },
},

// ── Environment Variables ──────────────────────────────

/** Get environment variables (sensitive values redacted) */
getEnvVars: {
  method: "GET",
  path: "/api/v1/admin/sandboxes/:id/env",
  responses: { 200: envVarResponse, 404: errorResponse, 502: errorResponse },
},

/** Set environment variables */
setEnvVars: {
  method: "POST",
  path: "/api/v1/admin/sandboxes/:id/env",
  body: z.object({
    vars: z.record(z.string(), z.string()),
    restart: z.boolean().default(false),
  }),
  responses: { 200: z.object({ message: z.string() }), 404: errorResponse, 502: errorResponse },
},

/** Delete an environment variable */
deleteEnvVar: {
  method: "DELETE",
  path: "/api/v1/admin/sandboxes/:id/env/:key",
  responses: { 200: z.object({ message: z.string() }), 404: errorResponse, 502: errorResponse },
},

// ── Worker Management ──────────────────────────────────

/** List all worker processes on this sandbox */
listWorkers: {
  method: "GET",
  path: "/api/v1/admin/sandboxes/:id/workers",
  responses: { 200: workerListResponse, 404: errorResponse, 502: errorResponse },
},

/** Start a new worker process */
startWorkerProcess: {
  method: "POST",
  path: "/api/v1/admin/sandboxes/:id/workers/start",
  body: z.object({
    workerId: z.string().optional(),
    maxConcurrentJobs: z.number().min(1).max(5).default(1),
  }),
  responses: { 201: workerResultResponse, 404: errorResponse, 502: errorResponse },
},

/** Stop a worker process */
stopWorkerProcess: {
  method: "POST",
  path: "/api/v1/admin/sandboxes/:id/workers/:workerId/stop",
  body: z.object({ graceful: z.boolean().default(true) }),
  responses: { 200: workerResultResponse, 404: errorResponse, 502: errorResponse },
},

// ── Container Management ───────────────────────────────

/** List Docker containers */
listContainers: {
  method: "GET",
  path: "/api/v1/admin/sandboxes/:id/containers",
  responses: { 200: containerListResponse, 404: errorResponse, 502: errorResponse },
},

// ── Screenshots ────────────────────────────────────────

/** Take a browser screenshot */
getScreenshot: {
  method: "GET",
  path: "/api/v1/admin/sandboxes/:id/screenshot",
  responses: {
    200: z.any(), // Binary PNG
    404: errorResponse,
    502: errorResponse,
  },
},

// ── Command Execution ──────────────────────────────────

/** Execute a command on the sandbox (admin-only, audit logged) */
executeCommand: {
  method: "POST",
  path: "/api/v1/admin/sandboxes/:id/exec",
  body: z.object({
    command: z.string().max(2000),
    timeoutMs: z.number().min(1000).max(300_000).default(30_000),
  }),
  responses: { 200: execResultResponse, 404: errorResponse, 502: errorResponse },
},

// ── Docker Build ───────────────────────────────────────

/** Trigger a Docker build on the sandbox machine */
buildImage: {
  method: "POST",
  path: "/api/v1/admin/sandboxes/:id/build",
  body: z.object({ tag: z.string().optional() }),
  responses: { 200: buildResultResponse, 404: errorResponse, 502: errorResponse },
},

// ── Audit Log ──────────────────────────────────────────

/** Get audit log for a sandbox */
getAuditLog: {
  method: "GET",
  path: "/api/v1/admin/sandboxes/:id/audit-log",
  query: z.object({
    page: z.coerce.number().default(1),
    pageSize: z.coerce.number().default(50),
    action: z.string().optional(),
  }),
  responses: { 200: auditLogListResponse, 404: errorResponse },
},

// ── Deploy History ─────────────────────────────────────

/** Get deploy history for a sandbox */
getDeployHistory: {
  method: "GET",
  path: "/api/v1/admin/sandboxes/:id/deploy-history",
  query: z.object({
    page: z.coerce.number().default(1),
    pageSize: z.coerce.number().default(20),
  }),
  responses: { 200: deployHistoryListResponse, 404: errorResponse },
},
```

### 8.2 WebSocket Events

Extend the existing WebSocket handler to support log streaming:

```typescript
// New WebSocket event types (add to existing ws handler)

// Client -> Server
interface WsSubscribeLogs {
  type: "subscribe_logs";
  sandboxId: string;
  service?: string;
}

interface WsUnsubscribeLogs {
  type: "unsubscribe_logs";
  sandboxId: string;
}

// Server -> Client
interface WsLogLine {
  type: "sandbox_log";
  sandboxId: string;
  timestamp: string;
  level: string;
  message: string;
  service: string;
}
```

---

## 9. UI Wireframes

### 9.1 Fleet Overview (Enhanced `sandboxes-page.tsx`)

```
┌─────────────────────────────────────────────────────────────────────┐
│  Sandbox Fleet                                    [+ Register]      │
├─────────────────────────────────────────────────────────────────────┤
│  [Deploy Banner: GH v2.3.1 ready - Deploy Now]                     │
├─────────────────────────────────────────────────────────────────────┤
│  Summary Cards:                                                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐           │
│  │ 3 Total  │  │ 2 Running│  │ 1 Stopped│  │ 2 Healthy│           │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘           │
├─────────────────────────────────────────────────────────────────────┤
│  [Search] [Env ▾] [Status ▾] [Health ▾] [EC2 ▾] [Machine ▾] [↻]  │
├─────────────────────────────────────────────────────────────────────┤
│  Name        │ Type  │ Env    │ IP          │ Status │ Health │ EC2 │
│  ─────────── │ ───── │ ────── │ ─────────── │ ────── │ ────── │ ─── │
│  worker-01   │ EC2   │ Prod   │ 34.197.x.x  │ Active │ ✓ OK   │ ▶   │
│  worker-02   │ EC2   │ Prod   │ 52.90.x.x   │ Active │ ! Deg  │ ▶   │
│  dev-mac     │ macOS │ Dev    │ 192.168.x.x │ Active │ ✓ OK   │ --  │
│  worker-03   │ EC2   │ Stg    │ --          │ Stopped│ -- Off │ ■   │
├─────────────────────────────────────────────────────────────────────┤
│  ◄ Page 1 of 1 ►                                                   │
└─────────────────────────────────────────────────────────────────────┘
```

Changes from current: Add "Type" column (machine type), summary cards at top, machine type filter.

### 9.2 Sandbox Detail (Enhanced `sandbox-detail-page.tsx`)

```
┌─────────────────────────────────────────────────────────────────────┐
│  ← Back   worker-prod-01  i-0abc123def                              │
│           [Health Check] [Restart] [Trigger Task] [Terminate]       │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─ Overview ─────────────────────────────────────────────────────┐ │
│  │  Environment: Production    Type: t3.large    Machine: EC2     │ │
│  │  Status: Active             Health: Healthy   Agent: v1.2.0    │ │
│  │  Image: ghcr.io/wekruit/gh:abc1234   Deployed: 2h ago         │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                     │
│  ┌─ EC2 Controls ────────────────────────────────────────────────┐  │
│  │  Status: ● Running    [Start] [Stop]                          │  │
│  │  Auto-stop: [ON]  Idle timeout: [30 min ▾]                    │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  ┌─ Worker Status ───────────────────────────────────────────────┐  │
│  │  (existing WorkerStatusCard content)                          │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  ┌─ Tabs: [Workers] [Logs] [Env Vars] [Containers] [Terminal]  ──┐ │
│  │                                                                │ │
│  │  [Workers Tab]                                                 │ │
│  │  ┌──────────────────────────────────────────────────────────┐  │ │
│  │  │  gh-worker-abc12  │ Running │ Idle  │ 3h uptime │ [Stop]│  │ │
│  │  │  gh-worker-def34  │ Running │ Busy  │ 1h uptime │ [Drain│  │ │
│  │  ├──────────────────────────────────────────────────────────┤  │ │
│  │  │  [+ Start New Worker]                                    │  │ │
│  │  └──────────────────────────────────────────────────────────┘  │ │
│  │                                                                │ │
│  │  [Logs Tab]                                                    │ │
│  │  ┌──────────────────────────────────────────────────────────┐  │ │
│  │  │  Service: [Worker ▾]   Lines: [200 ▾]   [▶ Stream]      │  │ │
│  │  │  ──────────────────────────────────────────────────────  │  │ │
│  │  │  12:34:05 INFO  Worker started, polling for jobs...      │  │ │
│  │  │  12:34:10 INFO  Picked up job abc-123                    │  │ │
│  │  │  12:34:12 DEBUG Opening browser session                  │  │ │
│  │  │  12:34:15 INFO  Navigating to https://workday.com/...    │  │ │
│  │  │  ...                                                     │  │ │
│  │  │  [Auto-scroll ✓]  [Download]  [Clear]                   │  │ │
│  │  └──────────────────────────────────────────────────────────┘  │ │
│  │                                                                │ │
│  │  [Env Vars Tab]                                                │ │
│  │  ┌──────────────────────────────────────────────────────────┐  │ │
│  │  │  GH_ENVIRONMENT     = production                         │  │ │
│  │  │  GH_MODEL           = claude-sonnet-4-20250514          │  │ │
│  │  │  GH_SERVICE_SECRET  = ••••••••••                [Reveal]│  │ │
│  │  │  DATABASE_URL       = ••••••••••                [Reveal]│  │ │
│  │  │  SUPABASE_URL       = https://uni...wkruit.co   [Edit]  │  │ │
│  │  │  ──────────────────────────────────────────────────────  │  │ │
│  │  │  [+ Add Variable]   [Restart After Save: ☑]             │  │ │
│  │  └──────────────────────────────────────────────────────────┘  │ │
│  │                                                                │ │
│  │  [Containers Tab]                                              │ │
│  │  ┌──────────────────────────────────────────────────────────┐  │ │
│  │  │  ghosthands-api-1    │ Running │ ghcr.io/wekruit/gh:..  │  │ │
│  │  │  ghosthands-worker-1 │ Running │ ghcr.io/wekruit/gh:..  │  │ │
│  │  │  adspower            │ Running │ adspower:latest         │  │ │
│  │  └──────────────────────────────────────────────────────────┘  │ │
│  │                                                                │ │
│  │  [Terminal Tab]  (admin-only, audit logged)                    │ │
│  │  ┌──────────────────────────────────────────────────────────┐  │ │
│  │  │  $ docker ps                                             │  │ │
│  │  │  CONTAINER ID  IMAGE           STATUS                    │  │ │
│  │  │  abc123        gh:v2.3.1       Up 3 hours                │  │ │
│  │  │  def456        adspower:latest Up 3 hours                │  │ │
│  │  │  $ _                                                     │  │ │
│  │  └──────────────────────────────────────────────────────────┘  │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                     │
│  ┌─ System Metrics ──────────────────────────────────────────────┐  │
│  │  (existing metrics cards: CPU, Memory, Disk, Services)        │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  ┌─ Deploy History ──────────────────────────────────────────────┐  │
│  │  v2.3.1 (abc1234) │ 2h ago  │ Completed │ 45s   │ @admin    │  │
│  │  v2.3.0 (def5678) │ 3d ago  │ Completed │ 38s   │ auto      │  │
│  │  v2.2.9 (ghi9012) │ 5d ago  │ Rolled back│ 120s │ @admin    │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  ┌─ Audit Log ───────────────────────────────────────────────────┐  │
│  │  12:34 │ deploy        │ admin@wekruit.com │ v2.3.1 deployed  │  │
│  │  12:30 │ set_env       │ admin@wekruit.com │ GH_MODEL changed │  │
│  │  12:00 │ start         │ admin@wekruit.com │ EC2 started      │  │
│  │  ► View all audit logs                                        │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  ┌─ Connection Info ─────────────────────────────────────────────┐  │
│  │  (existing SSH/noVNC/health URLs with copy buttons)           │  │
│  └───────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

### 9.3 Deploy Control Page (Enhanced `deploys-page.tsx`)

```
┌─────────────────────────────────────────────────────────────────────┐
│  Deploy Management                       [Auto-deploy: Staging ON]  │
│                                          [Auto-deploy: Prod    OFF] │
├─────────────────────────────────────────────────────────────────────┤
│  ┌─ Pending Deploys ─────────────────────────────────────────────┐  │
│  │  v2.3.2 (jkl3456) │ "Fix HITL timeout" │ main │ 5m ago       │  │
│  │  [View CI Run]  [Deploy to Staging]  [Deploy to Production]   │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  ┌─ Active Deploys ──────────────────────────────────────────────┐  │
│  │  v2.3.1 -> Prod  │ Deploying...  │ worker-01: ✓  worker-02: ⟳│  │
│  │  [Cancel]                                                     │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  ┌─ Deploy History ──────────────────────────────────────────────┐  │
│  │  Date       │ Image  │ Env  │ Status    │ Duration │ By       │  │
│  │  Feb 18     │ v2.3.1 │ Prod │ Completed │ 45s      │ admin    │  │
│  │  Feb 17     │ v2.3.0 │ Stg  │ Completed │ 38s      │ auto     │  │
│  │  Feb 15     │ v2.2.9 │ Prod │ Rollback  │ 120s     │ admin    │  │
│  └───────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

### 9.4 Fleet-Wide Worker Management (New Page)

```
┌─────────────────────────────────────────────────────────────────────┐
│  Worker Fleet                                                       │
├─────────────────────────────────────────────────────────────────────┤
│  Summary:  5 workers │ 3 idle │ 2 busy │ 0 draining                │
├─────────────────────────────────────────────────────────────────────┤
│  Worker ID     │ Sandbox    │ Status │ Current Job │ Uptime │ Acts │
│  ────────────  │ ─────────  │ ────── │ ─────────── │ ────── │ ──── │
│  gh-abc12      │ worker-01  │ Idle   │ --          │ 3h     │ [⏹]  │
│  gh-def34      │ worker-01  │ Busy   │ task-xyz    │ 3h     │ [⏸]  │
│  gh-ghi56      │ worker-02  │ Idle   │ --          │ 1h     │ [⏹]  │
│  gh-jkl78      │ worker-02  │ Busy   │ task-abc    │ 1h     │ [⏸]  │
│  gh-mno90      │ dev-mac    │ Idle   │ --          │ 6h     │ [⏹]  │
├─────────────────────────────────────────────────────────────────────┤
│  Fleet Actions:  [Drain All]  [Stop All Idle]                       │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 10. Security Architecture

### 10.1 Authentication & Authorization

| Layer           | Mechanism      | Details                                         |
| --------------- | -------------- | ----------------------------------------------- |
| Admin -> VALET  | JWT (existing) | Google OAuth, `adminOnly` middleware            |
| VALET -> Agent  | Shared secret  | `X-Deploy-Secret` header, timing-safe compare   |
| Agent -> Docker | Unix socket    | Docker Engine API via local socket (no network) |
| Agent WebSocket | Token param    | `?token=<secret>` in WebSocket URL              |

### 10.2 Network Security

- **Agent port 8000**: Must be accessible from VALET API server only. Use EC2 security group to restrict inbound to VALET's Fly.io egress IPs.
- **No agent-to-internet exposure**: Agent never needs to accept connections from the public internet. VALET relays all admin requests.
- **HTTPS between VALET and agent**: Currently HTTP. For production hardening, add TLS to the agent (self-signed cert with VALET trusting the CA) or use a VPN/Tailnet.

### 10.3 Secret Protection

- **Env var redaction**: Agent redacts sensitive values on read. The unredacted values never leave the machine.
- **No secret storage in VALET DB**: Env vars live only on the agent machine's `.env` file. VALET never stores them.
- **Deploy secret rotation**: Implement a `/rotate-secret` endpoint on the agent. VALET sends the old + new secret; agent updates and confirms.

### 10.4 Command Execution Safety

The `/exec` endpoint is the most dangerous feature. Safety measures:

1. **Admin-only**: Protected by `adminOnly` middleware in VALET
2. **Audit logged**: Every command is recorded in `sandbox_audit_logs` with user, IP, timestamp, command text, and result
3. **Command allowlist** (optional, Phase 3): Restrict to a set of approved commands (e.g., `docker ps`, `docker logs`, `df -h`)
4. **Timeout**: Hard timeout on agent side (default 30s, max 5min)
5. **No shell expansion**: Agent runs commands via `spawn` with explicit args, not through a shell (prevents injection)
6. **Output truncation**: Responses truncated to 1MB to prevent memory exhaustion
7. **Rate limiting**: Max 10 exec requests per minute per sandbox

### 10.5 Audit Log

Every sandbox management action is logged:

```typescript
interface AuditLogEntry {
  sandboxId: string;
  userId: string;
  action:
    | "start"
    | "stop"
    | "deploy"
    | "drain"
    | "set_env"
    | "delete_env"
    | "exec"
    | "start_worker"
    | "stop_worker"
    | "build"
    | "terminate"
    | "health_check"
    | "restart_service"
    | "screenshot";
  details: Record<string, unknown>; // Action-specific data
  ipAddress: string;
  result: "success" | "failure" | "error";
  errorMessage?: string;
  durationMs?: number;
}
```

---

## 11. Implementation Phases

### Phase 1: Agent Foundation + Provider Abstraction (Week 1-2)

**Goal:** Establish the provider pattern and extend the agent with essential new endpoints.

| Task                                                                            | Size | Files                                     |
| ------------------------------------------------------------------------------- | ---- | ----------------------------------------- |
| Create `SandboxProvider` interface                                              | S    | `providers/sandbox-provider.interface.ts` |
| Create `Ec2SandboxProvider` (refactor from `ec2.service.ts`)                    | M    | `providers/ec2-sandbox.provider.ts`       |
| Create `SandboxProviderFactory`                                                 | S    | `providers/provider-factory.ts`           |
| Create `SandboxAgentClient`                                                     | M    | `agent/sandbox-agent.client.ts`           |
| Refactor `SandboxService` to use provider + agent client                        | M    | `sandbox.service.ts`                      |
| DB migration: add `machine_type`, `agent_version`, `agent_last_seen_at` columns | S    | `drizzle/NNNN_sandbox_machine_type.sql`   |
| Add `GET /containers` endpoint to agent                                         | S    | `deploy-server.ts`                        |
| Add `GET /workers` endpoint to agent                                            | S    | `deploy-server.ts`                        |
| Add `GET /status` endpoint to agent                                             | S    | `deploy-server.ts`                        |
| Add `GET /metrics` endpoint to agent                                            | S    | `deploy-server.ts`                        |
| Update `SandboxForm` to include machine type selector                           | S    | `sandbox-form.tsx`                        |
| Add "Machine Type" column to fleet table                                        | S    | `sandboxes-page.tsx`                      |
| Create `sandbox_audit_logs` table                                               | S    | `drizzle/NNNN_sandbox_audit_logs.sql`     |
| Create `AuditLogService`                                                        | M    | `audit-log.service.ts`                    |
| Wire audit logging into existing operations (start/stop/deploy/terminate)       | M    | `sandbox.routes.ts`                       |

### Phase 2: Logs + Env Vars + Worker Management (Week 3-4)

**Goal:** Add the most-requested features: log viewing, env var management, per-worker controls.

| Task                                                         | Size | Files                             |
| ------------------------------------------------------------ | ---- | --------------------------------- |
| Add `GET /logs` endpoint to agent (Docker log tailing)       | M    | `deploy-server.ts`                |
| Add `WS /ws/logs` endpoint to agent (streaming)              | L    | `deploy-server.ts`                |
| Add log relay to VALET WebSocket handler                     | M    | `websocket/handler.ts`            |
| Create `LogViewer` React component (historical + streaming)  | L    | `log-viewer.tsx`                  |
| Add `GET /env` endpoint to agent (read with redaction)       | M    | `deploy-server.ts`                |
| Add `POST /env` endpoint to agent (write + optional restart) | M    | `deploy-server.ts`                |
| Create `EnvVarEditor` React component                        | M    | `env-var-editor.tsx`              |
| Add `POST /workers/start` endpoint to agent                  | S    | `deploy-server.ts`                |
| Add `POST /workers/:id/stop` endpoint to agent               | S    | `deploy-server.ts`                |
| Create `WorkerManagement` tab component                      | M    | `worker-management.tsx`           |
| Add new API routes to VALET contract + router                | M    | `sandbox.ts`, `sandbox.routes.ts` |
| Add tabbed interface to sandbox detail page                  | M    | `sandbox-detail-page.tsx`         |

### Phase 3: Command Execution + Screenshots + Deploy History (Week 5-6)

**Goal:** Complete the management feature set.

| Task                                                   | Size | Files                   |
| ------------------------------------------------------ | ---- | ----------------------- |
| Add `POST /exec` endpoint to agent                     | M    | `deploy-server.ts`      |
| Add `WS /ws/exec` endpoint to agent (streaming output) | M    | `deploy-server.ts`      |
| Create `Terminal` React component (xterm.js)           | L    | `terminal.tsx`          |
| Add `GET /screenshot` endpoint to agent                | M    | `deploy-server.ts`      |
| Create `ScreenshotViewer` component                    | S    | `screenshot-viewer.tsx` |
| Create `sandbox_deploy_history` table                  | S    | DB migration            |
| Migrate deploy tracking from Redis to DB               | M    | `deploy.service.ts`     |
| Create `DeployHistory` component                       | M    | `deploy-history.tsx`    |
| Create `AuditLog` component                            | M    | `audit-log.tsx`         |
| Add `POST /build` endpoint to agent                    | M    | `deploy-server.ts`      |
| Add command allowlist config to agent                  | S    | `deploy-server.ts`      |
| Fleet-wide worker management page                      | L    | `workers-page.tsx`      |

### Phase 4: macOS Provider + Polish (Week 7-8)

**Goal:** Add macOS support and polish the complete system.

| Task                                                      | Size | Files                                 |
| --------------------------------------------------------- | ---- | ------------------------------------- |
| Create `MacOsSandboxProvider`                             | M    | `providers/macos-sandbox.provider.ts` |
| Port Sandbox Agent to run on macOS (Docker Desktop paths) | M    | `deploy-server.ts`                    |
| macOS-specific agent features (Homebrew, launchd)         | M    | Agent code                            |
| Summary cards on fleet overview page                      | S    | `sandboxes-page.tsx`                  |
| Deploy config page enhancements (per-env auto-deploy)     | M    | `deploys-page.tsx`                    |
| E2E tests for agent endpoints                             | L    | `__tests__/`                          |
| Integration tests for provider pattern                    | M    | `__tests__/`                          |
| Documentation                                             | M    | `docs/`                               |

---

## 12. Effort Estimates

### By Component

| Component                                                   | Size | Effort (days) | Dependencies           |
| ----------------------------------------------------------- | ---- | ------------- | ---------------------- |
| Provider interface + factory                                | S    | 1-2           | None                   |
| `Ec2SandboxProvider`                                        | M    | 2-3           | Provider interface     |
| `SandboxAgentClient`                                        | M    | 2-3           | None                   |
| `SandboxService` refactor                                   | M    | 2-3           | Provider, agent client |
| Agent: new endpoints (containers, workers, status, metrics) | M    | 3-4           | None (GH side)         |
| Agent: log endpoints (HTTP + WS)                            | L    | 4-5           | None (GH side)         |
| Agent: env var endpoints                                    | M    | 2-3           | None (GH side)         |
| Agent: exec endpoints                                       | M    | 3-4           | None (GH side)         |
| Agent: screenshot endpoint                                  | S    | 1-2           | None (GH side)         |
| Agent: build endpoint                                       | M    | 2-3           | None (GH side)         |
| DB migrations (3 tables/alterations)                        | S    | 1             | None                   |
| Audit log service                                           | M    | 2-3           | DB migration           |
| VALET API routes (all new endpoints)                        | M    | 3-4           | Agent client, audit    |
| WebSocket log relay                                         | M    | 2-3           | Agent WS, existing WS  |
| UI: Log viewer component                                    | L    | 4-5           | API routes             |
| UI: Env var editor                                          | M    | 2-3           | API routes             |
| UI: Worker management tab                                   | M    | 2-3           | API routes             |
| UI: Terminal component (xterm.js)                           | L    | 4-5           | Exec endpoint          |
| UI: Screenshot viewer                                       | S    | 1             | Screenshot endpoint    |
| UI: Deploy history                                          | M    | 2-3           | DB migration           |
| UI: Audit log viewer                                        | M    | 2-3           | Audit service          |
| UI: Fleet worker page                                       | L    | 3-4           | Worker endpoints       |
| UI: Enhanced sandbox detail (tabs)                          | M    | 2-3           | All tabs               |
| `MacOsSandboxProvider`                                      | M    | 3-4           | Provider interface     |
| Tests                                                       | L    | 5-7           | All above              |
| Documentation                                               | M    | 2-3           | All above              |

### By Phase

| Phase     | Duration    | Effort           | Key Deliverables                                                                            |
| --------- | ----------- | ---------------- | ------------------------------------------------------------------------------------------- |
| Phase 1   | 2 weeks     | ~15 dev-days     | Provider pattern, agent foundation, audit logs, containers/workers/status/metrics endpoints |
| Phase 2   | 2 weeks     | ~20 dev-days     | Log streaming, env var management, worker controls, tabbed detail UI                        |
| Phase 3   | 2 weeks     | ~20 dev-days     | Terminal, screenshots, deploy history, fleet worker page                                    |
| Phase 4   | 2 weeks     | ~15 dev-days     | macOS provider, polish, tests, documentation                                                |
| **Total** | **8 weeks** | **~70 dev-days** | Full universal sandbox management system                                                    |

### Risk Assessment

| Risk                                                 | Likelihood | Impact   | Mitigation                                                        |
| ---------------------------------------------------- | ---------- | -------- | ----------------------------------------------------------------- |
| WebSocket relay complexity (VALET -> agent -> VALET) | Medium     | High     | Start with HTTP polling for logs, add WS streaming later          |
| Agent security surface area (exec endpoint)          | Low        | Critical | Ship without exec in Phase 1-2, add with allowlist in Phase 3     |
| macOS Docker Desktop differences                     | Medium     | Medium   | Keep agent code platform-agnostic, isolate platform-specific code |
| Agent update coordination                            | Medium     | Medium   | Agent auto-updates via deploy endpoint, version tracking in DB    |
| Env var write failures (corrupted .env)              | Low        | High     | Atomic write (temp file + rename), backup before write            |

---

## Appendix A: Agent Endpoint Detail (deploy-server.ts extensions)

The following is a sketch of how the agent endpoints would be added to the existing `deploy-server.ts`:

```typescript
// GET /containers — List Docker containers
if (url.pathname === "/containers" && req.method === "GET") {
  if (!verifySecret(req)) return unauthorized();
  const proc = Bun.spawn(["docker", "ps", "-a", "--format", "json"]);
  const text = await new Response(proc.stdout).text();
  const containers = text
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  return Response.json({ containers });
}

// GET /logs — Historical logs
if (url.pathname === "/logs" && req.method === "GET") {
  if (!verifySecret(req)) return unauthorized();
  const service = url.searchParams.get("service") ?? "worker";
  const lines = parseInt(url.searchParams.get("lines") ?? "200");
  const containerName = serviceToContainer(service);
  const proc = Bun.spawn([
    "docker",
    "logs",
    "--tail",
    String(lines),
    "--timestamps",
    containerName,
  ]);
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const combined = (stdout + stderr).trim().split("\n").map(parseLogLine);
  return Response.json({ lines: combined, service, truncated: combined.length >= lines });
}

// GET /env — Read env vars (redacted)
if (url.pathname === "/env" && req.method === "GET") {
  if (!verifySecret(req)) return unauthorized();
  const envFile = Bun.file(`${COMPOSE_DIR}/.env`);
  const text = await envFile.text();
  const vars: Record<string, string> = {};
  const redacted: string[] = [];
  for (const line of text.split("\n")) {
    if (!line.trim() || line.startsWith("#")) continue;
    const [key, ...rest] = line.split("=");
    const value = rest.join("=");
    if (isSensitiveKey(key)) {
      vars[key] = "***";
      redacted.push(key);
    } else {
      vars[key] = value;
    }
  }
  return Response.json({ vars, redactedKeys: redacted });
}
```

---

## Appendix B: Alternatives Considered and Rejected

### B1. Adopt Komodo (Core + Periphery)

**Pros:** Mature Rust agent, TypeScript SDK, REST + WS API, Docker management, terminal access, build pipelines.

**Cons:** GPL-3.0 license (viral, incompatible with commercial use without full source disclosure). Requires deploying Komodo Core as a separate service. Does not handle EC2 lifecycle or HITL. No macOS Docker Desktop support.

**Verdict:** Rejected due to license. However, the architecture pattern (Core + Periphery) is exactly right and we follow it.

### B2. Use AWS SSM for Remote Command Execution

**Pros:** Already available on EC2, no agent to deploy, IAM-based auth.

**Cons:** Only works on EC2 (not macOS), does not handle Docker operations, no streaming API, high latency for interactive use, adds AWS SDK dependency for every operation.

**Verdict:** Rejected. SSM is too slow and not portable across machine types. The agent approach is faster and universal.

### B3. SSH-based (Agentless)

**Pros:** No agent to deploy/maintain, works everywhere, well-understood.

**Cons:** SSH key management complexity, no WebSocket streaming, no structured API (parsing shell output), firewall challenges, hard to secure at scale, no health heartbeat.

**Verdict:** Rejected. SSH is fine for debugging but not for a management API.

### B4. Tailscale/Wireguard Mesh + Direct Docker API

**Pros:** Secure network layer, direct Docker Engine API access.

**Cons:** Still need something to proxy Docker API, no log streaming built in, Tailscale adds operational complexity, Docker API is too low-level (no env var management, no deploy orchestration).

**Verdict:** Partially adopted: Tailscale could be a future network layer improvement (Phase 4+), but does not replace the agent.
