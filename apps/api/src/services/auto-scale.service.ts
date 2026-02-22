import {
  AutoScalingClient,
  DescribeAutoScalingGroupsCommand,
  UpdateAutoScalingGroupCommand,
} from "@aws-sdk/client-auto-scaling";
import { EC2Client, DescribeInstancesCommand } from "@aws-sdk/client-ec2";
import { sql } from "drizzle-orm";
import type { FastifyBaseLogger } from "fastify";
import type { Database } from "@valet/db";
import type { TaskQueueService } from "../modules/tasks/task-queue.service.js";
import type { SandboxRepository } from "../modules/sandboxes/sandbox.repository.js";
import type { SandboxService } from "../modules/sandboxes/sandbox.service.js";

export class AutoScaleService {
  private logger: FastifyBaseLogger;
  private taskQueueService: TaskQueueService;
  private db: Database;
  private sandboxRepo: SandboxRepository;
  private sandboxService: SandboxService;
  private asgClient: AutoScalingClient | null;
  private ec2Client: EC2Client | null;
  private enabled: boolean;
  private asgName: string;
  private minCapacity: number;
  private maxCapacity: number;
  private jobsPerWorker: number;

  constructor({
    logger,
    taskQueueService,
    db,
    sandboxRepo,
    sandboxService,
  }: {
    logger: FastifyBaseLogger;
    taskQueueService: TaskQueueService;
    db: Database;
    sandboxRepo: SandboxRepository;
    sandboxService: SandboxService;
  }) {
    this.logger = logger;
    this.taskQueueService = taskQueueService;
    this.db = db;
    this.sandboxRepo = sandboxRepo;
    this.sandboxService = sandboxService;

    this.enabled = process.env.AUTOSCALE_ASG_ENABLED === "true";
    this.asgName = process.env.AWS_ASG_NAME ?? "";
    this.minCapacity = parseInt(process.env.AUTOSCALE_ASG_MIN ?? "1", 10);
    this.maxCapacity = parseInt(process.env.AUTOSCALE_ASG_MAX ?? "10", 10);
    this.jobsPerWorker = parseInt(process.env.JOBS_PER_WORKER ?? "1", 10);

    if (this.enabled) {
      const region = process.env.AWS_REGION ?? "us-east-1";
      this.asgClient = new AutoScalingClient({ region });
      this.ec2Client = new EC2Client({ region });
    } else {
      this.asgClient = null;
      this.ec2Client = null;
    }
  }

  async evaluate(): Promise<void> {
    if (!this.enabled) {
      return;
    }

    try {
      const stats = await this.taskQueueService.getQueueStats();
      const queueDepth = stats?.queued ?? 0;

      const desired = Math.min(
        this.maxCapacity,
        Math.max(this.minCapacity, Math.ceil(queueDepth / this.jobsPerWorker)),
      );

      const current = await this.getCurrentCapacity();

      if (desired === current) {
        this.logger.info(
          { desired, current, queueDepth },
          "ASG capacity matches desired — no change",
        );
      } else {
        this.logger.info({ desired, current, queueDepth }, "Updating ASG desired capacity");

        await this.asgClient!.send(
          new UpdateAutoScalingGroupCommand({
            AutoScalingGroupName: this.asgName,
            DesiredCapacity: desired,
            MinSize: this.minCapacity,
            MaxSize: this.maxCapacity,
          }),
        );
      }
    } catch (err) {
      this.logger.error({ err }, "AutoScale evaluate failed");
      // don't rethrow — let the pg-boss schedule continue
    }

    // Sync ASG instance IPs into DB (runs on every evaluate cycle, regardless of scaling changes)
    await this.syncAsgIps();
  }

  async getFleetStatus() {
    const stats = await this.taskQueueService.getQueueStats();
    const workerStats = await this.getWorkerStats();
    const currentCapacity = await this.getCurrentCapacity();

    return {
      enabled: this.enabled,
      asgName: this.asgName,
      currentCapacity,
      queueDepth: stats?.queued ?? 0,
      activeWorkers: workerStats.active,
      idleWorkers: workerStats.idle,
    };
  }

  async getWorkerStats(): Promise<{
    total: number;
    active: number;
    draining: number;
    offline: number;
    idle: number;
  }> {
    const statusRows = (await this.db.execute(
      sql`SELECT status, count(*)::text FROM gh_worker_registry GROUP BY status`,
    )) as Array<{ status: string; count: string }>;

    const idleRows = (await this.db.execute(
      sql`SELECT count(*)::text FROM gh_worker_registry WHERE status = 'active' AND current_job_id IS NULL`,
    )) as Array<{ count: string }>;

    let total = 0;
    let active = 0;
    let draining = 0;
    let offline = 0;

    for (const row of statusRows) {
      const count = parseInt(row.count, 10);
      total += count;
      switch (row.status) {
        case "active":
          active = count;
          break;
        case "draining":
          draining = count;
          break;
        case "offline":
          offline = count;
          break;
      }
    }

    const idle = parseInt(idleRows[0]?.count ?? "0", 10);

    return { total, active, draining, offline, idle };
  }

  /**
   * Sync ASG instance IPs into sandboxes + gh_worker_registry.
   * Called after evaluate() to keep DB in sync when ASG replaces instances.
   *
   * This method now handles the full lifecycle:
   * 1. Updates publicIp AND instanceId for known instances
   * 2. Creates/updates sandbox records for NEW ASG instances
   * 3. Marks sandboxes as terminated when instances disappear from ASG
   * 4. Triggers immediate health check on any sandbox whose IP changed
   * 5. Logs all state transitions
   */
  async syncAsgIps(): Promise<void> {
    if (!this.enabled || !this.ec2Client || !this.asgName) return;

    try {
      const result = await this.ec2Client.send(
        new DescribeInstancesCommand({
          Filters: [
            { Name: "tag:aws:autoscaling:groupName", Values: [this.asgName] },
            { Name: "instance-state-name", Values: ["running"] },
          ],
        }),
      );

      const instances: Array<{ instanceId: string; publicIp: string }> = [];
      for (const reservation of result.Reservations ?? []) {
        for (const inst of reservation.Instances ?? []) {
          if (inst.InstanceId && inst.PublicIpAddress) {
            instances.push({
              instanceId: inst.InstanceId,
              publicIp: inst.PublicIpAddress,
            });
          }
        }
      }

      // ── Step 1+2: Upsert instances ──
      const asgInstanceIds = new Set(instances.map((i) => i.instanceId));
      const healthCheckNeeded: string[] = [];

      for (const { instanceId, publicIp } of instances) {
        const novncUrl = `http://${publicIp}:6080`;

        // Try to find an existing sandbox by this instanceId
        const existingByInstanceId = await this.sandboxRepo.findByInstanceId(instanceId);

        if (existingByInstanceId) {
          // Known instance — check if IP changed
          const ipChanged =
            existingByInstanceId.publicIp !== null && existingByInstanceId.publicIp !== publicIp;

          if (ipChanged || !existingByInstanceId.publicIp) {
            this.logger.info(
              {
                sandboxId: existingByInstanceId.id,
                sandboxName: existingByInstanceId.name,
                oldIp: existingByInstanceId.publicIp,
                newIp: publicIp,
                instanceId,
              },
              "ASG sync: sandbox IP changed — updating",
            );

            await this.sandboxRepo.update(existingByInstanceId.id, {
              publicIp,
              novncUrl,
              instanceId,
            });

            // Schedule health check for IP-changed sandbox
            healthCheckNeeded.push(existingByInstanceId.id);
          }
        } else {
          // NEW instance not matching any sandbox by instanceId.
          // Check if there's an existing ASG-managed sandbox we should update
          // (e.g., the original "gh-worker-asg-1" record whose instance was replaced)
          const asgSandboxes = await this.sandboxRepo.findAsgManaged();

          // Find one whose instanceId is NOT in the current ASG set
          // (meaning its old instance was replaced)
          const staleAsgSandbox = asgSandboxes.find((s) => !asgInstanceIds.has(s.instanceId));

          if (staleAsgSandbox) {
            this.logger.info(
              {
                sandboxId: staleAsgSandbox.id,
                sandboxName: staleAsgSandbox.name,
                oldInstanceId: staleAsgSandbox.instanceId,
                newInstanceId: instanceId,
                oldIp: staleAsgSandbox.publicIp,
                newIp: publicIp,
              },
              "ASG sync: updating stale ASG sandbox with new instance",
            );

            await this.sandboxRepo.update(staleAsgSandbox.id, {
              instanceId,
              publicIp,
              novncUrl,
              ec2Status: "running",
              healthStatus: "degraded", // Must prove health
            });

            healthCheckNeeded.push(staleAsgSandbox.id);
          } else {
            // Truly new instance — create a new sandbox record
            this.logger.info(
              { instanceId, publicIp },
              "ASG sync: new ASG instance detected — creating sandbox record",
            );

            try {
              const newSandbox = await this.sandboxRepo.create({
                name: `gh-worker-asg-${instanceId.slice(-6)}`,
                environment: "staging",
                instanceId,
                instanceType: "t3.large",
                publicIp,
                capacity: 1,
                sshKeyName: "valet-worker.pem",
                novncUrl,
                tags: {
                  purpose: "staging",
                  region: "us-east-1",
                  asg_managed: true,
                  asg_name: this.asgName,
                },
              });

              this.logger.info(
                { sandboxId: newSandbox.id, instanceId, publicIp },
                "ASG sync: new sandbox record created",
              );

              healthCheckNeeded.push(newSandbox.id);
            } catch (err) {
              this.logger.error(
                { err, instanceId, publicIp },
                "ASG sync: failed to create sandbox for new ASG instance",
              );
            }
          }
        }

        // Always update gh_worker_registry (match on ec2_instance_id)
        await this.db.execute(
          sql`UPDATE gh_worker_registry SET ec2_ip = ${publicIp} WHERE ec2_instance_id = ${instanceId} AND (ec2_ip IS NULL OR ec2_ip != ${publicIp})`,
        );
      }

      // ── Step 3: Mark terminated instances ──
      // Find ASG-managed sandboxes whose instanceId no longer appears in the ASG
      const asgSandboxes = await this.sandboxRepo.findAsgManaged();
      for (const sandbox of asgSandboxes) {
        if (!asgInstanceIds.has(sandbox.instanceId)) {
          // Only mark as terminated if we have running instances (ASG is functional)
          // and this sandbox's instance is genuinely gone
          if (instances.length > 0) {
            this.logger.warn(
              {
                sandboxId: sandbox.id,
                sandboxName: sandbox.name,
                instanceId: sandbox.instanceId,
                publicIp: sandbox.publicIp,
              },
              "ASG sync: instance no longer in ASG — marking sandbox as terminated",
            );

            await this.sandboxRepo.update(sandbox.id, {
              status: "terminated",
              ec2Status: "terminated",
              healthStatus: "unhealthy",
            });
          }
        }
      }

      // ── Step 4: Trigger health checks on IP-changed sandboxes ──
      for (const sandboxId of healthCheckNeeded) {
        try {
          this.logger.info(
            { sandboxId },
            "ASG sync: triggering immediate health check after IP change",
          );
          await this.sandboxService.healthCheck(sandboxId);
        } catch (err) {
          this.logger.warn(
            { sandboxId, err },
            "ASG sync: post-IP-change health check failed (will retry on next cycle)",
          );
        }
      }

      // Warn if GHOSTHANDS_API_URL doesn't match any current instance IP
      const ghApiUrl = process.env.GHOSTHANDS_API_URL ?? "";
      const currentIps = instances.map((i) => i.publicIp);
      const urlMatchesInstance = currentIps.some((ip) => ghApiUrl.includes(ip));
      if (!urlMatchesInstance && currentIps.length > 0) {
        this.logger.warn(
          { ghApiUrl, currentIps },
          "GHOSTHANDS_API_URL does not match any running ASG instance IP — update Fly secret",
        );
      }
    } catch (err) {
      this.logger.error({ err }, "ASG IP sync failed");
    }
  }

  async getCurrentCapacity(): Promise<number> {
    if (!this.enabled || !this.asgClient) {
      return 0;
    }

    const result = await this.asgClient.send(
      new DescribeAutoScalingGroupsCommand({
        AutoScalingGroupNames: [this.asgName],
      }),
    );

    const asg = result.AutoScalingGroups?.[0];
    return asg?.DesiredCapacity ?? 0;
  }
}
