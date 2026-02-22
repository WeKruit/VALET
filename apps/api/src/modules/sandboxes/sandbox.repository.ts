import { eq, and, count, desc, asc, ilike, or, sql, type SQL } from "drizzle-orm";
import { sandboxes, type Database } from "@valet/db";
import type {
  SandboxStatus,
  SandboxHealthStatus,
  SandboxEnvironment,
  BrowserEngine,
  Ec2Status,
} from "@valet/shared/schemas";

export interface SandboxRecord {
  id: string;
  name: string;
  environment: SandboxEnvironment;
  instanceId: string;
  instanceType: string;
  publicIp: string | null;
  privateIp: string | null;
  status: SandboxStatus;
  healthStatus: SandboxHealthStatus;
  lastHealthCheckAt: Date | null;
  capacity: number;
  currentLoad: number;
  sshKeyName: string | null;
  novncUrl: string | null;
  adspowerVersion: string | null;
  browserEngine: BrowserEngine;
  browserConfig: Record<string, unknown> | null;
  tags: Record<string, unknown> | null;
  ec2Status: Ec2Status | null;
  lastStartedAt: Date | null;
  lastStoppedAt: Date | null;
  autoStopEnabled: boolean;
  idleMinutesBeforeStop: number;
  machineType: string;
  agentVersion: string | null;
  agentLastSeenAt: Date | null;
  ghImageTag: string | null;
  ghImageUpdatedAt: Date | null;
  deployedCommitSha: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function toSandboxRecord(row: Record<string, unknown>): SandboxRecord {
  return {
    ...row,
    browserEngine: (row.browserEngine as BrowserEngine) ?? "adspower",
    browserConfig: (row.browserConfig as Record<string, unknown>) ?? null,
    tags: (row.tags as Record<string, unknown>) ?? null,
    machineType: (row.machineType as string) ?? "ec2",
  } as SandboxRecord;
}

export class SandboxRepository {
  private db: Database;

  constructor({ db }: { db: Database }) {
    this.db = db;
  }

  async findById(id: string): Promise<SandboxRecord | null> {
    const rows = await this.db.select().from(sandboxes).where(eq(sandboxes.id, id)).limit(1);
    const row = rows[0];
    return row ? toSandboxRecord(row as Record<string, unknown>) : null;
  }

  async findByInstanceId(instanceId: string): Promise<SandboxRecord | null> {
    const rows = await this.db
      .select()
      .from(sandboxes)
      .where(eq(sandboxes.instanceId, instanceId))
      .limit(1);
    const row = rows[0];
    return row ? toSandboxRecord(row as Record<string, unknown>) : null;
  }

  async findMany(query: {
    page: number;
    pageSize: number;
    environment?: string;
    status?: string;
    healthStatus?: string;
    ec2Status?: string;
    search?: string;
    sortBy: string;
    sortOrder: string;
  }): Promise<{ data: SandboxRecord[]; total: number }> {
    const conditions: SQL[] = [];

    if (query.environment) {
      conditions.push(eq(sandboxes.environment, query.environment as SandboxEnvironment));
    }
    if (query.status) {
      conditions.push(eq(sandboxes.status, query.status as SandboxStatus));
    }
    if (query.healthStatus) {
      conditions.push(eq(sandboxes.healthStatus, query.healthStatus as SandboxHealthStatus));
    }
    if (query.ec2Status) {
      conditions.push(eq(sandboxes.ec2Status, query.ec2Status as Ec2Status));
    }
    if (query.search) {
      const pattern = `%${query.search}%`;
      conditions.push(
        or(
          ilike(sandboxes.name, pattern),
          ilike(sandboxes.instanceId, pattern),
          ilike(sandboxes.publicIp, pattern),
        )!,
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const sortColumnMap = {
      updatedAt: sandboxes.updatedAt,
      name: sandboxes.name,
      status: sandboxes.status,
      healthStatus: sandboxes.healthStatus,
      createdAt: sandboxes.createdAt,
    } as const;
    const sortColumn =
      sortColumnMap[query.sortBy as keyof typeof sortColumnMap] ?? sandboxes.createdAt;
    const orderFn = query.sortOrder === "asc" ? asc : desc;

    const [data, totalResult] = await Promise.all([
      this.db
        .select()
        .from(sandboxes)
        .where(whereClause)
        .orderBy(orderFn(sortColumn))
        .limit(query.pageSize)
        .offset((query.page - 1) * query.pageSize),
      this.db.select({ count: count() }).from(sandboxes).where(whereClause),
    ]);

    return {
      data: data.map((r) => toSandboxRecord(r as Record<string, unknown>)),
      total: totalResult[0]?.count ?? 0,
    };
  }

  async findAllActive(): Promise<SandboxRecord[]> {
    const data = await this.db.select().from(sandboxes).where(eq(sandboxes.status, "active"));
    return data.map((r) => toSandboxRecord(r as Record<string, unknown>));
  }

  async create(data: {
    name: string;
    environment: SandboxEnvironment;
    instanceId: string;
    instanceType: string;
    publicIp?: string;
    privateIp?: string;
    capacity?: number;
    sshKeyName?: string;
    novncUrl?: string;
    adspowerVersion?: string;
    browserEngine?: BrowserEngine;
    browserConfig?: Record<string, unknown>;
    tags?: Record<string, unknown>;
    machineType?: string;
  }): Promise<SandboxRecord> {
    const rows = await this.db
      .insert(sandboxes)
      .values({
        name: data.name,
        environment: data.environment,
        instanceId: data.instanceId,
        instanceType: data.instanceType,
        publicIp: data.publicIp ?? null,
        privateIp: data.privateIp ?? null,
        capacity: data.capacity ?? 5,
        sshKeyName: data.sshKeyName ?? null,
        novncUrl: data.novncUrl ?? null,
        adspowerVersion: data.adspowerVersion ?? null,
        browserEngine: data.browserEngine ?? "adspower",
        browserConfig: data.browserConfig ?? {},
        tags: data.tags ?? {},
        machineType: data.machineType ?? "ec2",
      })
      .returning();
    return toSandboxRecord(rows[0] as Record<string, unknown>);
  }

  async update(id: string, data: Record<string, unknown>): Promise<SandboxRecord | null> {
    const rows = await this.db
      .update(sandboxes)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(sandboxes.id, id))
      .returning();
    const row = rows[0];
    return row ? toSandboxRecord(row as Record<string, unknown>) : null;
  }

  async updateHealthStatus(
    id: string,
    healthStatus: SandboxHealthStatus,
  ): Promise<SandboxRecord | null> {
    const rows = await this.db
      .update(sandboxes)
      .set({
        healthStatus,
        lastHealthCheckAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(sandboxes.id, id))
      .returning();
    const row = rows[0];
    return row ? toSandboxRecord(row as Record<string, unknown>) : null;
  }

  async terminate(id: string): Promise<SandboxRecord | null> {
    const rows = await this.db
      .update(sandboxes)
      .set({ status: "terminated", updatedAt: new Date() })
      .where(eq(sandboxes.id, id))
      .returning();
    const row = rows[0];
    return row ? toSandboxRecord(row as Record<string, unknown>) : null;
  }

  async updateEc2Status(
    id: string,
    ec2Status: Ec2Status,
    extra?: {
      lastStartedAt?: Date;
      lastStoppedAt?: Date;
      publicIp?: string | null;
      instanceId?: string;
      novncUrl?: string | null;
      tags?: Record<string, unknown> | null;
    },
  ): Promise<SandboxRecord | null> {
    const rows = await this.db
      .update(sandboxes)
      .set({
        ec2Status,
        ...extra,
        updatedAt: new Date(),
      })
      .where(eq(sandboxes.id, id))
      .returning();
    const row = rows[0];
    return row ? toSandboxRecord(row as Record<string, unknown>) : null;
  }

  async findByMachineType(machineType: string): Promise<SandboxRecord[]> {
    const data = await this.db
      .select()
      .from(sandboxes)
      .where(and(eq(sandboxes.machineType, machineType), eq(sandboxes.status, "active")));
    return data.map((r) => toSandboxRecord(r as Record<string, unknown>));
  }

  async findAutoStopCandidates(): Promise<SandboxRecord[]> {
    const data = await this.db
      .select()
      .from(sandboxes)
      .where(
        and(
          eq(sandboxes.autoStopEnabled, true),
          eq(sandboxes.ec2Status, "running"),
          eq(sandboxes.currentLoad, 0),
        ),
      );
    return data.map((r) => toSandboxRecord(r as Record<string, unknown>));
  }

  /**
   * Resolve a sandbox ID to the active GH worker ID registered on that instance.
   * Returns null if no active worker is found for the sandbox.
   */
  async resolveWorkerId(sandboxId: string): Promise<string | null> {
    const sandbox = await this.findById(sandboxId);
    if (!sandbox?.instanceId) return null;

    const rows = (await this.db.execute(
      sql`SELECT worker_id FROM gh_worker_registry
          WHERE ec2_instance_id = ${sandbox.instanceId}
            AND status = 'active'
          ORDER BY last_heartbeat DESC
          LIMIT 1`,
    )) as Array<{ worker_id: string }>;

    return rows[0]?.worker_id ?? null;
  }
}
