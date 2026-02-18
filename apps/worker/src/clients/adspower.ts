/**
 * AdsPower Local API Client
 *
 * Real HTTP client for the AdsPower anti-detect browser.
 * Communicates with the AdsPower desktop app via its local REST API (default port 50325).
 *
 * API docs: https://localapi-doc-en.adspower.com/
 *
 * Response convention: { code: 0, msg: "success", data: {...} }
 *   code === 0 means success; anything else is an error.
 */

import pino from "pino";
import type {
  IAdsPowerClient,
  ProfileOptions,
  ProfileInfo,
  ProfileStatus,
  BrowserSession,
  ProxyConfig,
} from "@valet/shared/types";

const logger = pino({ name: "adspower-client" });

// ---------------------------------------------------------------------------
// AdsPower API response shapes
// ---------------------------------------------------------------------------

interface AdsPowerResponse<T = unknown> {
  code: number;
  msg: string;
  data: T;
}

interface BrowserStartData {
  ws: {
    selenium: string;
    puppeteer: string; // ws://127.0.0.1:xxxxx/devtools/browser/...
  };
  debug_port: string;
  webdriver: string;
}

interface BrowserActiveData {
  status: "Active" | "Inactive";
  ws?: {
    selenium: string;
    puppeteer: string;
  };
}

interface ProfileCreateData {
  id: string;
}

interface ProfileListItem {
  serial_number: string;
  user_id: string;
  name: string;
  group_id: string;
  group_name: string;
  domain_name: string;
  username: string;
  remark: string;
  created_time: string;
  ip: string;
  ip_country: string;
  last_open_time: string;
}

interface ProfileListData {
  list: ProfileListItem[];
  page: number;
  page_size: number;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface AdsPowerClientConfig {
  /** Base URL of the AdsPower local API. Default: http://127.0.0.1:50325 */
  baseUrl?: string;
  /** Optional API key for authenticated access (paid AdsPower versions) */
  apiKey?: string;
  /** Request timeout in ms. Default: 30000 */
  timeoutMs?: number;
  /** Max retries for transient failures. Default: 2 */
  maxRetries?: number;
}

// ---------------------------------------------------------------------------
// Client Implementation
// ---------------------------------------------------------------------------

export class AdsPowerClient implements IAdsPowerClient {
  private readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;

  constructor(config?: AdsPowerClientConfig) {
    this.baseUrl = (config?.baseUrl ?? "http://127.0.0.1:50325").replace(
      /\/$/,
      "",
    );
    this.apiKey = config?.apiKey;
    this.timeoutMs = config?.timeoutMs ?? 30_000;
    this.maxRetries = config?.maxRetries ?? 2;
  }

  // -------------------------------------------------------------------------
  // Profile Management
  // -------------------------------------------------------------------------

  async createProfile(options: ProfileOptions): Promise<ProfileInfo> {
    const body: Record<string, unknown> = {
      group_id: options.groupId ?? "0",
    };

    if (options.name) {
      body.name = options.name;
    }

    // Proxy config
    if (options.proxyConfig) {
      body.user_proxy_config = this.buildProxyPayload(options.proxyConfig);
    } else {
      body.user_proxy_config = { proxy_soft: "no_proxy" };
    }

    // Fingerprint (required by API — cannot be empty object)
    body.fingerprint_config = options.fingerprint ?? {
      automatic_timezone: "1",
      language: ["en-US", "en"],
      webrtc: "disabled",
      canvas: "1",
      webgl_image: "1",
      audio: "1",
      hardware_concurrency: "4",
      device_memory: "8",
    };

    const resp = await this.post<ProfileCreateData>(
      "/api/v1/user/create",
      body,
    );

    return {
      profileId: resp.id,
      name: options.name ?? `Profile-${resp.id.slice(0, 8)}`,
      status: "idle",
      groupId: options.groupId,
      createdAt: new Date().toISOString(),
    };
  }

  // -------------------------------------------------------------------------
  // Browser Lifecycle
  // -------------------------------------------------------------------------

  async startBrowser(profileId: string): Promise<BrowserSession> {
    logger.info({ profileId }, "Starting AdsPower browser");

    const params = new URLSearchParams({
      user_id: profileId,
      open_tabs: "1",    // Don't open default tabs
      ip_tab: "0",       // Don't open IP check page
      headless: "0",     // Normal mode (headless needs paid plan)
      cdp_mask: "1",     // Mask CDP detection
    });

    const data = await this.get<BrowserStartData>(
      `/api/v1/browser/start?${params.toString()}`,
    );

    const cdpUrl = data.ws.puppeteer;
    const debugPort = parseInt(data.debug_port, 10);

    logger.info(
      { profileId, cdpUrl, debugPort },
      "AdsPower browser started",
    );

    return {
      profileId,
      cdpUrl,
      port: debugPort,
      pid: 0, // AdsPower doesn't expose PID
      startedAt: new Date().toISOString(),
    };
  }

  async stopBrowser(profileId: string): Promise<void> {
    logger.info({ profileId }, "Stopping AdsPower browser");

    const params = new URLSearchParams({ user_id: profileId });
    await this.get(`/api/v1/browser/stop?${params.toString()}`);

    logger.info({ profileId }, "AdsPower browser stopped");
  }

  // -------------------------------------------------------------------------
  // Profile Queries
  // -------------------------------------------------------------------------

  async listActive(): Promise<ProfileInfo[]> {
    const data = await this.get<
      Array<{
        user_id: string;
        ws: { selenium: string; puppeteer: string };
        debug_port: string;
      }>
    >("/api/v1/browser/local-active");

    // local-active returns only currently open browsers
    return (data ?? []).map((item) => ({
      profileId: item.user_id,
      name: `Profile-${item.user_id.slice(0, 8)}`,
      status: "running" as ProfileStatus,
      createdAt: "",
    }));
  }

  async getProfileStatus(profileId: string): Promise<ProfileStatus> {
    const params = new URLSearchParams({ user_id: profileId });
    const data = await this.get<BrowserActiveData>(
      `/api/v1/browser/active?${params.toString()}`,
    );

    return data.status === "Active" ? "running" : "idle";
  }

  /**
   * List profiles with pagination.
   * Useful for finding existing profiles for a user/platform.
   */
  async listProfiles(
    page = 1,
    pageSize = 50,
    groupId?: string,
  ): Promise<{ profiles: ProfileInfo[]; total: number }> {
    const params = new URLSearchParams({
      page: String(page),
      page_size: String(Math.min(pageSize, 100)),
    });
    if (groupId) {
      params.set("group_id", groupId);
    }

    const data = await this.get<ProfileListData>(
      `/api/v1/user/list?${params.toString()}`,
    );

    const profiles: ProfileInfo[] = (data.list ?? []).map((item) => ({
      profileId: item.user_id,
      name: item.name,
      status: "idle" as ProfileStatus, // list doesn't return active status
      groupId: item.group_id !== "0" ? item.group_id : undefined,
      createdAt: new Date(parseInt(item.created_time, 10) * 1000).toISOString(),
      lastUsedAt: item.last_open_time
        ? new Date(
            parseInt(item.last_open_time, 10) * 1000,
          ).toISOString()
        : undefined,
    }));

    return { profiles, total: profiles.length };
  }

  /**
   * Update a profile's proxy configuration.
   */
  async updateProfileProxy(
    profileId: string,
    proxy: ProxyConfig | null,
  ): Promise<void> {
    const body: Record<string, unknown> = {
      user_id: profileId,
      user_proxy_config: proxy
        ? this.buildProxyPayload(proxy)
        : { proxy_soft: "no_proxy" },
    };

    await this.post("/api/v1/user/update", body);
    logger.info({ profileId, hasProxy: !!proxy }, "Profile proxy updated");
  }

  /**
   * Delete profiles by IDs (batch, max 100).
   */
  async deleteProfiles(profileIds: string[]): Promise<void> {
    await this.post("/api/v1/user/delete", {
      user_ids: profileIds.slice(0, 100),
    });
    logger.info(
      { count: profileIds.length },
      "Profiles deleted",
    );
  }

  // -------------------------------------------------------------------------
  // Group Management
  // -------------------------------------------------------------------------

  async createGroup(
    name: string,
    remark?: string,
  ): Promise<{ groupId: string }> {
    const body: Record<string, unknown> = { group_name: name };
    if (remark) body.remark = remark;

    const data = await this.post<{ group_id: string }>(
      "/api/v1/group/create",
      body,
    );

    return { groupId: data.group_id };
  }

  async listGroups(): Promise<
    Array<{ groupId: string; name: string; remark?: string }>
  > {
    const data = await this.get<{
      list: Array<{
        group_id: string;
        group_name: string;
        remark?: string;
      }>;
    }>("/api/v1/group/list?page_size=2000");

    return (data.list ?? []).map((g) => ({
      groupId: g.group_id,
      name: g.group_name,
      remark: g.remark,
    }));
  }

  // -------------------------------------------------------------------------
  // Health Check
  // -------------------------------------------------------------------------

  async healthCheck(): Promise<{ healthy: boolean; message?: string }> {
    try {
      const resp = await this.fetchWithTimeout(`${this.baseUrl}/status`);
      const json = (await resp.json()) as AdsPowerResponse;
      if (json.code === 0) {
        return { healthy: true };
      }
      return { healthy: false, message: json.msg };
    } catch (err) {
      return {
        healthy: false,
        message: `AdsPower unreachable: ${String(err)}`,
      };
    }
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  private buildProxyPayload(
    proxy: ProxyConfig,
  ): Record<string, string> {
    return {
      proxy_soft: "other",
      proxy_type: proxy.protocol === "socks5" ? "socks5" : "http",
      proxy_host: proxy.host,
      proxy_port: String(proxy.port),
      proxy_user: proxy.username ?? "",
      proxy_password: proxy.password ?? "",
    };
  }

  private async get<T>(path: string): Promise<T> {
    return this.request<T>("GET", path);
  }

  private async post<T>(
    path: string,
    body: Record<string, unknown>,
  ): Promise<T> {
    return this.request<T>("POST", path, body);
  }

  private async request<T>(
    method: string,
    path: string,
    body?: Record<string, unknown>,
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;

    let lastError: Error | null = null;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const headers: Record<string, string> = {};
        if (this.apiKey) {
          headers["Authorization"] = `Bearer ${this.apiKey}`;
        }

        const init: Parameters<typeof fetch>[1] = { method, headers };
        if (body) {
          headers["Content-Type"] = "application/json";
          init.body = JSON.stringify(body);
        }

        const resp = await this.fetchWithTimeout(url, init);
        const json = (await resp.json()) as AdsPowerResponse<T>;

        if (json.code !== 0) {
          throw new AdsPowerError(json.code, json.msg, path);
        }

        return json.data;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));

        // Don't retry AdsPower business errors (code != 0)
        if (err instanceof AdsPowerError) {
          throw err;
        }

        if (attempt < this.maxRetries) {
          const backoff = Math.min(1000 * 2 ** attempt, 5000);
          logger.warn(
            { attempt: attempt + 1, error: lastError.message, backoff },
            "AdsPower request failed, retrying",
          );
          await new Promise((r) => setTimeout(r, backoff));
        }
      }
    }

    throw lastError ?? new Error("AdsPower request failed");
  }

  private async fetchWithTimeout(
    url: string,
    init?: Parameters<typeof fetch>[1],
  ): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }
}

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

export class AdsPowerError extends Error {
  constructor(
    public readonly code: number,
    message: string,
    public readonly endpoint: string,
  ) {
    super(`AdsPower API error [${code}] on ${endpoint}: ${message}`);
    this.name = "AdsPowerError";
  }
}
