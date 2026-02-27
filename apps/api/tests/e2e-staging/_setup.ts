/**
 * Staging E2E test setup.
 *
 * Three-layer auth:
 *   ATM Direct  → bootstrap (wake/health, independent of VALET)
 *   VALET API   → test cases (tasks, sandboxes, monitoring)
 *   GH API      → test cases (GH health, models)
 *
 * Gated behind STAGING_E2E=true — skipped during normal `pnpm test`.
 */

// ── Gate ──────────────────────────────────────────────────────────────

export function isAvailable(): boolean {
  return (
    process.env.STAGING_E2E === "true" &&
    Boolean(process.env.STAGING_API_URL) &&
    Boolean(process.env.STAGING_GH_IP) &&
    Boolean(process.env.GH_SERVICE_SECRET) &&
    Boolean(process.env.ATM_BASE_URL) &&
    Boolean(process.env.ATM_DEPLOY_SECRET)
  );
}

// ── Configuration ────────────────────────────────────────────────────

export function getConfig() {
  return {
    apiUrl: process.env.STAGING_API_URL ?? "https://valet-api-stg.fly.dev",
    ghIp: process.env.STAGING_GH_IP ?? "44.198.167.49",
    ghServiceSecret: process.env.GH_SERVICE_SECRET!,
    jwt: process.env.STAGING_JWT,
    atmBaseUrl: process.env.ATM_BASE_URL!,
    atmDeploySecret: process.env.ATM_DEPLOY_SECRET!,
    atmFleetId: process.env.ATM_FLEET_ID,
  };
}

// ── HTTP helpers ─────────────────────────────────────────────────────

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

interface RequestOptions {
  body?: unknown;
  headers?: Record<string, string>;
  timeoutMs?: number;
}

interface HttpResponse {
  status: number;
  data: unknown;
  headers: Headers;
  ok: boolean;
}

async function request(
  baseUrl: string,
  path: string,
  method: Method,
  opts: RequestOptions & { authHeader?: Record<string, string> } = {},
): Promise<HttpResponse> {
  const url = `${baseUrl}${path}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? 30_000);

  try {
    const res = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...opts.authHeader,
        ...opts.headers,
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      signal: controller.signal,
    });

    let data: unknown;
    const ct = res.headers.get("content-type") ?? "";
    if (ct.includes("application/json")) {
      data = await res.json();
    } else {
      data = await res.text();
    }

    return { status: res.status, data, headers: res.headers, ok: res.ok };
  } finally {
    clearTimeout(timeout);
  }
}

// ── ATM Direct Client (bootstrap — independent of VALET) ────────────

function getAtmClient() {
  const baseUrl = (process.env.ATM_BASE_URL ?? "").replace(/\/$/, "");
  const secret = process.env.ATM_DEPLOY_SECRET;
  if (!baseUrl || !secret) throw new Error("ATM_BASE_URL + ATM_DEPLOY_SECRET required");

  return {
    wake: (fleetId: string) =>
      request(baseUrl, `/fleet/${fleetId}/wake`, "POST", {
        authHeader: { "X-Deploy-Secret": secret },
        timeoutMs: 135_000, // ATM wake timeout is 130s
      }),
    health: (fleetId: string) =>
      request(baseUrl, `/fleet/${fleetId}/health`, "GET", {
        authHeader: { "X-Deploy-Secret": secret },
        timeoutMs: 15_000,
      }),
    idleStatus: () =>
      request(baseUrl, "/fleet/idle-status", "GET", {
        authHeader: { "X-Deploy-Secret": secret },
        timeoutMs: 10_000,
      }),
  };
}

// ── Fleet ID Discovery ──────────────────────────────────────────────

async function discoverFleetId(): Promise<string> {
  // 1. Check env override
  if (process.env.ATM_FLEET_ID) return process.env.ATM_FLEET_ID;

  // 2. Query ATM idle-status, match by known staging IP or instanceId
  const atm = getAtmClient();
  const res = await atm.idleStatus();
  const workers = (res.data as any)?.workers ?? [];
  const staging = workers.find(
    (w: any) => w.instanceId === "i-0baf28dd8bb630810" || w.ip === process.env.STAGING_GH_IP,
  );
  if (staging?.serverId) return staging.serverId;

  throw new Error("Cannot discover fleet ID — set ATM_FLEET_ID env var");
}

// ── Worker Lifecycle (singleton) ────────────────────────────────────

let _workerReady: Promise<void> | null = null;

/**
 * Ensures the EC2 worker is up and healthy.
 * Call from `beforeAll` in every test file — singleton guarantees it runs once.
 *
 * Flow: check liveness → wake if needed → poll until healthy → hard-fail if can't.
 */
export function ensureWorkerUp(): Promise<void> {
  if (!_workerReady) _workerReady = _doEnsureWorkerUp();
  return _workerReady;
}

async function _doEnsureWorkerUp(): Promise<void> {
  const fleetId = await discoverFleetId();
  const atm = getAtmClient();

  // Step 1: check liveness first
  console.log(`[e2e] Checking liveness for fleet ${fleetId}...`);
  try {
    const healthRes = await atm.health(fleetId);
    const isHealthy = healthRes.ok && (healthRes.data as any)?.status === "healthy";

    if (isHealthy) {
      console.log(`[e2e] Fleet ${fleetId} already healthy — no wake needed`);
      return;
    }
  } catch {
    // Health check failed (e.g. EC2 stopped) — proceed to wake
  }

  // Step 2: wake via ATM (may take up to 130s for EC2 cold start)
  console.log(`[e2e] Fleet ${fleetId} not live — waking via ATM (this may take 1-2 min)...`);
  const wakeRes = await atm.wake(fleetId);
  if (!wakeRes.ok) {
    throw new Error(`ATM wake failed: ${wakeRes.status} ${JSON.stringify(wakeRes.data)}`);
  }

  // Step 3: poll health every 5s up to 120s until healthy
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    try {
      const h = await atm.health(fleetId);
      if (h.ok && (h.data as any)?.status === "healthy") {
        console.log(`[e2e] Fleet ${fleetId} healthy after wake`);
        return;
      }
    } catch {
      // Health endpoint may not be up yet — keep polling
    }
    await new Promise((r) => setTimeout(r, 5_000));
  }

  throw new Error(`Fleet ${fleetId} not healthy after 120s — HARD FAIL`);
}

// ── Clients ──────────────────────────────────────────────────────────

export function getStagingClient() {
  const cfg = getConfig();

  const authHeader: Record<string, string> = cfg.jwt ? { Authorization: `Bearer ${cfg.jwt}` } : {};

  const ghAuthHeader: Record<string, string> = {
    "X-GH-Service-Key": cfg.ghServiceSecret,
  };

  return {
    /** VALET API client (Fly.io staging) */
    api: {
      get: (path: string, opts?: RequestOptions) =>
        request(cfg.apiUrl, path, "GET", { ...opts, authHeader }),
      post: (path: string, opts?: RequestOptions) =>
        request(cfg.apiUrl, path, "POST", { ...opts, authHeader }),
      put: (path: string, opts?: RequestOptions) =>
        request(cfg.apiUrl, path, "PUT", { ...opts, authHeader }),
      patch: (path: string, opts?: RequestOptions) =>
        request(cfg.apiUrl, path, "PATCH", { ...opts, authHeader }),
      delete: (path: string, opts?: RequestOptions) =>
        request(cfg.apiUrl, path, "DELETE", { ...opts, authHeader }),
    },
    /** GhostHands EC2 client (direct IP) */
    gh: {
      get: (path: string, opts?: RequestOptions) =>
        request(`http://${cfg.ghIp}:3100`, path, "GET", {
          ...opts,
          authHeader: ghAuthHeader,
        }),
      post: (path: string, opts?: RequestOptions) =>
        request(`http://${cfg.ghIp}:3100`, path, "POST", {
          ...opts,
          authHeader: ghAuthHeader,
        }),
    },
    /** EC2 deploy server client (port 8000, no auth) */
    deploy: {
      get: (path: string, opts?: RequestOptions) =>
        request(`http://${cfg.ghIp}:8000`, path, "GET", opts),
    },
    /** EC2 worker client (port 3101, no auth) */
    worker: {
      get: (path: string, opts?: RequestOptions) =>
        request(`http://${cfg.ghIp}:3101`, path, "GET", opts),
    },
  };
}

// ── Polling helper ───────────────────────────────────────────────────

export async function waitForStatus(
  client: ReturnType<typeof getStagingClient>,
  taskId: string,
  targetStatuses: string[],
  timeoutMs = 120_000,
  pollIntervalMs = 3_000,
): Promise<HttpResponse> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const res = await client.api.get(`/api/v1/tasks/${taskId}`);
    if (res.ok) {
      const status = (res.data as any)?.status;
      if (targetStatuses.includes(status)) return res;
    }
    await new Promise((r) => setTimeout(r, pollIntervalMs));
  }

  throw new Error(`Task ${taskId} did not reach ${targetStatuses.join("|")} within ${timeoutMs}ms`);
}
