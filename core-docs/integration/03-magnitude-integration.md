# 03 — Magnitude Browser Agent Integration

> **Role in Valet**: Fallback vision-first browser automation engine, used when Stagehand's
> DOM-based approach fails on complex UIs (canvas elements, SVG forms, heavy shadow DOM,
> Workday-style portals).

---

## Table of Contents

1. [Magnitude SDK Setup](#1-magnitude-sdk-setup)
2. [Dual-Agent Architecture: Planner + Executor](#2-dual-agent-architecture-planner--executor)
3. [Core API](#3-core-api)
4. [CDP Connection to AdsPower Browsers](#4-cdp-connection-to-adspower-browsers)
5. [Vision-First Approach](#5-vision-first-approach)
6. [Plan Saving and Reuse](#6-plan-saving-and-reuse)
7. [Patchright: Anti-Detect Playwright Fork](#7-patchright-anti-detect-playwright-fork)
8. [When to Use Magnitude](#8-when-to-use-magnitude)
9. [Engine Switching Protocol](#9-engine-switching-protocol)
10. [Moondream Self-Hosting](#10-moondream-self-hosting)
11. [Error Handling](#11-error-handling)
12. [Full TypeScript Examples](#12-full-typescript-examples)
13. [Testing Strategy](#13-testing-strategy)

---

## 1. Magnitude SDK Setup

### Package Installation

```bash
# Core automation library (used at runtime in apps/worker)
pnpm add magnitude-core --filter @valet/worker

# magnitude-test is the test framework — only for dev/testing
pnpm add -D magnitude-test --filter @valet/worker
```

**magnitude-core** (v0.3.x) provides `startBrowserAgent()` and the full BrowserAgent API.
**magnitude-test** adds the test runner with visual assertions — used for our E2E validation
of automation flows, not for production job applications.

### Environment Variables

```bash
# Required — Magnitude defaults to Claude Sonnet 4 via Anthropic
ANTHROPIC_API_KEY=sk-ant-...

# Optional — for role-based model routing (see Section 2)
GOOGLE_API_KEY=...             # Gemini Flash for extract/query roles
OPENROUTER_API_KEY=...         # Qwen 2.5 VL 72B as alternative planner
```

If `ANTHROPIC_API_KEY` is set and no `llm` config is provided, Magnitude automatically
uses Claude Sonnet 4 as the default model.

### Workspace Integration

The worker package already depends on `@valet/shared` for automation types. Magnitude's
`BrowserAgent` will be wrapped behind the existing `IBrowserAgent` interface defined in
`packages/shared/src/types/automation.ts`:

```
packages/shared/src/types/automation.ts    → IBrowserAgent interface (unchanged)
apps/worker/src/adapters/magnitude-agent.ts → MagnitudeAgent implements IBrowserAgent
apps/worker/src/adapters/browser-agent.mock.ts → existing mock (unchanged)
```

---

## 2. Dual-Agent Architecture: Planner + Executor

Magnitude separates LLM responsibilities into three configurable **roles**:

| Role | Purpose | Model Requirements | Recommended |
|------|---------|--------------------|-------------|
| **act** | Browser interactions — click, type, navigate | Visually grounded, strong reasoning | Claude Sonnet 4 |
| **extract** | Structured data extraction from pages | Fast, does not need visual grounding | Gemini 2.5 Flash |
| **query** | Answer questions about observed data | Moderate reasoning | Gemini 2.5 Flash |

### How Planner + Executor Coordinate

1. **Planner** (act role): Receives a screenshot of the current viewport. The visually
   grounded LLM identifies UI elements by pixel coordinates, plans a sequence of
   mouse/keyboard operations, and emits structured action commands.

2. **Executor**: Translates planned actions into precise Playwright operations — mouse
   move to (x, y), click, type keystrokes. This is handled internally by Magnitude's
   core runtime, not a separate LLM.

3. **Feedback Loop**: After each action, a new screenshot is captured. The planner
   evaluates whether the action succeeded (did the expected UI change occur?) and
   plans the next step.

### Role-Based Model Configuration

```typescript
import { startBrowserAgent } from "magnitude-core";

const agent = await startBrowserAgent({
  url: "https://jobs.lever.co/company/apply",
  llm: [
    {
      // Primary: visually grounded model for act role
      provider: "anthropic",
      options: {
        model: "claude-sonnet-4-20250514",
        apiKey: process.env.ANTHROPIC_API_KEY,
      },
      roles: ["act"],
    },
    {
      // Cost-efficient: fast model for data extraction and queries
      provider: "google-ai",
      options: {
        model: "gemini-2.5-flash",
        apiKey: process.env.GOOGLE_API_KEY,
      },
      roles: ["extract", "query"],
    },
  ],
});
```

**Cost Implications**: The act role consumes the most tokens (screenshot analysis per step).
By offloading extract and query to Gemini Flash, we reduce per-application cost by
approximately 60-70% compared to using Claude for everything.

### Incompatible Models

Most LLMs lack visual grounding and **cannot** be used for the act role:
- OpenAI GPT-4o/4.1 — not visually grounded
- Gemini models — not visually grounded
- Llama models — not visually grounded

The act role requires models that can specify precise pixel coordinates from screenshots.
Currently only **Claude Sonnet 4** and **Qwen 2.5 VL 72B** are confirmed compatible.

---

## 3. Core API

### `startBrowserAgent(options?)`

Creates and returns an initialized `BrowserAgent` instance.

```typescript
import { startBrowserAgent } from "magnitude-core";

const agent = await startBrowserAgent({
  // Initial URL to navigate to after browser launch
  url: "https://greenhouse.io/apply/12345",

  // System-level instructions for the agent
  prompt: "You are filling out a job application form. Be precise with field values.",

  // Enable console narration of agent thoughts and actions
  narrate: true,

  // Screenshot resolution sent to the LLM
  virtualScreenDimensions: { width: 1280, height: 720 },

  // LLM provider configuration (see Section 2 for multi-role setup)
  llm: {
    provider: "anthropic",
    options: {
      model: "claude-sonnet-4-20250514",
      apiKey: process.env.ANTHROPIC_API_KEY,
    },
  },

  // Browser configuration (see Section 4 for CDP)
  browser: {
    launchOptions: {
      args: ["--disable-gpu", "--no-sandbox"],
    },
    contextOptions: {
      viewport: { width: 1280, height: 720 },
      userAgent: "Mozilla/5.0 ...",
    },
  },

  // Minimum screenshots retained in context (for prompt caching)
  minScreenshots: 3,
});
```

### `agent.act(description, options?)`

Execute browser actions described in natural language.

```typescript
// Simple action
await agent.act("Click the 'Next' button");

// Action with data substitution
await agent.act("Fill in the first name field with {{firstName}}", {
  data: { firstName: "Jane" },
});

// Action with additional LLM instructions
await agent.act("Upload the resume file", {
  prompt: "The file upload button may be hidden. Look for a drag-and-drop zone or a small icon.",
});

// Complex multi-step action
await agent.act("Select 'United States' from the country dropdown, then select 'California' from the state dropdown");
```

### `agent.extract(instructions, schema)`

Extract structured data from the current page using a Zod schema.

```typescript
import { z } from "zod";

const formFieldsSchema = z.array(
  z.object({
    label: z.string().describe("The visible label of the form field"),
    type: z.enum(["text", "select", "checkbox", "radio", "file", "textarea"]),
    required: z.boolean().describe("Whether the field is marked as required"),
    currentValue: z.string().describe("The current value filled in, or empty string"),
  }),
);

const fields = await agent.extract(
  "List all visible form fields on this page with their current values",
  formFieldsSchema,
);
// fields.data → Array of form field objects matching the schema
```

### `agent.nav(url)`

Navigate to a URL.

```typescript
await agent.nav("https://jobs.lever.co/company/apply/12345");
```

### `agent.stop()`

Close the browser and release all resources.

```typescript
await agent.stop();
```

### `agent.page` / `agent.context`

Access the underlying Playwright objects for low-level operations when needed.

```typescript
// Direct Playwright Page access
const page = agent.page;
await page.waitForLoadState("networkidle");
const cookies = await agent.context.cookies();

// Screenshot via Playwright directly
const screenshot = await page.screenshot({ fullPage: true });

// Evaluate JavaScript in the page
const title = await page.evaluate(() => document.title);
```

---

## 4. CDP Connection to AdsPower Browsers

Magnitude supports connecting to existing Chrome DevTools Protocol endpoints via the
`browser.cdp` option. This is how we connect to AdsPower-managed anti-detect browsers.

### Connection Flow

```
AdsPower API → start browser → returns cdpUrl (ws://127.0.0.1:{port})
                                      ↓
Magnitude startBrowserAgent({ browser: { cdp: cdpUrl } })
                                      ↓
BrowserAgent connected to AdsPower's Chromium instance
```

### Implementation

```typescript
import { startBrowserAgent } from "magnitude-core";
import type { IAdsPowerClient, BrowserSession } from "@valet/shared/types";

async function connectMagnitudeToAdsPower(
  adsPower: IAdsPowerClient,
  profileId: string,
): Promise<ReturnType<typeof startBrowserAgent>> {
  // 1. Start the AdsPower browser profile
  const session: BrowserSession = await adsPower.startBrowser(profileId);

  // 2. Connect Magnitude via CDP
  const agent = await startBrowserAgent({
    browser: {
      cdp: session.cdpUrl, // e.g., "ws://127.0.0.1:9222/devtools/browser/..."
    },
    llm: {
      provider: "anthropic",
      options: { model: "claude-sonnet-4-20250514" },
    },
    narrate: true,
  });

  return agent;
}
```

### CDP Limitations vs Stagehand

| Aspect | Stagehand CDP | Magnitude CDP |
|--------|--------------|---------------|
| Connection method | `browserWSEndpoint` or `browserURL` | `browser.cdp` option |
| Browser context | Can attach to existing contexts | Creates new context on connected browser |
| Page reuse | Can connect to existing pages | Navigates from scratch within new context |
| Anti-detect profiles | Full AdsPower fingerprint preserved | Full AdsPower fingerprint preserved |
| Session persistence | Can resume mid-flow | Must start from URL (no mid-page resume) |

**Key Limitation**: When Magnitude connects via CDP, it creates a new browser context
rather than attaching to an existing page. This means:
- AdsPower's fingerprint configuration (canvas, WebGL, fonts, etc.) is preserved
- But you cannot resume a half-completed form from Stagehand's session
- The engine switch must re-navigate to the application URL

This limitation shapes our engine switching protocol (Section 9).

---

## 5. Vision-First Approach

### How Pixel-Coordinate Interaction Works

```
┌─────────────────────────────────────────────┐
│  1. Capture viewport screenshot (PNG)       │
│  2. Send screenshot + instruction to LLM    │
│  3. LLM identifies target element visually  │
│  4. LLM returns pixel coordinates (x, y)    │
│  5. Execute mouse action at coordinates     │
│  6. Capture new screenshot                  │
│  7. Verify action succeeded visually        │
│  8. Repeat until task complete              │
└─────────────────────────────────────────────┘
```

The LLM literally "looks" at the page as a human would — identifying buttons, text fields,
dropdowns, and other UI elements by their visual appearance rather than DOM structure.

### Pros vs DOM-Based (Stagehand)

| Aspect | Vision-First (Magnitude) | DOM-Based (Stagehand) |
|--------|-------------------------|----------------------|
| **Canvas elements** | Works naturally | Cannot interact (no DOM nodes) |
| **SVG-heavy forms** | Works naturally | Unreliable selector generation |
| **Shadow DOM** | Works naturally | Requires piercing, often breaks |
| **Dynamic class names** | Immune (no selectors used) | Breaks with CSS-in-JS hashing |
| **iframes** | Sees unified visual | Must switch iframe contexts |
| **Speed** | Slower (screenshot + LLM per action) | Faster (direct DOM manipulation) |
| **Token cost** | Higher (image tokens per step) | Lower (text-only DOM analysis) |
| **Accuracy on standard forms** | ~94% (WebVoyager benchmark) | ~98% (simple forms) |
| **Determinism** | Lower (pixel variance) | Higher (exact selectors) |
| **Debugging** | Screenshot trail | DOM snapshots + selectors |

### Pixel Accuracy Considerations

- **Virtual screen dimensions**: Set `virtualScreenDimensions` to match the actual viewport
  to avoid coordinate scaling issues.
- **Dynamic layouts**: If the page layout shifts between screenshot and action execution
  (e.g., lazy-loading content), coordinates may miss their target.
- **Retina displays**: Magnitude handles DPI scaling internally — coordinates are in
  CSS pixels, not device pixels.
- **Small targets**: Tiny checkboxes or radio buttons (< 15px) may be hard for the LLM
  to pinpoint accurately. The `minScreenshots` option helps by keeping context.

---

## 6. Plan Saving and Reuse

Magnitude's architecture supports a planner/executor separation that enables **plan caching**
for known form types. This is a critical cost optimization for Valet.

### Concept

```
First run (expensive):
  Planner LLM (Claude Sonnet 4) → generates step-by-step plan → Executor runs it
  Plan saved to database/file

Subsequent runs (cheap):
  Saved plan loaded → Executor runs it directly (no planner LLM needed)
  Only executor vision model used for coordinate identification
```

### Implementation for Valet

We save plans per **platform + form type** combination:

```typescript
// Plan structure stored in database
interface SavedPlan {
  id: string;
  platform: Platform;           // "linkedin" | "greenhouse" | "lever" | "workday"
  formType: string;             // "easy_apply" | "standard" | "multi_page"
  version: number;              // Increment when platform UI changes
  steps: PlanStep[];
  createdAt: Date;
  lastSuccessAt: Date;
  successRate: number;          // Track reliability over time
}

interface PlanStep {
  action: "act" | "extract" | "nav" | "wait" | "verify";
  instruction: string;          // Natural language instruction
  dataTemplate?: string;        // e.g., "{{firstName}}" for substitution
  expectedOutcome?: string;     // Visual verification description
  timeout?: number;
}
```

### Platform-Specific Saved Plans

| Platform | Form Type | Plan Steps | Notes |
|----------|-----------|-----------|-------|
| LinkedIn | Easy Apply | ~8-12 | Modal-based, 2-4 pages, file upload |
| Greenhouse | Standard | ~15-20 | Full page form, many custom questions |
| Lever | Standard | ~12-15 | Single page, clean layout |
| Workday | Multi-page | ~25-35 | Complex wizard, shadow DOM heavy |
| Unknown | Generic | Generate fresh | No saved plan, full planner run |

### Cost Savings

- **Full planner run**: ~$0.08-0.15 per application (Claude Sonnet 4 screenshots)
- **Cached plan + executor only**: ~$0.02-0.04 per application
- **Savings**: 60-75% cost reduction on known platforms

### Plan Invalidation

Plans must be invalidated when platforms update their UI:

```typescript
async function shouldRegeneratePlan(plan: SavedPlan): Promise<boolean> {
  // Plan older than 30 days — platforms update frequently
  if (daysSince(plan.lastSuccessAt) > 30) return true;

  // Success rate dropped below threshold
  if (plan.successRate < 0.80) return true;

  // Version mismatch detected by platform adapter
  return false;
}
```

---

## 7. Patchright: Anti-Detect Playwright Fork

Magnitude uses **patchright** under the hood instead of stock Playwright. Patchright is an
undetected fork of Playwright that patches critical automation detection vectors.

### What Patchright Patches

| Detection Vector | Stock Playwright | Patchright |
|-----------------|-----------------|------------|
| `Runtime.enable` CDP command | Sent on page load — detected by Cloudflare, DataDome | **Eliminated** — uses isolated ExecutionContexts |
| `navigator.webdriver` | Set to `true` | Set to `false` via `--disable-blink-features=AutomationControlled` |
| `--enable-automation` flag | Present in launch args | **Removed** |
| `--disable-popup-blocking` | Present | **Removed** |
| `--disable-component-update` | Present | **Removed** |
| `--disable-default-apps` | Present | **Removed** |
| `--disable-extensions` | Present | **Removed** |
| `Console.enable` CDP command | Active | **Disabled** (trade-off: no console.log capture) |
| Closed Shadow DOM | Cannot pierce | **Can interact** with closed shadow roots |

### How Runtime.enable Avoidance Works

Standard Playwright sends `Runtime.enable` to the browser to set up JavaScript evaluation.
Anti-bot systems (Cloudflare, DataDome, Kasada, Akamai) specifically check for this CDP
command. Patchright instead:

1. Creates **isolated ExecutionContexts** for JavaScript evaluation
2. Never sends `Runtime.enable` to the main page context
3. Scripts cannot detect the automation tooling via CDP side-channel leaks

### Implications for Valet

- **AdsPower + Patchright**: Double-layered anti-detection. AdsPower handles browser
  fingerprinting (canvas, WebGL, fonts, timezone), while patchright handles CDP/automation
  detection. This combination passes all major anti-bot systems.
- **Console logging disabled**: We cannot use `console.log` for debugging inside page
  context. Use Playwright's `page.evaluate()` return values instead.
- **Chromium only**: Patchright does not support Firefox or WebKit. This is fine for
  Valet since AdsPower uses Chromium exclusively.
- **API compatibility**: Patchright is a drop-in replacement — all Playwright APIs
  (`page.click()`, `page.fill()`, `page.evaluate()`, etc.) work identically.

### Detection Bypass Results

Patchright passes these anti-bot systems:

- Cloudflare Turnstile / Challenge
- DataDome
- Kasada (Iovation)
- Akamai Bot Manager
- PerimeterX (HUMAN)
- Fingerprint.com
- Shape Security

---

## 8. When to Use Magnitude

### Decision Matrix

| Scenario | Use Stagehand | Use Magnitude | Rationale |
|----------|:------------:|:-------------:|-----------|
| Standard HTML forms (Greenhouse, Lever) | **Yes** | No | DOM selectors reliable, faster |
| LinkedIn Easy Apply modal | **Yes** | Fallback | Well-structured DOM, but modal quirks |
| Workday application portal | No | **Yes** | Heavy shadow DOM, defeats DOM selectors |
| Canvas-based assessments | No | **Yes** | No DOM nodes to select |
| SVG-rendered form elements | No | **Yes** | SVG elements lack standard form semantics |
| Drag-and-drop interfaces | No | **Yes** | Pixel-coordinate drag naturally supported |
| Sites with aggressive anti-bot | Fallback | **Yes** | Patchright + vision avoids detection patterns |
| WYSIWYG rich text editors | No | **Yes** | ContentEditable + iframes defeat DOM approach |
| Multi-iframe nested forms | Fallback | **Yes** | Vision sees unified page, no iframe switching |
| Simple data extraction | **Yes** | No | DOM extraction faster and cheaper |
| High-volume batch applications | **Yes** | No | Lower cost per application |
| Unknown/new platforms | No | **Yes** | Vision generalizes without platform-specific code |

### Concrete Examples

**Use Stagehand**:
```
Greenhouse job application
→ Clean HTML form with labeled inputs
→ Standard <select>, <input>, <textarea> elements
→ CSS class names are stable
→ Stagehand observe() + act() handles reliably
```

**Use Magnitude**:
```
Workday job application
→ Shadow DOM encapsulated web components
→ Custom <wd-popup>, <wd-select>, <wd-input> elements
→ Standard Playwright selectors cannot pierce reliably
→ Stagehand's DOM tree analysis returns incomplete/wrong selectors
→ Magnitude sees the rendered UI and clicks at pixel coordinates
```

**Use Magnitude**:
```
Company with custom canvas-based skills assessment
→ Skills listed in <canvas> element
→ Drag-and-drop to rank them
→ No DOM representation of draggable items
→ Magnitude: "Drag 'JavaScript' above 'Python' in the skills ranking"
```

---

## 9. Engine Switching Protocol

When Stagehand fails, the orchestrator must seamlessly switch to Magnitude while preserving
as much session state as possible.

### Full Flow

```
┌─────────────────────────────────────────────────────────┐
│  1. Stagehand attempts operation                        │
│  2. Operation fails (timeout, selector not found,       │
│     wrong element clicked, action had no effect)        │
│  3. Failure detector classifies failure type            │
│  4. If retriable with Stagehand → retry (max 2x)       │
│  5. If structural failure → trigger engine switch       │
│                                                         │
│  ENGINE SWITCH:                                         │
│  6. Capture current page state:                         │
│     - Current URL                                       │
│     - Screenshot of current viewport                    │
│     - Cookies (from AdsPower session — preserved)       │
│     - Form data filled so far (via extract)             │
│     - Which step in the flow we're on                   │
│                                                         │
│  7. Disconnect Stagehand from CDP endpoint              │
│  8. Connect Magnitude to same CDP endpoint              │
│     (AdsPower browser stays running)                    │
│                                                         │
│  9. Magnitude navigates to the saved URL                │
│  10. Verify page matches expected state (screenshot     │
│      comparison or visual assertion)                    │
│  11. Resume operation from the failed step              │
│  12. Continue with Magnitude for remaining steps        │
│                                                         │
│  POST-SWITCH:                                           │
│  13. Log switch event for analytics                     │
│  14. If Magnitude also fails → request human takeover   │
└─────────────────────────────────────────────────────────┘
```

### Failure Type Classification

```typescript
type FailureType =
  | "selector_not_found"       // DOM element doesn't exist
  | "selector_ambiguous"       // Multiple matches, wrong one clicked
  | "action_no_effect"         // Click/type had no visible result
  | "shadow_dom_blocked"       // Cannot pierce shadow root
  | "iframe_unreachable"       // Nested iframe context switch failed
  | "canvas_element"           // Target is inside <canvas>
  | "dynamic_rendering"        // Page uses client-side rendering that defeats observe()
  | "timeout"                  // Operation exceeded time limit
  | "anti_bot_detected"        // Cloudflare/DataDome challenge appeared
  | "unknown";                 // Unclassified failure

function shouldSwitchToMagnitude(failure: FailureType): boolean {
  const switchableFailures: FailureType[] = [
    "shadow_dom_blocked",
    "canvas_element",
    "iframe_unreachable",
    "selector_not_found",      // After retries exhausted
    "selector_ambiguous",
    "action_no_effect",        // After retries exhausted
    "dynamic_rendering",
    "anti_bot_detected",
  ];
  return switchableFailures.includes(failure);
}
```

### State Preservation

The AdsPower browser profile stays running throughout the switch. This preserves:
- **Cookies and localStorage**: Login sessions, CSRF tokens, form state
- **Browser fingerprint**: Canvas hash, WebGL renderer, installed fonts
- **Network state**: Active WebSocket connections, pending requests

What is **not** preserved across the switch:
- **Playwright Page object**: New context created by Magnitude
- **In-memory JavaScript state**: Page variables reset on navigation
- **Partially filled form fields**: Must re-fill if page reloads

### Implementation

```typescript
import type { IAgentOrchestrator, OperationResult } from "@valet/shared/types";

class AgentOrchestrator implements IAgentOrchestrator {
  private currentAgent: "stagehand" | "magnitude" | "human" = "stagehand";
  private stagehandAgent: IBrowserAgent | null = null;
  private magnitudeAgent: ReturnType<typeof startBrowserAgent> | null = null;
  private cdpUrl: string;
  private sessionState: SessionState;

  async switchAgent(reason: string): Promise<void> {
    if (this.currentAgent === "stagehand") {
      // 1. Capture state from Stagehand
      const currentUrl = await this.stagehandAgent!.getCurrentUrl();
      const screenshot = await this.stagehandAgent!.takeScreenshot();

      // 2. Disconnect Stagehand (do NOT close the AdsPower browser)
      this.stagehandAgent = null;

      // 3. Connect Magnitude to same AdsPower CDP
      this.magnitudeAgent = await startBrowserAgent({
        browser: { cdp: this.cdpUrl },
        llm: {
          provider: "anthropic",
          options: { model: "claude-sonnet-4-20250514" },
        },
        prompt: `You are resuming a job application. The previous automation
                 engine failed at this point. Current URL: ${currentUrl}.
                 Reason for switch: ${reason}`,
      });

      // 4. Navigate to the saved URL
      await this.magnitudeAgent.nav(currentUrl);

      this.currentAgent = "magnitude";

      // 5. Log the switch
      this.sessionState.engineSwitches.push({
        from: "stagehand",
        to: "magnitude",
        reason,
        timestamp: new Date().toISOString(),
        url: currentUrl,
      });
    }
  }

  getCurrentAgent(): "stagehand" | "magnitude" | "human" {
    return this.currentAgent;
  }

  async requestHumanTakeover(reason: string, screenshotUrl?: string): Promise<void> {
    // Emit WebSocket event to frontend for VNC takeover
    this.currentAgent = "human";
    // ... (see VNC integration doc)
  }
}
```

---

## 10. Moondream Self-Hosting

Moondream is a lightweight vision language model that can serve as a cost-effective
alternative for the extract and query roles (not for the act role, which requires
full visual grounding from Claude Sonnet 4 or Qwen 2.5 VL).

### Model Versions

| Model | Parameters | Active Params | Context Window | Use Case |
|-------|-----------|---------------|---------------|----------|
| Moondream 2 | 1.8B | 1.8B | 2K tokens | Edge deployment, basic VQA |
| Moondream 3 Preview | 9B (MoE) | 2B | 32K tokens | Production extraction, detection |

### Capabilities Relevant to Valet

- **Visual Question Answering**: "What is the label of this form field?"
- **Object Detection**: Locate UI elements by bounding box
- **Pointing and Counting**: "How many required fields are on this page?"
- **Captioning**: Generate descriptions of page sections

### Deployment Options

#### Option A: Moondream Cloud (Recommended for MVP)

```typescript
// No self-hosting required
// $5/month free credits, pay-as-you-go after
// 2 RPS free tier, scales to 10+ RPS with paid credits
```

Pros: Zero ops overhead, instant setup.
Cons: Rate limits, external dependency, latency.

#### Option B: Moondream Station (Self-Hosted)

```bash
# Local installation
pip install moondream

# Or Docker
docker run -p 3475:3475 ghcr.io/vikhyat/moondream-station:latest
```

**Hardware Requirements**:

| Configuration | GPU | VRAM | Inference Speed | Cost/Month |
|--------------|-----|------|----------------|------------|
| CPU-only | None | 4GB+ RAM | ~2-5s per image | $0 (existing infra) |
| NVIDIA T4 | 1x T4 | 16GB | ~200-500ms | ~$150 (cloud GPU) |
| NVIDIA A10G | 1x A10G | 24GB | ~100-200ms | ~$300 (cloud GPU) |
| Apple MPS | M1/M2/M3 | Unified | ~300-800ms | $0 (local dev) |

**Fly.io GPU Machine** (for production):

```toml
# fly/moondream.toml
[build]
  image = "ghcr.io/vikhyat/moondream-station:latest"

[http_service]
  internal_port = 3475
  auto_stop_machines = "suspend"
  auto_start_machines = true
  min_machines_running = 0

[[vm]]
  size = "a10g"        # or "l40s" for higher throughput
  gpu_kind = "a10g"
  memory = "16gb"
```

#### Option C: Hybrid

Use Moondream Cloud for extract/query roles during normal hours, fall back to
self-hosted for burst capacity or when cloud is down.

### Cost Comparison

| Method | Per-Image Cost | Monthly (10K applications) | Latency |
|--------|---------------|---------------------------|---------|
| Claude Sonnet 4 (extract) | ~$0.003 | ~$30 | ~1-2s |
| Moondream Cloud | ~$0.001 | ~$10 | ~500ms |
| Moondream Self-Hosted (T4) | ~$0.0002 | ~$150 fixed | ~300ms |
| Gemini 2.5 Flash (extract) | ~$0.0005 | ~$5 | ~500ms |

**Recommendation**: Use Gemini 2.5 Flash for extract/query roles initially. Consider
Moondream self-hosting when volume exceeds 50K+ applications/month and latency matters.

---

## 11. Error Handling

### Vision Model Errors

```typescript
import { startBrowserAgent } from "magnitude-core";

async function executeWithRetry(
  agent: Awaited<ReturnType<typeof startBrowserAgent>>,
  instruction: string,
  maxRetries = 3,
): Promise<void> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await agent.act(instruction);
      return;
    } catch (error) {
      const err = error as Error;

      if (err.message.includes("coordinate") || err.message.includes("target")) {
        // Pixel accuracy issue — wait for page to stabilize, retry
        await agent.page.waitForTimeout(1000);
        continue;
      }

      if (err.message.includes("rate_limit") || err.message.includes("429")) {
        // LLM rate limit — exponential backoff
        await new Promise((r) => setTimeout(r, 2 ** attempt * 1000));
        continue;
      }

      if (err.message.includes("context_length") || err.message.includes("token")) {
        // Context overflow — reduce minScreenshots and retry
        // This happens on very long multi-page forms
        throw new Error(`Context overflow on attempt ${attempt}: ${err.message}`);
      }

      // Unknown error — don't retry
      throw error;
    }
  }
  throw new Error(`Failed after ${maxRetries} retries: ${instruction}`);
}
```

### Coordinate Accuracy Issues

When the LLM identifies wrong coordinates:

1. **Verify action had effect**: After each `act()`, extract the page state and compare
   to expected outcome.
2. **Re-prompt with feedback**: "The previous click did not open the dropdown. The
   dropdown trigger appears to be the small arrow icon to the right of the field."
3. **Increase screenshot resolution**: Set `virtualScreenDimensions` to a higher
   resolution for small targets.
4. **Fall back to Playwright direct**: Access `agent.page` and use standard Playwright
   selectors as a last resort.

```typescript
// Verify + retry pattern
async function clickWithVerification(
  agent: Awaited<ReturnType<typeof startBrowserAgent>>,
  target: string,
  expectedOutcome: string,
): Promise<boolean> {
  await agent.act(`Click on ${target}`);

  // Verify the click had the expected effect
  const verification = await agent.extract(
    `Is the following true: "${expectedOutcome}"? Answer with just true or false.`,
    z.object({ result: z.boolean() }),
  );

  if (!verification.data.result) {
    // Retry with more specific instruction
    await agent.act(
      `The previous click on ${target} did not work. Try clicking more precisely on the exact center of ${target}.`,
    );
    return true; // Retried
  }

  return true; // Success
}
```

### Patchright Compatibility Issues

- **Console.log unavailable**: Patchright disables `Console.enable`. Use `page.evaluate()`
  return values for debugging, not `page.on('console')`.
- **Firefox/WebKit**: Not supported. Always use Chromium via AdsPower.
- **Playwright version mismatch**: Patchright tracks a specific Playwright version. If
  Magnitude upgrades patchright, test against AdsPower's Chromium version.

### Fallback to Human Takeover

When both Stagehand and Magnitude fail, escalate to human:

```typescript
async function escalateToHuman(
  orchestrator: IAgentOrchestrator,
  reason: string,
  agent: Awaited<ReturnType<typeof startBrowserAgent>>,
): Promise<void> {
  // Capture final screenshot for the human operator
  const screenshot = await agent.page.screenshot({ fullPage: true });
  const screenshotUrl = await uploadToStorage(screenshot, "screenshots");

  // Stop the Magnitude agent (keeps AdsPower browser open)
  await agent.stop();

  // Request human takeover via VNC
  await orchestrator.requestHumanTakeover(reason, screenshotUrl);
}
```

---

## 12. Full TypeScript Examples

### Example 1: Connect to AdsPower and Fill a Greenhouse Form

```typescript
import { startBrowserAgent } from "magnitude-core";
import { z } from "zod";
import type { IAdsPowerClient, UserData } from "@valet/shared/types";

async function fillGreenhouseForm(
  adsPower: IAdsPowerClient,
  profileId: string,
  jobUrl: string,
  userData: UserData,
): Promise<{ success: boolean; screenshotUrl?: string }> {
  const session = await adsPower.startBrowser(profileId);

  const agent = await startBrowserAgent({
    browser: { cdp: session.cdpUrl },
    url: jobUrl,
    narrate: true,
    llm: [
      {
        provider: "anthropic",
        options: { model: "claude-sonnet-4-20250514" },
        roles: ["act"],
      },
      {
        provider: "google-ai",
        options: { model: "gemini-2.5-flash" },
        roles: ["extract", "query"],
      },
    ],
  });

  try {
    // Extract form fields to understand the form structure
    const fields = await agent.extract(
      "List all form fields with their labels and types",
      z.array(
        z.object({
          label: z.string(),
          type: z.string(),
          required: z.boolean(),
        }),
      ),
    );

    // Fill personal information
    await agent.act("Fill in the first name field with {{firstName}}", {
      data: { firstName: userData.firstName },
    });
    await agent.act("Fill in the last name field with {{lastName}}", {
      data: { lastName: userData.lastName },
    });
    await agent.act("Fill in the email field with {{email}}", {
      data: { email: userData.email },
    });
    await agent.act("Fill in the phone number field with {{phone}}", {
      data: { phone: userData.phone },
    });

    // Upload resume if required
    if (fields.data.some((f) => f.type === "file")) {
      await agent.act("Click the resume upload button and upload the file", {
        prompt: "Look for a file upload area, drag-and-drop zone, or 'Attach' button.",
      });
      // Use Playwright directly for file chooser
      const fileChooserPromise = agent.page.waitForEvent("filechooser");
      await agent.act("Click the upload button for resume");
      const fileChooser = await fileChooserPromise;
      await fileChooser.setFiles(userData.resumeUrl!);
    }

    // Fill LinkedIn URL if field exists
    if (userData.linkedinUrl) {
      await agent.act("Fill in the LinkedIn profile URL field with {{url}}", {
        data: { url: userData.linkedinUrl },
      });
    }

    // Submit the application
    await agent.act("Click the Submit Application button");

    // Verify submission
    const result = await agent.extract(
      "Was the application submitted successfully? Look for confirmation message.",
      z.object({
        submitted: z.boolean(),
        confirmationMessage: z.string().optional(),
      }),
    );

    const screenshot = await agent.page.screenshot({ fullPage: true });
    const screenshotUrl = await uploadToStorage(screenshot, "screenshots");

    return {
      success: result.data.submitted,
      screenshotUrl,
    };
  } finally {
    await agent.stop();
  }
}
```

### Example 2: Workday Shadow DOM Navigation

```typescript
import { startBrowserAgent } from "magnitude-core";
import { z } from "zod";

async function fillWorkdayApplication(
  cdpUrl: string,
  jobUrl: string,
  userData: UserData,
): Promise<void> {
  const agent = await startBrowserAgent({
    browser: { cdp: cdpUrl },
    url: jobUrl,
    prompt: `You are filling out a Workday job application. Workday uses custom
             web components with shadow DOM. Interact with elements visually —
             click on visible buttons, type into visible fields. Do not rely on
             standard HTML form selectors.`,
    llm: {
      provider: "anthropic",
      options: { model: "claude-sonnet-4-20250514" },
    },
  });

  try {
    // Workday often requires clicking "Apply" first
    await agent.act("Click the 'Apply' button to start the application");

    // Wait for the application wizard to load
    await agent.page.waitForTimeout(3000);

    // Workday multi-step wizard — each page is a shadow DOM component
    await agent.act("Fill in my first name as {{firstName}}", {
      data: { firstName: userData.firstName },
    });
    await agent.act("Fill in my last name as {{lastName}}", {
      data: { lastName: userData.lastName },
    });

    // Workday custom dropdowns (not standard <select>)
    await agent.act("Click the country dropdown and select 'United States'");
    await agent.act("Click the state dropdown and select 'California'");

    // Click Next to proceed through wizard pages
    await agent.act("Click the 'Next' button to go to the next page");

    // Continue filling subsequent pages...
    await agent.act("Upload my resume by clicking the upload area", {
      prompt: "Workday's upload area may be a drag-and-drop zone or a button labeled 'Select Files'.",
    });

    // Final submission
    await agent.act("Click 'Submit' to submit the application");
  } finally {
    await agent.stop();
  }
}
```

### Example 3: Engine Switch — Stagehand Fails, Magnitude Takes Over

```typescript
import { startBrowserAgent } from "magnitude-core";
import type { IBrowserAgent, IAgentOrchestrator } from "@valet/shared/types";

async function applyWithFallback(
  stagehand: IBrowserAgent,
  adsPowerCdpUrl: string,
  jobUrl: string,
  userData: UserData,
): Promise<void> {
  // Attempt 1: Stagehand (DOM-based, faster, cheaper)
  try {
    await stagehand.navigate(jobUrl);
    await stagehand.act("Fill out the application form with my information");
    return; // Success
  } catch (stagehandError) {
    console.error("Stagehand failed:", stagehandError);

    // Classify the failure
    const error = stagehandError as Error;
    const isShadowDom = error.message.includes("shadow") || error.message.includes("closed");
    const isCanvas = error.message.includes("canvas");
    const isSelectorFail = error.message.includes("selector") || error.message.includes("not found");

    if (!isShadowDom && !isCanvas && !isSelectorFail) {
      throw stagehandError; // Not a structural failure — don't switch engines
    }
  }

  // Attempt 2: Magnitude (vision-first, handles complex UIs)
  const magnitudeAgent = await startBrowserAgent({
    browser: { cdp: adsPowerCdpUrl },
    url: jobUrl,
    llm: {
      provider: "anthropic",
      options: { model: "claude-sonnet-4-20250514" },
    },
    prompt: `The DOM-based automation failed on this page. Use vision to identify
             and interact with form elements. The page may use shadow DOM,
             canvas, or custom web components.`,
  });

  try {
    await magnitudeAgent.act("Fill out this job application form", {
      data: {
        firstName: userData.firstName,
        lastName: userData.lastName,
        email: userData.email,
        phone: userData.phone,
      },
    });
    await magnitudeAgent.act("Submit the application");
  } finally {
    await magnitudeAgent.stop();
  }
}
```

### Example 4: Structured Data Extraction with Zod

```typescript
import { startBrowserAgent } from "magnitude-core";
import { z } from "zod";

async function extractJobDetails(
  cdpUrl: string,
  jobUrl: string,
): Promise<{
  title: string;
  company: string;
  location: string;
  salary?: string;
  requirements: string[];
}> {
  const agent = await startBrowserAgent({
    browser: { cdp: cdpUrl },
    url: jobUrl,
    llm: [
      {
        provider: "google-ai",
        options: { model: "gemini-2.5-flash" },
        roles: ["extract"],
      },
    ],
  });

  try {
    const result = await agent.extract(
      "Extract the job posting details from this page",
      z.object({
        title: z.string().describe("The job title"),
        company: z.string().describe("The company name"),
        location: z.string().describe("The job location, including remote status"),
        salary: z.string().optional().describe("Salary range if listed"),
        requirements: z
          .array(z.string())
          .describe("List of job requirements or qualifications"),
      }),
    );

    return result.data;
  } finally {
    await agent.stop();
  }
}
```

---

## 13. Testing Strategy

### Unit Tests: Mock Vision Model

Use the existing `BrowserAgentMock` pattern from
`apps/worker/src/adapters/browser-agent.mock.ts` to create a Magnitude-specific mock:

```typescript
// apps/worker/src/adapters/magnitude-agent.mock.ts
import type { IBrowserAgent } from "@valet/shared/types";

export class MagnitudeAgentMock implements IBrowserAgent {
  // Same interface as BrowserAgentMock, but with
  // Magnitude-specific behaviors:
  // - Simulates vision-based delays (longer than DOM-based)
  // - Returns pixel-coordinate based action results
  // - Simulates screenshot capture cycle

  async act(instruction: string) {
    await randomDelay(1000, 3000); // Vision analysis is slower
    return {
      success: true,
      message: `[Magnitude] Executed: ${instruction}`,
      action: instruction,
    };
  }
}
```

### Integration Tests: Real Browser, Mock LLM

```typescript
// tests/integration/magnitude-agent.test.ts
import { describe, it, expect } from "vitest";
import { startBrowserAgent } from "magnitude-core";

describe("MagnitudeAgent integration", () => {
  it("should connect via CDP and navigate", async () => {
    const agent = await startBrowserAgent({
      url: "https://httpbin.org/forms/post",
      llm: {
        provider: "anthropic",
        options: { model: "claude-sonnet-4-20250514" },
      },
    });

    try {
      const url = await agent.page.url();
      expect(url).toContain("httpbin.org");
    } finally {
      await agent.stop();
    }
  });

  it("should extract form fields from a test page", async () => {
    const agent = await startBrowserAgent({
      url: "https://httpbin.org/forms/post",
      llm: {
        provider: "anthropic",
        options: { model: "claude-sonnet-4-20250514" },
      },
    });

    try {
      const fields = await agent.extract(
        "List all form fields",
        z.array(z.object({ label: z.string(), type: z.string() })),
      );
      expect(fields.data.length).toBeGreaterThan(0);
    } finally {
      await agent.stop();
    }
  });
});
```

### Visual Regression Tests

Use Magnitude's built-in test runner (`magnitude-test`) for visual assertions:

```typescript
// tests/magnitude/greenhouse-apply.mag.ts
import { test } from "magnitude-test";

test("Greenhouse application form fills correctly", async (agent) => {
  await agent.nav("https://boards.greenhouse.io/test-company/jobs/12345");

  await agent.act("Fill in the first name field with 'Jane'");
  await agent.act("Fill in the last name field with 'Doe'");
  await agent.act("Fill in the email field with 'jane@example.com'");

  // Visual assertion — check that fields are filled
  await agent.check("The first name field shows 'Jane'");
  await agent.check("The last name field shows 'Doe'");
  await agent.check("The email field shows 'jane@example.com'");
});
```

### Screenshot Comparison Tests

For verifying that engine switches produce equivalent results:

```typescript
async function compareEngineOutputs(
  stagehandScreenshot: Buffer,
  magnitudeScreenshot: Buffer,
): Promise<{
  match: boolean;
  similarity: number;
  differences: string[];
}> {
  // Use sharp or pixelmatch for image comparison
  // Threshold: 95% similarity acceptable (pixel-level differences expected)
  // Focus on: form field values visible, correct page state, no error messages
}
```

### Test Environment

```bash
# Run Magnitude-specific tests
pnpm test --filter @valet/worker -- --grep "magnitude"

# Run visual regression tests with magnitude-test
npx magnitude run tests/magnitude/

# Run integration tests (requires ANTHROPIC_API_KEY)
ANTHROPIC_API_KEY=sk-ant-... pnpm test:integration --filter @valet/worker
```

---

## References

- [Magnitude Documentation](https://docs.magnitude.run/)
- [Magnitude GitHub Repository](https://github.com/magnitudedev/magnitude)
- [Magnitude Browser Agent Reference](https://docs.magnitude.run/reference/browser-agent)
- [Patchright GitHub](https://github.com/Kaliiiiiiiiii-Vinyzu/patchright)
- [Moondream Documentation](https://docs.moondream.ai/)
- [Moondream GitHub](https://github.com/vikhyat/moondream)
- [Valet Automation Types](../packages/shared/src/types/automation.ts)
- [Valet Browser Agent Mock](../apps/worker/src/adapters/browser-agent.mock.ts)
