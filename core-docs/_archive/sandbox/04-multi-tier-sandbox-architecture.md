# 04 — Multi-Tier Sandbox Architecture

> Scalable browser sandbox strategy: dedicated EC2, managed cloud (Browserbase), self-hosted ephemeral (Fly Machines), and API-direct tiers for 100–1,000+ concurrent users.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [The Scaling Problem](#2-the-scaling-problem)
3. [Tier Architecture Overview](#3-tier-architecture-overview)
4. [Tier 1: Dedicated (EC2 + AdsPower)](#4-tier-1-dedicated-ec2--adspower)
5. [Tier 2: Managed Cloud (Browserbase + Stagehand)](#5-tier-2-managed-cloud-browserbase--stagehand)
6. [Tier 3: Self-Hosted Ephemeral (Fly Machines + Camoufox)](#6-tier-3-self-hosted-ephemeral-fly-machines--camoufox)
7. [Tier 4: API-Direct (No Browser)](#7-tier-4-api-direct-no-browser)
8. [Provider Comparison Matrix](#8-provider-comparison-matrix)
9. [Session State Management](#9-session-state-management)
10. [Anti-Detect Strategy per Tier](#10-anti-detect-strategy-per-tier)
11. [Human-in-the-Loop per Tier](#11-human-in-the-loop-per-tier)
12. [Shared Automation Abstraction](#12-shared-automation-abstraction)
13. [Cost Model & Unit Economics](#13-cost-model--unit-economics)
14. [Pricing Strategy](#14-pricing-strategy)
15. [Implementation Roadmap](#15-implementation-roadmap)
16. [Risk Register](#16-risk-register)

---

## 1. Executive Summary

A single EC2 instance handles ~5 concurrent browser sessions. At 100 users running 5 applications/day (~3 min each), we need **25 browser-hours/day** with peaks of **15+ concurrent sessions** during 8am–12pm. At 1,000 users, this becomes **250 browser-hours/day** and **150+ concurrent sessions**.

**Solution**: A 4-tier architecture where each tier optimizes for a different cost/speed/reliability tradeoff:

| Tier | Name | Engine | Anti-Detect | Cost/App | Best For |
|------|------|--------|-------------|----------|----------|
| 1 | Dedicated | EC2 + AdsPower + Selenium | Best (hardware-level) | $0.005 | LinkedIn, high-security sites |
| 2 | Managed Cloud | Browserbase + Stagehand v3 | Good (managed stealth) | $0.012 | Standard applications, HITL |
| 3 | Self-Hosted | Fly Machines + Camoufox + Playwright | Moderate (open-source) | $0.004 | Bulk volume, simple forms |
| 4 | API-Direct | HTTP API calls (no browser) | N/A | $0.001 | Greenhouse, Lever, Workday |

**Key metrics**: $0.07–0.09 all-in cost per application (including LLM), 75–85% gross margin, break-even at ~35 paying users.

---

## 2. The Scaling Problem

### Current State (MVP)

```
┌──────────────────────────────────────┐
│  Single EC2 t3.medium ($30/mo)       │
│  ┌──────────┐  ┌──────────────────┐  │
│  │ AdsPower │  │ Selenium Worker  │  │
│  │ 5 profiles│  │ 5 slots         │  │
│  └──────────┘  └──────────────────┘  │
│  Max: 5 concurrent sessions          │
└──────────────────────────────────────┘
```

### Bottlenecks

| Constraint | Limit | Impact |
|-----------|-------|--------|
| RAM (4GB on t3.medium) | ~5 Chrome instances @ 500–800MB each | Hard ceiling on concurrency |
| AdsPower profiles | 1 profile = 1 session at a time | No parallel use of same profile |
| Single point of failure | 1 EC2 = all users down if it dies | Zero fault tolerance |
| No isolation | All users share one machine | Security/privacy risk |
| Geographic | 1 region | Latency for users in other regions |

### Target State

```
┌─────────────────────────────────────────────────────────┐
│                    Hatchet Orchestrator                  │
│                                                         │
│  ┌──────────┐  ┌──────────────┐  ┌─────────────────┐  │
│  │ Tier 1   │  │   Tier 2     │  │    Tier 3       │  │
│  │ EC2 Pool │  │ Browserbase  │  │ Fly Machines    │  │
│  │ 2-10 VMs │  │ 100 sessions │  │ 0-N containers  │  │
│  └──────────┘  └──────────────┘  └─────────────────┘  │
│                                                         │
│  ┌──────────────────────────────────────────────────┐  │
│  │              Tier 4: API-Direct                   │  │
│  │  Greenhouse API · Lever API · Workday API         │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

---

## 3. Tier Architecture Overview

### Routing Logic

The Hatchet workflow decides which tier to use based on:

```
1. Is the ATS platform supported by API-Direct?
   → Yes: Tier 4 (no browser needed)
   → No: continue

2. Does the user's plan include Dedicated tier?
   → Yes AND available EC2 capacity: Tier 1
   → No: continue

3. Does this task need human-in-the-loop (copilot mode)?
   → Yes: Tier 2 (Browserbase Live View) or Tier 1 (VNC)
   → No: continue

4. Default: Tier 3 (cheapest, ephemeral)
   → If Tier 3 fails (anti-detect block): retry on Tier 2
   → If Tier 2 fails: retry on Tier 1
```

### Tier Selection in Hatchet Workflow

```typescript
// apps/worker/src/workflows/job-application.ts
async function selectTier(ctx: Context<JobApplicationInput>): Promise<SandboxTier> {
  const { jobUrl, mode, userId } = ctx.input();

  // Tier 4: API-direct check
  const atsInfo = detectATS(jobUrl);
  if (atsInfo.hasDirectAPI) return { tier: 4, provider: atsInfo.provider };

  // Tier 1: Premium user with dedicated EC2
  const user = await getUserPlan(userId);
  if (user.plan === "premium") {
    const ec2 = await findAvailableEC2(userId);
    if (ec2) return { tier: 1, instanceId: ec2.id, profileId: ec2.profileId };
  }

  // Tier 2: Copilot mode or high-security sites
  if (mode === "copilot" || atsInfo.requiresStrongAntiDetect) {
    return { tier: 2, provider: "browserbase" };
  }

  // Tier 3: Default ephemeral
  return { tier: 3, provider: "fly-machines" };
}
```

---

## 4. Tier 1: Dedicated (EC2 + AdsPower)

> Persistent EC2 instances with AdsPower anti-detect browser. Best fingerprint protection, pre-warmed profiles with saved login state.

### Architecture

```
┌─ EC2 Pool (2-10 instances) ──────────────────┐
│                                                │
│  ┌─ EC2 Instance (t3.xlarge, 16GB) ─────────┐ │
│  │                                           │ │
│  │  ┌──────────┐  ┌──────────────────────┐   │ │
│  │  │ AdsPower │  │ Valet EC2 Worker     │   │ │
│  │  │ Headless │  │ (axon fork)          │   │ │
│  │  │ 8-10     │  │ Fastify :8080        │   │ │
│  │  │ profiles │  │ Selenium automation  │   │ │
│  │  └──────────┘  └──────────────────────┘   │ │
│  │                                           │ │
│  │  ┌──────────┐  ┌──────────────────────┐   │ │
│  │  │ Xvfb +   │  │ nginx (TLS + proxy)  │   │ │
│  │  │ noVNC    │  │ :443 → :8080, :6080  │   │ │
│  │  └──────────┘  └──────────────────────┘   │ │
│  └───────────────────────────────────────────┘ │
│                                                │
│  ┌─ EC2 Instance #2 ────────────────────────┐ │
│  │  ... (same stack)                         │ │
│  └───────────────────────────────────────────┘ │
└────────────────────────────────────────────────┘
```

### Instance Pooling Strategy

| Scale | Instances | Profiles/Instance | Total Profiles | Concurrent Sessions | Monthly Cost |
|-------|-----------|-------------------|----------------|--------------------|-|
| 50 users | 2 × t3.xlarge | 8 | 16 | 10 | $146 (RI) |
| 100 users | 3 × t3.xlarge | 10 | 30 | 15 | $219 (RI) |
| 500 users | 10 × t3.xlarge | 10 | 100 | 50 | $730 (RI) |

**Profile assignment**: Each user gets 1 dedicated AdsPower profile. Profiles are assigned to instances via Redis-backed `ProfilePool` (see [03-ec2-worker-integration.md §7](03-ec2-worker-integration.md#7-profile-pool)). When a user triggers an application, Hatchet routes to the EC2 instance holding their profile.

**Scaling**: Add new EC2 instances via Terraform. New profiles provisioned via AdsPower API. Auto-scaling group with min=2, desired=N based on queue depth.

### When to Use Tier 1

- LinkedIn (aggressive bot detection, requires persistent cookies + fingerprint)
- Sites that track browser fingerprint across sessions
- Premium plan users who need guaranteed fast execution
- Long-running applications (>10 min) that would time out on ephemeral tiers

### Limitations

- Capacity bound by EC2 count (not elastic)
- $73/mo per instance even when idle
- AdsPower license required (~$9/mo for 10 profiles)
- Geographic: limited to EC2 region (us-east-1)

---

## 5. Tier 2: Managed Cloud (Browserbase + Stagehand)

> Browserbase provides managed browser sessions with built-in stealth, persistent contexts, and embeddable Live View. Stagehand v3 connects via CDP for AI-driven automation.

### Architecture

```
┌─ VALET Worker (Fly.io / EC2) ───────────────┐
│                                               │
│  Hatchet Task                                 │
│  ┌─────────────────────────────────────────┐  │
│  │  Stagehand v3 (Node.js SDK)             │  │
│  │  ┌──── CDP WebSocket ────────────────┐  │  │
│  │  │                                    │  │  │
│  │  │  Browserbase Session               │  │  │
│  │  │  ┌─────────────────────────────┐   │  │  │
│  │  │  │ Managed Chromium            │   │  │  │
│  │  │  │ • Stealth fingerprints      │   │  │  │
│  │  │  │ • Residential proxy         │   │  │  │
│  │  │  │ • Auto-CAPTCHA solving      │   │  │  │
│  │  │  │ • Contexts API (state)      │   │  │  │
│  │  │  └─────────────────────────────┘   │  │  │
│  │  └────────────────────────────────────┘  │  │
│  └─────────────────────────────────────────┘  │
│                                               │
│  Live View iframe → frontend                  │
└───────────────────────────────────────────────┘
```

### Stagehand v3 Connection

Stagehand v3 has **dropped its Playwright dependency** and now speaks Chrome DevTools Protocol (CDP) directly. It supports two connection modes:

```typescript
// Option A: Connect to Browserbase (first-class, same company)
const stagehand = new Stagehand({
  env: "BROWSERBASE",
  apiKey: process.env.BROWSERBASE_API_KEY,
  projectId: process.env.BROWSERBASE_PROJECT_ID,
  model: "anthropic/claude-sonnet-4-20250514",
});
await stagehand.init();

// Option B: Connect to any Chrome via CDP URL
const stagehand = new Stagehand({
  env: "LOCAL",
  localBrowserLaunchOptions: {
    cdpUrl: "ws://remote-host:9222/devtools/browser/abc123",
  },
});
```

### Browserbase Session Lifecycle

```typescript
import Browserbase from "@browserbasehq/sdk";

const bb = new Browserbase({ apiKey: process.env.BROWSERBASE_API_KEY });

// 1. Create or reuse a persistent context (stores cookies/localStorage)
const context = await bb.contexts.create({
  projectId: process.env.BROWSERBASE_PROJECT_ID,
});

// 2. Create a session with the context
const session = await bb.sessions.create({
  projectId: process.env.BROWSERBASE_PROJECT_ID,
  browserSettings: {
    context: { id: context.id, persist: true },
  },
  proxies: [{
    type: "browserbase",
    geolocation: { city: "New York", state: "NY", country: "US" },
  }],
});

// 3. Get Live View URL for human-in-the-loop
const debug = await bb.sessions.debug(session.id);
const liveViewUrl = debug.debuggerFullscreenUrl;
// Embed: <iframe src="${liveViewUrl}" allow="clipboard-read; clipboard-write" />

// 4. Connect Stagehand to the session
const stagehand = new Stagehand({
  env: "BROWSERBASE",
  apiKey: process.env.BROWSERBASE_API_KEY,
  projectId: process.env.BROWSERBASE_PROJECT_ID,
  browserbaseSessionID: session.id,
  model: "anthropic/claude-sonnet-4-20250514",
});
await stagehand.init();

// 5. Run automation
await stagehand.page.act({ action: "Click the 'Easy Apply' button" });
const formData = await stagehand.page.extract({
  instruction: "Extract all form field labels and their types",
  schema: formFieldsSchema,
});
```

### Browserbase Pricing

| Plan | Monthly | Browser Hours | Concurrent | Proxy BW | Stealth Level | $/browser-hr (overage) |
|------|---------|---------------|------------|----------|---|-|
| Free | $0 | 1 hr | 1 | 0 | Basic | N/A |
| Developer | $20 | 100 hrs | 25 | 1 GB | Basic | $0.12 |
| Startup | $99 | 500 hrs | 100 | 5 GB | Basic | $0.10 |
| Scale | Custom | Usage-based | 250+ | Usage-based | Advanced | Negotiable |

**For VALET at 100 users**: Startup plan ($99/mo) covers ~500 browser-hours (enough for 10,000 applications/mo at 3 min each). Overage at $0.10/hr.

### When to Use Tier 2

- Copilot mode (Live View enables human monitoring/takeover)
- Standard job applications (Indeed, Glassdoor, company career pages)
- Sites with moderate anti-bot detection
- When Tier 3 fails due to detection (automatic retry escalation)

### Limitations

- Advanced Stealth only on Scale plan (custom pricing)
- 6-hour max session duration
- Browserbase controls the browser — less customization than self-hosted
- Proxy bandwidth costs extra ($10–12/GB)

---

## 6. Tier 3: Self-Hosted Ephemeral (Fly Machines + Camoufox)

> On-demand Fly Machines with Camoufox (anti-detect Firefox) or stealth Chromium. Cheapest per-session cost, fully elastic, zero idle waste.

### Architecture

```
┌─ Fly Machine (per-task, auto-stop) ─────────┐
│                                               │
│  Docker Container                             │
│  ┌──────────┐  ┌──────────────────────────┐  │
│  │ Camoufox │  │ Playwright + Stagehand   │  │
│  │ (Firefox) │  │ or plain Playwright      │  │
│  │ headless  │  │ automation               │  │
│  └──────────┘  └──────────────────────────┘  │
│                                               │
│  ┌──────────┐  ┌──────────────────────────┐  │
│  │ Xvfb +   │  │ State restored from S3   │  │
│  │ noVNC    │  │ (cookies, localStorage)  │  │
│  │ (optional)│  │                          │  │
│  └──────────┘  └──────────────────────────┘  │
│                                               │
│  Auto-stops when task completes               │
│  Billed per-second while running              │
└───────────────────────────────────────────────┘
```

### Camoufox: Open-Source Anti-Detect

[Camoufox](https://github.com/daijro/camoufox) is an open-source Firefox fork with C++-level fingerprint spoofing:
- Navigator properties (hardwareConcurrency, deviceMemory, platform)
- WebGL vendor/renderer spoofing
- Canvas fingerprint noise
- AudioContext fingerprint protection
- Screen geometry randomization
- WebRTC leak prevention
- Font enumeration protection

It runs in Docker and is compatible with Playwright:

```typescript
// Connect Playwright to Camoufox running in the container
const browser = await firefox.connect("ws://localhost:9222");
const context = await browser.newContext({
  storageState: await restoreStateFromS3(userId), // Restore cookies
  viewport: { width: 1920, height: 1080 },
});
```

### Alternative: Chromium + fingerprint-suite

For sites that require Chromium (not Firefox), use Apify's [fingerprint-suite](https://github.com/AntagonistHQ/fingerprint-suite):

```typescript
import { FingerprintGenerator } from "fingerprint-generator";
import { newInjectedContext } from "fingerprint-injector";

const generator = new FingerprintGenerator();
const fingerprint = generator.getFingerprint({
  browsers: ["chrome"],
  operatingSystems: ["linux"],
});
const context = await newInjectedContext(browser, { fingerprint });
```

### Fly Machine Lifecycle

```typescript
// apps/worker/src/sandbox/fly-machine-manager.ts
import { FlyMachineApi } from "./fly-api.js";

const fly = new FlyMachineApi(process.env.FLY_API_TOKEN);

// 1. Start a machine for this task
const machine = await fly.createMachine({
  app: "valet-sandbox",
  config: {
    image: "registry.fly.io/valet-sandbox:latest",
    guest: { cpu_kind: "performance", cpus: 2, memory_mb: 4096 },
    auto_destroy: true,
    restart: { policy: "no" },
    env: {
      TASK_ID: taskId,
      USER_ID: userId,
      CALLBACK_URL: `https://valet-api.fly.dev/api/v1/webhooks/sandbox`,
    },
  },
});

// 2. Wait for machine to boot + browser to start (~20-25s cold, ~3s warm)
await fly.waitForMachine(machine.id, "started");

// 3. Execute automation via HTTP API on the machine
const result = await fetch(`http://${machine.private_ip}:8080/run-task`, {
  method: "POST",
  body: JSON.stringify({ jobUrl, profileState, formAnswers }),
});

// 4. Machine auto-stops when done, billed per-second
```

### Warm Pool Strategy

Keep N stopped Fly Machines ready to reduce cold start from 25s to 3s:

```typescript
// Warm pool: 5 stopped machines, replenished on use
const WARM_POOL_SIZE = 5;

async function getWarmMachine(): Promise<Machine | null> {
  const stopped = await fly.listMachines({
    app: "valet-sandbox",
    state: "stopped",
  });
  if (stopped.length > 0) {
    await fly.startMachine(stopped[0].id);
    replenishPool(); // Async: create a new stopped machine
    return stopped[0];
  }
  return null; // Fall back to cold start
}
```

**Warm pool cost**: 5 stopped machines × 2GB rootfs × $0.15/GB/mo = **$1.50/mo** (negligible).

### Fly Machine Pricing

| Config | $/hr (running) | $/session (3 min) | Monthly @ 500 apps/day |
|--------|----------------|--------------------|-|
| shared-2x-cpu, 2GB | $0.022 | $0.0011 | $17 |
| performance-2x-cpu, 4GB | $0.061 | $0.0030 | $46 |

### When to Use Tier 3

- Bulk applications on simple ATS forms
- Sites with weak bot detection (small company career pages)
- Cost-sensitive users on Starter plan
- Overflow when Tier 1 capacity is full

### Limitations

- Chromium cold start on Fly: 20–25s (mitigated by warm pool)
- Anti-detect weaker than AdsPower or Browserbase Advanced
- No persistent profile on disk (must serialize to S3)
- Fly Machines limit: 50 per app (expandable by contacting support)

---

## 7. Tier 4: API-Direct (No Browser)

> For ATS platforms that expose public APIs for application submission. Zero browser cost, instant execution, highest reliability.

### Supported Platforms

| Platform | API Endpoint | Auth Method | Fields | Rate Limits |
|----------|-------------|-------------|--------|-------------|
| **Greenhouse** | `POST /v1/boards/{token}/jobs/{id}` | Basic Auth (API key) | name, email, resume, education[], employment[], custom fields | Per-employer key |
| **Lever** | `POST /v0/postings/{id}` | Basic Auth (API key) | name, email, resume, phone, custom fields | 429 retry required |
| **Workday** | Company-specific REST endpoints | OAuth 2.0 / session | Varies by company config | Varies |
| **SmartRecruiters** | `POST /jobs/{id}/candidates` | API key | Standard candidate fields | 100 req/min |

### Greenhouse API Example

```typescript
// apps/worker/src/handlers/api-direct/greenhouse.ts
async function applyViaGreenhouseAPI(params: {
  boardToken: string;
  jobId: string;
  candidate: CandidateData;
  resumeBuffer: Buffer;
}): Promise<ApplicationResult> {
  const form = new FormData();
  form.append("first_name", params.candidate.firstName);
  form.append("last_name", params.candidate.lastName);
  form.append("email", params.candidate.email);
  form.append("phone", params.candidate.phone);
  form.append("resume", new Blob([params.resumeBuffer]), "resume.pdf");

  // Custom question answers
  for (const [key, value] of Object.entries(params.candidate.answers)) {
    form.append(key, value);
  }

  const response = await fetch(
    `https://boards-api.greenhouse.io/v1/boards/${params.boardToken}/jobs/${params.jobId}`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(params.apiKey + ":")}`,
      },
      body: form,
    },
  );

  if (!response.ok) throw new APIDirectError(response.status, await response.text());
  return { success: true, method: "api-direct", platform: "greenhouse" };
}
```

### ATS Detection

```typescript
// apps/worker/src/handlers/api-direct/detect-ats.ts
const ATS_PATTERNS: Record<string, ATSInfo> = {
  "boards.greenhouse.io": {
    provider: "greenhouse",
    hasDirectAPI: true,
    extractBoardToken: (url) => url.match(/boards\.greenhouse\.io\/(\w+)/)?.[1],
  },
  "jobs.lever.co": {
    provider: "lever",
    hasDirectAPI: true,
    extractPostingId: (url) => url.match(/jobs\.lever\.co\/\w+\/([\w-]+)/)?.[1],
  },
  "myworkdayjobs.com": {
    provider: "workday",
    hasDirectAPI: false, // Requires company-specific OAuth setup
  },
};

function detectATS(jobUrl: string): ATSInfo {
  const hostname = new URL(jobUrl).hostname;
  for (const [pattern, info] of Object.entries(ATS_PATTERNS)) {
    if (hostname.includes(pattern)) return info;
  }
  return { provider: "unknown", hasDirectAPI: false };
}
```

### When to Use Tier 4

- Greenhouse-hosted job postings (very common in tech)
- Lever-hosted job postings
- Any ATS with a documented candidate submission API
- Maximizing speed and reliability (no browser flakiness)

### Limitations

- Limited to platforms with public APIs
- Some employers disable API submissions
- Custom question formats vary per employer
- No way to handle complex multi-page flows

---

## 8. Provider Comparison Matrix

### Managed Browser Providers

| Provider | Cold Start | $/browser-hr | Max Concurrent | Anti-Detect | VNC/Live View | Persistent Profiles | Proxy |
|----------|-----------|--------------|----------------|-------------|---------------|--------------------|-|
| **Browserbase** | ~2-3s | $0.10-0.12 | 100 (Startup) | Basic/Advanced | **Yes (best)** | **Yes (Contexts)** | Built-in residential |
| **Steel.dev** | **~0.9s** | **$0.05-0.10** | 100 (Pro) | Built-in | No | Yes | Multi-region, BYOP |
| **Browserless** | ~1-2s | $0.05-0.06 | 50 (Scale) | BrowserQL | Screen recording | Yes (7-90 days) | BYOP only |
| **HyperBrowser** | ~3.7s | $0.10 | 25+ | Good | Yes | Yes | Region/city-level |

### Self-Hosted Options

| Provider | Cold Start | $/browser-hr | Max Concurrent | Anti-Detect | VNC | Persistent Profiles |
|----------|-----------|--------------|----------------|-------------|-----|------|
| **Fly Machines** | 20-25s (Chromium) | $0.03-0.09 | 50/app | BYOB | Yes (WireGuard) | Volumes/$0.15/GB |
| **AWS Fargate** | 30-90s | $0.04-0.12 | 500+ | BYOB | Difficult | EFS/S3 |
| **EC2 Dedicated** | 0s (always on) | $0.002-0.003 (RI) | 5-8/instance | AdsPower | Yes (noVNC) | Local disk |

### Decision Matrix

| Criterion | Weight | Browserbase | Steel.dev | Fly Machines | EC2+AdsPower |
|-----------|--------|-------------|-----------|--------------|--------------|
| Anti-detect quality | 25% | 8/10 | 6/10 | 5/10 (Camoufox) | **10/10** |
| Human-in-the-loop | 20% | **10/10** | 3/10 | 7/10 | 8/10 |
| Cost efficiency | 20% | 5/10 | 7/10 | **9/10** | 8/10 |
| Ops simplicity | 15% | **10/10** | 8/10 | 6/10 | 3/10 |
| Session persistence | 10% | **9/10** | 7/10 | 5/10 | **9/10** |
| Scalability | 10% | **9/10** | 8/10 | 7/10 | 4/10 |
| **Weighted Score** | | **8.15** | **6.25** | **6.55** | **7.15** |

**Recommendation**: Browserbase (Tier 2) + EC2 (Tier 1) + Fly Machines (Tier 3) as a three-layer hybrid.

---

## 9. Session State Management

### The Challenge

Ephemeral tiers (2, 3) destroy the browser when a task completes. Login state (cookies, localStorage, sessionStorage) must survive between sessions.

### Strategy per Tier

| Tier | State Storage | Restore Time | What's Preserved |
|------|--------------|-------------|-----------------|
| 1 (EC2) | AdsPower profile on local disk | 0s (always live) | Everything (cookies, cache, IndexedDB, extensions) |
| 2 (Browserbase) | Browserbase Contexts API | ~1s | Cookies, localStorage |
| 3 (Fly Machines) | Supabase Storage S3 | ~2-3s | Cookies, localStorage, sessionStorage (manual) |
| 4 (API-Direct) | N/A | N/A | API keys stored in DB |

### Playwright storageState() for Tier 3

```typescript
// Save state after task completes
async function saveSessionState(
  context: BrowserContext,
  userId: string,
): Promise<void> {
  const state = await context.storageState();
  const page = context.pages()[0];

  // storageState() captures cookies + localStorage but NOT sessionStorage
  const sessionData = await page?.evaluate(() =>
    JSON.stringify(Object.fromEntries(
      Object.entries(sessionStorage)
    ))
  );

  await s3.putObject({
    Bucket: "browser-states",
    Key: `${userId}/storage-state.json`,
    Body: JSON.stringify({ ...state, sessionStorage: sessionData }),
  });
}

// Restore state when new container starts
async function restoreSessionState(userId: string): Promise<StorageState | undefined> {
  try {
    const obj = await s3.getObject({
      Bucket: "browser-states",
      Key: `${userId}/storage-state.json`,
    });
    return JSON.parse(await obj.Body!.transformToString());
  } catch {
    return undefined;
  }
}
```

### Browserbase Contexts API for Tier 2

```typescript
// Create a persistent context per user (one-time)
const context = await bb.contexts.create({
  projectId: process.env.BROWSERBASE_PROJECT_ID,
});
// Store context.id in user's DB record

// Reuse context in every session
const session = await bb.sessions.create({
  projectId: process.env.BROWSERBASE_PROJECT_ID,
  browserSettings: {
    context: { id: userRecord.browserbaseContextId, persist: true },
  },
});
```

---

## 10. Anti-Detect Strategy per Tier

| Tier | Engine | Fingerprint Method | Detection Risk | Mitigation |
|------|--------|--------------------|----------------|-----------|
| 1 | AdsPower | Hardware-level Chromium fork, unique canvas/WebGL/audio per profile | **Very Low** | Rotate profiles, ISP proxies, human-like timing |
| 2 | Browserbase | Managed stealth mode (Basic on Startup, Advanced on Scale) | **Low** | Contexts API preserves fingerprint across sessions |
| 3 | Camoufox | C++-level Firefox fork with fingerprint spoofing | **Moderate** | Randomize fingerprint per session, residential proxies |
| 3-alt | Chromium + fingerprint-suite | JavaScript injection of fake navigator/canvas/WebGL | **Moderate-High** | Less reliable than native patches, detectable by advanced sites |
| 4 | N/A | No browser, direct API | **None** | Rate limiting, realistic timing |

### Proxy Strategy

| Tier | Proxy Type | Cost | Source |
|------|-----------|------|--------|
| 1 | ISP/static residential | $3/IP/month | IPRoyal, Webshare |
| 2 | Browserbase built-in residential | $10-12/GB | Included in plan |
| 3 | Rotating residential | $2.50-4.00/GB | IPRoyal, Bright Data |
| 4 | N/A | $0 | Direct API calls |

**Budget**: ~$0.01-0.02 per application for proxy bandwidth (3-5 MB per session).

---

## 11. Human-in-the-Loop per Tier

| Tier | HITL Method | Latency to Human | Human Capabilities | Implementation |
|------|------------|------------------|--------------------|----------------|
| 1 | noVNC over WebSocket | <1s | Full browser control | Xvfb + x11vnc + websockify on EC2 |
| 2 | Browserbase Live View (iframe) | <1s | Watch, click, type, scroll | `<iframe src="${debuggerFullscreenUrl}">` |
| 3 | noVNC in Fly Machine | 1-2s | Full browser control | Requires headed mode + Xvfb in container |
| 4 | N/A | N/A | N/A | Form field review in VALET UI |

### Browserbase Live View Integration (Tier 2)

```typescript
// Backend: get Live View URL when entering HITL mode
const debugInfo = await bb.sessions.debug(sessionId);
const liveViewUrl = debugInfo.debuggerFullscreenUrl + "&navbar=false";

// Send to frontend via WebSocket
ws.send(JSON.stringify({
  type: "hitl_required",
  taskId,
  reason: "captcha_detected",
  liveViewUrl,
}));

// Frontend: embed in task detail page
// <iframe
//   src={liveViewUrl}
//   className="w-full h-[600px] rounded-lg border"
//   allow="clipboard-read; clipboard-write"
// />
```

**Advantage over noVNC**: Zero infrastructure to manage. Browserbase handles the WebSocket proxy, TLS, and browser rendering. The iframe is embeddable anywhere.

---

## 12. Shared Automation Abstraction

All tiers share the same `IBrowserAgent` interface so automation logic is written once:

```typescript
// packages/shared/src/types/automation.ts (already exists in codebase)
export interface IBrowserAgent {
  navigate(url: string): Promise<void>;
  fillField(selector: string, value: string): Promise<void>;
  clickElement(selector: string): Promise<void>;
  uploadFile(selector: string, filePath: string): Promise<void>;
  extractData<T>(instruction: string, schema: z.ZodType<T>): Promise<T>;
  takeScreenshot(): Promise<Buffer>;
  getCurrentUrl(): Promise<string>;
  act(instruction: string): Promise<ActResult>;
  extract<T>(instruction: string, schema: z.ZodType<T>): Promise<ExtractResult<T>>;
  observe(instruction: string): Promise<ObserveResult>;
}
```

### Tier-Specific Implementations

```
IBrowserAgent
├── SeleniumBrowserAgent      (Tier 1: AdsPower + Selenium)
├── StagehandBrowserAgent     (Tier 2: Browserbase + Stagehand v3)
├── PlaywrightBrowserAgent    (Tier 3: Fly Machine + Playwright)
└── APIDirectAgent            (Tier 4: HTTP API calls, no browser)
```

### Factory Pattern

```typescript
// apps/worker/src/sandbox/agent-factory.ts
function createBrowserAgent(tier: SandboxTier): IBrowserAgent {
  switch (tier.tier) {
    case 1:
      return new SeleniumBrowserAgent(tier.instanceId, tier.profileId);
    case 2:
      return new StagehandBrowserAgent({
        useBrowserbase: true,
        contextId: tier.contextId,
      });
    case 3:
      return new PlaywrightBrowserAgent({
        cdpUrl: `ws://${tier.machineIp}:9222`,
      });
    case 4:
      return new APIDirectAgent(tier.provider, tier.apiKey);
  }
}
```

---

## 13. Cost Model & Unit Economics

### Per-Application Cost Breakdown

| Component | Cost/App | % of Total | Notes |
|-----------|----------|-----------|-------|
| **LLM (3-tier routing)** | $0.070 | 78.7% | Blended new + cached sites |
| **Proxy** | $0.010 | 11.2% | ISP base + overflow |
| **Compute** | $0.004 | 4.5% | Fly Machines perf-2x, 4 min |
| **Fixed infra (amortized)** | $0.004 | 4.2% | Supabase, Redis, Hatchet |
| **Storage** | $0.001 | 1.1% | Screenshots + artifacts |
| **CAPTCHA solving** | $0.0003 | 0.3% | 10% rate × $0.003 |
| **Total** | **$0.089** | **100%** | |

> LLM costs dominate. The 3-tier router (Sonnet 4.5 → GPT-4.1 mini → nano) already optimizes this. Cached site selectors reduce LLM calls by 60-70% for repeat visits.

### Cost by Tier (Compute Only)

| Tier | Compute $/App | Total $/App (w/ LLM) | Best For |
|------|--------------|----------------------|----------|
| 1 (EC2 RI) | $0.002 | $0.082 | Premium users |
| 2 (Browserbase) | $0.008 | $0.088 | Standard + HITL |
| 3 (Fly Machines) | $0.003 | $0.083 | Bulk volume |
| 4 (API-Direct) | $0.000 | $0.010 | Supported ATS only |

### Cost at Scale

| Scale | Apps/Day | Apps/Month | Variable Costs | Fixed Infra | Proxy | **Total COGS** |
|-------|----------|------------|----------------|-------------|-------|-|
| 100 users | 500 | 15,000 | $1,365 | $104 | $300 | **$1,769/mo** |
| 500 users | 2,500 | 75,000 | $5,475 | $148 | $1,500 | **$7,123/mo** |
| 1,000 users | 5,000 | 150,000 | $9,150 | $398 | $3,000 | **$12,548/mo** |

### Fixed Infrastructure

| Service | 100 Users | 500 Users | 1,000 Users |
|---------|-----------|-----------|-------------|
| Supabase Postgres (Pro) | $25 | $25 | $75 |
| Upstash Redis | $10 | $10 | $30 |
| Hatchet (Fly, self-hosted) | $15 | $30 | $60 |
| CloudAMQP | $0 | $19 | $99 |
| Fly.io API/Web | $10 | $20 | $40 |
| Monitoring | $29 | $29 | $79 |
| Domain/DNS/SSL | $15 | $15 | $15 |
| **Total** | **$104** | **$148** | **$398** |

---

## 14. Pricing Strategy

### Competitor Landscape

| Platform | Entry Tier | Mid Tier | Model |
|----------|-----------|----------|-------|
| Bardeen.ai | $20/mo (2K credits) | $40/mo/user | Per-action credits |
| PhantomBuster | $69/mo | $159/mo (80 hrs) | Execution hours |
| Browse.ai | $49/mo (2K credits) | $124/mo | Per-scrape credits |
| Axiom.ai | $15/mo (5 hrs) | $50/mo (30 hrs) | Runtime minutes |
| GoLogin | $24/mo (100 profiles) | $49/mo (300 profiles) | Browser profiles |

### Proposed VALET Pricing

| | **Starter** | **Professional** | **Premium** |
|---|---|---|---|
| **Monthly** | **$29/mo** | **$79/mo** | **$199/mo** |
| **Annual** | $24/mo | $66/mo | $166/mo |
| **Applications/mo** | 50 | 200 | 600 |
| **Overage** | $0.50/app | $0.35/app | $0.25/app |
| **Concurrent** | 1 | 3 | 5 |
| **Default Tier** | Tier 3 only | Tier 2 + 3 | Tier 1 + 2 + 3 |
| **Mode** | Copilot only | Copilot + Autopilot | Copilot + Autopilot |
| **Anti-Detect** | Basic (Camoufox) | Managed stealth (Browserbase) | Full (AdsPower + Browserbase) |
| **VNC / Live View** | Copilot mode | Both modes | Both + session recording |
| **Browser Profiles** | 1 | 5 | 15 |
| **Resumes** | 1 | 3 | 10 |
| **Q&A Bank** | 50 answers | 200 answers | Unlimited |
| **API Access** | No | Read-only | Full |
| **Support** | Community + email | Priority email | Slack + email |

**Free trial**: 7 days of Professional tier, 10 applications, no credit card.

### Margin Analysis

| Tier | Revenue/Included App | Cost/App | Gross Margin |
|------|---------------------|----------|-------------|
| Starter ($29/50 apps) | $0.58 | $0.091 | **84.3%** |
| Professional ($79/200 apps) | $0.395 | $0.080 | **79.7%** |
| Premium ($199/600 apps) | $0.332 | $0.073 | **78.0%** |

### Revenue Projections (60% Starter / 30% Pro / 10% Premium)

| Metric | 100 Users | 500 Users | 1,000 Users |
|--------|-----------|-----------|-------------|
| MRR | **$6,100** | **$30,500** | **$61,000** |
| ARR | **$73,200** | **$366,000** | **$732,000** |
| COGS | $1,769 | $7,123 | $12,548 |
| **Gross Profit** | **$4,331** | **$23,377** | **$48,452** |
| **Gross Margin** | **71.0%** | **76.6%** | **79.4%** |

**Break-even**: ~35 users. **$100K ARR**: ~140 users.

---

## 15. Implementation Roadmap

### Phase 1: MVP (Weeks 1–4) — Single Tier

Ship with **Tier 3 only** (Fly Machines + Camoufox/Playwright):
1. Docker image with Camoufox + Playwright + noVNC
2. Fly Machine lifecycle manager (create, start, stop, destroy)
3. Warm pool (5 stopped machines)
4. `PlaywrightBrowserAgent` implementing `IBrowserAgent`
5. `storageState()` save/restore to Supabase S3
6. Basic anti-detect via Camoufox
7. noVNC for human-in-the-loop
8. Webhook callback to Hatchet on task completion

### Phase 2: Browserbase Integration (Weeks 5–7) — Add Tier 2

1. Browserbase SDK integration (`@browserbasehq/sdk`)
2. Stagehand v3 integration (`@browserbasehq/stagehand`)
3. `StagehandBrowserAgent` implementing `IBrowserAgent`
4. Browserbase Contexts API for session persistence
5. Live View iframe in task detail page (replace noVNC for Tier 2)
6. Tier routing logic in Hatchet workflow
7. Automatic retry: Tier 3 failure → escalate to Tier 2

### Phase 3: EC2 Pool (Weeks 8–11) — Add Tier 1

1. EC2 pool manager (Terraform for N instances)
2. AdsPower headless + Selenium on each instance
3. `SeleniumBrowserAgent` implementing `IBrowserAgent`
4. Profile-to-instance assignment via Redis
5. noVNC for human-in-the-loop on EC2
6. Auto-scaling: add instances when queue > threshold
7. Instance health monitoring + auto-recovery

### Phase 4: API-Direct (Weeks 12–13) — Add Tier 4

1. ATS detection module (URL → provider mapping)
2. Greenhouse Job Board API handler
3. Lever Postings API handler
4. `APIDirectAgent` implementing `IBrowserAgent`
5. Tier 4 routing in Hatchet workflow

### Phase 5: Polish & Pricing (Weeks 14–16)

1. User plan management (Starter/Pro/Premium)
2. Usage metering and billing integration (Stripe)
3. Overage handling
4. Analytics dashboard (applications/tier, success rate, cost)
5. Tier fallback cascade tuning based on real data

---

## 16. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| LinkedIn detects all tiers | High | Critical | Tier 1 with ISP proxies + human-like timing; Copilot mode as default for LinkedIn |
| Browserbase price increases | Medium | High | Tier 3 as fallback; Steel.dev as alternative managed provider |
| Fly Machines cold start > 30s | Medium | Medium | Warm pool; pre-loaded Docker images; consider Fargate as alternative |
| Camoufox detection improves | Medium | Medium | Fall back to Browserbase Advanced; consider Multilogin cloud API |
| LLM costs don't decrease | Low | Medium | Aggressive caching; fine-tuned smaller models; GPT-4.1 nano for 60%+ of calls |
| ATS APIs change/break | Medium | Low (Tier 4 only) | Browser tiers as fallback; version monitoring |
| CAPTCHA rates increase >10% | Medium | High | Expand Tier 1 capacity; integrate 2Captcha as Autopilot fallback |
| Profile state corruption on S3 | Low | Medium | Versioned S3 objects; state validation on restore; fresh login fallback |

---

*Last updated: 2026-02-13*
*Depends on: [03-ec2-worker-integration.md](03-ec2-worker-integration.md), [02-stagehand-integration.md](../integration/02-stagehand-integration.md), [01-vnc-stack.md](01-vnc-stack.md)*
