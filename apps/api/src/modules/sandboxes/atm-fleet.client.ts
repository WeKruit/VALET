import type { FastifyBaseLogger } from "fastify";
import type { SandboxRecord } from "./sandbox.repository.js";

// ── Types ────────────────────────────────────────────────────────────

export interface AtmWorkerState {
  serverId: string;
  ip: string;
  instanceId: string | null;
  ec2State: string;
  activeJobs: number;
  idleSinceMs: number;
  transitioning: boolean;
}

export interface AtmIdleStatus {
  enabled: boolean;
  workers: AtmWorkerState[];
}

export interface AtmWakeResult {
  status: string;
  serverId: string;
  instanceId: string;
  ip: string | null;
}

export interface AtmStopResult {
  status: string;
  serverId: string;
  instanceId: string;
}

export interface AtmHealthResult {
  status: "healthy" | "degraded" | "offline";
  activeWorkers: number;
  deploySafe: boolean;
  apiHealthy: boolean;
  workerStatus: string;
  uptimeMs: number;
}

// ── Cache ────────────────────────────────────────────────────────────

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const IDLE_STATUS_CACHE_TTL_MS = 60_000; // 1 minute
const FLEET_ID_CACHE_TTL_MS = 300_000; // 5 minutes

// ── Client ───────────────────────────────────────────────────────────

/**
 * HTTP client for ATM fleet management operations.
 * Centralizes EC2 lifecycle (wake/stop), health queries, and fleet ID resolution
 * so VALET doesn't need direct AWS SDK access for fleet operations.
 */
export class AtmFleetClient {
  private baseUrl: string;
  private deploySecret: string;
  private logger: FastifyBaseLogger;
  private fleetIdCache: Map<string, CacheEntry<string>> = new Map();
  private idleStatusCache: CacheEntry<AtmIdleStatus> | null = null;

  constructor({ logger }: { logger: FastifyBaseLogger }) {
    this.baseUrl = (process.env.ATM_BASE_URL || "").replace(/\/$/, "");
    this.deploySecret = process.env.ATM_DEPLOY_SECRET || "";
    this.logger = logger;
  }

  /** Whether ATM integration is configured */
  get isConfigured(): boolean {
    return !!this.baseUrl;
  }

  // ── Fleet ID Resolution ──────────────────────────────────────────

  /**
   * Resolve ATM fleet server ID for a sandbox.
   * 1. Check sandbox tags for atm_fleet_id
   * 2. Look up from ATM /fleet/idle-status by matching instanceId
   * 3. Fall back to matching by IP
   */
  async resolveFleetId(sandbox: SandboxRecord): Promise<string | null> {
    if (!this.isConfigured) return null;

    // Check tags first (fast path, no network)
    const tags = sandbox.tags as Record<string, unknown> | null;
    const taggedFleetId = tags?.atm_fleet_id as string | undefined;
    if (taggedFleetId) return taggedFleetId;

    // Check in-memory cache
    const cached = this.fleetIdCache.get(sandbox.instanceId);
    if (cached && cached.expiresAt > Date.now()) return cached.data;

    // Look up from ATM
    try {
      const status = await this.getIdleStatus();

      // Match by EC2 instance ID
      const byInstanceId = status.workers.find((w) => w.instanceId === sandbox.instanceId);
      if (byInstanceId) {
        this.cacheFleetId(sandbox.instanceId, byInstanceId.serverId);
        return byInstanceId.serverId;
      }

      // Fallback: match by IP
      if (sandbox.publicIp) {
        const byIp = status.workers.find((w) => w.ip === sandbox.publicIp);
        if (byIp) {
          this.cacheFleetId(sandbox.instanceId, byIp.serverId);
          return byIp.serverId;
        }
      }
    } catch (err) {
      this.logger.debug({ err, sandboxId: sandbox.id }, "Failed to resolve fleet ID from ATM");
    }

    return null;
  }

  /**
   * Synchronous fleet ID lookup from sandbox tags only.
   * Returns null if not cached in tags — use resolveFleetId() for full resolution.
   */
  resolveFleetIdSync(sandbox: SandboxRecord): string | null {
    const tags = sandbox.tags as Record<string, unknown> | null;
    return (tags?.atm_fleet_id as string) ?? null;
  }

  // ── ATM API Methods ──────────────────────────────────────────────

  async getIdleStatus(): Promise<AtmIdleStatus> {
    if (this.idleStatusCache && this.idleStatusCache.expiresAt > Date.now()) {
      return this.idleStatusCache.data;
    }

    const data = await this.get<AtmIdleStatus>("/fleet/idle-status");
    this.idleStatusCache = { data, expiresAt: Date.now() + IDLE_STATUS_CACHE_TTL_MS };
    return data;
  }

  /** Wake a specific fleet worker. Polls until healthy (up to 120s). */
  async wakeWorker(fleetId: string): Promise<AtmWakeResult> {
    this.invalidateIdleStatusCache();
    return this.post<AtmWakeResult>(`/fleet/${fleetId}/wake`, undefined, 130_000);
  }

  /** Stop a specific fleet worker. Fails if worker has active jobs. */
  async stopWorker(fleetId: string): Promise<AtmStopResult> {
    this.invalidateIdleStatusCache();
    return this.post<AtmStopResult>(`/fleet/${fleetId}/stop`, undefined, 15_000);
  }

  /** Get aggregated health for a specific fleet worker via ATM proxy. */
  async getWorkerHealth(fleetId: string): Promise<AtmHealthResult> {
    return this.get<AtmHealthResult>(`/fleet/${fleetId}/health`);
  }

  /**
   * Get EC2 state for a worker from ATM idle-status.
   * Returns the worker state or null if not found.
   */
  async getWorkerState(fleetId: string): Promise<AtmWorkerState | null> {
    const status = await this.getIdleStatus();
    return status.workers.find((w) => w.serverId === fleetId) ?? null;
  }

  // ── Private ──────────────────────────────────────────────────────

  private cacheFleetId(instanceId: string, fleetId: string): void {
    this.fleetIdCache.set(instanceId, {
      data: fleetId,
      expiresAt: Date.now() + FLEET_ID_CACHE_TTL_MS,
    });
  }

  private invalidateIdleStatusCache(): void {
    this.idleStatusCache = null;
  }

  private async get<T>(path: string, timeoutMs = 10_000): Promise<T> {
    const resp = await fetch(`${this.baseUrl}${path}`, {
      headers: { "X-Deploy-Secret": this.deploySecret },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      throw new AtmError(resp.status, text);
    }
    return resp.json() as Promise<T>;
  }

  private async post<T>(path: string, body?: unknown, timeoutMs = 60_000): Promise<T> {
    const resp = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Deploy-Secret": this.deploySecret,
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      throw new AtmError(resp.status, text);
    }
    return resp.json() as Promise<T>;
  }
}

export class AtmError extends Error {
  public readonly statusCode: number;
  public readonly responseBody: string;

  constructor(statusCode: number, responseBody: string) {
    // Try to extract error message from JSON response
    let errorMessage = responseBody;
    try {
      const parsed = JSON.parse(responseBody) as { error?: string; message?: string };
      errorMessage = parsed.error || parsed.message || responseBody;
    } catch {
      // Not JSON
    }
    super(`ATM ${statusCode}: ${errorMessage}`);
    this.name = "AtmError";
    this.statusCode = statusCode;
    this.responseBody = responseBody;
  }
}
