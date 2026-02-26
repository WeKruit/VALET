import type { FastifyBaseLogger } from "fastify";
import { AppError } from "../../common/errors.js";
import type { SandboxRepository } from "../sandboxes/sandbox.repository.js";
import type { GhAutomationJobRepository } from "./gh-automation-job.repository.js";
import type {
  GHSubmitApplicationParams,
  GHSubmitApplicationResponse,
  GHSubmitGenericTaskParams,
  GHSubmitGenericTaskResponse,
  GHJobStatus,
  GHResumeJobParams,
  GHResumeJobResponse,
  GHSessionListResponse,
  GHClearSessionResponse,
  GHClearAllSessionsResponse,
  GHDetailedHealth,
  GHMetrics,
  GHWorkerStatus,
  GHWorkerHealth,
  GHWorkerFleetResponse,
  GHDeregisterWorkerParams,
  GHDeregisterWorkerResponse,
  GHModelCatalog,
} from "./ghosthands.types.js";

/** TTL for cached resolved URLs (30 seconds) */
const URL_CACHE_TTL_MS = 30_000;

export class GhostHandsClient {
  private baseUrl: string;
  private workerBaseUrl: string;
  private serviceKey: string;
  private logger: FastifyBaseLogger;
  private sandboxRepo: SandboxRepository | null = null;
  private ghJobRepo: GhAutomationJobRepository | null = null;

  /** Cached resolved IP — shared between resolveApiUrl and resolveWorkerUrl */
  private _cachedIp: string | null = null;
  private _cachedIpTimestamp = 0;

  constructor({
    ghosthandsApiUrl,
    ghosthandsServiceKey,
    logger,
  }: {
    ghosthandsApiUrl: string;
    ghosthandsServiceKey: string;
    logger: FastifyBaseLogger;
  }) {
    this.baseUrl = ghosthandsApiUrl.replace(/\/+$/, "");
    this.workerBaseUrl = ghosthandsApiUrl.replace(/:\d+\/?$/, "").replace(/\/+$/, "") + ":3101";
    this.serviceKey = ghosthandsServiceKey;
    this.logger = logger;
  }

  /**
   * Inject the SandboxRepository for dynamic GH API URL resolution.
   * Called after DI container construction to avoid circular dependencies.
   */
  setSandboxRepository(repo: SandboxRepository): void {
    this.sandboxRepo = repo;
  }

  /**
   * Inject the GhAutomationJobRepository for job-targeted routing.
   * Called after DI container construction to avoid circular dependencies.
   */
  setGhJobRepository(repo: GhAutomationJobRepository): void {
    this.ghJobRepo = repo;
  }

  /**
   * Resolve the healthy EC2 sandbox IP, with a 30s TTL cache to avoid
   * hitting the DB on every request.
   */
  private async resolveHealthyIp(): Promise<string | null> {
    const now = Date.now();
    if (this._cachedIp && now - this._cachedIpTimestamp < URL_CACHE_TTL_MS) {
      return this._cachedIp;
    }

    if (!this.sandboxRepo) return null;

    try {
      const sandboxes = await this.sandboxRepo.findActive("ec2");
      // Accept "healthy" or "degraded" — degraded means the GH API (port 3100) is up
      // but a non-critical service (e.g. deploy-server) is down.
      const healthy = sandboxes.find(
        (s) => (s.healthStatus === "healthy" || s.healthStatus === "degraded") && s.publicIp,
      );
      if (healthy?.publicIp) {
        this._cachedIp = healthy.publicIp;
        this._cachedIpTimestamp = now;
        return healthy.publicIp;
      }
    } catch (err) {
      this.logger.warn({ err }, "Failed to resolve dynamic GH IP, falling back to static");
    }

    return null;
  }

  /**
   * Resolve the GH API URL dynamically from the database.
   * Prefers healthy EC2 sandbox IPs over the static env var.
   * Falls back to the static baseUrl if no healthy sandbox is found or on error.
   */
  async resolveApiUrl(): Promise<string> {
    const ip = await this.resolveHealthyIp();
    if (ip) {
      const dynamicUrl = `http://${ip}:3100`;
      if (dynamicUrl !== this.baseUrl) {
        this.logger.info(
          { dynamicUrl, staticUrl: this.baseUrl },
          "GhostHands using dynamic API URL from sandbox DB",
        );
      }
      return dynamicUrl;
    }
    return this.baseUrl;
  }

  /**
   * Resolve the GH worker URL (port 3101) dynamically from the database.
   * Falls back to the static workerBaseUrl.
   */
  private async resolveWorkerUrl(): Promise<string> {
    const ip = await this.resolveHealthyIp();
    if (ip) {
      return `http://${ip}:3101`;
    }
    return this.workerBaseUrl;
  }

  // ─── Fleet-Aware Routing (WEK-402) ───

  /**
   * Resolve the EC2 IP for a specific job by looking up its workerId
   * in gh_automation_jobs, then the worker's ec2_ip in gh_worker_registry.
   * Returns null if lookup fails at any step (graceful fallback).
   */
  private async resolveWorkerIpForJob(jobId: string): Promise<string | null> {
    if (!this.ghJobRepo || !this.sandboxRepo) return null;

    try {
      const job = await this.ghJobRepo.findById(jobId);
      if (!job?.workerId) {
        this.logger.warn(
          { jobId },
          "Fleet routing fallback — job has no workerId, cancel/resume may reach wrong EC2",
        );
        return null;
      }

      const ip = await this.sandboxRepo.findWorkerIp(job.workerId);
      if (!ip) {
        this.logger.error(
          { jobId, workerId: job.workerId },
          "Fleet routing error — workerId not found in gh_worker_registry, cancel/resume will reach wrong EC2",
        );
      }
      return ip;
    } catch (err) {
      this.logger.warn({ err, jobId }, "Failed to resolve worker IP for job, falling back");
      return null;
    }
  }

  /**
   * Resolve the EC2 IP for a specific worker ID via gh_worker_registry.
   * Returns null if lookup fails (graceful fallback).
   */
  private async resolveWorkerIpById(workerId: string): Promise<string | null> {
    if (!this.sandboxRepo) return null;

    try {
      return await this.sandboxRepo.findWorkerIp(workerId);
    } catch (err) {
      this.logger.warn({ err, workerId }, "Failed to resolve worker IP by ID, falling back");
      return null;
    }
  }

  /**
   * Resolve the GH API URL (port 3100) for a specific job.
   * Falls back to the generic resolveApiUrl() if job-targeted lookup fails.
   */
  private async resolveApiUrlForJob(jobId: string): Promise<string> {
    const ip = await this.resolveWorkerIpForJob(jobId);
    if (ip) {
      this.logger.info(
        { jobId, resolvedIp: ip },
        "GhostHands targeted API routing: job → worker → EC2",
      );
      return `http://${ip}:3100`;
    }
    return this.resolveApiUrl();
  }

  /**
   * Resolve the GH worker URL (port 3101) for a specific job.
   * Falls back to the generic resolveWorkerUrl() if job-targeted lookup fails.
   */
  private async resolveWorkerUrlForJob(jobId: string): Promise<string> {
    const ip = await this.resolveWorkerIpForJob(jobId);
    if (ip) {
      this.logger.info(
        { jobId, resolvedIp: ip },
        "GhostHands targeted worker routing: job → worker → EC2",
      );
      return `http://${ip}:3101`;
    }
    return this.resolveWorkerUrl();
  }

  /**
   * Resolve the GH worker URL (port 3101) for a specific worker ID.
   * Falls back to the generic resolveWorkerUrl() if lookup fails.
   */
  private async resolveWorkerUrlById(workerId: string): Promise<string> {
    const ip = await this.resolveWorkerIpById(workerId);
    if (ip) {
      this.logger.info(
        { workerId, resolvedIp: ip },
        "GhostHands targeted worker routing: workerId → EC2",
      );
      return `http://${ip}:3101`;
    }
    return this.resolveWorkerUrl();
  }

  /**
   * Make a request to a specific GH API URL (job-targeted routing).
   */
  private async requestTargeted<T>(
    method: string,
    path: string,
    targetUrl: string,
    body?: unknown,
    timeoutMs = 15_000,
  ): Promise<T> {
    const url = `${targetUrl}${path}`;
    this.logger.debug({ method, url }, "GhostHands targeted request");

    const res = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        "X-GH-Service-Key": this.serviceKey,
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      this.logger.error(
        { status: res.status, url, responseBody: text },
        "GhostHands targeted request failed",
      );

      if (res.status === 409) {
        try {
          const parsed = JSON.parse(text) as GHSubmitApplicationResponse;
          return parsed as T;
        } catch {
          throw AppError.internal(`GhostHands API 409 conflict with non-JSON body`);
        }
      }

      throw AppError.internal(`GhostHands API error: ${res.status} ${res.statusText}`);
    }

    return (await res.json()) as T;
  }

  /**
   * Make a request to a specific GH worker URL (worker-targeted routing).
   */
  private async workerRequestTargeted<T>(
    method: string,
    path: string,
    targetUrl: string,
    timeoutMs = 5_000,
  ): Promise<T> {
    const url = `${targetUrl}${path}`;
    this.logger.debug({ method, url }, "GhostHands targeted worker request");
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw AppError.internal(`GhostHands worker API error: ${res.status} ${text}`);
    }
    return (await res.json()) as T;
  }

  // ─── Generic Request Methods ───

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    timeoutMs = 15_000,
  ): Promise<T> {
    const apiUrl = await this.resolveApiUrl();
    const url = `${apiUrl}${path}`;
    this.logger.debug({ method, url }, "GhostHands request");

    const res = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        "X-GH-Service-Key": this.serviceKey,
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      this.logger.error(
        { status: res.status, url, responseBody: text },
        "GhostHands request failed",
      );

      if (res.status === 409) {
        try {
          const parsed = JSON.parse(text) as GHSubmitApplicationResponse;
          return parsed as T;
        } catch {
          throw AppError.internal(`GhostHands API 409 conflict with non-JSON body`);
        }
      }

      throw AppError.internal(`GhostHands API error: ${res.status} ${res.statusText}`);
    }

    return (await res.json()) as T;
  }

  private async workerRequest<T>(method: string, path: string, timeoutMs = 5_000): Promise<T> {
    const workerUrl = await this.resolveWorkerUrl();
    const url = `${workerUrl}${path}`;
    this.logger.debug({ method, url }, "GhostHands worker request");
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw AppError.internal(`GhostHands worker API error: ${res.status} ${text}`);
    }
    return (await res.json()) as T;
  }

  async submitApplication(params: GHSubmitApplicationParams): Promise<GHSubmitApplicationResponse> {
    this.logger.info(
      { valetTaskId: params.valet_task_id, targetUrl: params.target_url },
      "Submitting application to GhostHands",
    );
    return this.request<GHSubmitApplicationResponse>("POST", "/api/v1/gh/valet/apply", params);
  }

  async submitGenericTask(params: GHSubmitGenericTaskParams): Promise<GHSubmitGenericTaskResponse> {
    this.logger.info(
      { valetTaskId: params.valet_task_id, jobType: params.job_type, targetUrl: params.target_url },
      "Submitting generic task to GhostHands",
    );
    return this.request<GHSubmitGenericTaskResponse>("POST", "/api/v1/gh/valet/task", params);
  }

  async getJobStatus(jobId: string): Promise<GHJobStatus> {
    const targetUrl = await this.resolveApiUrlForJob(jobId);
    return this.requestTargeted<GHJobStatus>(
      "GET",
      `/api/v1/gh/valet/status/${encodeURIComponent(jobId)}`,
      targetUrl,
    );
  }

  async cancelJob(jobId: string): Promise<void> {
    const targetUrl = await this.resolveApiUrlForJob(jobId);
    this.logger.info(
      { jobId, targetUrl },
      "GhostHands targeted request: POST cancel → resolved EC2",
    );
    await this.requestTargeted<unknown>(
      "POST",
      `/api/v1/gh/jobs/${encodeURIComponent(jobId)}/cancel`,
      targetUrl,
    );
  }

  async retryJob(jobId: string): Promise<void> {
    const targetUrl = await this.resolveApiUrlForJob(jobId);
    this.logger.info(
      { jobId, targetUrl },
      "GhostHands targeted request: POST retry → resolved EC2",
    );
    await this.requestTargeted<unknown>(
      "POST",
      `/api/v1/gh/jobs/${encodeURIComponent(jobId)}/retry`,
      targetUrl,
    );
  }

  async resumeJob(jobId: string, params?: GHResumeJobParams): Promise<GHResumeJobResponse> {
    const targetUrl = await this.resolveApiUrlForJob(jobId);
    this.logger.info(
      { jobId, targetUrl },
      "GhostHands targeted request: POST resume → resolved EC2",
    );
    return this.requestTargeted<GHResumeJobResponse>(
      "POST",
      `/api/v1/gh/valet/resume/${encodeURIComponent(jobId)}`,
      targetUrl,
      params,
    );
  }

  async healthCheck(): Promise<{ status: string }> {
    return this.request<{ status: string }>("GET", "/health", undefined, 5_000);
  }

  async getModels(): Promise<GHModelCatalog> {
    return this.request<GHModelCatalog>("GET", "/api/v1/gh/models", undefined, 10_000);
  }

  async getDetailedHealth(): Promise<GHDetailedHealth> {
    return this.request<GHDetailedHealth>("GET", "/monitoring/health", undefined, 5_000);
  }

  async getMetrics(): Promise<GHMetrics> {
    return this.request<GHMetrics>("GET", "/monitoring/metrics/json", undefined, 5_000);
  }

  async getAlerts(): Promise<unknown> {
    return this.request<unknown>("GET", "/monitoring/alerts", undefined, 5_000);
  }

  async listSessions(userId: string): Promise<GHSessionListResponse> {
    return this.request<GHSessionListResponse>(
      "GET",
      `/api/v1/gh/sessions?user_id=${encodeURIComponent(userId)}`,
    );
  }

  async clearSession(userId: string, domain: string): Promise<GHClearSessionResponse> {
    return this.request<GHClearSessionResponse>(
      "DELETE",
      `/api/v1/gh/sessions?user_id=${encodeURIComponent(userId)}&domain=${encodeURIComponent(domain)}`,
    );
  }

  async clearAllSessions(userId: string): Promise<GHClearAllSessionsResponse> {
    return this.request<GHClearAllSessionsResponse>(
      "DELETE",
      `/api/v1/gh/sessions?user_id=${encodeURIComponent(userId)}&all=true`,
    );
  }

  async getWorkerStatus(workerId?: string): Promise<GHWorkerStatus> {
    if (workerId) {
      const targetUrl = await this.resolveWorkerUrlById(workerId);
      return this.workerRequestTargeted<GHWorkerStatus>("GET", "/worker/status", targetUrl);
    }
    return this.workerRequest<GHWorkerStatus>("GET", "/worker/status");
  }

  async getWorkerHealth(workerId?: string): Promise<GHWorkerHealth> {
    if (workerId) {
      const targetUrl = await this.resolveWorkerUrlById(workerId);
      return this.workerRequestTargeted<GHWorkerHealth>("GET", "/worker/health", targetUrl);
    }
    return this.workerRequest<GHWorkerHealth>("GET", "/worker/health");
  }

  async drainWorker(workerId?: string): Promise<void> {
    if (workerId) {
      const targetUrl = await this.resolveWorkerUrlById(workerId);
      this.logger.info(
        { workerId, targetUrl },
        "GhostHands targeted request: POST drain → resolved EC2",
      );
      await this.workerRequestTargeted<unknown>("POST", "/worker/drain", targetUrl);
      return;
    }
    await this.workerRequest<unknown>("POST", "/worker/drain");
  }

  async getWorkerFleet(): Promise<GHWorkerFleetResponse> {
    return this.request<GHWorkerFleetResponse>("GET", "/monitoring/workers", undefined, 10_000);
  }

  async deregisterWorker(params: GHDeregisterWorkerParams): Promise<GHDeregisterWorkerResponse> {
    this.logger.info(
      { targetWorkerId: params.target_worker_id, reason: params.reason },
      "Deregistering worker from GhostHands",
    );
    return this.request<GHDeregisterWorkerResponse>(
      "POST",
      "/api/v1/gh/valet/workers/deregister",
      params,
    );
  }
}
