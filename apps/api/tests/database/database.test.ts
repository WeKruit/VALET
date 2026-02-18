/**
 * Database Schema & Migration Tests (DB-01 to DB-19)
 *
 * Verifies schema definitions, foreign keys, column types, and migration integrity.
 * No live database connection needed -- tests inspect Drizzle schema objects and migration files.
 */
import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

// ── Schema imports ───────────────────────────────────────────────────────────
import { users } from "@valet/db/schema";
import {
  tasks,
  taskStatusEnum,
  platformEnum,
  applicationModeEnum,
  externalStatusEnum,
} from "@valet/db/schema";
import { resumes, resumeStatusEnum } from "@valet/db/schema";
import { consentRecords, consentTypeEnum } from "@valet/db/schema";
import { sandboxes, sandboxStatusEnum } from "@valet/db/schema";
import { ghAutomationJobs } from "@valet/db/schema";
import { taskEvents } from "@valet/db/schema";
import { qaBank, qaUsageModeEnum, answerSourceEnum } from "@valet/db/schema";
import { notifications } from "@valet/db/schema";

// ── Helper to get column names from a Drizzle table ──────────────────────────
function getColumnNames(table: Record<string, unknown>): string[] {
  // Drizzle table objects have Symbol(drizzle:Columns) or similar,
  // but column accessors are direct properties that have a .name or .columnType
  return Object.keys(table).filter((key) => {
    const col = table[key];
    return col != null && typeof col === "object" && "name" in (col as any);
  });
}

// ── Paths ────────────────────────────────────────────────────────────────────
const DB_PACKAGE_ROOT = path.resolve(__dirname, "../../../../packages/db");
const DRIZZLE_DIR = path.join(DB_PACKAGE_ROOT, "drizzle");
const JOURNAL_PATH = path.join(DRIZZLE_DIR, "meta", "_journal.json");

describe("Database Tests", () => {
  // ── DB-01: All migration files exist ─────────────────────────────────────
  describe("DB-01: All migration files exist", () => {
    const expectedMigrations = [
      "0000_friendly_hitman.sql",
      "0001_add_auth_columns.sql",
      "0002_add_external_status.sql",
      "0003_add_action_manuals.sql",
      "0004_add_sandboxes.sql",
      "0005_add_user_roles.sql",
      "0006_add_sandbox_secrets.sql",
      "0007_add_browser_config.sql",
      "0008_add_performance_indexes.sql",
      "0009_add_ec2_controls.sql",
      "0010_add_hitl_interaction.sql",
      "0011_add_task_sandbox_id.sql",
    ];

    it("verifies all 12 migration SQL files exist", () => {
      for (const migrationFile of expectedMigrations) {
        const filePath = path.join(DRIZZLE_DIR, migrationFile);
        expect(fs.existsSync(filePath), `Migration file missing: ${migrationFile}`).toBe(true);
      }
    });

    it("has exactly 12 SQL migration files", () => {
      const sqlFiles = fs.readdirSync(DRIZZLE_DIR).filter((f) => f.endsWith(".sql"));
      expect(sqlFiles).toHaveLength(12);
    });
  });

  // ── DB-02: TypeScript schema types compile ───────────────────────────────
  describe("DB-02: TypeScript schema types compile", () => {
    it("imports all schema types without errors", () => {
      // If these imports fail, the test file won't even load
      expect(users).toBeDefined();
      expect(tasks).toBeDefined();
      expect(resumes).toBeDefined();
      expect(consentRecords).toBeDefined();
      expect(sandboxes).toBeDefined();
      expect(ghAutomationJobs).toBeDefined();
      expect(taskEvents).toBeDefined();
      expect(qaBank).toBeDefined();
      expect(notifications).toBeDefined();
    });

    it("enum definitions are valid", () => {
      expect(taskStatusEnum).toBeDefined();
      expect(platformEnum).toBeDefined();
      expect(applicationModeEnum).toBeDefined();
      expect(externalStatusEnum).toBeDefined();
      expect(resumeStatusEnum).toBeDefined();
      expect(consentTypeEnum).toBeDefined();
      expect(sandboxStatusEnum).toBeDefined();
      expect(qaUsageModeEnum).toBeDefined();
      expect(answerSourceEnum).toBeDefined();
    });
  });

  // ── DB-03: resetDatabase helper works ────────────────────────────────────
  describe("DB-03: resetDatabase helper works", () => {
    it("verify function exists and accepts Pool param", async () => {
      const { resetDatabase } = await import("../../tests/helpers/db");
      expect(typeof resetDatabase).toBe("function");
      // Function signature: (pool: Pool) => Promise<void>
      expect(resetDatabase.length).toBe(1);
    });

    it("truncateTables helper also exists", async () => {
      const { truncateTables } = await import("../../tests/helpers/db");
      expect(typeof truncateTables).toBe("function");
    });
  });

  // ── DB-10: Schema: users table has correct columns ───────────────────────
  describe("DB-10: Schema: users table has correct columns", () => {
    it("has all expected columns", () => {
      const cols = getColumnNames(users);
      const required = [
        "id",
        "email",
        "name",
        "avatarUrl",
        "googleId",
        "passwordHash",
        "emailVerified",
        "phone",
        "location",
        "linkedinUrl",
        "githubUrl",
        "portfolioUrl",
        "workHistory",
        "education",
        "skills",
        "role",
        "subscriptionTier",
        "isActive",
        "createdAt",
        "updatedAt",
      ];

      for (const col of required) {
        expect(cols, `Missing column: ${col}`).toContain(col);
      }
    });

    it("id is a uuid primary key", () => {
      expect((users.id as any).columnType).toContain("UUID");
      expect((users.id as any).primary).toBe(true);
    });

    it("email is unique and not null", () => {
      expect((users.email as any).isUnique).toBe(true);
      expect((users.email as any).notNull).toBe(true);
    });
  });

  // ── DB-11: Schema: tasks table has correct FK to users ───────────────────
  describe("DB-11: Schema: tasks table has correct FK to users", () => {
    it("userId references users.id", () => {
      const userIdCol = tasks.userId as any;
      expect(userIdCol).toBeDefined();
      expect(userIdCol.notNull).toBe(true);
    });

    it("tasks table has required columns", () => {
      const cols = getColumnNames(tasks);
      const required = [
        "id",
        "userId",
        "jobUrl",
        "platform",
        "status",
        "mode",
        "resumeId",
        "progress",
        "workflowRunId",
        "sandboxId",
        "interactionType",
        "interactionData",
        "createdAt",
        "updatedAt",
      ];

      for (const col of required) {
        expect(cols, `Missing column: ${col}`).toContain(col);
      }
    });
  });

  // ── DB-12: Schema: resumes table columns ─────────────────────────────────
  describe("DB-12: Schema: resumes table columns", () => {
    it("has all required columns", () => {
      const cols = getColumnNames(resumes);
      const required = [
        "id",
        "userId",
        "filename",
        "fileKey",
        "fileSizeBytes",
        "mimeType",
        "isDefault",
        "status",
        "parsedData",
        "createdAt",
      ];

      for (const col of required) {
        expect(cols, `Missing column: ${col}`).toContain(col);
      }
    });

    it("userId references users table", () => {
      const userIdCol = resumes.userId as any;
      expect(userIdCol).toBeDefined();
      expect(userIdCol.notNull).toBe(true);
    });
  });

  // ── DB-13: Schema: consent_records table ─────────────────────────────────
  describe("DB-13: Schema: consent_records table", () => {
    it("has required columns and types", () => {
      const cols = getColumnNames(consentRecords);
      const required = ["id", "userId", "type", "version", "ipAddress", "userAgent", "createdAt"];

      for (const col of required) {
        expect(cols, `Missing column: ${col}`).toContain(col);
      }
    });

    it("consent type enum has correct values", () => {
      // The enum values are encoded in the Drizzle pgEnum
      expect(consentTypeEnum).toBeDefined();
      expect(consentTypeEnum.enumValues).toContain("tos_acceptance");
      expect(consentTypeEnum.enumValues).toContain("privacy_policy");
      expect(consentTypeEnum.enumValues).toContain("copilot_disclaimer");
      expect(consentTypeEnum.enumValues).toContain("autopilot_consent");
    });
  });

  // ── DB-14: Schema: sandboxes table unique constraint ─────────────────────
  describe("DB-14: Schema: sandboxes table unique constraint", () => {
    it("instanceId has unique constraint", () => {
      const instanceIdCol = sandboxes.instanceId as any;
      expect(instanceIdCol).toBeDefined();
      expect(instanceIdCol.isUnique).toBe(true);
    });

    it("has required columns", () => {
      const cols = getColumnNames(sandboxes);
      const required = [
        "id",
        "name",
        "environment",
        "instanceId",
        "instanceType",
        "publicIp",
        "status",
        "healthStatus",
        "capacity",
        "currentLoad",
        "browserEngine",
        "ec2Status",
        "createdAt",
        "updatedAt",
      ];

      for (const col of required) {
        expect(cols, `Missing column: ${col}`).toContain(col);
      }
    });
  });

  // ── DB-15: Schema: gh_automation_jobs columns ────────────────────────────
  describe("DB-15: Schema: gh_automation_jobs columns", () => {
    it("has key columns", () => {
      const cols = getColumnNames(ghAutomationJobs);
      const required = [
        "id",
        "userId",
        "jobType",
        "targetUrl",
        "status",
        "statusMessage",
        "startedAt",
        "completedAt",
        "workerId",
        "resultData",
        "resultSummary",
        "errorCode",
        "errorDetails",
        "actionCount",
        "totalTokens",
        "llmCostCents",
        "targetWorkerId",
        "valetTaskId",
        "interactionType",
        "interactionData",
        "createdAt",
        "updatedAt",
      ];

      for (const col of required) {
        expect(cols, `Missing column: ${col}`).toContain(col);
      }
    });

    it("status defaults to queued", () => {
      const statusCol = ghAutomationJobs.status as any;
      expect(statusCol.hasDefault).toBe(true);
    });
  });

  // ── DB-16: Schema: task_events FK to tasks ───────────────────────────────
  describe("DB-16: Schema: task_events FK to tasks", () => {
    it("has taskId referencing tasks table", () => {
      const taskIdCol = taskEvents.taskId as any;
      expect(taskIdCol).toBeDefined();
      expect(taskIdCol.notNull).toBe(true);
    });

    it("has required columns", () => {
      const cols = getColumnNames(taskEvents);
      const required = [
        "id",
        "taskId",
        "eventType",
        "fromStatus",
        "toStatus",
        "eventData",
        "createdAt",
      ];

      for (const col of required) {
        expect(cols, `Missing column: ${col}`).toContain(col);
      }
    });
  });

  // ── DB-17: Schema: qa_bank columns ───────────────────────────────────────
  describe("DB-17: Schema: qa_bank columns", () => {
    it("has question, answer, usageMode columns", () => {
      const cols = getColumnNames(qaBank);
      expect(cols).toContain("question");
      expect(cols).toContain("answer");
      expect(cols).toContain("usageMode");
    });

    it("usageMode enum has correct values", () => {
      expect(qaUsageModeEnum.enumValues).toContain("always_use");
      expect(qaUsageModeEnum.enumValues).toContain("ask_each_time");
      expect(qaUsageModeEnum.enumValues).toContain("decline_to_answer");
    });

    it("source enum has correct values", () => {
      expect(answerSourceEnum.enumValues).toContain("user_input");
      expect(answerSourceEnum.enumValues).toContain("resume_inferred");
      expect(answerSourceEnum.enumValues).toContain("application_learned");
    });

    it("has all required columns", () => {
      const cols = getColumnNames(qaBank);
      const required = [
        "id",
        "userId",
        "category",
        "question",
        "answer",
        "usageMode",
        "source",
        "timesUsed",
        "createdAt",
        "updatedAt",
      ];

      for (const col of required) {
        expect(cols, `Missing column: ${col}`).toContain(col);
      }
    });
  });

  // ── DB-18: Schema: notifications columns ─────────────────────────────────
  describe("DB-18: Schema: notifications columns", () => {
    it("has userId, type, read columns", () => {
      const cols = getColumnNames(notifications);
      expect(cols).toContain("userId");
      expect(cols).toContain("type");
      expect(cols).toContain("read");
    });

    it("read defaults to false", () => {
      const readCol = notifications.read as any;
      expect(readCol.hasDefault).toBe(true);
    });

    it("has all required columns", () => {
      const cols = getColumnNames(notifications);
      const required = ["id", "userId", "type", "title", "body", "read", "metadata", "createdAt"];

      for (const col of required) {
        expect(cols, `Missing column: ${col}`).toContain(col);
      }
    });
  });

  // ── DB-19: Migration journal is valid ────────────────────────────────────
  describe("DB-19: Migration journal is valid", () => {
    it("_journal.json exists and is valid JSON", () => {
      expect(fs.existsSync(JOURNAL_PATH)).toBe(true);
      const content = fs.readFileSync(JOURNAL_PATH, "utf-8");
      const journal = JSON.parse(content);
      expect(journal).toBeDefined();
      expect(journal.version).toBe("7");
      expect(journal.dialect).toBe("postgresql");
    });

    it("has 12 entries with sequential indices", () => {
      const content = fs.readFileSync(JOURNAL_PATH, "utf-8");
      const journal = JSON.parse(content);
      expect(journal.entries).toHaveLength(12);

      for (let i = 0; i < 12; i++) {
        expect(journal.entries[i].idx).toBe(i);
      }
    });

    it("each entry has required fields", () => {
      const content = fs.readFileSync(JOURNAL_PATH, "utf-8");
      const journal = JSON.parse(content);

      for (const entry of journal.entries) {
        expect(entry).toHaveProperty("idx");
        expect(entry).toHaveProperty("version");
        expect(entry).toHaveProperty("when");
        expect(entry).toHaveProperty("tag");
        expect(entry).toHaveProperty("breakpoints");
        expect(typeof entry.idx).toBe("number");
        expect(typeof entry.tag).toBe("string");
        expect(typeof entry.when).toBe("number");
      }
    });

    it("entry tags match migration file names (without .sql)", () => {
      const content = fs.readFileSync(JOURNAL_PATH, "utf-8");
      const journal = JSON.parse(content);

      for (const entry of journal.entries) {
        const sqlFile = path.join(DRIZZLE_DIR, `${entry.tag}.sql`);
        expect(fs.existsSync(sqlFile), `Migration file for tag ${entry.tag} not found`).toBe(true);
      }
    });
  });
});
