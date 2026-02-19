import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  text,
  integer,
  boolean,
  jsonb,
  timestamp,
  index,
} from "drizzle-orm/pg-core";

export const sandboxStatusEnum = pgEnum("sandbox_status", [
  "provisioning",
  "active",
  "stopping",
  "stopped",
  "terminated",
  "unhealthy",
]);

export const sandboxHealthStatusEnum = pgEnum("sandbox_health_status", [
  "healthy",
  "degraded",
  "unhealthy",
]);

export const sandboxEnvironmentEnum = pgEnum("sandbox_environment", ["dev", "staging", "prod"]);

export const browserEngineEnum = pgEnum("browser_engine", ["chromium", "adspower"]);

export const ec2StatusEnum = pgEnum("ec2_status", [
  "pending",
  "running",
  "stopping",
  "stopped",
  "terminated",
]);

export const sandboxes = pgTable(
  "sandboxes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: varchar("name", { length: 255 }).notNull(),
    environment: sandboxEnvironmentEnum("environment").notNull(),
    instanceId: varchar("instance_id", { length: 50 }).notNull().unique(),
    instanceType: varchar("instance_type", { length: 50 }).notNull(),
    publicIp: varchar("public_ip", { length: 45 }),
    privateIp: varchar("private_ip", { length: 45 }),
    status: sandboxStatusEnum("status").default("provisioning").notNull(),
    healthStatus: sandboxHealthStatusEnum("health_status").default("unhealthy").notNull(),
    lastHealthCheckAt: timestamp("last_health_check_at", { withTimezone: true }),
    capacity: integer("capacity").default(5).notNull(),
    currentLoad: integer("current_load").default(0).notNull(),
    sshKeyName: varchar("ssh_key_name", { length: 255 }),
    novncUrl: text("novnc_url"),
    adspowerVersion: varchar("adspower_version", { length: 50 }),
    browserEngine: browserEngineEnum("browser_engine").default("adspower").notNull(),
    browserConfig: jsonb("browser_config").default({}),
    tags: jsonb("tags").default({}),
    ec2Status: ec2StatusEnum("ec2_status").default("stopped"),
    lastStartedAt: timestamp("last_started_at", { withTimezone: true }),
    lastStoppedAt: timestamp("last_stopped_at", { withTimezone: true }),
    autoStopEnabled: boolean("auto_stop_enabled").default(false).notNull(),
    idleMinutesBeforeStop: integer("idle_minutes_before_stop").default(30).notNull(),
    machineType: varchar("machine_type", { length: 20 }).notNull().default("ec2"),
    agentVersion: varchar("agent_version", { length: 50 }),
    agentLastSeenAt: timestamp("agent_last_seen_at", { withTimezone: true }),
    ghImageTag: varchar("gh_image_tag", { length: 255 }),
    ghImageUpdatedAt: timestamp("gh_image_updated_at", { withTimezone: true }),
    deployedCommitSha: varchar("deployed_commit_sha", { length: 40 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_sandboxes_environment").on(table.environment),
    index("idx_sandboxes_status").on(table.status),
    index("idx_sandboxes_health_status").on(table.healthStatus),
    index("idx_sandboxes_env_status").on(table.environment, table.status),
    index("idx_sandboxes_status_health").on(table.status, table.healthStatus),
    index("idx_sandboxes_updated_at").on(table.updatedAt),
  ],
);
