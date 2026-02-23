import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { FastifyBaseLogger } from "fastify";

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

export interface SyncResult {
  environment: string;
  results: Array<{ target: string; success: boolean; error?: string }>;
  triggeredAt: string;
  triggeredBy: string;
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

// --- Service ---
export class SecretsSyncService {
  private readonly logger: FastifyBaseLogger;

  constructor({ logger }: { logger: FastifyBaseLogger }) {
    this.logger = logger;
  }

  async getDiff(env: "staging" | "production"): Promise<SecretsDiffResponse> {
    const monorepoRoot = process.env.MONOREPO_ROOT ?? resolve(process.cwd(), "..");
    const valetEnvPath = resolve(monorepoRoot, `.env.${env}`);
    const ghEnvPath = resolve(monorepoRoot, `GHOST-HANDS/.env.${env}`);

    const valetVars = parseEnvFile(valetEnvPath);
    const ghVars = parseEnvFile(ghEnvPath);

    this.logger.info(
      {
        env,
        valetEnvPath,
        ghEnvPath,
        valetKeyCount: valetVars.size,
        ghKeyCount: ghVars.size,
      },
      "Computing secrets diff",
    );

    const flyApps =
      env === "staging"
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

    const results = await Promise.allSettled([
      ...flyApps.map((app) => this.diffFlyApp(env, valetVars, app.name, app.role)),
      this.diffGhActions(env, ghVars),
      this.diffAwsSm(env, ghVars),
    ]);

    const targets: TargetDiff[] = results.map((r, i) => {
      if (r.status === "fulfilled") return r.value;
      // Build a fallback error target for rejected promises
      const allTargets = [
        ...flyApps.map((a) => ({
          target: a.name,
          targetType: "fly" as const,
          role: a.role,
        })),
        {
          target: "WeKruit/GHOST-HANDS",
          targetType: "gh-actions" as const,
          role: "ci",
        },
        {
          target: `ghosthands/${env}`,
          targetType: "aws-sm" as const,
          role: "all",
        },
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

  async sync(
    env: "staging" | "production",
    userId: string,
    targets?: string[],
  ): Promise<SyncResult> {
    this.logger.info({ env, userId, targets }, "Secrets sync requested");
    // Sync via API is complex (fly secrets set, gh secrets set, etc.)
    // For now, return not-implemented — use CLI workflows
    return {
      environment: env,
      results: (targets ?? ["all"]).map((t) => ({
        target: t,
        success: false,
        error: "Sync not yet implemented — use CLI (fly secrets set / gh secret set)",
      })),
      triggeredAt: new Date().toISOString(),
      triggeredBy: userId,
    };
  }

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
}
