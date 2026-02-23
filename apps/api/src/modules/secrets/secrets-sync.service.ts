import {
  SecretsManagerClient,
  GetSecretValueCommand,
  PutSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";
import sodium from "libsodium-wrappers";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { sql, desc } from "drizzle-orm";
import type { FastifyBaseLogger } from "fastify";
import type { Database } from "@valet/db";
import { auditTrail } from "@valet/db";

// --- Types ---
export interface TargetDiff {
  target: string;
  targetType: "fly" | "gh-actions" | "aws-sm";
  role: string;
  totalRefKeys: number;
  totalDeployedKeys: number;
  missing: string[];
  extra: string[];
  matched: number;
  mismatched: number;
  status: "synced" | "drifted" | "error" | "unavailable";
  error?: string;
  lastChecked: string;
}

export interface SecretsDiffResponse {
  environment: string;
  targets: TargetDiff[];
  summary: {
    total: number;
    synced: number;
    drifted: number;
    errors: number;
    unavailable: number;
  };
}

export interface SyncTargetResult {
  target: string;
  success: boolean;
  pushed: number;
  skipped: number;
  failed: number;
  errors: string[];
}

export interface SyncResult {
  environment: string;
  results: SyncTargetResult[];
  totalPushed: number;
  totalFailed: number;
  triggeredAt: string;
  triggeredBy: string;
  durationMs: number;
}

export interface SyncAuditEntry {
  id: string;
  userId: string;
  action: string;
  details: Record<string, unknown>;
  createdAt: string;
}

// --- Constants ---
const RUNTIME_VARS = new Set([
  "GH_WORKER_ID",
  "COMMIT_SHA",
  "BUILD_TIME",
  "EC2_INSTANCE_ID",
  "EC2_IP",
  "IMAGE_TAG",
]);

const PLACEHOLDER_RE =
  /<SET ON FLY|<set on EC2|<same as|<from admin|<production value|<MUST be|cannot read|PLACEHOLDER/i;

const WORKER_VAR_PATTERNS = [
  "NODE_ENV",
  "DATABASE_URL",
  "DATABASE_DIRECT_URL",
  "REDIS_URL",
  "JWT_SECRET",
  "JWT_REFRESH_SECRET",
  "S3_",
  "GH_SERVICE_SECRET",
  "GH_DEPLOY_SECRET",
  "VALET_DEPLOY_WEBHOOK_SECRET",
  "GHOSTHANDS_",
  "ANTHROPIC_",
  "OPENAI_",
  "CORS_ORIGIN",
  "TASK_DISPATCH_MODE",
  "AUTOSCALE_",
  "AWS_",
  "JOBS_PER_WORKER",
  "GH_DEPLOY_AUTO_TRIGGER",
];

const CI_VAR_PATTERNS = [
  "SUPABASE_URL",
  "SUPABASE_SECRET_KEY",
  "SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_DIRECT_URL",
  "GH_SERVICE_SECRET",
  "GH_ENCRYPTION_KEY",
  "VALET_DEPLOY_WEBHOOK_SECRET",
  "ECR_REGISTRY",
  "ECR_REPOSITORY",
];

// --- Helper: parse .env file ---
function parseEnvFile(filePath: string): Map<string, string> {
  const result = new Map<string, string>();
  let content: string;
  try {
    content = readFileSync(filePath, "utf-8");
  } catch {
    return result;
  }
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)/);
    if (!match) continue;
    const key = match[1]!;
    let value = match[2]!.trim();
    // Strip surrounding quotes
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (RUNTIME_VARS.has(key)) continue;
    if (PLACEHOLDER_RE.test(value)) continue;
    if (!value) continue;
    result.set(key, value);
  }
  return result;
}

// --- Helper: filter by role ---
function filterByRole(vars: Map<string, string>, role: string): Map<string, string> {
  const filtered = new Map<string, string>();
  for (const [key, value] of vars) {
    switch (role) {
      case "api":
        if (!key.startsWith("VITE_")) filtered.set(key, value);
        break;
      case "worker":
        if (WORKER_VAR_PATTERNS.some((p) => key === p || (p.endsWith("_") && key.startsWith(p)))) {
          filtered.set(key, value);
        }
        break;
      case "web":
        if (key.startsWith("VITE_")) filtered.set(key, value);
        break;
      case "ci":
        if (CI_VAR_PATTERNS.some((p) => key === p || (p.endsWith("_") && key.startsWith(p)))) {
          filtered.set(key, value);
        }
        break;
      default:
        filtered.set(key, value);
    }
  }
  return filtered;
}

// --- Helper: compute diff ---
function computeDiff(
  refKeys: Set<string>,
  deployedKeys: Set<string>,
): { missing: string[]; extra: string[]; matched: number } {
  const missing = [...refKeys].filter((k) => !deployedKeys.has(k)).sort();
  const extra = [...deployedKeys].filter((k) => !refKeys.has(k)).sort();
  const matched = [...refKeys].filter((k) => deployedKeys.has(k)).length;
  return { missing, extra, matched };
}

// --- Helper: get env file paths ---
function getEnvPaths(env: string) {
  const monorepoRoot = process.env.MONOREPO_ROOT ?? resolve(process.cwd(), "..");
  return {
    valetEnvPath: resolve(monorepoRoot, `.env.${env}`),
    ghEnvPath: resolve(monorepoRoot, `GHOST-HANDS/.env.${env}`),
  };
}

// --- Helper: Fly app config ---
function getFlyApps(env: string) {
  return env === "staging"
    ? [
        { name: "valet-api-stg", role: "api" },
        { name: "valet-worker-stg", role: "worker" },
        { name: "valet-web-stg", role: "web" },
      ]
    : [
        { name: "valet-api", role: "api" },
        { name: "valet-worker", role: "worker" },
        { name: "valet-web", role: "web" },
      ];
}

// --- Service ---
export class SecretsSyncService {
  private readonly logger: FastifyBaseLogger;
  private readonly db: Database;

  constructor({ logger, db }: { logger: FastifyBaseLogger; db: Database }) {
    this.logger = logger;
    this.db = db;
  }

  // ─── Diff ──────────────────────────────────────────────────────────

  async getDiff(env: "staging" | "production"): Promise<SecretsDiffResponse> {
    const { valetEnvPath, ghEnvPath } = getEnvPaths(env);
    const valetVars = parseEnvFile(valetEnvPath);
    const ghVars = parseEnvFile(ghEnvPath);

    this.logger.info(
      { env, valetEnvPath, ghEnvPath, valetKeyCount: valetVars.size, ghKeyCount: ghVars.size },
      "Computing secrets diff",
    );

    const flyApps = getFlyApps(env);

    const results = await Promise.allSettled([
      ...flyApps.map((app) => this.diffFlyApp(env, valetVars, app.name, app.role)),
      this.diffGhActions(env, ghVars),
      this.diffAwsSm(env, ghVars),
    ]);

    const targets: TargetDiff[] = results.map((r, i) => {
      if (r.status === "fulfilled") return r.value;
      const allTargets = [
        ...flyApps.map((a) => ({ target: a.name, targetType: "fly" as const, role: a.role })),
        { target: "WeKruit/GHOST-HANDS", targetType: "gh-actions" as const, role: "ci" },
        { target: `ghosthands/${env}`, targetType: "aws-sm" as const, role: "all" },
      ];
      const info = allTargets[i]!;
      return {
        target: info.target,
        targetType: info.targetType,
        role: info.role,
        totalRefKeys: 0,
        totalDeployedKeys: 0,
        missing: [],
        extra: [],
        matched: 0,
        mismatched: 0,
        status: "error" as const,
        error: String(r.reason),
        lastChecked: new Date().toISOString(),
      };
    });

    const summary = {
      total: targets.length,
      synced: targets.filter((t) => t.status === "synced").length,
      drifted: targets.filter((t) => t.status === "drifted").length,
      errors: targets.filter((t) => t.status === "error").length,
      unavailable: targets.filter((t) => t.status === "unavailable").length,
    };

    return { environment: env, targets, summary };
  }

  // ─── Sync ──────────────────────────────────────────────────────────

  async sync(
    env: "staging" | "production",
    userId: string,
    targets?: string[],
  ): Promise<SyncResult> {
    const startTime = Date.now();
    this.logger.info({ env, userId, targets }, "Starting secrets sync");

    const { valetEnvPath, ghEnvPath } = getEnvPaths(env);
    const valetVars = parseEnvFile(valetEnvPath);
    const ghVars = parseEnvFile(ghEnvPath);

    // Get diff to know what's drifted
    const diff = await this.getDiff(env);

    const results: SyncTargetResult[] = [];

    for (const target of diff.targets) {
      // Skip if specific targets requested and this isn't one
      if (targets && targets.length > 0 && !targets.includes(target.target)) {
        continue;
      }

      // Skip already-synced targets
      if (target.status === "synced") {
        results.push({
          target: target.target,
          success: true,
          pushed: 0,
          skipped: target.matched,
          failed: 0,
          errors: [],
        });
        continue;
      }

      // Skip unavailable targets
      if (target.status === "unavailable") {
        results.push({
          target: target.target,
          success: false,
          pushed: 0,
          skipped: 0,
          failed: 0,
          errors: [target.error ?? "Target unavailable"],
        });
        continue;
      }

      // Skip errored targets (diff itself failed — can't push)
      if (target.status === "error") {
        results.push({
          target: target.target,
          success: false,
          pushed: 0,
          skipped: 0,
          failed: 0,
          errors: [target.error ?? "Target errored during diff"],
        });
        continue;
      }

      try {
        const result = await this.pushToTarget(env, target, valetVars, ghVars);
        results.push(result);
      } catch (err) {
        this.logger.error({ err, target: target.target }, "Sync to target failed");
        results.push({
          target: target.target,
          success: false,
          pushed: 0,
          skipped: 0,
          failed: target.missing.length,
          errors: [err instanceof Error ? err.message : String(err)],
        });
      }
    }

    const syncResult: SyncResult = {
      environment: env,
      results,
      totalPushed: results.reduce((s, r) => s + r.pushed, 0),
      totalFailed: results.reduce((s, r) => s + r.failed, 0),
      triggeredAt: new Date().toISOString(),
      triggeredBy: userId,
      durationMs: Date.now() - startTime,
    };

    // Audit log
    await this.logAudit(userId, "secrets_sync", {
      environment: env,
      targetCount: results.length,
      totalPushed: syncResult.totalPushed,
      totalFailed: syncResult.totalFailed,
      targets: results.map((r) => ({
        target: r.target,
        pushed: r.pushed,
        failed: r.failed,
        success: r.success,
      })),
      durationMs: syncResult.durationMs,
    });

    return syncResult;
  }

  // ─── Audit log ─────────────────────────────────────────────────────

  async getAuditLog(env?: string, limit = 50): Promise<SyncAuditEntry[]> {
    const rows = await this.db
      .select()
      .from(auditTrail)
      .where(
        env
          ? sql`${auditTrail.action} LIKE 'secrets_%' AND ${auditTrail.details}->>'environment' = ${env}`
          : sql`${auditTrail.action} LIKE 'secrets_%'`,
      )
      .orderBy(desc(auditTrail.createdAt))
      .limit(limit);

    return rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      action: r.action,
      details: (r.details as Record<string, unknown>) ?? {},
      createdAt: r.createdAt.toISOString(),
    }));
  }

  // ─── Private: push to specific target ──────────────────────────────

  private async pushToTarget(
    env: string,
    target: TargetDiff,
    valetVars: Map<string, string>,
    ghVars: Map<string, string>,
  ): Promise<SyncTargetResult> {
    switch (target.targetType) {
      case "fly":
        return this.syncFlyApp(valetVars, target);
      case "gh-actions":
        return this.syncGhActions(ghVars, target);
      case "aws-sm":
        return this.syncAwsSm(env, ghVars, target);
      default:
        return {
          target: target.target,
          success: false,
          pushed: 0,
          skipped: 0,
          failed: 0,
          errors: [`Unknown target type: ${target.targetType}`],
        };
    }
  }

  // ─── Fly.io sync ───────────────────────────────────────────────────

  private async syncFlyApp(
    refVars: Map<string, string>,
    target: TargetDiff,
  ): Promise<SyncTargetResult> {
    const flyToken = process.env.FLY_API_TOKEN;
    if (!flyToken) {
      return {
        target: target.target,
        success: false,
        pushed: 0,
        skipped: 0,
        failed: 0,
        errors: ["FLY_API_TOKEN not set"],
      };
    }

    const filtered = filterByRole(refVars, target.role);
    // Only push keys that are missing or mismatched
    const keysToPush = target.missing;
    if (keysToPush.length === 0) {
      return {
        target: target.target,
        success: true,
        pushed: 0,
        skipped: target.matched,
        failed: 0,
        errors: [],
      };
    }

    const secrets = keysToPush
      .filter((k) => filtered.has(k))
      .map((k) => ({ label: k, type: "secret" as const, value: filtered.get(k)! }));

    if (secrets.length === 0) {
      return {
        target: target.target,
        success: true,
        pushed: 0,
        skipped: target.matched,
        failed: 0,
        errors: [],
      };
    }

    try {
      const res = await fetch(`https://api.machines.dev/v1/apps/${target.target}/secrets`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${flyToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(secrets),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`Fly API ${res.status}: ${body}`);
      }

      this.logger.info(
        { target: target.target, pushed: secrets.length, keys: keysToPush },
        "Fly secrets synced",
      );

      return {
        target: target.target,
        success: true,
        pushed: secrets.length,
        skipped: target.matched,
        failed: 0,
        errors: [],
      };
    } catch (err) {
      this.logger.error({ err, target: target.target }, "Fly sync failed");
      return {
        target: target.target,
        success: false,
        pushed: 0,
        skipped: 0,
        failed: keysToPush.length,
        errors: [err instanceof Error ? err.message : String(err)],
      };
    }
  }

  // ─── GitHub Actions sync ───────────────────────────────────────────

  private async syncGhActions(
    refVars: Map<string, string>,
    target: TargetDiff,
  ): Promise<SyncTargetResult> {
    const ghToken = process.env.GITHUB_TOKEN;
    if (!ghToken) {
      return {
        target: target.target,
        success: false,
        pushed: 0,
        skipped: 0,
        failed: 0,
        errors: ["GITHUB_TOKEN not set"],
      };
    }

    const filtered = filterByRole(refVars, "ci");
    const keysToPush = target.missing;
    if (keysToPush.length === 0) {
      return {
        target: target.target,
        success: true,
        pushed: 0,
        skipped: target.matched,
        failed: 0,
        errors: [],
      };
    }

    // Get repo public key for encryption
    const repo = target.target; // e.g. "WeKruit/GHOST-HANDS"
    let publicKey: { key: string; key_id: string };
    try {
      const res = await fetch(`https://api.github.com/repos/${repo}/actions/secrets/public-key`, {
        headers: {
          Authorization: `Bearer ${ghToken}`,
          Accept: "application/vnd.github+json",
        },
      });
      if (!res.ok) throw new Error(`GitHub API ${res.status}: ${res.statusText}`);
      publicKey = (await res.json()) as { key: string; key_id: string };
    } catch (err) {
      return {
        target: target.target,
        success: false,
        pushed: 0,
        skipped: 0,
        failed: keysToPush.length,
        errors: [
          `Failed to get repo public key: ${err instanceof Error ? err.message : String(err)}`,
        ],
      };
    }

    // Ensure libsodium is ready
    await sodium.ready;

    let pushed = 0;
    const errors: string[] = [];

    for (const key of keysToPush) {
      const value = filtered.get(key);
      if (!value) continue;

      try {
        // Encrypt value using libsodium sealed box
        const keyBytes = sodium.from_base64(publicKey.key, sodium.base64_variants.ORIGINAL);
        const messageBytes = sodium.from_string(value);
        const encryptedBytes = sodium.crypto_box_seal(messageBytes, keyBytes);
        const encryptedValue = sodium.to_base64(encryptedBytes, sodium.base64_variants.ORIGINAL);

        // Push encrypted secret
        const res = await fetch(`https://api.github.com/repos/${repo}/actions/secrets/${key}`, {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${ghToken}`,
            Accept: "application/vnd.github+json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            encrypted_value: encryptedValue,
            key_id: publicKey.key_id,
          }),
        });
        if (!res.ok) {
          const body = await res.text().catch(() => "");
          throw new Error(`GitHub API ${res.status}: ${body}`);
        }
        pushed++;
      } catch (err) {
        errors.push(`${key}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    this.logger.info(
      { target: target.target, pushed, failed: errors.length, keys: keysToPush },
      "GitHub Actions secrets synced",
    );

    return {
      target: target.target,
      success: errors.length === 0,
      pushed,
      skipped: target.matched,
      failed: errors.length,
      errors,
    };
  }

  // ─── AWS Secrets Manager sync ──────────────────────────────────────

  private async syncAwsSm(
    env: string,
    refVars: Map<string, string>,
    target: TargetDiff,
  ): Promise<SyncTargetResult> {
    const secretId = `ghosthands/${env}`;

    // For AWS SM, we read the full current secret, merge in changes, write back
    const client = new SecretsManagerClient({
      region: process.env.AWS_REGION ?? "us-east-1",
    });

    try {
      // Read existing secret (may not exist)
      let existing: Record<string, string> = {};
      try {
        const getCmd = new GetSecretValueCommand({ SecretId: secretId });
        const getResult = await client.send(getCmd);
        if (getResult.SecretString) {
          existing = JSON.parse(getResult.SecretString) as Record<string, string>;
        }
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        if (!errMsg.includes("ResourceNotFoundException")) {
          throw err;
        }
        // Secret doesn't exist yet — will create
      }

      // Merge canonical values into existing (canonical wins)
      const merged = { ...existing };
      let pushed = 0;
      for (const [key, value] of refVars) {
        if (merged[key] !== value) {
          merged[key] = value;
          pushed++;
        }
      }

      if (pushed === 0) {
        return {
          target: target.target,
          success: true,
          pushed: 0,
          skipped: target.matched,
          failed: 0,
          errors: [],
        };
      }

      // Write merged secret
      const putCmd = new PutSecretValueCommand({
        SecretId: secretId,
        SecretString: JSON.stringify(merged),
      });
      await client.send(putCmd);

      this.logger.info({ target: target.target, secretId, pushed }, "AWS Secrets Manager synced");

      return {
        target: target.target,
        success: true,
        pushed,
        skipped: refVars.size - pushed,
        failed: 0,
        errors: [],
      };
    } catch (err) {
      this.logger.error({ err, secretId }, "AWS SM sync failed");
      return {
        target: target.target,
        success: false,
        pushed: 0,
        skipped: 0,
        failed: target.missing.length + target.mismatched,
        errors: [err instanceof Error ? err.message : String(err)],
      };
    }
  }

  // ─── Diff: private methods (unchanged) ─────────────────────────────

  private async diffFlyApp(
    _env: string,
    refVars: Map<string, string>,
    appName: string,
    role: string,
  ): Promise<TargetDiff> {
    const flyToken = process.env.FLY_API_TOKEN;
    if (!flyToken) {
      return {
        target: appName,
        targetType: "fly",
        role,
        totalRefKeys: 0,
        totalDeployedKeys: 0,
        missing: [],
        extra: [],
        matched: 0,
        mismatched: 0,
        status: "unavailable",
        error: "FLY_API_TOKEN not set",
        lastChecked: new Date().toISOString(),
      };
    }
    const filtered = filterByRole(refVars, role);
    try {
      const res = await fetch(`https://api.machines.dev/v1/apps/${appName}/secrets`, {
        headers: { Authorization: `Bearer ${flyToken}` },
      });
      if (!res.ok) throw new Error(`Fly API ${res.status}: ${res.statusText}`);
      const secrets = (await res.json()) as Array<{ label: string }>;
      const deployedKeys = new Set(secrets.map((s) => s.label));
      const refKeys = new Set(filtered.keys());
      const { missing, extra, matched } = computeDiff(refKeys, deployedKeys);
      return {
        target: appName,
        targetType: "fly",
        role,
        totalRefKeys: refKeys.size,
        totalDeployedKeys: deployedKeys.size,
        missing,
        extra,
        matched,
        mismatched: 0,
        status: missing.length > 0 ? "drifted" : "synced",
        lastChecked: new Date().toISOString(),
      };
    } catch (err) {
      this.logger.error({ err, appName }, "Fly diff failed");
      return {
        target: appName,
        targetType: "fly",
        role,
        totalRefKeys: filtered.size,
        totalDeployedKeys: 0,
        missing: [],
        extra: [],
        matched: 0,
        mismatched: 0,
        status: "error",
        error: String(err),
        lastChecked: new Date().toISOString(),
      };
    }
  }

  private async diffGhActions(_env: string, refVars: Map<string, string>): Promise<TargetDiff> {
    const ghToken = process.env.GITHUB_TOKEN;
    if (!ghToken) {
      return {
        target: "WeKruit/GHOST-HANDS",
        targetType: "gh-actions",
        role: "ci",
        totalRefKeys: 0,
        totalDeployedKeys: 0,
        missing: [],
        extra: [],
        matched: 0,
        mismatched: 0,
        status: "unavailable",
        error: "GITHUB_TOKEN not set",
        lastChecked: new Date().toISOString(),
      };
    }
    const filtered = filterByRole(refVars, "ci");
    try {
      const res = await fetch("https://api.github.com/repos/WeKruit/GHOST-HANDS/actions/secrets", {
        headers: {
          Authorization: `Bearer ${ghToken}`,
          Accept: "application/vnd.github+json",
        },
      });
      if (!res.ok) throw new Error(`GitHub API ${res.status}: ${res.statusText}`);
      const data = (await res.json()) as {
        secrets: Array<{ name: string }>;
      };
      const deployedKeys = new Set(data.secrets.map((s) => s.name));
      const refKeys = new Set(filtered.keys());
      const { missing, extra, matched } = computeDiff(refKeys, deployedKeys);
      return {
        target: "WeKruit/GHOST-HANDS",
        targetType: "gh-actions",
        role: "ci",
        totalRefKeys: refKeys.size,
        totalDeployedKeys: deployedKeys.size,
        missing,
        extra,
        matched,
        mismatched: 0,
        status: missing.length > 0 ? "drifted" : "synced",
        lastChecked: new Date().toISOString(),
      };
    } catch (err) {
      this.logger.error({ err }, "GitHub Actions diff failed");
      return {
        target: "WeKruit/GHOST-HANDS",
        targetType: "gh-actions",
        role: "ci",
        totalRefKeys: filtered.size,
        totalDeployedKeys: 0,
        missing: [],
        extra: [],
        matched: 0,
        mismatched: 0,
        status: "error",
        error: String(err),
        lastChecked: new Date().toISOString(),
      };
    }
  }

  private async diffAwsSm(env: string, refVars: Map<string, string>): Promise<TargetDiff> {
    const secretId = `ghosthands/${env}`;
    try {
      const client = new SecretsManagerClient({
        region: process.env.AWS_REGION ?? "us-east-1",
      });
      const cmd = new GetSecretValueCommand({ SecretId: secretId });
      const result = await client.send(cmd);
      if (!result.SecretString) throw new Error("Empty secret");
      const deployed = JSON.parse(result.SecretString) as Record<string, string>;
      const deployedKeys = new Set(Object.keys(deployed));
      const refKeys = new Set(refVars.keys());
      const { missing, extra, matched } = computeDiff(refKeys, deployedKeys);
      // Value comparison for AWS SM
      let mismatched = 0;
      for (const key of refKeys) {
        if (deployedKeys.has(key) && deployed[key] !== refVars.get(key)) {
          mismatched++;
        }
      }
      return {
        target: secretId,
        targetType: "aws-sm",
        role: "all",
        totalRefKeys: refKeys.size,
        totalDeployedKeys: deployedKeys.size,
        missing,
        extra,
        matched: matched - mismatched,
        mismatched,
        status: missing.length > 0 || mismatched > 0 ? "drifted" : "synced",
        lastChecked: new Date().toISOString(),
      };
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      if (errMsg.includes("ResourceNotFoundException")) {
        return {
          target: secretId,
          targetType: "aws-sm",
          role: "all",
          totalRefKeys: refVars.size,
          totalDeployedKeys: 0,
          missing: [...refVars.keys()].sort(),
          extra: [],
          matched: 0,
          mismatched: 0,
          status: "drifted",
          error: "Secret not found in AWS SM",
          lastChecked: new Date().toISOString(),
        };
      }
      this.logger.error({ err, secretId }, "AWS SM diff failed");
      return {
        target: secretId,
        targetType: "aws-sm",
        role: "all",
        totalRefKeys: refVars.size,
        totalDeployedKeys: 0,
        missing: [],
        extra: [],
        matched: 0,
        mismatched: 0,
        status: "error",
        error: errMsg,
        lastChecked: new Date().toISOString(),
      };
    }
  }

  // ─── Private: audit helper ─────────────────────────────────────────

  private async logAudit(
    userId: string,
    action: string,
    details: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.db.insert(auditTrail).values({
        userId,
        action,
        details,
      });
    } catch (err) {
      this.logger.error({ err, action }, "Failed to write secrets audit log");
    }
  }
}
