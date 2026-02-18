import type { FastifyBaseLogger } from "fastify";
import type Redis from "ioredis";
import type { SandboxRepository } from "./sandbox.repository.js";
import type { NotificationService } from "../notifications/notification.service.js";
import type { UserRepository } from "../users/user.repository.js";
import type { DeployStatus, DeploySandboxStatus } from "@valet/shared/schemas";
import { publishToUser } from "../../websocket/handler.js";

const DEPLOY_PREFIX = "deploy:";
const DEPLOY_LIST_KEY = "deploys:recent";
const DEPLOY_TTL_SECONDS = 60 * 60 * 24; // 24 hours

export interface DeployRecord {
  id: string;
  imageTag: string;
  commitSha: string;
  commitMessage: string;
  branch: string;
  environment: "dev" | "staging" | "prod";
  repository: string;
  runUrl: string;
  status: DeployStatus;
  sandboxes: DeploySandboxProgressRecord[];
  createdAt: string;
  updatedAt: string;
}

interface DeploySandboxProgressRecord {
  sandboxId: string;
  sandboxName: string;
  status: DeploySandboxStatus;
  activeTaskCount: number;
  message?: string | null;
}

const DEPLOY_ENDPOINT_TIMEOUT_MS = 60_000;

export class DeployService {
  private redis: Redis;
  private sandboxRepo: SandboxRepository;
  private notificationService: NotificationService;
  private userRepo: UserRepository;
  private logger: FastifyBaseLogger;

  constructor({
    redis,
    sandboxRepo,
    notificationService,
    userRepo,
    logger,
  }: {
    redis: Redis;
    sandboxRepo: SandboxRepository;
    notificationService: NotificationService;
    userRepo: UserRepository;
    logger: FastifyBaseLogger;
  }) {
    this.redis = redis;
    this.sandboxRepo = sandboxRepo;
    this.notificationService = notificationService;
    this.userRepo = userRepo;
    this.logger = logger;
  }

  /**
   * Called by the webhook handler when GhostHands CI sends a deploy_ready event.
   */
  async createFromWebhook(payload: {
    imageTag: string;
    commitSha: string;
    commitMessage: string;
    branch: string;
    environment: "dev" | "staging" | "prod";
    repository: string;
    runUrl: string;
  }): Promise<DeployRecord> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    const record: DeployRecord = {
      id,
      imageTag: payload.imageTag,
      commitSha: payload.commitSha,
      commitMessage: payload.commitMessage,
      branch: payload.branch,
      environment: payload.environment,
      repository: payload.repository,
      runUrl: payload.runUrl,
      status: "pending",
      sandboxes: [],
      createdAt: now,
      updatedAt: now,
    };

    await this.redis.setex(`${DEPLOY_PREFIX}${id}`, DEPLOY_TTL_SECONDS, JSON.stringify(record));
    await this.redis.lpush(DEPLOY_LIST_KEY, id);
    await this.redis.ltrim(DEPLOY_LIST_KEY, 0, 49);

    await this.notifyAdmins(record);

    // Check if auto-deploy is enabled for this environment
    const autoDeployKey = `config:auto_deploy:${payload.environment}`;
    const autoDeployEnabled = await this.redis.get(autoDeployKey);
    if (autoDeployEnabled === "true") {
      this.logger.info(
        { deployId: id, environment: payload.environment },
        "Auto-deploy enabled, triggering immediately",
      );
      // Trigger in background — don't block webhook response
      this.triggerDeploy(id).catch((err) => {
        this.logger.error({ deployId: id, err }, "Auto-deploy trigger failed");
      });
    }

    return record;
  }

  async list(): Promise<DeployRecord[]> {
    const ids = await this.redis.lrange(DEPLOY_LIST_KEY, 0, 19);
    if (ids.length === 0) return [];

    const pipeline = this.redis.pipeline();
    for (const id of ids) {
      pipeline.get(`${DEPLOY_PREFIX}${id}`);
    }
    const results = await pipeline.exec();

    const records: DeployRecord[] = [];
    if (results) {
      for (const [err, val] of results) {
        if (!err && val) {
          records.push(JSON.parse(val as string) as DeployRecord);
        }
      }
    }
    return records;
  }

  async getById(id: string): Promise<DeployRecord | null> {
    const raw = await this.redis.get(`${DEPLOY_PREFIX}${id}`);
    if (!raw) return null;
    return JSON.parse(raw) as DeployRecord;
  }

  /**
   * Trigger a rolling deploy across all running sandboxes for the deploy's environment.
   */
  async triggerDeploy(id: string): Promise<DeployRecord> {
    const record = await this.getById(id);
    if (!record) throw new Error("Deploy not found");
    if (record.status !== "pending") {
      throw new Error(`Deploy is already ${record.status}`);
    }

    const allSandboxes = await this.sandboxRepo.findAllActive();
    const runningSandboxes = allSandboxes.filter(
      (s) => s.ec2Status === "running" && s.environment === record.environment,
    );

    if (runningSandboxes.length === 0) {
      record.status = "failed";
      record.updatedAt = new Date().toISOString();
      await this.saveRecord(record);
      throw new Error("No running sandboxes found for this environment");
    }

    record.sandboxes = runningSandboxes.map((s) => ({
      sandboxId: s.id,
      sandboxName: s.name,
      status: "pending" as DeploySandboxStatus,
      activeTaskCount: 0,
      message: null,
    }));
    record.status = "deploying";
    record.updatedAt = new Date().toISOString();
    await this.saveRecord(record);

    // Execute in background
    this.executeRollingDeploy(record).catch((err) => {
      this.logger.error({ deployId: id, err }, "Rolling deploy failed");
    });

    return record;
  }

  async cancelDeploy(id: string): Promise<void> {
    const record = await this.getById(id);
    if (!record) throw new Error("Deploy not found");

    record.status = "cancelled";
    record.updatedAt = new Date().toISOString();
    await this.saveRecord(record);
  }

  async getAutoDeployConfig(environment: string): Promise<boolean> {
    const val = await this.redis.get(`config:auto_deploy:${environment}`);
    return val === "true";
  }

  async setAutoDeployConfig(environment: string, enabled: boolean): Promise<void> {
    await this.redis.set(`config:auto_deploy:${environment}`, enabled ? "true" : "false");
  }

  // ── Private helpers ─────────────────────────────────────

  private async saveRecord(record: DeployRecord): Promise<void> {
    await this.redis.setex(
      `${DEPLOY_PREFIX}${record.id}`,
      DEPLOY_TTL_SECONDS,
      JSON.stringify(record),
    );
  }

  private async executeRollingDeploy(record: DeployRecord): Promise<void> {
    this.logger.info(
      { deployId: record.id, imageTag: record.imageTag, sandboxCount: record.sandboxes.length },
      "Starting rolling deploy",
    );

    let allSucceeded = true;

    for (const sbProgress of record.sandboxes) {
      const current = await this.getById(record.id);
      if (!current || current.status === "cancelled") {
        this.logger.info({ deployId: record.id }, "Deploy cancelled, stopping");
        return;
      }

      const sandbox = await this.sandboxRepo.findById(sbProgress.sandboxId);
      if (!sandbox || sandbox.ec2Status !== "running" || !sandbox.publicIp) {
        sbProgress.status = "skipped";
        sbProgress.message = "Sandbox not running or no IP";
        record.updatedAt = new Date().toISOString();
        await this.saveRecord(record);
        await this.broadcastDeployUpdate(record);
        continue;
      }

      try {
        // Phase 1: Drain active tasks
        sbProgress.status = "draining";
        sbProgress.message = "Checking for active tasks...";
        record.updatedAt = new Date().toISOString();
        await this.saveRecord(record);
        await this.broadcastDeployUpdate(record);

        const activeTasks = await this.getActiveTaskCount(sandbox.publicIp);
        sbProgress.activeTaskCount = activeTasks;

        if (activeTasks > 0) {
          sbProgress.message = `Waiting for ${activeTasks} active task(s) to complete...`;
          await this.saveRecord(record);
          await this.broadcastDeployUpdate(record);

          const drained = await this.waitForDrain(sandbox.publicIp, 5 * 60 * 1000);
          if (!drained) {
            sbProgress.message = `Proceeding despite ${activeTasks} active task(s)`;
          }
        }

        // Phase 2: Deploy
        sbProgress.status = "deploying";
        sbProgress.message = `Deploying ${record.imageTag}...`;
        record.updatedAt = new Date().toISOString();
        await this.saveRecord(record);
        await this.broadcastDeployUpdate(record);

        const result = await this.deployToSandbox(sandbox.publicIp, record.imageTag);

        sbProgress.status = "completed";
        sbProgress.message = result.message ?? "Deploy successful";
        record.updatedAt = new Date().toISOString();
        await this.saveRecord(record);
        await this.broadcastDeployUpdate(record);
      } catch (err) {
        allSucceeded = false;
        sbProgress.status = "failed";
        sbProgress.message = err instanceof Error ? err.message : "Unknown error";
        record.updatedAt = new Date().toISOString();
        await this.saveRecord(record);
        await this.broadcastDeployUpdate(record);
        this.logger.error(
          { deployId: record.id, sandboxId: sbProgress.sandboxId, err },
          "Deploy to sandbox failed",
        );
      }
    }

    record.status = allSucceeded ? "completed" : "failed";
    record.updatedAt = new Date().toISOString();
    await this.saveRecord(record);
    await this.broadcastDeployUpdate(record);

    this.logger.info({ deployId: record.id, status: record.status }, "Rolling deploy finished");
  }

  private async getActiveTaskCount(publicIp: string): Promise<number> {
    try {
      const resp = await fetch(`http://${publicIp}:8000/health`, {
        signal: AbortSignal.timeout(10_000),
      });
      if (!resp.ok) return 0;
      const body = (await resp.json()) as Record<string, unknown>;
      return (body.activeWorkers as number) ?? 0;
    } catch {
      return 0;
    }
  }

  private async waitForDrain(publicIp: string, timeoutMs: number): Promise<boolean> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const count = await this.getActiveTaskCount(publicIp);
      if (count === 0) return true;
      await new Promise((r) => setTimeout(r, 5_000));
    }
    return false;
  }

  private async deployToSandbox(
    publicIp: string,
    imageTag: string,
  ): Promise<{ success: boolean; message: string }> {
    const resp = await fetch(`http://${publicIp}:8000/deploy`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image_tag: imageTag }),
      signal: AbortSignal.timeout(DEPLOY_ENDPOINT_TIMEOUT_MS),
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      throw new Error(`Deploy endpoint returned ${resp.status}: ${text}`);
    }

    return (await resp.json()) as { success: boolean; message: string };
  }

  private async notifyAdmins(record: DeployRecord): Promise<void> {
    try {
      const adminIds = await this.userRepo.findAdminUserIds();

      const shortSha = record.commitSha.slice(0, 7);
      const title = `GhostHands Deploy Ready: ${record.imageTag}`;
      const body = `New GhostHands image ready for ${record.environment}.\n${record.commitMessage}\n(${shortSha} on ${record.branch})`;

      for (const adminId of adminIds) {
        await this.notificationService.create({
          userId: adminId,
          type: "deploy_ready",
          title,
          body,
          metadata: {
            deployId: record.id,
            imageTag: record.imageTag,
            commitSha: record.commitSha,
            environment: record.environment,
            runUrl: record.runUrl,
          },
        });

        await publishToUser(this.redis, adminId, {
          type: "deploy_ready",
          deployId: record.id,
          imageTag: record.imageTag,
          environment: record.environment,
          commitMessage: record.commitMessage,
          commitSha: record.commitSha,
        });
      }

      this.logger.info(
        { deployId: record.id, adminCount: adminIds.length },
        "Notified admins about deploy",
      );
    } catch (err) {
      this.logger.error({ err }, "Failed to notify admins about deploy");
    }
  }

  private async broadcastDeployUpdate(record: DeployRecord): Promise<void> {
    try {
      const adminIds = await this.userRepo.findAdminUserIds();

      for (const adminId of adminIds) {
        await publishToUser(this.redis, adminId, {
          type: "deploy_update",
          deployId: record.id,
          status: record.status,
          sandboxes: record.sandboxes,
        });
      }
    } catch (err) {
      this.logger.error({ err }, "Failed to broadcast deploy update");
    }
  }
}
