import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";

export interface StartupCheckResult {
  check: string;
  status: "pass" | "warn" | "fail";
  message: string;
}

declare module "fastify" {
  interface FastifyInstance {
    configValidation: StartupCheckResult[];
  }
}

/**
 * Startup validator plugin — runs critical config checks when the API boots.
 * Logs results but does NOT prevent startup (so health/debug endpoints remain accessible).
 */
async function startupValidatorPlugin(app: FastifyInstance) {
  const results: StartupCheckResult[] = [];
  const logger = app.log;

  // 1. Check GHOSTHANDS_API_URL is set and reachable
  const ghApiUrl = process.env.GHOSTHANDS_API_URL;
  if (!ghApiUrl) {
    results.push({
      check: "GHOSTHANDS_API_URL",
      status: "fail",
      message: "GHOSTHANDS_API_URL not set — job dispatch will fail",
    });
  } else {
    try {
      const resp = await fetch(`${ghApiUrl}/health`, {
        signal: AbortSignal.timeout(5000),
      });
      if (resp.ok) {
        results.push({
          check: "GHOSTHANDS_API_URL",
          status: "pass",
          message: `Reachable at ${ghApiUrl}`,
        });
      } else {
        results.push({
          check: "GHOSTHANDS_API_URL",
          status: "warn",
          message: `${ghApiUrl} returned ${resp.status} — may be starting up`,
        });
      }
    } catch (err) {
      results.push({
        check: "GHOSTHANDS_API_URL",
        status: "fail",
        message: `${ghApiUrl} unreachable — ${(err as Error).message}`,
      });
    }
  }

  // 2. Check GH_SERVICE_SECRET is set (used by GhostHandsClient + webhook auth)
  if (!process.env.GH_SERVICE_SECRET) {
    results.push({
      check: "GH_SERVICE_SECRET",
      status: "fail",
      message: "GH_SERVICE_SECRET not set — GH API auth will fail",
    });
  } else {
    results.push({
      check: "GH_SERVICE_SECRET",
      status: "pass",
      message: "Set",
    });
  }

  // 3. Check webhook secrets
  const webhookSecret = process.env.VALET_DEPLOY_WEBHOOK_SECRET || process.env.GH_DEPLOY_SECRET;
  if (!webhookSecret) {
    results.push({
      check: "WEBHOOK_SECRET",
      status: "warn",
      message: "No deploy webhook secret set — deploys from CI will fail",
    });
  } else {
    results.push({
      check: "WEBHOOK_SECRET",
      status: "pass",
      message: "Set",
    });
  }

  // 4. Check DATABASE_URL
  if (!process.env.DATABASE_URL && !process.env.DATABASE_DIRECT_URL) {
    results.push({
      check: "DATABASE_URL",
      status: "fail",
      message: "No database URL configured",
    });
  } else {
    results.push({
      check: "DATABASE_URL",
      status: "pass",
      message: "Set",
    });
  }

  // 5. Check Kasm config consistency (if any Kasm vars are set, all must be)
  const kasmVars: Record<string, string | undefined> = {
    KASM_API_URL: process.env.KASM_API_URL,
    KASM_API_KEY: process.env.KASM_API_KEY,
    KASM_API_KEY_SECRET: process.env.KASM_API_KEY_SECRET,
  };
  const kasmSet = Object.entries(kasmVars).filter(([, v]) => !!v);
  const kasmTotal = Object.keys(kasmVars).length;
  if (kasmSet.length > 0 && kasmSet.length < kasmTotal) {
    const missing = Object.entries(kasmVars)
      .filter(([, v]) => !v)
      .map(([k]) => k);
    results.push({
      check: "KASM_CONFIG",
      status: "warn",
      message: `Partial Kasm config — missing: ${missing.join(", ")}`,
    });
  } else if (kasmSet.length === kasmTotal) {
    results.push({
      check: "KASM_CONFIG",
      status: "pass",
      message: "All Kasm variables set",
    });
  }

  // 6. Check ASG config consistency
  const asgEnabled = process.env.AUTOSCALE_ASG_ENABLED === "true";
  if (asgEnabled) {
    const asgName = process.env.AWS_ASG_NAME;
    if (!asgName) {
      results.push({
        check: "ASG_CONFIG",
        status: "fail",
        message: "AUTOSCALE_ASG_ENABLED=true but AWS_ASG_NAME not set",
      });
    } else {
      results.push({
        check: "ASG_CONFIG",
        status: "pass",
        message: `ASG: ${asgName}`,
      });
    }
  }

  // Log summary
  const fails = results.filter((r) => r.status === "fail");
  const warns = results.filter((r) => r.status === "warn");
  const passes = results.filter((r) => r.status === "pass");

  logger.info(
    { passes: passes.length, warns: warns.length, fails: fails.length },
    `[startup-validator] ${passes.length} pass, ${warns.length} warn, ${fails.length} fail`,
  );

  for (const r of results) {
    if (r.status === "fail") {
      logger.error({ check: r.check }, `[startup-validator] FAIL: ${r.check} — ${r.message}`);
    } else if (r.status === "warn") {
      logger.warn({ check: r.check }, `[startup-validator] WARN: ${r.check} — ${r.message}`);
    } else {
      logger.info({ check: r.check }, `[startup-validator] PASS: ${r.check} — ${r.message}`);
    }
  }

  // Expose results via a decorated property for health endpoints
  app.decorate("configValidation", results);
}

export default fp(startupValidatorPlugin, {
  name: "startup-validator",
});
