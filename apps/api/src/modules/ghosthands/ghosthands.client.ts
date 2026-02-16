import type { FastifyBaseLogger } from "fastify";
import { AppError } from "../../common/errors.js";
import type {
  GHSubmitApplicationParams,
  GHSubmitApplicationResponse,
  GHSubmitGenericTaskParams,
  GHSubmitGenericTaskResponse,
  GHJobStatus,
} from "./ghosthands.types.js";

export class GhostHandsClient {
  private baseUrl: string;
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

  async healthCheck(): Promise<{ status: string }> {
    return this.request<{ status: string }>("GET", "/health", undefined, 5_000);
  }
}
