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
  AtmDeployRecord,
  AtmRollbackResult,
  AtmKamalStatus,
  AtmKamalAuditEntry,
  AtmSecretsStatus,
  AtmKamalDeployResult,
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

  async refreshSecrets(agentUrl: string): Promise<{ success: boolean; message: string }> {
    try {
      const resp = await this.post<{ success?: boolean; message?: string }>(
        `${agentUrl}/admin/refresh-secrets`,
        undefined,
        15_000,
      );
      return { success: resp.success !== false, message: resp.message ?? "OK" };
    } catch (err) {
      if (err instanceof AgentError) {
        return { success: false, message: `Agent ${err.statusCode}: ${err.responseBody}` };
      }
      return { success: false, message: err instanceof Error ? err.message : String(err) };
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

  // -- ATM-specific methods (backward-compatible: return null/empty on 404/502) --

  async getAtmDeployHistory(agentUrl: string, limit?: number): Promise<AtmDeployRecord[]> {
    try {
      const url = limit ? `${agentUrl}/deploys?limit=${limit}` : `${agentUrl}/deploys`;
      return await this.get(url, 10_000);
    } catch (err) {
      if (err instanceof AgentError && (err.statusCode === 404 || err.statusCode === 502))
        return [];
      throw err;
    }
  }

  async getAtmDeployRecord(agentUrl: string, deployId: string): Promise<AtmDeployRecord | null> {
    try {
      return await this.get(`${agentUrl}/deploys/${deployId}`, 10_000);
    } catch (err) {
      if (err instanceof AgentError && (err.statusCode === 404 || err.statusCode === 502))
        return null;
      throw err;
    }
  }

  async atmRollback(agentUrl: string): Promise<AtmRollbackResult> {
    return this.post(`${agentUrl}/rollback`, undefined, 120_000);
  }

  async getKamalStatus(agentUrl: string): Promise<AtmKamalStatus | null> {
    try {
      return await this.get(`${agentUrl}/kamal/status`, 10_000);
    } catch (err) {
      if (err instanceof AgentError && (err.statusCode === 404 || err.statusCode === 502))
        return null;
      throw err;
    }
  }

  async getKamalAudit(agentUrl: string): Promise<AtmKamalAuditEntry[]> {
    try {
      return await this.get(`${agentUrl}/kamal/audit`, 10_000);
    } catch (err) {
      if (err instanceof AgentError && (err.statusCode === 404 || err.statusCode === 502))
        return [];
      throw err;
    }
  }

  async kamalDeploy(
    agentUrl: string,
    opts?: { destination?: string; version?: string },
  ): Promise<AtmKamalDeployResult> {
    return this.post(`${agentUrl}/deploy/kamal`, opts ?? {}, 300_000);
  }

  async kamalRollback(
    agentUrl: string,
    opts: { destination?: string; version: string },
  ): Promise<AtmKamalDeployResult> {
    return this.post(`${agentUrl}/rollback/kamal`, opts, 300_000);
  }

  async getSecretsStatus(agentUrl: string): Promise<AtmSecretsStatus | null> {
    try {
      return await this.get(`${agentUrl}/secrets/status`, 10_000);
    } catch (err) {
      if (err instanceof AgentError && (err.statusCode === 404 || err.statusCode === 502))
        return null;
      throw err;
    }
  }

  /** Feature detection: check if the deploy-server is ATM (has /deploys endpoint) */
  async isAtmEnabled(agentUrl: string): Promise<boolean> {
    try {
      await this.get(`${agentUrl}/deploys?limit=1`, 5_000);
      return true;
    } catch {
      return false;
    }
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
