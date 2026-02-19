import type {
  DeployResult,
  BuildResult,
  ContainerInfo,
  WorkerStartConfig,
  WorkerResult,
  DrainResult,
  WorkerInfo,
  EnvVarMap,
  LogOptions,
  LogStreamOptions,
  LogResult,
  AgentHealthResponse,
  AgentMetricsResponse,
  AgentVersionResponse,
  TakeoverInfo,
  ExecResult,
} from "./types.js";

/**
 * HTTP client for communicating with the Sandbox Agent
 * running on each machine. Used by all providers.
 */
export class SandboxAgentClient {
  private deploySecret: string;

  constructor(deploySecret: string) {
    this.deploySecret = deploySecret;
  }

  // -- Phase 1: Implemented methods ------------------------------------------

  async deploy(agentUrl: string, imageTag: string): Promise<DeployResult> {
    return this.post(`${agentUrl}/deploy`, { image_tag: imageTag }, 60_000);
  }

  async drain(agentUrl: string, workerId?: string): Promise<DrainResult> {
    return this.post(`${agentUrl}/drain`, { worker_id: workerId }, 30_000);
  }

  async getHealth(agentUrl: string): Promise<AgentHealthResponse> {
    return this.get(`${agentUrl}/health`, 10_000);
  }

  async getVersion(agentUrl: string): Promise<AgentVersionResponse> {
    return this.get(`${agentUrl}/version`, 10_000);
  }

  async getContainers(agentUrl: string): Promise<ContainerInfo[]> {
    try {
      return await this.get(`${agentUrl}/containers`, 10_000);
    } catch (err) {
      if (err instanceof AgentError && err.statusCode === 404) return [];
      throw err;
    }
  }

  async getWorkers(agentUrl: string): Promise<WorkerInfo[]> {
    try {
      return await this.get(`${agentUrl}/workers`, 10_000);
    } catch (err) {
      if (err instanceof AgentError && err.statusCode === 404) return [];
      throw err;
    }
  }

  async getMetrics(agentUrl: string): Promise<AgentMetricsResponse | null> {
    try {
      return await this.get(`${agentUrl}/metrics`, 10_000);
    } catch (err) {
      if (err instanceof AgentError && err.statusCode === 404) return null;
      throw err;
    }
  }

  // -- Phase 2: Stubs --------------------------------------------------------

  async getLogs(_agentUrl: string, _options: LogOptions): Promise<LogResult> {
    throw new Error("getLogs is not implemented yet");
  }

  createLogStream(_agentUrl: string, _options: LogStreamOptions): WebSocket {
    throw new Error("createLogStream is not implemented yet");
  }

  async getEnvVars(_agentUrl: string): Promise<EnvVarMap> {
    throw new Error("getEnvVars is not implemented yet");
  }

  async setEnvVars(_agentUrl: string, _vars: Record<string, string>): Promise<void> {
    throw new Error("setEnvVars is not implemented yet");
  }

  async deleteEnvVar(_agentUrl: string, _key: string): Promise<void> {
    throw new Error("deleteEnvVar is not implemented yet");
  }

  async executeCommand(
    _agentUrl: string,
    _command: string,
    _timeout?: number,
  ): Promise<ExecResult> {
    throw new Error("executeCommand is not implemented yet");
  }

  async getScreenshot(_agentUrl: string): Promise<Buffer> {
    throw new Error("getScreenshot is not implemented yet");
  }

  async buildImage(_agentUrl: string, _tag?: string): Promise<BuildResult> {
    throw new Error("buildImage is not implemented yet");
  }

  async startWorker(_agentUrl: string, _config?: WorkerStartConfig): Promise<WorkerResult> {
    throw new Error("startWorker is not implemented yet");
  }

  async stopWorker(
    _agentUrl: string,
    _workerId: string,
    _graceful?: boolean,
  ): Promise<WorkerResult> {
    throw new Error("stopWorker is not implemented yet");
  }

  async getTakeoverInfo(_agentUrl: string): Promise<TakeoverInfo> {
    throw new Error("getTakeoverInfo is not implemented yet");
  }

  // -- Private helpers --------------------------------------------------------

  private authHeaders(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      "X-Deploy-Secret": this.deploySecret,
    };
  }

  private async get<T>(url: string, timeoutMs = 10_000): Promise<T> {
    const resp = await fetch(url, {
      headers: this.authHeaders(),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      throw new AgentError(resp.status, text);
    }
    return resp.json() as Promise<T>;
  }

  private async post<T>(url: string, body?: unknown, timeoutMs = 60_000): Promise<T> {
    const resp = await fetch(url, {
      method: "POST",
      headers: this.authHeaders(),
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      throw new AgentError(resp.status, text);
    }
    return resp.json() as Promise<T>;
  }

  private async deleteRequest(url: string, timeoutMs = 10_000): Promise<void> {
    const resp = await fetch(url, {
      method: "DELETE",
      headers: this.authHeaders(),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      throw new AgentError(resp.status, text);
    }
  }
}

export class AgentError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly responseBody: string,
  ) {
    super(`Agent ${statusCode}: ${responseBody}`);
    this.name = "AgentError";
  }
}
