# AdsPower Anti-Detect Browser Integration

> Implementation plan for integrating the AdsPower Local API into the Valet worker
> service, replacing the mock client at `apps/worker/src/adapters/ads-power.mock.ts`.

---

## Table of Contents

1. [AdsPower Local API Reference](#1-adspower-local-api-reference)
2. [TypeScript HTTP Client](#2-typescript-http-client)
3. [Profile Lifecycle](#3-profile-lifecycle)
4. [CDP URL Extraction](#4-cdp-url-extraction)
5. [Proxy Integration](#5-proxy-integration)
6. [Error Handling](#6-error-handling)
7. [Database Integration](#7-database-integration)
8. [Health Monitoring](#8-health-monitoring)
9. [Deployment](#9-deployment)
10. [Testing Strategy](#10-testing-strategy)

---

## 1. AdsPower Local API Reference

### Base Configuration

```
Base URL:  http://local.adspower.net:50325  (alias: http://localhost:50325)
Auth:      Bearer token via Authorization header (required when API key is set)
Format:    JSON POST body / GET query params
```

**Rate Limits** (v2.8.2.1+):

| Profile Count | Limit          |
|---------------|----------------|
| 0 -- 200      | 2 requests/sec |
| 200 -- 5000   | 5 requests/sec |
| > 5000        | 10 requests/sec|

**Common Response Envelope:**

```jsonc
// Success
{ "code": 0, "data": { /* payload */ }, "msg": "success" }

// Failure
{ "code": -1, "data": {}, "msg": "failed" }
```

---

### 1.1 Open Browser

```
GET /api/v1/browser/start?user_id={profileId}
```

| Param                      | Required | Default | Description                                         |
|----------------------------|----------|---------|-----------------------------------------------------|
| `user_id`                  | YES      | --      | AdsPower profile ID                                 |
| `serial_number`            | NO       | --      | Alternative to user_id; user_id takes priority       |
| `open_tabs`                | NO       | 0       | 0 = no tabs, 1 = open platform/historical pages     |
| `ip_tab`                   | NO       | 1       | Show IP detection page (1=yes, 0=no)                |
| `launch_args`              | NO       | --      | JSON array of Chrome flags, e.g. `["--window-position=400,0"]` |
| `headless`                 | NO       | 0       | 0 = visible, 1 = headless browser                   |
| `disable_password_filling` | NO       | 0       | 1 = disable password autofill                        |
| `clear_cache_after_closing`| NO       | 0       | 1 = delete cache on close                            |
| `enable_password_saving`   | NO       | 0       | 1 = allow password storage                           |
| `cdp_mask`                 | NO       | 1       | 1 = mask CDP detection (default), 0 = no mask        |

**Success Response:**

```json
{
  "code": 0,
  "data": {
    "ws": {
      "selenium": "127.0.0.1:xxxx",
      "puppeteer": "ws://127.0.0.1:xxxx/devtools/browser/xxxxxx"
    },
    "debug_port": "xxxx",
    "webdriver": "/path/to/chromedriver"
  },
  "msg": "success"
}
```

---

### 1.2 Close Browser

```
GET /api/v1/browser/stop?user_id={profileId}
```

| Param           | Required | Description         |
|-----------------|----------|---------------------|
| `user_id`       | YES      | Profile ID to stop  |
| `serial_number` | NO       | Alternative ID      |

**Response:** `{ "code": 0, "data": {}, "msg": "success" }`

---

### 1.3 Check Browser Status (Single)

```
GET /api/v1/browser/active?user_id={profileId}
```

**Success Response (browser running):**

```json
{
  "code": 0,
  "data": {
    "status": "Active",
    "ws": {
      "selenium": "127.0.0.1:xxxx",
      "puppeteer": "ws://127.0.0.1:xxxx/devtools/browser/xxxxxx"
    }
  },
  "msg": "success"
}
```

**Response (browser not running):**

```json
{ "code": 0, "data": { "status": "Inactive" }, "msg": "success" }
```

---

### 1.4 List All Active Browsers (Local Device)

```
GET /api/v1/browser/local-active
```

**Response:**

```json
{
  "code": 0,
  "data": {
    "list": [
      {
        "user_id": "xxx",
        "ws": {
          "puppeteer": "ws://127.0.0.1:xxxx/devtools/browser/xxxxxx",
          "selenium": "127.0.0.1:xxxx"
        },
        "debug_port": "xxxx",
        "webdriver": "/path/to/chromedriver"
      }
    ]
  },
  "msg": "success"
}
```

---

### 1.5 Create Profile

```
POST /api/v1/user/create
Content-Type: application/json
```

| Body Param           | Type   | Required    | Description                                          |
|----------------------|--------|-------------|------------------------------------------------------|
| `name`               | string | NO          | Profile name (max 100 chars)                         |
| `group_id`           | string | **YES**     | Target group ID ("0" for ungrouped)                  |
| `domain_name`        | string | NO          | Platform domain (e.g. "linkedin.com")                |
| `open_urls`          | list   | NO          | URLs to open on browser launch                       |
| `username`           | string | NO          | Account username                                     |
| `password`           | string | NO          | Account password                                     |
| `cookie`             | string | NO          | Cookie data in JSON format                           |
| `country`            | string | NO          | Country code for geolocation                         |
| `remark`             | string | NO          | Profile description                                  |
| `user_proxy_config`  | object | Conditional | Proxy config (required if no `proxyid`)              |
| `proxyid`            | string | Conditional | Existing proxy ID or "random"                        |
| `fingerprint_config` | object | **YES**     | Fingerprint settings (cannot be `{}`)                |
| `ip`                 | string | NO          | Proxy IP address                                     |
| `sys_app_cate_id`    | string | NO          | Application category ID (default "0")                |

**`user_proxy_config` Object:**

```json
{
  "proxy_soft": "other",
  "proxy_type": "socks5",
  "proxy_host": "geo.iproyal.com",
  "proxy_port": "12321",
  "proxy_user": "username",
  "proxy_password": "password"
}
```

| Field            | Type   | Required | Values                                         |
|------------------|--------|----------|-------------------------------------------------|
| `proxy_soft`     | string | YES      | `"other"`, `"brightdata"`, `"no_proxy"`, etc.  |
| `proxy_type`     | string | NO       | `"http"`, `"https"`, `"socks5"`                |
| `proxy_host`     | string | NO       | Hostname or IP                                  |
| `proxy_port`     | string | NO       | Port number (as string)                         |
| `proxy_user`     | string | NO       | Username                                        |
| `proxy_password` | string | NO       | Password                                        |
| `proxy_url`      | string | NO       | For mobile proxies only                         |

**`fingerprint_config` Object (key fields):**

```json
{
  "automatic_timezone": "1",
  "webrtc": "disabled",
  "location": "ask",
  "location_switch": "1",
  "language_switch": "0",
  "language": ["en-US", "en"],
  "ua": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) ...",
  "screen_resolution": "1920_1080",
  "fonts": ["all"],
  "canvas": "1",
  "webgl_image": "1",
  "webgl": "3",
  "audio": "1",
  "do_not_track": "default",
  "hardware_concurrency": "4",
  "device_memory": "8",
  "flash": "block",
  "scan_port_type": "1",
  "media_devices": "1",
  "client_rects": "1",
  "device_name_switch": "1",
  "speech_switch": "1",
  "gpu": "0"
}
```

| Field                  | Default | Description                                      |
|------------------------|---------|--------------------------------------------------|
| `automatic_timezone`   | `"1"`   | 1 = auto from IP, 0 = custom                    |
| `webrtc`               | `"disabled"` | `forward`, `proxy`, `local`, `disabled`     |
| `location`             | `"ask"` | `ask`, `allow`, `block`                          |
| `language`             | `["en-US","en"]` | Language tags array                     |
| `canvas`               | `"1"`   | 1 = noise, 0 = real                             |
| `webgl_image`          | `"1"`   | 1 = noise, 0 = real                             |
| `webgl`                | `"3"`   | 0 = real, 2 = custom, 3 = random match          |
| `audio`                | `"1"`   | 1 = noise, 0 = disabled                         |
| `hardware_concurrency` | `"4"`   | CPU cores: 2, 4, 6, 8, 16                       |
| `device_memory`        | `"8"`   | GB: 2, 4, 6, 8                                  |
| `screen_resolution`    | `"none"`| `none`, `random`, or `"1920_1080"` format        |
| `media_devices`        | `"1"`   | 0 = off, 1 = noise, 2 = custom                  |
| `client_rects`         | `"1"`   | 0 = real, 1 = noise                             |

**Success Response:**

```json
{
  "code": 0,
  "data": { "id": "jc29dag5" },
  "msg": "Success"
}
```

---

### 1.6 Delete Profile(s)

```
POST /api/v1/user/delete
Content-Type: application/json
```

**Body:** `{ "user_ids": ["profileId1", "profileId2"] }`

Max batch size: 100 profiles per request.

**Response:** `{ "code": 0, "data": {}, "msg": "success" }`

---

### 1.7 Query Profiles

```
GET /api/v1/user/list?page=1&page_size=50
```

| Param           | Required | Default                          | Description              |
|-----------------|----------|----------------------------------|--------------------------|
| `group_id`      | NO       | all                              | Filter by group          |
| `user_id`       | NO       | --                               | Filter by profile ID     |
| `serial_number` | NO       | --                               | Filter by serial number  |
| `page`          | NO       | 1                                | Page number              |
| `page_size`     | NO       | 1                                | Results per page (max 100) |
| `user_sort`     | NO       | `{"serial_number":"desc"}`       | Sort field and direction |

**Response:**

```json
{
  "code": 0,
  "data": {
    "list": [
      {
        "serial_number": "1",
        "user_id": "jc29dag5",
        "name": "valet-linkedin-001",
        "group_id": "1",
        "group_name": "valet-prod",
        "domain_name": "linkedin.com",
        "username": "",
        "remark": "",
        "created_time": "1712520997",
        "ip": "203.0.113.42",
        "ip_country": "us",
        "last_open_time": "1712621030"
      }
    ],
    "page": 1,
    "page_size": 50
  },
  "msg": "Success"
}
```

---

### 1.8 Update Profile

```
POST /api/v1/user/update
Content-Type: application/json
```

Body accepts the same fields as create, plus `user_id` (required) to identify the
profile to update. Only the fields you include are changed.

**Response:** `{ "code": 0, "data": {}, "msg": "success" }`

---

## 2. TypeScript HTTP Client

### 2.1 File Location

```
apps/worker/src/adapters/ads-power.ts
```

### 2.2 Types

```typescript
// apps/worker/src/adapters/ads-power.types.ts

/** Raw AdsPower API response envelope */
export interface AdsPowerResponse<T = Record<string, unknown>> {
  code: number;  // 0 = success, -1 = failure
  data: T;
  msg: string;
}

/** WebSocket endpoints returned by /browser/start and /browser/active */
export interface AdsPowerWsEndpoints {
  selenium: string;
  puppeteer: string;
}

/** /api/v1/browser/start response data */
export interface AdsPowerStartData {
  ws: AdsPowerWsEndpoints;
  debug_port: string;
  webdriver: string;
}

/** /api/v1/browser/active response data */
export interface AdsPowerActiveData {
  status: "Active" | "Inactive";
  ws?: AdsPowerWsEndpoints;
}

/** Single entry in /api/v1/browser/local-active response */
export interface AdsPowerLocalActiveEntry {
  user_id: string;
  ws: AdsPowerWsEndpoints;
  debug_port: string;
  webdriver: string;
}

/** /api/v1/user/create response data */
export interface AdsPowerCreateData {
  id: string;
}

/** Single profile in /api/v1/user/list response */
export interface AdsPowerProfileEntry {
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

/** /api/v1/user/list response data */
export interface AdsPowerListData {
  list: AdsPowerProfileEntry[];
  page: number;
  page_size: number;
}

/** Proxy config for profile create/update */
export interface AdsPowerProxyConfig {
  proxy_soft: string;
  proxy_type?: "http" | "https" | "socks5";
  proxy_host?: string;
  proxy_port?: string;
  proxy_user?: string;
  proxy_password?: string;
}

/** Fingerprint config for profile create/update */
export interface AdsPowerFingerprintConfig {
  automatic_timezone?: string;
  webrtc?: "forward" | "proxy" | "local" | "disabled";
  location?: "ask" | "allow" | "block";
  location_switch?: string;
  language_switch?: string;
  language?: string[];
  ua?: string;
  screen_resolution?: string;
  fonts?: string[];
  canvas?: string;
  webgl_image?: string;
  webgl?: string;
  audio?: string;
  do_not_track?: string;
  hardware_concurrency?: string;
  device_memory?: string;
  flash?: string;
  scan_port_type?: string;
  media_devices?: string;
  client_rects?: string;
  device_name_switch?: string;
  speech_switch?: string;
  gpu?: string;
}

/** Body for POST /api/v1/user/create */
export interface AdsPowerCreateBody {
  name?: string;
  group_id: string;
  domain_name?: string;
  open_urls?: string[];
  username?: string;
  password?: string;
  cookie?: string;
  country?: string;
  remark?: string;
  user_proxy_config?: AdsPowerProxyConfig;
  proxyid?: string;
  fingerprint_config: AdsPowerFingerprintConfig;
  ip?: string;
  sys_app_cate_id?: string;
}

/** Options for the AdsPower HTTP client constructor */
export interface AdsPowerClientOptions {
  baseUrl?: string;
  apiKey?: string;
  timeoutMs?: number;
  maxRetries?: number;
  retryDelayMs?: number;
}
```

### 2.3 HTTP Client Implementation

```typescript
// apps/worker/src/adapters/ads-power.ts

import type {
  IAdsPowerClient,
  ProfileOptions,
  ProfileInfo,
  ProfileStatus,
  BrowserSession,
} from "@valet/shared/types";

import type {
  AdsPowerResponse,
  AdsPowerStartData,
  AdsPowerActiveData,
  AdsPowerLocalActiveEntry,
  AdsPowerCreateData,
  AdsPowerListData,
  AdsPowerClientOptions,
  AdsPowerFingerprintConfig,
} from "./ads-power.types.js";

export class AdsPowerApiError extends Error {
  constructor(
    message: string,
    public readonly code: number,
    public readonly endpoint: string,
  ) {
    super(`AdsPower API error [${endpoint}]: ${message} (code=${code})`);
    this.name = "AdsPowerApiError";
  }
}

export class AdsPowerConnectionError extends Error {
  constructor(
    message: string,
    public readonly endpoint: string,
    public readonly cause?: unknown,
  ) {
    super(`AdsPower connection error [${endpoint}]: ${message}`);
    this.name = "AdsPowerConnectionError";
  }
}

const DEFAULT_OPTIONS: Required<AdsPowerClientOptions> = {
  baseUrl: "http://local.adspower.net:50325",
  apiKey: "",
  timeoutMs: 30_000,
  maxRetries: 3,
  retryDelayMs: 1_000,
};

export class AdsPowerClient implements IAdsPowerClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly retryDelayMs: number;

  constructor(options: AdsPowerClientOptions = {}) {
    const merged = { ...DEFAULT_OPTIONS, ...options };
    this.baseUrl = merged.baseUrl.replace(/\/$/, "");
    this.apiKey = merged.apiKey;
    this.timeoutMs = merged.timeoutMs;
    this.maxRetries = merged.maxRetries;
    this.retryDelayMs = merged.retryDelayMs;
  }

  // ---------------------------------------------------------------------------
  // IAdsPowerClient interface
  // ---------------------------------------------------------------------------

  async createProfile(options: ProfileOptions): Promise<ProfileInfo> {
    const fingerprintConfig: AdsPowerFingerprintConfig = {
      automatic_timezone: "1",
      webrtc: "disabled",
      location: "ask",
      location_switch: "1",
      language: ["en-US", "en"],
      canvas: "1",
      webgl_image: "1",
      webgl: "3",
      audio: "1",
      hardware_concurrency: "4",
      device_memory: "8",
      flash: "block",
      scan_port_type: "1",
      media_devices: "1",
      client_rects: "1",
      device_name_switch: "1",
      ...(options.fingerprint as AdsPowerFingerprintConfig | undefined),
    };

    const body: Record<string, unknown> = {
      name: options.name ?? `valet-${Date.now()}`,
      group_id: options.groupId ?? "0",
      fingerprint_config: fingerprintConfig,
    };

    if (options.proxyConfig) {
      body.user_proxy_config = {
        proxy_soft: "other",
        proxy_type: options.proxyConfig.protocol,
        proxy_host: options.proxyConfig.host,
        proxy_port: String(options.proxyConfig.port),
        proxy_user: options.proxyConfig.username,
        proxy_password: options.proxyConfig.password,
      };
    } else {
      body.user_proxy_config = { proxy_soft: "no_proxy" };
    }

    const resp = await this.post<AdsPowerCreateData>(
      "/api/v1/user/create",
      body,
    );

    return {
      profileId: resp.data.id,
      name: (body.name as string),
      status: "idle",
      groupId: options.groupId,
      createdAt: new Date().toISOString(),
    };
  }

  async startBrowser(profileId: string): Promise<BrowserSession> {
    const params = new URLSearchParams({
      user_id: profileId,
      open_tabs: "0",
      ip_tab: "0",
      headless: "0",
      cdp_mask: "1",
    });

    const resp = await this.get<AdsPowerStartData>(
      `/api/v1/browser/start?${params.toString()}`,
    );

    return {
      profileId,
      cdpUrl: resp.data.ws.puppeteer,
      port: parseInt(resp.data.debug_port, 10),
      pid: 0, // AdsPower does not expose PID; tracked externally
      startedAt: new Date().toISOString(),
    };
  }

  async stopBrowser(profileId: string): Promise<void> {
    const params = new URLSearchParams({ user_id: profileId });
    await this.get<Record<string, never>>(
      `/api/v1/browser/stop?${params.toString()}`,
    );
  }

  async listActive(): Promise<ProfileInfo[]> {
    const resp = await this.get<{ list: AdsPowerLocalActiveEntry[] }>(
      "/api/v1/browser/local-active",
    );

    return resp.data.list.map((entry) => ({
      profileId: entry.user_id,
      name: "",
      status: "running" as ProfileStatus,
      createdAt: "",
    }));
  }

  async getProfileStatus(profileId: string): Promise<ProfileStatus> {
    const params = new URLSearchParams({ user_id: profileId });
    const resp = await this.get<AdsPowerActiveData>(
      `/api/v1/browser/active?${params.toString()}`,
    );

    return resp.data.status === "Active" ? "running" : "idle";
  }

  // ---------------------------------------------------------------------------
  // Extended methods (not on interface, used by lifecycle manager)
  // ---------------------------------------------------------------------------

  async deleteProfiles(profileIds: string[]): Promise<void> {
    await this.post<Record<string, never>>("/api/v1/user/delete", {
      user_ids: profileIds,
    });
  }

  async listProfiles(
    page = 1,
    pageSize = 50,
    groupId?: string,
  ): Promise<AdsPowerListData> {
    const params = new URLSearchParams({
      page: String(page),
      page_size: String(pageSize),
    });
    if (groupId) params.set("group_id", groupId);

    const resp = await this.get<AdsPowerListData>(
      `/api/v1/user/list?${params.toString()}`,
    );
    return resp.data;
  }

  async updateProfile(
    profileId: string,
    updates: Record<string, unknown>,
  ): Promise<void> {
    await this.post<Record<string, never>>("/api/v1/user/update", {
      user_id: profileId,
      ...updates,
    });
  }

  async getActiveSession(
    profileId: string,
  ): Promise<BrowserSession | null> {
    const params = new URLSearchParams({ user_id: profileId });
    const resp = await this.get<AdsPowerActiveData>(
      `/api/v1/browser/active?${params.toString()}`,
    );

    if (resp.data.status !== "Active" || !resp.data.ws) {
      return null;
    }

    return {
      profileId,
      cdpUrl: resp.data.ws.puppeteer,
      port: 0,
      pid: 0,
      startedAt: "",
    };
  }

  // ---------------------------------------------------------------------------
  // HTTP transport with retries
  // ---------------------------------------------------------------------------

  private async get<T>(path: string): Promise<AdsPowerResponse<T>> {
    return this.request<T>("GET", path);
  }

  private async post<T>(
    path: string,
    body: unknown,
  ): Promise<AdsPowerResponse<T>> {
    return this.request<T>("POST", path, body);
  }

  private async request<T>(
    method: "GET" | "POST",
    path: string,
    body?: unknown,
  ): Promise<AdsPowerResponse<T>> {
    const url = `${this.baseUrl}${path}`;
    let lastError: unknown;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      if (attempt > 0) {
        const backoff = this.retryDelayMs * Math.pow(2, attempt - 1);
        await new Promise((r) => setTimeout(r, backoff));
      }

      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        this.timeoutMs,
      );

      try {
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };
        if (this.apiKey) {
          headers["Authorization"] = `Bearer ${this.apiKey}`;
        }

        const resp = await fetch(url, {
          method,
          headers,
          body: body ? JSON.stringify(body) : undefined,
          signal: controller.signal,
        });

        const json = (await resp.json()) as AdsPowerResponse<T>;

        if (json.code !== 0) {
          throw new AdsPowerApiError(json.msg, json.code, path);
        }

        return json;
      } catch (err) {
        lastError = err;

        // Do not retry API-level errors (business logic failures)
        if (err instanceof AdsPowerApiError) {
          throw err;
        }

        // Retry on network/timeout errors
        if (attempt === this.maxRetries) {
          throw new AdsPowerConnectionError(
            `Failed after ${this.maxRetries + 1} attempts`,
            path,
            lastError,
          );
        }
      } finally {
        clearTimeout(timeout);
      }
    }

    // Unreachable, but satisfies TypeScript
    throw new AdsPowerConnectionError("Exhausted retries", path, lastError);
  }
}
```

### 2.4 DI Registration (awilix)

```typescript
// apps/worker/src/container.ts  (excerpt)

import { AdsPowerClient } from "./adapters/ads-power.js";
import { AdsPowerMockClient } from "./adapters/ads-power.mock.js";

// In the cradle registration:
adsPowerClient: asFunction(() => {
  if (env.ADSPOWER_MOCK === "true") {
    return new AdsPowerMockClient();
  }
  return new AdsPowerClient({
    baseUrl: env.ADSPOWER_BASE_URL,       // default: http://local.adspower.net:50325
    apiKey: env.ADSPOWER_API_KEY,          // required in headless mode
    timeoutMs: 30_000,
    maxRetries: 3,
    retryDelayMs: 1_000,
  });
}).singleton(),
```

---

## 3. Profile Lifecycle

### 3.1 State Machine

```
                              +---> [error] ---+
                              |                |
  [not_exists] --create--> [available] --acquire--> [in_use] --release--> [available]
                              ^                       |
                              |                       +--retire--> [retired]
                              |                                       |
                              +-------recycle (create new)------------+
```

Mapped to `profileStatusEnum` in `packages/db/src/schema/browser-profiles.ts`:

| DB Status     | Meaning                                    |
|---------------|--------------------------------------------|
| `available`   | Profile exists, browser closed, ready       |
| `in_use`      | Browser started, CDP session active          |
| `error`       | Start failed or crash detected               |
| `retired`     | Exceeded usage threshold, pending deletion   |

### 3.2 Lifecycle Manager

```typescript
// apps/worker/src/services/profile-lifecycle.ts

import type { AdsPowerClient } from "../adapters/ads-power.js";
import type { BrowserSession, ProxyConfig } from "@valet/shared/types";
import type { DbClient } from "@valet/db";

interface AcquireOptions {
  userId: string;
  platform: string;
  proxy?: ProxyConfig;
  maxTasksBeforeRetire?: number;
}

interface AcquireResult {
  profileId: string;
  adspowerProfileId: string;
  session: BrowserSession;
}

export class ProfileLifecycleManager {
  constructor(
    private readonly adspower: AdsPowerClient,
    private readonly db: DbClient,
  ) {}

  /**
   * Acquire a browser profile for a task.
   * 1. Try to reuse an existing "available" profile for this user+platform.
   * 2. If none available, create a new one in AdsPower and persist to DB.
   * 3. Start the browser and return the CDP session.
   */
  async acquire(options: AcquireOptions): Promise<AcquireResult> {
    const { userId, platform, proxy, maxTasksBeforeRetire = 50 } = options;

    // Step 1: find reusable profile
    let dbProfile = await this.findAvailableProfile(userId, platform);

    // Step 2: create if needed
    if (!dbProfile) {
      dbProfile = await this.createProfile(userId, platform, proxy);
    }

    // Step 3: bind proxy if provided and different from current
    if (proxy && dbProfile.proxyBindingId === null) {
      await this.bindProxy(dbProfile.id, dbProfile.adspowerProfileId, proxy);
    }

    // Step 4: start browser
    const session = await this.adspower.startBrowser(
      dbProfile.adspowerProfileId,
    );

    // Step 5: mark in_use
    await this.db
      .update("browser_profiles")
      .set({
        status: "in_use",
        sessionHealthy: true,
        lastUsedAt: new Date(),
      })
      .where("id", dbProfile.id);

    return {
      profileId: dbProfile.id,
      adspowerProfileId: dbProfile.adspowerProfileId,
      session,
    };
  }

  /**
   * Release a profile after task completion.
   * Stops the browser and returns the profile to "available" or "retired".
   */
  async release(
    profileId: string,
    adspowerProfileId: string,
    options?: { retire?: boolean },
  ): Promise<void> {
    // Stop the browser
    await this.adspower.stopBrowser(adspowerProfileId);

    // Increment completed tasks
    const profile = await this.db
      .select("browser_profiles")
      .where("id", profileId)
      .first();

    const newCount = (profile?.totalTasksCompleted ?? 0) + 1;
    const shouldRetire = options?.retire || newCount >= 50;

    await this.db
      .update("browser_profiles")
      .set({
        status: shouldRetire ? "retired" : "available",
        sessionHealthy: false,
        totalTasksCompleted: newCount,
        lastUsedAt: new Date(),
      })
      .where("id", profileId);
  }

  /**
   * Retire and delete a profile from both DB and AdsPower.
   */
  async destroy(profileId: string, adspowerProfileId: string): Promise<void> {
    // Ensure browser is stopped
    try {
      await this.adspower.stopBrowser(adspowerProfileId);
    } catch {
      // May already be stopped
    }

    await this.adspower.deleteProfiles([adspowerProfileId]);
    await this.db.delete("browser_profiles").where("id", profileId);
  }

  // -- internal helpers (pseudocode using Drizzle) --

  private async findAvailableProfile(userId: string, platform: string) {
    // SELECT * FROM browser_profiles
    // WHERE user_id = $1 AND platform = $2 AND status = 'available'
    // ORDER BY last_used_at ASC NULLS FIRST
    // LIMIT 1
    return null; // placeholder
  }

  private async createProfile(
    userId: string,
    platform: string,
    proxy?: ProxyConfig,
  ) {
    const info = await this.adspower.createProfile({
      name: `valet-${platform}-${Date.now()}`,
      groupId: "0",
      proxyConfig: proxy,
    });

    // INSERT into browser_profiles
    const [row] = await this.db
      .insert("browser_profiles")
      .values({
        userId,
        platform,
        adspowerProfileId: info.profileId,
        fingerprintConfig: {},
        status: "available",
      })
      .returning();

    return row;
  }

  private async bindProxy(
    dbProfileId: string,
    adspowerProfileId: string,
    proxy: ProxyConfig,
  ) {
    await this.adspower.updateProfile(adspowerProfileId, {
      user_proxy_config: {
        proxy_soft: "other",
        proxy_type: proxy.protocol,
        proxy_host: proxy.host,
        proxy_port: String(proxy.port),
        proxy_user: proxy.username,
        proxy_password: proxy.password,
      },
    });
    // Update DB reference as needed
  }
}
```

### 3.3 Warm-up and Cool-down

Between acquiring a profile and handing it to the automation engine, a warm-up
step ensures the browser is stable:

```
acquire() -> warm-up (3--5 sec) -> automation -> cool-down (2 sec) -> release()
```

**Warm-up** (after `startBrowser` returns):
1. Wait 2 seconds for Chromium to fully initialize.
2. Connect to CDP URL via Puppeteer `connect()`.
3. Navigate to `about:blank` to verify the connection works.
4. If connection fails, retry up to 3 times with 1-second backoff.
5. If all retries fail, stop browser, mark profile as `error`, throw.

**Cool-down** (before `stopBrowser`):
1. Navigate to `about:blank` to clear sensitive page state.
2. Wait 1 second for pending network requests to drain.
3. Disconnect Puppeteer gracefully.
4. Call `stopBrowser`.

---

## 4. CDP URL Extraction

### 4.1 Standard Local Flow

When AdsPower and the worker run on the same machine, the CDP URL from
`/api/v1/browser/start` can be used directly:

```
ws://127.0.0.1:9222/devtools/browser/abc123-def456
```

### 4.2 Remote / Sandbox Flow

When AdsPower runs inside a Docker container or Fly Machine, the `127.0.0.1`
address must be remapped to the sandbox's internal IP or hostname:

```
                   AdsPower returns:
                   ws://127.0.0.1:9222/devtools/browser/abc123

                   Worker rewrites to:
                   ws://sandbox-abc.flycast:9222/devtools/browser/abc123
```

**Implementation:**

```typescript
// apps/worker/src/utils/cdp-url.ts

export interface CdpUrlRewriteOptions {
  /** Original CDP URL from AdsPower (contains 127.0.0.1) */
  originalUrl: string;
  /** Target hostname to replace 127.0.0.1 with */
  targetHost?: string;
  /** Target port override (if port forwarding differs) */
  targetPort?: number;
}

/**
 * Rewrite a CDP WebSocket URL for remote connections.
 *
 * AdsPower always returns ws://127.0.0.1:{port}/devtools/browser/{id}.
 * When connecting from outside the sandbox container, we replace the
 * host (and optionally port) with the sandbox's reachable address.
 */
export function rewriteCdpUrl(options: CdpUrlRewriteOptions): string {
  const { originalUrl, targetHost, targetPort } = options;

  if (!targetHost) {
    return originalUrl; // local mode, no rewrite needed
  }

  const url = new URL(originalUrl);
  url.hostname = targetHost;

  if (targetPort !== undefined) {
    url.port = String(targetPort);
  }

  return url.toString();
}
```

**Usage in the sandbox controller:**

```typescript
const session = await adspower.startBrowser(adspowerProfileId);

const cdpUrl = rewriteCdpUrl({
  originalUrl: session.cdpUrl,
  targetHost: sandbox.hostname,  // e.g. "sandbox-abc.flycast"
});

const browser = await puppeteer.connect({
  browserWSEndpoint: cdpUrl,
  defaultViewport: null,
});
```

### 4.3 CDP Connection Sequence

```
Worker                    AdsPower                    Chromium
  |                          |                           |
  |--- GET /browser/start -->|                           |
  |                          |--- launch chromium ------>|
  |                          |<-- debug port ready ------|
  |<-- { ws.puppeteer } -----|                           |
  |                          |                           |
  |--- puppeteer.connect(ws) ----------------------------->
  |<--------- CDP handshake complete -------------------|
  |                          |                           |
  |--- page.goto(url) ----------------------------------->
```

---

## 5. Proxy Integration

### 5.1 IPRoyal Residential Proxy Configuration

Valet uses IPRoyal residential proxies. The `proxy_bindings` table stores proxy
credentials, and each browser profile is bound to one proxy.

**IPRoyal SOCKS5 format for AdsPower:**

```json
{
  "proxy_soft": "other",
  "proxy_type": "socks5",
  "proxy_host": "geo.iproyal.com",
  "proxy_port": "12321",
  "proxy_user": "username",
  "proxy_password": "password_country-us_session-abc123_lifetime-30m"
}
```

### 5.2 Sticky Session Strategy

IPRoyal supports sticky sessions via the password suffix. Format:

```
{base_password}_country-{CC}_session-{sessionId}_lifetime-{duration}
```

| Parameter   | Value           | Purpose                              |
|-------------|-----------------|--------------------------------------|
| `country`   | `us`, `gb`, etc.| Geo-target the exit IP               |
| `session`   | random string   | Same session = same IP               |
| `lifetime`  | `10m` to `24h`  | How long the sticky session lasts    |

**Recommended defaults for job application automation:**

- `lifetime`: `30m` (enough for one application flow)
- `session`: UUID generated per task
- `country`: `us` (or match job posting location)

### 5.3 Proxy Rotation Flow

```
Task starts
  |
  +-- generate sessionId (uuid)
  |
  +-- build password: "{base}_country-us_session-{uuid}_lifetime-30m"
  |
  +-- bind to AdsPower profile via user_proxy_config
  |
  +-- start browser (same IP for 30 min)
  |
  +-- task completes
  |
  +-- next task gets new sessionId -> new IP
```

### 5.4 Proxy Selection from Database

```typescript
// Pseudocode for proxy selection

async function selectProxy(country: string): Promise<ProxyBinding> {
  // SELECT * FROM proxy_bindings
  // WHERE status = 'active'
  //   AND country = $1
  //   AND (blocked_until IS NULL OR blocked_until < NOW())
  // ORDER BY RANDOM()
  // LIMIT 1
}
```

### 5.5 Blocked Proxy Handling

If a target site blocks an IP:
1. Mark the proxy's `status` as `blocked` in `proxy_bindings`.
2. Set `blocked_until` to `NOW() + 1 hour` (cooldown).
3. Generate a new `sessionId` to rotate to a fresh IP.
4. Retry the operation with the new session.

---

## 6. Error Handling

### 6.1 Error Categories

| Category                   | Detection                              | Recovery                                      |
|----------------------------|----------------------------------------|-----------------------------------------------|
| AdsPower not running       | `fetch` throws `ECONNREFUSED`          | Retry with backoff; alert if persistent        |
| Profile locked             | API returns `code: -1`, msg "locked"   | Wait 10s and retry; force-stop if stuck        |
| CDP connection timeout     | `puppeteer.connect` times out          | Stop browser, mark `error`, retry with new start |
| Browser crash              | CDP WebSocket closes unexpectedly      | Detect via `browser.on('disconnected')`, restart |
| Rate limit exceeded        | HTTP 429 or rapid `code: -1` responses | Exponential backoff, respect rate limit tiers  |
| Profile creation failure   | `code: -1` on `/user/create`           | Log and retry; check quota if persistent       |
| Proxy authentication error | Page loads but IP check fails          | Rotate proxy session, re-bind                  |

### 6.2 Error Recovery Implementation

```typescript
// apps/worker/src/services/browser-error-handler.ts

export class BrowserErrorHandler {
  private readonly maxCrashRetries = 3;

  async withBrowserRecovery<T>(
    profileId: string,
    adspowerProfileId: string,
    lifecycle: ProfileLifecycleManager,
    operation: (session: BrowserSession) => Promise<T>,
  ): Promise<T> {
    let lastError: unknown;

    for (let attempt = 0; attempt < this.maxCrashRetries; attempt++) {
      let session: BrowserSession | undefined;

      try {
        // Check if already running
        const existing = await this.adspower.getActiveSession(adspowerProfileId);
        if (existing) {
          session = existing;
        } else {
          session = await this.adspower.startBrowser(adspowerProfileId);
        }

        return await operation(session);
      } catch (err) {
        lastError = err;

        // Force stop to clean up
        try {
          await this.adspower.stopBrowser(adspowerProfileId);
        } catch {
          // ignore stop errors during recovery
        }

        // Wait before retry
        await new Promise((r) =>
          setTimeout(r, 2000 * Math.pow(2, attempt)),
        );
      }
    }

    // All retries exhausted
    await lifecycle.release(profileId, adspowerProfileId, { retire: true });
    throw lastError;
  }
}
```

### 6.3 Health Check Before Task

Before dispatching work to a profile, verify it is usable:

```typescript
async function preflight(
  adspower: AdsPowerClient,
  adspowerProfileId: string,
): Promise<boolean> {
  try {
    const status = await adspower.getProfileStatus(adspowerProfileId);
    return status === "idle"; // not already running
  } catch {
    return false; // AdsPower unreachable
  }
}
```

---

## 7. Database Integration

### 7.1 Schema Reference

**`browser_profiles`** table (`packages/db/src/schema/browser-profiles.ts`):

| Column                 | Type                | Notes                          |
|------------------------|---------------------|--------------------------------|
| `id`                   | `uuid` PK           | Internal Valet ID              |
| `user_id`              | `uuid` FK -> users   | Owning user                    |
| `platform`             | `varchar(50)`        | "linkedin", "greenhouse", etc. |
| `adspower_profile_id`  | `varchar(100)` UNIQUE| AdsPower's profile identifier  |
| `proxy_binding_id`     | `uuid` FK nullable   | Currently bound proxy          |
| `fingerprint_config`   | `jsonb`              | Fingerprint snapshot           |
| `status`               | `profile_status` enum| available/in_use/error/retired |
| `session_healthy`      | `boolean`            | CDP connection alive?          |
| `total_tasks_completed`| `integer`            | Usage counter for rotation     |
| `last_used_at`         | `timestamptz`        | For LRU selection              |
| `created_at`           | `timestamptz`        | Record creation                |

**Indexes:**
- `idx_browser_profiles_user_platform` on `(user_id, platform)`
- `idx_browser_profiles_status` on `(status)`

**`proxy_bindings`** table (`packages/db/src/schema/proxy-bindings.ts`):

| Column               | Type               | Notes                          |
|----------------------|--------------------|--------------------------------|
| `id`                 | `uuid` PK          | Internal proxy ID              |
| `provider`           | `varchar(50)`      | Default "iproyal"              |
| `proxy_type`         | `varchar(20)`      | Default "socks5"               |
| `hostname`           | `varchar(255)`     | e.g. "geo.iproyal.com"        |
| `port`               | `integer`          | e.g. 12321                     |
| `username`           | `varchar(255)`     | Proxy auth user                |
| `encrypted_password` | `varchar(500)`     | Encrypted proxy password       |
| `country`            | `varchar(10)`      | Default "US"                   |
| `ip_address`         | `varchar(45)`      | Resolved exit IP (cached)      |
| `session_id`         | `varchar(255)`     | Current sticky session ID      |
| `status`             | `proxy_status` enum| active/blocked/expired         |
| `blocked_until`      | `timestamptz`      | Cooldown expiry                |
| `created_at`         | `timestamptz`      | Record creation                |

**Indexes:**
- `idx_proxy_bindings_status_country` on `(status, country)`

### 7.2 Query Patterns

**Acquire an available profile:**

```sql
SELECT * FROM browser_profiles
WHERE user_id = $1
  AND platform = $2
  AND status = 'available'
ORDER BY last_used_at ASC NULLS FIRST
LIMIT 1
FOR UPDATE SKIP LOCKED;
```

The `FOR UPDATE SKIP LOCKED` prevents two concurrent workers from grabbing the
same profile.

**Retire stale profiles (cron):**

```sql
UPDATE browser_profiles
SET status = 'retired'
WHERE status = 'available'
  AND total_tasks_completed >= 50;
```

**Select active proxy:**

```sql
SELECT * FROM proxy_bindings
WHERE status = 'active'
  AND country = $1
  AND (blocked_until IS NULL OR blocked_until < NOW())
ORDER BY RANDOM()
LIMIT 1;
```

### 7.3 Drizzle ORM Usage

```typescript
import { eq, and, isNull, lt, sql } from "drizzle-orm";
import { browserProfiles, proxyBindings } from "@valet/db";

// Find available profile
const available = await db
  .select()
  .from(browserProfiles)
  .where(
    and(
      eq(browserProfiles.userId, userId),
      eq(browserProfiles.platform, platform),
      eq(browserProfiles.status, "available"),
    ),
  )
  .orderBy(browserProfiles.lastUsedAt)
  .limit(1);

// Mark in-use
await db
  .update(browserProfiles)
  .set({
    status: "in_use",
    sessionHealthy: true,
    lastUsedAt: new Date(),
  })
  .where(eq(browserProfiles.id, profileId));

// Find active proxy
const proxy = await db
  .select()
  .from(proxyBindings)
  .where(
    and(
      eq(proxyBindings.status, "active"),
      eq(proxyBindings.country, country),
      sql`(${proxyBindings.blockedUntil} IS NULL OR ${proxyBindings.blockedUntil} < NOW())`,
    ),
  )
  .orderBy(sql`RANDOM()`)
  .limit(1);
```

---

## 8. Health Monitoring

### 8.1 Heartbeat Check

The worker periodically verifies that AdsPower is reachable and responsive:

```typescript
// apps/worker/src/services/adspower-health.ts

export class AdsPowerHealthMonitor {
  private readonly adspower: AdsPowerClient;
  private readonly intervalMs: number;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(adspower: AdsPowerClient, intervalMs = 30_000) {
    this.adspower = adspower;
    this.intervalMs = intervalMs;
  }

  start(): void {
    this.timer = setInterval(() => this.check(), this.intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async check(): Promise<HealthReport> {
    const start = Date.now();

    try {
      const active = await this.adspower.listActive();
      const latencyMs = Date.now() - start;

      return {
        healthy: true,
        latencyMs,
        activeProfiles: active.length,
        timestamp: new Date().toISOString(),
      };
    } catch (err) {
      return {
        healthy: false,
        latencyMs: Date.now() - start,
        activeProfiles: 0,
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      };
    }
  }
}

interface HealthReport {
  healthy: boolean;
  latencyMs: number;
  activeProfiles: number;
  error?: string;
  timestamp: string;
}
```

### 8.2 Active Profile Count Monitoring

Track the number of concurrent browser sessions to stay within licensing limits:

```typescript
async function getResourceUsage(
  adspower: AdsPowerClient,
  db: DbClient,
): Promise<ResourceReport> {
  const [active, dbProfiles] = await Promise.all([
    adspower.listActive(),
    db.select().from(browserProfiles).where(eq(browserProfiles.status, "in_use")),
  ]);

  return {
    adspowerActiveSessions: active.length,
    dbInUseProfiles: dbProfiles.length,
    mismatch: active.length !== dbProfiles.length,
  };
}
```

If `mismatch` is true, a reconciliation job should:
1. Query AdsPower for all active browsers.
2. Cross-reference with `browser_profiles` where `status = 'in_use'`.
3. Stop any orphaned AdsPower sessions.
4. Mark stale DB rows back to `available` or `error`.

### 8.3 Reconciliation Cron

Run every 5 minutes to clean up drift between AdsPower state and the database:

```typescript
async function reconcileProfiles(
  adspower: AdsPowerClient,
  db: DbClient,
): Promise<void> {
  // 1. Get all AdsPower active sessions
  const active = await adspower.listActive();
  const activeIds = new Set(active.map((p) => p.profileId));

  // 2. Get all DB profiles marked in_use
  const dbInUse = await db
    .select()
    .from(browserProfiles)
    .where(eq(browserProfiles.status, "in_use"));

  // 3. Mark orphaned DB profiles (in_use but not actually running)
  for (const profile of dbInUse) {
    if (!activeIds.has(profile.adspowerProfileId)) {
      await db
        .update(browserProfiles)
        .set({ status: "available", sessionHealthy: false })
        .where(eq(browserProfiles.id, profile.id));
    }
  }

  // 4. Stop orphaned AdsPower sessions (running but not in DB as in_use)
  const dbActiveIds = new Set(dbInUse.map((p) => p.adspowerProfileId));
  for (const ap of active) {
    if (!dbActiveIds.has(ap.profileId)) {
      await adspower.stopBrowser(ap.profileId);
    }
  }
}
```

---

## 9. Deployment

### 9.1 AdsPower on Linux (Headless Mode)

AdsPower v3.3.2+ supports headless mode on Linux. This is the required
deployment mode for server environments (Fly Machines, Docker).

**System Requirements:**
- Ubuntu 22.04+ or Debian 12+
- 2 GB RAM minimum per instance
- Xvfb (X Virtual Framebuffer) for non-headless rendering in sandbox
- AdsPower app v3.3.2+ with kernel v2.4.2.8+

**Startup Command:**

```bash
# Headless mode (no GUI required)
./AdsPower --headless=true \
  --api-key="${ADSPOWER_API_KEY}" \
  --api-port=50325
```

**Environment variables for the worker:**

```bash
ADSPOWER_BASE_URL=http://localhost:50325
ADSPOWER_API_KEY=your-api-key-here
ADSPOWER_MOCK=false
ADSPOWER_GROUP_ID=0
```

### 9.2 Docker Deployment

AdsPower runs inside the same Docker container as the sandbox (alongside Xvfb,
x11vnc, websockify). The Dockerfile installs AdsPower and starts it before the
worker process.

```dockerfile
# Excerpt from sandbox Dockerfile

# Install AdsPower
RUN wget -q "https://adspower.net/download/linux/AdsPower-Global-v5.x.x.deb" \
    -O /tmp/adspower.deb && \
    dpkg -i /tmp/adspower.deb && \
    rm /tmp/adspower.deb

# Entrypoint script starts AdsPower in headless mode, then the worker
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
ENTRYPOINT ["/entrypoint.sh"]
```

**entrypoint.sh:**

```bash
#!/bin/bash
set -e

# Start Xvfb (for non-headless profile rendering)
Xvfb :99 -screen 0 1920x1080x24 &
export DISPLAY=:99

# Start AdsPower in headless mode
/opt/adspower/AdsPower \
  --headless=true \
  --api-key="${ADSPOWER_API_KEY}" \
  --api-port=50325 &

# Wait for AdsPower API to be ready
for i in $(seq 1 30); do
  if curl -sf http://localhost:50325/api/v1/browser/local-active > /dev/null 2>&1; then
    echo "AdsPower API ready"
    break
  fi
  sleep 1
done

# Start the worker
exec node /app/worker/dist/index.js
```

### 9.3 Fly Machines Deployment

Each sandbox Fly Machine contains:
- AdsPower (headless)
- Xvfb + x11vnc + websockify (VNC stack)
- The worker process

The Fly Machine exposes:
- Port 50325 (AdsPower API) -- internal only, not exposed to internet
- Port 6080 (noVNC) -- exposed for human takeover
- Port 8080 (worker health check) -- for Fly health checks

### 9.4 Licensing Tiers

| Plan         | Price    | Profiles | API Access | Team Members |
|--------------|----------|----------|------------|--------------|
| Free         | $0/mo    | 5        | NO         | 1            |
| Professional | $9/mo    | 10 + 5   | YES        | 3            |
| Business     | $36/mo   | 100      | YES        | configurable |
| Custom       | Contact  | 10,000+  | YES        | configurable |

**Recommendation for Valet:**
- Development: Professional plan ($9/mo, 15 profiles)
- Production: Business or Custom plan (100+ profiles, scales with user base)
- Each sandbox machine needs its own AdsPower license if running isolated
  instances; alternatively, use a single headless instance with API access
  from multiple workers.

### 9.5 Limitations

- Cannot run headless and non-headless simultaneously on the same machine.
- Resetting the API key invalidates the previous key (requires restart).
- Multi-device login only works in headless mode.
- Rate limits are per-account, not per-machine -- shared across all workers
  hitting the same AdsPower instance.

---

## 10. Testing Strategy

### 10.1 Unit Tests with Mock Server

The existing `AdsPowerMockClient` at
`apps/worker/src/adapters/ads-power.mock.ts` already implements the
`IAdsPowerClient` interface. Use it for all unit tests.

**Pattern:** Tests inject the mock via DI container:

```typescript
// apps/worker/src/__tests__/profile-lifecycle.test.ts

import { describe, it, expect, beforeEach } from "vitest";
import { AdsPowerMockClient } from "../adapters/ads-power.mock.js";
import { ProfileLifecycleManager } from "../services/profile-lifecycle.js";

describe("ProfileLifecycleManager", () => {
  let mockAdspower: AdsPowerMockClient;
  let lifecycle: ProfileLifecycleManager;

  beforeEach(() => {
    mockAdspower = new AdsPowerMockClient();
    lifecycle = new ProfileLifecycleManager(mockAdspower, mockDb);
  });

  it("creates a new profile when none available", async () => {
    const result = await lifecycle.acquire({
      userId: "user-1",
      platform: "linkedin",
    });

    expect(result.session.cdpUrl).toMatch(/^ws:\/\//);
    expect(result.adspowerProfileId).toBeTruthy();
  });

  it("reuses an existing available profile", async () => {
    // seed an available profile in mock DB
    // acquire should return that profile, not create a new one
  });

  it("retires profile after max tasks", async () => {
    // set totalTasksCompleted to 49 in DB
    // release should set status to 'retired'
  });
});
```

### 10.2 HTTP Client Tests with MSW

For testing the real `AdsPowerClient` without a running AdsPower instance, use
Mock Service Worker (MSW) to intercept HTTP requests:

```typescript
// apps/worker/src/__tests__/ads-power-client.test.ts

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import { AdsPowerClient, AdsPowerApiError } from "../adapters/ads-power.js";

const server = setupServer(
  http.get("http://localhost:50325/api/v1/browser/start", ({ request }) => {
    const url = new URL(request.url);
    const userId = url.searchParams.get("user_id");

    if (!userId) {
      return HttpResponse.json({ code: -1, data: {}, msg: "user_id required" });
    }

    return HttpResponse.json({
      code: 0,
      data: {
        ws: {
          selenium: "127.0.0.1:9222",
          puppeteer: `ws://127.0.0.1:9222/devtools/browser/${userId}`,
        },
        debug_port: "9222",
        webdriver: "/usr/bin/chromedriver",
      },
      msg: "success",
    });
  }),

  http.get("http://localhost:50325/api/v1/browser/stop", () => {
    return HttpResponse.json({ code: 0, data: {}, msg: "success" });
  }),

  http.post("http://localhost:50325/api/v1/user/create", () => {
    return HttpResponse.json({
      code: 0,
      data: { id: "test-profile-001" },
      msg: "Success",
    });
  }),

  http.post("http://localhost:50325/api/v1/user/delete", () => {
    return HttpResponse.json({ code: 0, data: {}, msg: "success" });
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterAll(() => server.close());

describe("AdsPowerClient", () => {
  const client = new AdsPowerClient({
    baseUrl: "http://localhost:50325",
    maxRetries: 0,
  });

  it("starts a browser and returns CDP URL", async () => {
    const session = await client.startBrowser("test-profile-001");
    expect(session.cdpUrl).toBe(
      "ws://127.0.0.1:9222/devtools/browser/test-profile-001",
    );
    expect(session.port).toBe(9222);
  });

  it("creates a profile with proxy config", async () => {
    const profile = await client.createProfile({
      name: "test-profile",
      proxyConfig: {
        host: "geo.iproyal.com",
        port: 12321,
        username: "user",
        password: "pass",
        protocol: "socks5",
      },
    });
    expect(profile.profileId).toBe("test-profile-001");
  });

  it("throws AdsPowerApiError on failure response", async () => {
    server.use(
      http.get("http://localhost:50325/api/v1/browser/start", () => {
        return HttpResponse.json({
          code: -1,
          data: {},
          msg: "profile is locked",
        });
      }),
    );

    await expect(client.startBrowser("locked-profile")).rejects.toThrow(
      AdsPowerApiError,
    );
  });
});
```

### 10.3 Integration Tests with Real AdsPower

For CI or local integration testing with an actual AdsPower instance:

```typescript
// apps/worker/src/__tests__/integration/ads-power.integration.test.ts

import { describe, it, expect, afterEach } from "vitest";
import { AdsPowerClient } from "../../adapters/ads-power.js";

const ADSPOWER_URL = process.env.ADSPOWER_BASE_URL ?? "http://localhost:50325";
const ADSPOWER_KEY = process.env.ADSPOWER_API_KEY ?? "";

// Skip if no AdsPower instance available
const shouldRun = process.env.ADSPOWER_INTEGRATION === "true";

describe.skipIf(!shouldRun)("AdsPower Integration", () => {
  const client = new AdsPowerClient({
    baseUrl: ADSPOWER_URL,
    apiKey: ADSPOWER_KEY,
  });

  const createdProfiles: string[] = [];

  afterEach(async () => {
    // Clean up created profiles
    if (createdProfiles.length > 0) {
      await client.deleteProfiles(createdProfiles);
      createdProfiles.length = 0;
    }
  });

  it("creates, starts, checks, stops, and deletes a profile", async () => {
    // Create
    const profile = await client.createProfile({
      name: `integration-test-${Date.now()}`,
      groupId: "0",
    });
    createdProfiles.push(profile.profileId);

    // Start
    const session = await client.startBrowser(profile.profileId);
    expect(session.cdpUrl).toMatch(/^ws:\/\/127\.0\.0\.1:\d+\/devtools\/browser\//);

    // Check status
    const status = await client.getProfileStatus(profile.profileId);
    expect(status).toBe("running");

    // Stop
    await client.stopBrowser(profile.profileId);

    // Verify stopped
    const stoppedStatus = await client.getProfileStatus(profile.profileId);
    expect(stoppedStatus).toBe("idle");
  });

  it("lists active browsers", async () => {
    const active = await client.listActive();
    expect(Array.isArray(active)).toBe(true);
  });
});
```

### 10.4 Test Environment Variables

```bash
# .env.test
ADSPOWER_MOCK=true                      # Unit tests use mock
ADSPOWER_BASE_URL=http://localhost:50325 # Integration tests
ADSPOWER_API_KEY=test-key-xxx           # Integration tests
ADSPOWER_INTEGRATION=false              # Set true to run integration
```

### 10.5 Test Matrix

| Test Type     | AdsPower Required | Database Required | CI Friendly | Command                                  |
|---------------|-------------------|-------------------|-------------|------------------------------------------|
| Unit (mock)   | No                | No (mock)         | Yes         | `pnpm test --filter @valet/worker`       |
| HTTP (MSW)    | No                | No                | Yes         | `pnpm test --filter @valet/worker`       |
| Integration   | Yes               | Yes               | No*         | `ADSPOWER_INTEGRATION=true pnpm test`    |

*Integration tests require a running AdsPower instance and are typically run
locally or in a dedicated staging environment, not in standard CI.
