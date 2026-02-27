import {
  AutoScalingClient,
  DescribeAutoScalingInstancesCommand,
} from "@aws-sdk/client-auto-scaling";
import { EC2Client, DescribeInstancesCommand } from "@aws-sdk/client-ec2";
import { sql } from "drizzle-orm";
import type { FastifyBaseLogger } from "fastify";
import type Redis from "ioredis";
import type { Database } from "@valet/db";
import type { SandboxEnvironment } from "@valet/shared/schemas";
import type { SandboxRepository, SandboxRecord } from "../sandboxes/sandbox.repository.js";
import type { DeepHealthChecker, DeepHealthResult } from "../sandboxes/deep-health-checker.js";
import type { AuditLogService } from "../sandboxes/audit-log.service.js";
import type { GhAutomationJobRepository } from "../ghosthands/gh-automation-job.repository.js";
import type { TaskRepository } from "../tasks/task.repository.js";
import type { UserSandboxRepository } from "../sandboxes/user-sandbox.repository.js";
import { publishToUser } from "../../websocket/handler.js";

// ─── Types ───

export interface AsgInstance {
  instanceId: string;
  publicIp: string;
  instanceType: string;
  lifecycleState: string;
  healthStatus: string;
}

export interface DiscoveryDiff {
  newInstances: AsgInstance[];
  staleRecords: SandboxRecord[];
  matched: Array<{
    instance: AsgInstance;
    sandbox: SandboxRecord;
    ipChanged: boolean;
  }>;
  asgInstances: AsgInstance[];
  dbSandboxes: SandboxRecord[];
}

export interface ReconciliationResult {
  registered: number;
  deregistered: number;
  ipUpdated: number;
  orphanedJobsRecovered: number;
  errors: string[];
  timestamp: number;
}

// ─── Constants ───

const DISCOVERY_INTERVAL_MS = 60_000; // 60 seconds
const HEALTH_PROBE_DELAY_MS = 15_000; // Wait 15s before probing new instances

const ENV_MAP: Record<string, SandboxEnvironment> = {
  production: "prod",
  prod: "prod",
  staging: "staging",
  development: "dev",
  dev: "dev",
};

function resolveEnvironment(): SandboxEnvironment {
  const raw = process.env.VALET_ENVIRONMENT ?? process.env.NODE_ENV ?? "staging";
  return ENV_MAP[raw] ?? "staging";
}

export class InstanceDiscoveryService {
  private logger: FastifyBaseLogger;
  private db: Database;
  private redis: Redis;
  private sandboxRepo: SandboxRepository;
  private deepHealthChecker: DeepHealthChecker;
  private auditLogService: AuditLogService;
  private ghJobRepo: GhAutomationJobRepository;
  private taskRepo: TaskRepository;
  private userSandboxRepo: UserSandboxRepository;

  private asgClient: AutoScalingClient | null;
  private ec2Client: EC2Client | null;
  private asgName: string;
  private environment: SandboxEnvironment;
  private enabled: boolean;

  private intervalId: ReturnType<typeof setInterval> | null = null;
  private pendingTimeouts = new Set<ReturnType<typeof setTimeout>>();
  private running = false;

  constructor({
    logger,
    db,
    redis,
    sandboxRepo,
    deepHealthChecker,
    auditLogService,
    ghJobRepo,
    taskRepo,
    userSandboxRepo,
  }: {
    logger: FastifyBaseLogger;
    db: Database;
    redis: Redis;
    sandboxRepo: SandboxRepository;
    deepHealthChecker: DeepHealthChecker;
    auditLogService: AuditLogService;
    ghJobRepo: GhAutomationJobRepository;
    taskRepo: TaskRepository;
    userSandboxRepo: UserSandboxRepository;
  }) {
    this.logger = logger;
    this.db = db;
    this.redis = redis;
    this.sandboxRepo = sandboxRepo;
    this.deepHealthChecker = deepHealthChecker;
    this.auditLogService = auditLogService;
    this.ghJobRepo = ghJobRepo;
    this.taskRepo = taskRepo;
    this.userSandboxRepo = userSandboxRepo;

    this.asgName = process.env.AWS_ASG_NAME ?? "";
    this.environment = resolveEnvironment();
    this.enabled = process.env.AUTOSCALE_ASG_ENABLED === "true" && this.asgName.length > 0;

    if (this.enabled) {
      const region = process.env.AWS_REGION ?? "us-east-1";
      this.asgClient = new AutoScalingClient({ region });
      this.ec2Client = new EC2Client({ region });
    } else {
      this.asgClient = null;
      this.ec2Client = null;
    }
  }

  // ─── Lifecycle ───

  start() {
    if (this.intervalId) return;

    if (!this.enabled) {
      this.logger.info(
        "Instance discovery disabled (AUTOSCALE_ASG_ENABLED != true or AWS_ASG_NAME not set)",
      );
      return;
    }

    this.logger.info(
      { intervalMs: DISCOVERY_INTERVAL_MS, asgName: this.asgName },
      "Starting instance discovery service",
    );

    this.reconcile().catch((err) => {
      this.logger.error({ err }, "Initial discovery reconciliation failed");
    });

    this.intervalId = setInterval(() => {
      this.reconcile().catch((err) => {
        this.logger.error({ err }, "Scheduled discovery reconciliation failed");
      });
    }, DISCOVERY_INTERVAL_MS);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    // Clear any pending health probe timeouts
    for (const id of this.pendingTimeouts) {
      clearTimeout(id);
    }
    this.pendingTimeouts.clear();

    this.logger.info("Instance discovery service stopped");
  }

  // ─── Public API ───

  /**
   * Get the current diff between ASG instances and DB sandbox records.
   * Used by the admin API to display the diff view.
   */
  async getDiff(): Promise<DiscoveryDiff> {
    if (!this.enabled) {
      return {
        newInstances: [],
        staleRecords: [],
        matched: [],
        asgInstances: [],
        dbSandboxes: [],
      };
    }

    const [asgInstances, dbSandboxes] = await Promise.all([
      this.fetchAsgInstances(),
      this.fetchEc2Sandboxes(),
    ]);

    return this.computeDiff(asgInstances, dbSandboxes);
  }

  /**
   * Run a full reconciliation cycle. Can be triggered manually via admin API
   * or runs automatically on the interval.
   */
  async reconcile(): Promise<ReconciliationResult> {
    if (!this.enabled) {
      return {
        registered: 0,
        deregistered: 0,
        ipUpdated: 0,
        orphanedJobsRecovered: 0,
        errors: [],
        timestamp: Date.now(),
      };
    }

    if (this.running) {
      this.logger.debug("Discovery reconciliation already running, skipping");
      return {
        registered: 0,
        deregistered: 0,
        ipUpdated: 0,
        orphanedJobsRecovered: 0,
        errors: ["skipped: already running"],
        timestamp: Date.now(),
      };
    }

    this.running = true;
    const result: ReconciliationResult = {
      registered: 0,
      deregistered: 0,
      ipUpdated: 0,
      orphanedJobsRecovered: 0,
      errors: [],
      timestamp: Date.now(),
    };

    try {
      const diff = await this.getDiff();

      this.logger.info(
        {
          newInstances: diff.newInstances.length,
          staleRecords: diff.staleRecords.length,
          matched: diff.matched.length,
          ipChanges: diff.matched.filter((m) => m.ipChanged).length,
        },
        "Instance discovery diff computed",
      );

      // WEK-167: Auto-register new instances
      for (const instance of diff.newInstances) {
        try {
          await this.registerNewInstance(instance);
          result.registered++;
        } catch (err) {
          const msg = `Failed to register ${instance.instanceId}: ${err instanceof Error ? err.message : "unknown"}`;
          result.errors.push(msg);
          this.logger.error({ err, instanceId: instance.instanceId }, msg);
        }
      }

      // WEK-168: Auto-deregister stale records + orphan recovery
      for (const sandbox of diff.staleRecords) {
        try {
          const orphans = await this.deregisterStaleSandbox(sandbox);
          result.deregistered++;
          result.orphanedJobsRecovered += orphans;
        } catch (err) {
          const msg = `Failed to deregister ${sandbox.id}: ${err instanceof Error ? err.message : "unknown"}`;
          result.errors.push(msg);
          this.logger.error({ err, sandboxId: sandbox.id }, msg);
        }
      }

      // Update IPs for matched instances
      for (const match of diff.matched) {
        if (match.ipChanged) {
          try {
            await this.updateSandboxIp(match.sandbox, match.instance);
            result.ipUpdated++;
          } catch (err) {
            const msg = `Failed to update IP for ${match.sandbox.id}: ${err instanceof Error ? err.message : "unknown"}`;
            result.errors.push(msg);
            this.logger.error({ err, sandboxId: match.sandbox.id }, msg);
          }
        }
      }

      this.logger.info(result, "Instance discovery reconciliation complete");
    } catch (err) {
      this.logger.error({ err }, "Instance discovery reconciliation failed");
      result.errors.push(`Top-level error: ${err instanceof Error ? err.message : "unknown"}`);
    } finally {
      this.running = false;
    }

    return result;
  }

  // ─── Private: AWS Queries ───

  private async fetchAsgInstances(): Promise<AsgInstance[]> {
    if (!this.asgClient || !this.ec2Client) return [];

    // Step 1: Get instance IDs from ASG
    const asgResult = await this.asgClient.send(new DescribeAutoScalingInstancesCommand({}));

    const asgInstanceIds = (asgResult.AutoScalingInstances ?? [])
      .filter((i) => i.AutoScalingGroupName === this.asgName)
      .filter(
        (i) =>
          i.LifecycleState === "InService" ||
          i.LifecycleState === "Pending" ||
          i.LifecycleState === "Standby",
      )
      .map((i) => ({
        instanceId: i.InstanceId!,
        lifecycleState: i.LifecycleState ?? "Unknown",
        healthStatus: i.HealthStatus ?? "Unknown",
      }));

    if (asgInstanceIds.length === 0) return [];

    // Step 2: Get public IPs and instance types from EC2
    const ec2Result = await this.ec2Client.send(
      new DescribeInstancesCommand({
        InstanceIds: asgInstanceIds.map((i) => i.instanceId),
      }),
    );

    const ec2Info = new Map<string, { publicIp: string; instanceType: string }>();
    for (const reservation of ec2Result.Reservations ?? []) {
      for (const inst of reservation.Instances ?? []) {
        if (inst.InstanceId && inst.PublicIpAddress) {
          ec2Info.set(inst.InstanceId, {
            publicIp: inst.PublicIpAddress,
            instanceType: inst.InstanceType ?? "t3.large",
          });
        }
      }
    }

    return asgInstanceIds
      .filter((i) => ec2Info.has(i.instanceId))
      .map((i) => {
        const info = ec2Info.get(i.instanceId)!;
        return {
          ...i,
          publicIp: info.publicIp,
          instanceType: info.instanceType,
        };
      });
  }

  private async fetchEc2Sandboxes(): Promise<SandboxRecord[]> {
    return this.sandboxRepo.findByMachineTypeWithStatuses("ec2", [
      "active",
      "provisioning",
      "stopping",
    ]);
  }

  // ─── Private: Diff Logic ───

  private computeDiff(asgInstances: AsgInstance[], dbSandboxes: SandboxRecord[]): DiscoveryDiff {
    const asgInstanceIds = new Set(asgInstances.map((i) => i.instanceId));
    const dbInstanceIds = new Set(dbSandboxes.map((s) => s.instanceId));
    const dbByInstanceId = new Map(dbSandboxes.map((s) => [s.instanceId, s]));

    const newInstances = asgInstances.filter((i) => !dbInstanceIds.has(i.instanceId));

    // Only consider ASG-managed sandboxes as stale (tagged with asg_managed)
    const staleRecords = dbSandboxes.filter((s) => {
      if (asgInstanceIds.has(s.instanceId)) return false;
      const tags = s.tags as Record<string, unknown> | null;
      return tags?.asg_managed === true;
    });

    const matched: DiscoveryDiff["matched"] = [];
    for (const instance of asgInstances) {
      const sandbox = dbByInstanceId.get(instance.instanceId);
      if (sandbox) {
        matched.push({
          instance,
          sandbox,
          ipChanged: sandbox.publicIp !== instance.publicIp,
        });
      }
    }

    return {
      newInstances,
      staleRecords,
      matched,
      asgInstances,
      dbSandboxes,
    };
  }

  // ─── Private: WEK-167 Auto-Register ───

  private async registerNewInstance(instance: AsgInstance): Promise<void> {
    this.logger.info(
      { instanceId: instance.instanceId, publicIp: instance.publicIp },
      "Auto-registering new ASG instance as sandbox",
    );

    // If a terminated/stopped record exists with the same instanceId, reactivate it
    // instead of creating a duplicate (the unique constraint on instance_id would block INSERT)
    const existing = await this.sandboxRepo.findByInstanceId(instance.instanceId);
    if (existing) {
      if (existing.status === "terminated" || existing.status === "stopping") {
        this.logger.info(
          { sandboxId: existing.id, instanceId: instance.instanceId, oldStatus: existing.status },
          "Reactivating terminated sandbox record for returning instance",
        );
        await this.sandboxRepo.update(existing.id, {
          status: "provisioning",
          ec2Status: "running",
          healthStatus: "degraded",
          publicIp: instance.publicIp,
          instanceType: instance.instanceType,
        });

        // Schedule health probe
        const timeoutId = setTimeout(() => {
          this.pendingTimeouts.delete(timeoutId);
          this.probeAndActivate(existing.id).catch((err) => {
            this.logger.error(
              { err, sandboxId: existing.id },
              "Health probe after reactivation failed",
            );
          });
        }, HEALTH_PROBE_DELAY_MS);
        this.pendingTimeouts.add(timeoutId);

        return;
      }

      // Already active with this instanceId — just update IP if changed
      if (existing.publicIp !== instance.publicIp) {
        await this.updateSandboxIp(existing, instance);
      }
      return;
    }

    // Determine sandbox name using sequential numbering
    const existingAsg = await this.sandboxRepo.findAsgManaged();
    const maxN = existingAsg.reduce((max, s) => {
      const match = s.name.match(/gh-worker-asg-(\d+)/);
      const num = match?.[1];
      return num ? Math.max(max, parseInt(num, 10)) : max;
    }, 0);

    const sandbox = await this.sandboxRepo.create({
      name: `gh-worker-asg-${maxN + 1}`,
      environment: this.environment,
      instanceId: instance.instanceId,
      instanceType: instance.instanceType,
      publicIp: instance.publicIp,
      capacity: 1,
      sshKeyName: "wekruit-atm-server.pem",
      tags: {
        asg_managed: true,
        asg_name: this.asgName,
        registered_by: "instance_discovery",
        registered_at: new Date().toISOString(),
      },
      machineType: "ec2",
    });

    // Update ec2Status to running
    await this.sandboxRepo.update(sandbox.id, {
      status: "provisioning",
      ec2Status: "running",
      healthStatus: "degraded",
    });

    // Audit log
    await this.auditLogService.log({
      sandboxId: sandbox.id,
      action: "instance_discovered",
      details: {
        instanceId: instance.instanceId,
        publicIp: instance.publicIp,
        instanceType: instance.instanceType,
        lifecycleState: instance.lifecycleState,
        source: "instance_discovery",
      },
      result: "success",
    });

    // Schedule health probe after delay (tracked for cleanup on stop)
    const timeoutId = setTimeout(() => {
      this.pendingTimeouts.delete(timeoutId);
      this.probeAndActivate(sandbox.id).catch((err) => {
        this.logger.error({ err, sandboxId: sandbox.id }, "Health probe after registration failed");
      });
    }, HEALTH_PROBE_DELAY_MS);
    this.pendingTimeouts.add(timeoutId);
  }

  private async probeAndActivate(sandboxId: string): Promise<void> {
    const sandbox = await this.sandboxRepo.findById(sandboxId);
    if (!sandbox) return;

    const result: DeepHealthResult = await this.deepHealthChecker.check(sandbox);

    this.logger.info(
      { sandboxId, overall: result.overall, checks: result.checks.length },
      "Health probe result for new instance",
    );

    if (result.overall === "healthy") {
      await this.sandboxRepo.update(sandboxId, {
        status: "active",
        healthStatus: "healthy",
        lastHealthCheckAt: new Date(),
      });

      await this.auditLogService.log({
        sandboxId,
        action: "instance_activated",
        details: {
          healthResult: result.overall,
          checks: result.checks.map((c) => ({
            name: c.name,
            status: c.status,
          })),
        },
        result: "success",
      });
    } else {
      // Mark degraded but keep as provisioning — the regular health monitor will retry
      await this.sandboxRepo.update(sandboxId, {
        healthStatus: result.overall,
        lastHealthCheckAt: new Date(),
      });

      this.logger.warn(
        { sandboxId, overall: result.overall },
        "New instance not yet healthy, leaving as provisioning",
      );
    }
  }

  // ─── Private: WEK-168 Auto-Deregister + Orphan Recovery ───

  private async deregisterStaleSandbox(sandbox: SandboxRecord): Promise<number> {
    this.logger.warn(
      {
        sandboxId: sandbox.id,
        sandboxName: sandbox.name,
        instanceId: sandbox.instanceId,
      },
      "Auto-deregistering stale sandbox (instance no longer in ASG)",
    );

    // Step 1: Mark as stopping (intermediate status during orphan recovery)
    await this.sandboxRepo.update(sandbox.id, {
      status: "stopping",
      ec2Status: "terminated",
      healthStatus: "unhealthy",
    });

    // Step 2: Recover orphaned jobs
    const orphanCount = await this.recoverOrphanedJobs(sandbox);

    // Step 3: Mark as terminated (final status)
    await this.sandboxRepo.update(sandbox.id, {
      status: "terminated",
    });

    // Step 3b: Clear user-sandbox assignments
    const clearedAssignments = await this.userSandboxRepo.unassignBySandboxId(sandbox.id);

    // Step 4: Audit log
    await this.auditLogService.log({
      sandboxId: sandbox.id,
      action: "instance_deregistered",
      details: {
        instanceId: sandbox.instanceId,
        reason: "not_in_asg",
        orphanedJobsRecovered: orphanCount,
        clearedAssignments,
        source: "instance_discovery",
      },
      result: "success",
    });

    return orphanCount;
  }

  /**
   * Find orphaned jobs assigned to a terminated sandbox's worker and recover them.
   * - pending jobs: clear worker_id, re-queue
   * - running jobs >5 min: mark failed with error_code 'worker_terminated'
   *   and publish WebSocket notification so the user's frontend updates
   */
  private async recoverOrphanedJobs(sandbox: SandboxRecord): Promise<number> {
    // Resolve the worker_id for this sandbox
    const workerId = await this.sandboxRepo.resolveWorkerId(sandbox.id);
    if (!workerId) {
      this.logger.debug(
        { sandboxId: sandbox.id },
        "No worker registered for sandbox, skipping orphan recovery",
      );
      return 0;
    }

    let recovered = 0;

    // Find pending jobs assigned to this worker
    const pendingRows = (await this.db.execute(
      sql`SELECT id, valet_task_id FROM gh_automation_jobs
          WHERE worker_id = ${workerId}
            AND status IN ('queued', 'pending')`,
    )) as Array<{ id: string; valet_task_id: string | null }>;

    for (const row of pendingRows) {
      try {
        // Clear worker assignment so job can be picked up by another worker
        await this.ghJobRepo.updateStatus(row.id, {
          status: "queued",
          workerId: null,
          statusMessage: "Re-queued: original worker terminated",
        });
        recovered++;

        this.logger.info(
          { jobId: row.id, valetTaskId: row.valet_task_id },
          "Re-queued orphaned pending job",
        );
      } catch (err) {
        this.logger.error({ err, jobId: row.id }, "Failed to re-queue orphaned pending job");
      }
    }

    // Find running jobs assigned to this worker that have been running >5 min
    // Include user_id from linked VALET task for WebSocket notification
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
    const runningRows = (await this.db.execute(
      sql`SELECT j.id, j.valet_task_id, t.user_id
          FROM gh_automation_jobs j
          LEFT JOIN tasks t ON t.id = j.valet_task_id
          WHERE j.worker_id = ${workerId}
            AND j.status = 'running'
            AND j.started_at < ${fiveMinAgo}`,
    )) as Array<{ id: string; valet_task_id: string | null; user_id: string | null }>;

    const errorMessage = "Worker instance terminated while job was running";

    for (const row of runningRows) {
      try {
        await this.ghJobRepo.updateStatus(row.id, {
          status: "failed",
          errorCode: "worker_terminated",
          errorDetails: {
            reason: errorMessage,
            sandboxId: sandbox.id,
            instanceId: sandbox.instanceId,
          },
          completedAt: new Date(),
        });

        // Also fail the linked VALET task if one exists
        if (row.valet_task_id) {
          await this.taskRepo.updateStatus(row.valet_task_id, "failed");

          // Publish WebSocket event so the user's frontend updates immediately
          if (row.user_id) {
            await publishToUser(this.redis, row.user_id, {
              type: "task_update",
              taskId: row.valet_task_id,
              status: "failed",
              currentStep: `Failed: ${errorMessage}`,
              error: {
                code: "worker_terminated",
                message: errorMessage,
              },
            });
          }
        }

        recovered++;

        this.logger.warn(
          { jobId: row.id, valetTaskId: row.valet_task_id },
          "Marked orphaned running job as failed (worker_terminated)",
        );
      } catch (err) {
        this.logger.error({ err, jobId: row.id }, "Failed to mark orphaned running job as failed");
      }
    }

    // Mark the worker as offline in gh_worker_registry
    await this.db.execute(
      sql`UPDATE gh_worker_registry
          SET status = 'offline', updated_at = NOW()
          WHERE worker_id = ${workerId} AND status != 'offline'`,
    );

    return recovered;
  }

  // ─── Private: IP Update ───

  private async updateSandboxIp(sandbox: SandboxRecord, instance: AsgInstance): Promise<void> {
    this.logger.info(
      {
        sandboxId: sandbox.id,
        oldIp: sandbox.publicIp,
        newIp: instance.publicIp,
        instanceId: instance.instanceId,
      },
      "Updating sandbox IP to match ASG instance",
    );

    await this.sandboxRepo.update(sandbox.id, {
      publicIp: instance.publicIp,
      instanceId: instance.instanceId,
    });

    // Also update gh_worker_registry
    await this.db.execute(
      sql`UPDATE gh_worker_registry
          SET ec2_ip = ${instance.publicIp}
          WHERE ec2_instance_id = ${instance.instanceId}
            AND (ec2_ip IS NULL OR ec2_ip != ${instance.publicIp})`,
    );

    await this.auditLogService.log({
      sandboxId: sandbox.id,
      action: "ip_updated",
      details: {
        oldIp: sandbox.publicIp,
        newIp: instance.publicIp,
        instanceId: instance.instanceId,
        source: "instance_discovery",
      },
      result: "success",
    });
  }
}
