import type { FastifyBaseLogger } from "fastify";
import type { SandboxRecord } from "./sandbox.repository.js";
import type { SandboxProviderFactory } from "./providers/provider-factory.js";
import type { KasmClient } from "./kasm/kasm.client.js";

// ─── Types ───

export interface PortCheckResult {
  name: string;
  port: number;
  status: "up" | "down" | "timeout";
  responseTimeMs: number;
  details?: Record<string, unknown>;
}

export interface DeepHealthResult {
  overall: "healthy" | "degraded" | "unhealthy";
  checks: PortCheckResult[];
  timestamp: number;
}

// ─── Port Definitions ───

const EC2_PORTS = [
  { name: "GH API", port: 3100, path: "/health", critical: true },
  { name: "GH Worker", port: 3101, path: "/health", critical: false },
  { name: "Deploy Server", port: 8000, path: "/health", critical: false },
] as const;

const PROBE_TIMEOUT_MS = 8_000;

/**
 * Performs multi-port health probes against sandbox instances.
 *
 * EC2 sandboxes: probes ports 3100, 3101, 8000
 * Kasm sandboxes: checks Kasm session status + probes the mapped GH API port
 */
export class DeepHealthChecker {
  private logger: FastifyBaseLogger;
  private providerFactory: SandboxProviderFactory;
  private kasmClient: KasmClient | null;

  constructor({
    logger,
    sandboxProviderFactory,
    kasmClient,
  }: {
    logger: FastifyBaseLogger;
    sandboxProviderFactory: SandboxProviderFactory;
    kasmClient?: KasmClient | null;
  }) {
    this.logger = logger;
    this.providerFactory = sandboxProviderFactory;
    this.kasmClient = kasmClient ?? null;
  }

  /**
   * Run a deep health check against a sandbox, probing all required services.
   */
  async check(sandbox: SandboxRecord): Promise<DeepHealthResult> {
    const machineType = sandbox.machineType ?? "ec2";

    if (machineType === "kasm") {
      return this.checkKasm(sandbox);
    }

    // EC2 / macOS / local_docker all use the same port layout
    return this.checkEc2(sandbox);
  }

  // ─── EC2 Health Check ───

  private async checkEc2(sandbox: SandboxRecord): Promise<DeepHealthResult> {
    const ip = sandbox.publicIp;
    if (!ip) {
      return {
        overall: "unhealthy",
        checks: EC2_PORTS.map((p) => ({
          name: p.name,
          port: p.port,
          status: "down" as const,
          responseTimeMs: 0,
          details: { error: "No public IP configured" },
        })),
        timestamp: Date.now(),
      };
    }

    const checks = await Promise.all(
      EC2_PORTS.map((portDef) => this.probePort(ip, portDef.port, portDef.path, portDef.name)),
    );

    return {
      overall: this.computeOverall(checks),
      checks,
      timestamp: Date.now(),
    };
  }

  // ─── Kasm Health Check ───

  private async checkKasm(sandbox: SandboxRecord): Promise<DeepHealthResult> {
    const checks: PortCheckResult[] = [];

    // 1. Check Kasm session is alive
    const kasmCheck = await this.checkKasmSession(sandbox);
    checks.push(kasmCheck);

    // 2. Probe the GH API port (resolved from kasm_port_map or fallback)
    const portMap = (sandbox.tags as Record<string, unknown> | null)?.kasm_port_map as
      | Record<string, { port: number; path: string }>
      | undefined;

    const hostname =
      sandbox.publicIp ??
      ((sandbox.tags as Record<string, unknown> | null)?.kasm_hostname as string | undefined);

    if (hostname && portMap?.["3100"]) {
      const mappedPort = portMap["3100"].port;
      const ghApiCheck = await this.probePort(hostname, mappedPort, "/health", "GH API");
      // Override the port in the result to show the container port (3100) for clarity
      checks.push({ ...ghApiCheck, details: { ...ghApiCheck.details, mappedPort } });
    } else if (hostname) {
      // Fallback: try port 3100 directly
      const ghApiCheck = await this.probePort(hostname, 3100, "/health", "GH API");
      checks.push(ghApiCheck);
    } else {
      checks.push({
        name: "GH API",
        port: 3100,
        status: "down",
        responseTimeMs: 0,
        details: { error: "No hostname or port map available" },
      });
    }

    return {
      overall: this.computeKasmOverall(checks),
      checks,
      timestamp: Date.now(),
    };
  }

  private async checkKasmSession(sandbox: SandboxRecord): Promise<PortCheckResult> {
    if (!this.kasmClient) {
      return {
        name: "Kasm Session",
        port: 0,
        status: "down",
        responseTimeMs: 0,
        details: { error: "Kasm client not configured" },
      };
    }

    if (!sandbox.instanceId) {
      return {
        name: "Kasm Session",
        port: 0,
        status: "down",
        responseTimeMs: 0,
        details: { error: "No Kasm session ID (instanceId)" },
      };
    }

    const start = Date.now();
    try {
      const response = await this.kasmClient.getKasmStatus(sandbox.instanceId);
      const elapsed = Date.now() - start;
      const opStatus = response.kasm?.operational_status ?? "unknown";

      if (opStatus === "running") {
        return {
          name: "Kasm Session",
          port: 0,
          status: "up",
          responseTimeMs: elapsed,
          details: { operationalStatus: opStatus },
        };
      }

      return {
        name: "Kasm Session",
        port: 0,
        status: "down",
        responseTimeMs: elapsed,
        details: { operationalStatus: opStatus },
      };
    } catch (err) {
      return {
        name: "Kasm Session",
        port: 0,
        status: "down",
        responseTimeMs: Date.now() - start,
        details: { error: err instanceof Error ? err.message : "Unknown error" },
      };
    }
  }

  // ─── Port Probe ───

  private async probePort(
    host: string,
    port: number,
    path: string,
    name: string,
  ): Promise<PortCheckResult> {
    const url = `http://${host}:${port}${path}`;
    const start = Date.now();

    try {
      const resp = await fetch(url, {
        signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      });
      const elapsed = Date.now() - start;

      if (!resp.ok) {
        return {
          name,
          port,
          status: "down",
          responseTimeMs: elapsed,
          details: { httpStatus: resp.status },
        };
      }

      // Try to parse JSON body for richer details
      let details: Record<string, unknown> = { httpStatus: resp.status };
      try {
        const body = (await resp.json()) as Record<string, unknown>;
        details = { ...details, ...body };
      } catch {
        // Not JSON — that's fine (e.g. noVNC returns HTML)
      }

      return {
        name,
        port,
        status: "up",
        responseTimeMs: elapsed,
        details,
      };
    } catch (err) {
      const elapsed = Date.now() - start;
      const isTimeout =
        err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");

      this.logger.debug(
        { host, port, name, err: err instanceof Error ? err.message : "Unknown" },
        "Deep health probe failed",
      );

      return {
        name,
        port,
        status: isTimeout ? "timeout" : "down",
        responseTimeMs: elapsed,
        details: { error: err instanceof Error ? err.message : "Unknown error" },
      };
    }
  }

  // ─── Overall Status Computation ───

  /**
   * EC2 overall status rules:
   * - healthy: ALL checks pass
   * - degraded: GH API (port 3100) is up, but something else is down
   * - unhealthy: GH API (port 3100) is down
   */
  private computeOverall(checks: PortCheckResult[]): DeepHealthResult["overall"] {
    const ghApi = checks.find((c) => c.name === "GH API");

    if (!ghApi || ghApi.status !== "up") {
      return "unhealthy";
    }

    const allUp = checks.every((c) => c.status === "up");
    return allUp ? "healthy" : "degraded";
  }

  /**
   * Kasm overall status rules:
   * - healthy: Session alive AND GH API up
   * - degraded: Session alive but GH API down
   * - unhealthy: Session not alive
   */
  private computeKasmOverall(checks: PortCheckResult[]): DeepHealthResult["overall"] {
    const kasmSession = checks.find((c) => c.name === "Kasm Session");
    const ghApi = checks.find((c) => c.name === "GH API");

    if (!kasmSession || kasmSession.status !== "up") {
      return "unhealthy";
    }

    if (!ghApi || ghApi.status !== "up") {
      return "degraded";
    }

    return "healthy";
  }
}
