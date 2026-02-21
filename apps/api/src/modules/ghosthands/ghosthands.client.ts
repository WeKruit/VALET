import type { FastifyBaseLogger } from "fastify";
import { AppError } from "../../common/errors.js";
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

export class GhostHandsClient {
  private baseUrl: string;
  private workerBaseUrl: string;
  private serviceKey: string;
  private logger: FastifyBaseLogger;

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

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    timeoutMs = 15_000,
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
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
        const parsed = JSON.parse(text) as GHSubmitApplicationResponse;
        return parsed as T;
      }

      throw AppError.internal(`GhostHands API error: ${res.status} ${res.statusText}`);
    }

    return (await res.json()) as T;
  }

  private async workerRequest<T>(method: string, path: string, timeoutMs = 5_000): Promise<T> {
    const url = `${this.workerBaseUrl}${path}`;
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
    return this.request<GHJobStatus>("GET", `/api/v1/gh/valet/status/${encodeURIComponent(jobId)}`);
  }

  async cancelJob(jobId: string): Promise<void> {
    await this.request<unknown>("POST", `/api/v1/gh/jobs/${encodeURIComponent(jobId)}/cancel`);
  }

  async retryJob(jobId: string): Promise<void> {
    await this.request<unknown>("POST", `/api/v1/gh/jobs/${encodeURIComponent(jobId)}/retry`);
  }

  async resumeJob(jobId: string, params?: GHResumeJobParams): Promise<GHResumeJobResponse> {
    this.logger.info({ jobId }, "Resuming GhostHands job");
    return this.request<GHResumeJobResponse>(
      "POST",
      `/api/v1/gh/valet/resume/${encodeURIComponent(jobId)}`,
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

  async getWorkerStatus(): Promise<GHWorkerStatus> {
    return this.workerRequest<GHWorkerStatus>("GET", "/worker/status");
  }

  async getWorkerHealth(): Promise<GHWorkerHealth> {
    return this.workerRequest<GHWorkerHealth>("GET", "/worker/health");
  }

  async drainWorker(): Promise<void> {
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
