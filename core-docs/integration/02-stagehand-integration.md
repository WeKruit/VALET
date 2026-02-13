# 02 - Stagehand v3 Integration

> Primary browser automation engine for Valet.
> Stagehand v3 talks directly to Chrome via CDP, provides act/extract/observe
> primitives plus an autonomous agent mode with custom tools.

---

## Table of Contents

1. [SDK Setup](#1-stagehand-v3-sdk-setup)
2. [Three Primitives](#2-three-primitives)
3. [Agent Mode](#3-agent-mode)
4. [DOM Mode Tools](#4-dom-mode-tools)
5. [Custom Tools](#5-custom-tools)
6. [LLM Integration](#6-llm-integration)
7. [Element Caching](#7-element-caching)
8. [Streaming & Progress](#8-streaming--progress)
9. [Form Filling Strategy](#9-form-filling-strategy)
10. [Screenshot Capture](#10-screenshot-capture)
11. [Error Handling](#11-error-handling)
12. [Integration with Hatchet](#12-integration-with-hatchet)
13. [Testing](#13-testing)

---

## 1. Stagehand v3 SDK Setup

### Package Installation

```bash
pnpm add @browserbasehq/stagehand
```

Stagehand v3 has no Playwright peer dependency. It communicates directly with Chrome
via the Chrome DevTools Protocol (CDP), yielding 44% faster interactions and lighter
memory usage.

### Initialization: Connect to Existing CDP Session

Valet launches browsers through AdsPower, which exposes a CDP endpoint per profile.
Stagehand connects to that existing session -- it never launches its own browser.

```
+-----------+      CDP ws://      +------------+       CDP ws://       +------------+
| AdsPower  | ------------------> |  Chrome    | <-------------------- | Stagehand  |
| (profile) |  port from launch   | (headless) |   cdpUrl from ADS    |  (v3 SDK)  |
+-----------+                     +------------+                       +------------+
```

```typescript
// apps/worker/src/adapters/stagehand-agent.ts

import { Stagehand } from "@browserbasehq/stagehand";
import type { BrowserSession } from "@valet/shared/types";

export interface StagehandAgentConfig {
  /** CDP WebSocket URL from AdsPower browser launch */
  cdpUrl: string;
  /** Model string in "provider/model" format for agent mode */
  agentModel: string;
  /** Model string for act/extract/observe primitives */
  primitiveModel?: string;
  /** Timeout for DOM settlement after navigation (ms) */
  domSettleTimeout?: number;
  /** Directory to persist action cache */
  cacheDir?: string;
}

export async function createStagehandAgent(
  config: StagehandAgentConfig,
): Promise<Stagehand> {
  const stagehand = new Stagehand({
    env: "LOCAL",
    localBrowserLaunchOptions: {
      cdpUrl: config.cdpUrl,
      headless: false,
      chromiumSandbox: false,
      ignoreHTTPSErrors: true,
      connectTimeoutMs: 30_000,
      viewport: { width: 1440, height: 900 },
    },
    domSettleTimeout: config.domSettleTimeout ?? 3000,
  });

  await stagehand.init();
  return stagehand;
}
```

### Constructor Options Reference

| Option                       | Type     | Default | Description                                    |
|------------------------------|----------|---------|------------------------------------------------|
| `env`                        | string   | --      | `"LOCAL"` or `"BROWSERBASE"`                   |
| `localBrowserLaunchOptions`  | object   | --      | CDP/Chrome launch config (see below)           |
| `domSettleTimeout`           | number   | 3000    | Ms to wait for DOM stability after navigation  |

### localBrowserLaunchOptions

| Option                 | Type     | Default   | Description                              |
|------------------------|----------|-----------|------------------------------------------|
| `cdpUrl`               | string   | --        | WebSocket URL of running Chrome instance |
| `headless`             | boolean  | true      | Run headless (false for VNC visibility)  |
| `chromiumSandbox`      | boolean  | true      | Chromium sandbox (false in Docker)       |
| `ignoreHTTPSErrors`    | boolean  | false     | Accept invalid certs                     |
| `connectTimeoutMs`     | number   | 30000     | CDP connection timeout                   |
| `viewport`             | object   | --        | `{ width: number, height: number }`      |
| `executablePath`       | string   | --        | Path to Chrome binary (unused with CDP)  |
| `port`                 | number   | random    | Fixed CDP debugging port                 |
| `userDataDir`          | string   | --        | Chrome profile directory                 |
| `args`                 | string[] | []        | Extra Chrome flags                       |
| `proxy`                | object   | --        | `{ server, username, password }`         |

---

## 2. Three Primitives

Stagehand provides three low-level primitives. Each issues a single LLM call to
interpret the page, then executes via CDP.

### 2.1 act() -- Perform a Single Action

```typescript
const result = await stagehand.act(instruction: string, options?: ActOptions);
```

**Parameters:**

| Param         | Type                         | Required | Description                          |
|---------------|------------------------------|----------|--------------------------------------|
| `instruction` | string                       | yes      | Natural language action description  |
| `options`     | ActOptions                   | no       | Model override, timeout, variables   |

```typescript
interface ActOptions {
  model?: { modelName: string; apiKey?: string };
  timeout?: number;
  variables?: Record<string, string>;  // sensitive data, never sent to LLM
  page?: Page;
}
```

**Return type: ActResult**

```typescript
interface ActResult {
  success: boolean;
  message: string;
  actionDescription: string;
  actions: Array<{
    selector: string;       // xpath
    description: string;
    method: string;         // click | fill | type | press | scroll | select
    arguments: unknown[];
  }>;
}
```

**Supported methods:**

| Method   | Instruction Example                         |
|----------|---------------------------------------------|
| click    | `"click the Submit Application button"`     |
| fill     | `"fill the email field with %email%"`       |
| type     | `"type 'hello' into the search box"`        |
| press    | `"press Enter in the search field"`         |
| scroll   | `"scroll down to the bottom of the page"`   |
| select   | `"select 'California' from the state dropdown"` |

**Variable substitution** keeps secrets out of LLM context:

```typescript
await stagehand.act("fill the password field with %password%", {
  variables: { password: process.env.USER_PASSWORD! },
});
```

### 2.2 extract() -- Get Structured Data

```typescript
const result = await stagehand.extract(instruction, schema?, options?);
```

**Parameters:**

| Param         | Type       | Required | Description                              |
|---------------|------------|----------|------------------------------------------|
| `instruction` | string     | yes      | What to extract                          |
| `schema`      | ZodObject  | no       | Zod schema for type-safe extraction      |
| `options`     | object     | no       | `{ model?, timeout?, selector? }`        |

**Return type:** Inferred from Zod schema, or `{ extraction: string }` if no schema.

```typescript
import { z } from "zod";

// Schema-based extraction -- typed output
const formFields = await stagehand.extract(
  "Extract all form fields on this page",
  z.object({
    fields: z.array(z.object({
      label: z.string().describe("The visible label of the form field"),
      type: z.string().describe("Input type: text, select, checkbox, etc."),
      required: z.boolean().describe("Whether the field is required"),
      selector: z.string().describe("CSS selector to target this field"),
      options: z.array(z.string()).optional().describe("Options for select/radio"),
    })),
    submitSelector: z.string().describe("CSS selector for the submit button"),
    hasCaptcha: z.boolean(),
  }),
);

// formFields is fully typed: { fields: [...], submitSelector: string, hasCaptcha: boolean }
```

**Targeted extraction** using selector to reduce token usage:

```typescript
const headerData = await stagehand.extract(
  "Extract the job title and company name",
  z.object({
    jobTitle: z.string(),
    company: z.string(),
  }),
  { selector: "//header" },
);
```

### 2.3 observe() -- Discover Available Actions

```typescript
const actions = await stagehand.observe(instruction, options?);
```

**Parameters:**

| Param         | Type          | Required | Description                            |
|---------------|---------------|----------|----------------------------------------|
| `instruction` | string        | yes      | What elements to discover              |
| `options`     | ObserveOptions| no       | `{ model?, timeout?, selector?, page? }` |

**Return type: Action[]**

```typescript
interface Action {
  description: string;      // human-readable
  method: string;           // click, fill, type, press
  arguments: unknown[];     // method arguments
  selector: string;         // xpath or CSS selector
}
```

**Plan-then-execute pattern** (2-3x faster for repeated actions):

```typescript
// Discover all form fields once
const fields = await stagehand.observe(
  "find all input fields and their labels in the application form",
);

// Execute each without additional LLM calls
for (const field of fields) {
  if (field.method === "fill") {
    await stagehand.act(field);
  }
}
```

---

## 3. Agent Mode

Agent mode orchestrates multi-step browser tasks autonomously. The LLM plans,
executes tools, observes results, and repeats until the goal is reached or
maxSteps is hit.

### 3.1 Configuration

```typescript
const agent = stagehand.agent({
  mode: "dom",                                       // "dom" | "cua" | "hybrid"
  model: "anthropic/claude-sonnet-4-5-20250514",     // provider/model format
  executionModel: "openai/gpt-4.1-mini",             // cheaper model for tool execution
  systemPrompt: VALET_AGENT_SYSTEM_PROMPT,
  tools: customTools,                                // Vercel AI SDK tools
  experimental: true,                                // required for callbacks/streaming
  stream: true,                                      // enable streaming
});
```

### 3.2 Mode Comparison

```
+------------------+-------------------+-------------------+--------------------+
|                  |     DOM Mode      |    Hybrid Mode    |     CUA Mode       |
+------------------+-------------------+-------------------+--------------------+
| Tools            | act, fillForm,    | act, fillForm,    | Screenshot-based   |
|                  | extract, goto,    | click, type,      | computer use       |
|                  | scroll, keys,     | dragAndDrop,      | (Anthropic CUA,    |
|                  | screenshot,       | clickAndHold,     |  Gemini, OpenAI)   |
|                  | search, think,    | extract, goto,    |                    |
|                  | wait, ariaTree,   | scroll, keys,     |                    |
|                  | navback           | screenshot, etc.  |                    |
+------------------+-------------------+-------------------+--------------------+
| Model Req.       | Any LLM           | Coordinate-aware  | CUA provider       |
|                  |                   | (Gemini, Claude)  |                    |
+------------------+-------------------+-------------------+--------------------+
| Speed            | Fastest           | Medium            | Slowest            |
+------------------+-------------------+-------------------+--------------------+
| Best For         | Structured forms, | Complex UIs,      | Visual tasks,      |
|                  | known layouts     | drag-drop,        | unknown layouts    |
|                  |                   | canvas apps       |                    |
+------------------+-------------------+-------------------+--------------------+
```

**Valet default:** DOM mode. Structured job application forms map perfectly
to DOM-based tools. Fall back to hybrid only if DOM tools fail.

### 3.3 agent.execute()

```typescript
// Non-streaming
const result: AgentResult = await agent.execute({
  instruction: "Fill out this job application form with the candidate's data",
  maxSteps: 30,
  signal: abortController.signal,
  callbacks: {
    onStepFinish: async (event) => {
      await publishProgress(event);
    },
  },
  output: z.object({
    submitted: z.boolean(),
    confirmationId: z.string().optional(),
    errors: z.array(z.string()),
  }),
});
```

**AgentExecuteOptions:**

| Option            | Type            | Default | Description                              |
|-------------------|-----------------|---------|------------------------------------------|
| `instruction`     | string          | --      | Task description in natural language      |
| `maxSteps`        | number          | 20      | Maximum actions before stopping           |
| `page`            | Page            | active  | Target page object                        |
| `signal`          | AbortSignal     | --      | Cancel via AbortController                |
| `callbacks`       | object          | --      | `onStepFinish`, `prepareStep`, etc.       |
| `output`          | ZodObject       | --      | Structured output schema                  |
| `messages`        | ModelMessage[]  | --      | Prior conversation for continuation       |
| `excludeTools`    | string[]        | --      | Tools to disable                          |
| `highlightCursor` | boolean         | false   | Visual debugging cursor                   |

**AgentResult:**

```typescript
interface AgentResult {
  success: boolean;
  message: string;
  actions: AgentAction[];
  completed: boolean;
  metadata?: Record<string, unknown>;
  messages?: ModelMessage[];         // for continuation
  output?: Record<string, unknown>;  // from output schema
  usage?: {
    input_tokens: number;
    output_tokens: number;
    reasoning_tokens?: number;
    cached_input_tokens?: number;
    inference_time_ms: number;
  };
}
```

### 3.4 AbortController

```typescript
// apps/worker/src/workflows/apply.ts

const controller = new AbortController();

// Budget guard: abort if token spend exceeds threshold
const budgetTimer = setInterval(async () => {
  const spent = await getBudgetSpent(applicationId);
  if (spent > MAX_APPLICATION_BUDGET_CENTS) {
    controller.abort();
  }
}, 5_000);

try {
  const result = await agent.execute({
    instruction: "Complete this job application",
    maxSteps: 50,
    signal: controller.signal,
  });
} catch (err) {
  if (err instanceof AgentAbortError) {
    // Budget exceeded or user cancelled -- save progress
    await savePartialApplication(applicationId, err);
  }
  throw err;
} finally {
  clearInterval(budgetTimer);
}
```

---

## 4. DOM Mode Tools

When running in DOM mode, the agent has access to these built-in tools. The LLM
selects which tool to invoke at each step.

### Tool Reference

| Tool          | Description                                           | When Used                              |
|---------------|-------------------------------------------------------|----------------------------------------|
| `act`         | Perform a single DOM action (click, fill, type, etc.) | Individual field fills, button clicks  |
| `fillForm`    | Fill multiple form fields in a single step            | Batch-filling application forms        |
| `extract`     | Get structured data from the current page             | Read field values, verify filled data  |
| `observe`     | Discover interactive elements                         | Analyze page before acting             |
| `goto`        | Navigate to a URL                                     | Moving between application pages       |
| `scroll`      | Scroll the page                                       | Revealing hidden form sections         |
| `keys`        | Send keyboard events                                  | Tab between fields, Enter to submit    |
| `screenshot`  | Capture current page state                            | Progress logging, verification         |
| `search`      | Search the page DOM for text                          | Finding specific sections              |
| `think`       | Pause to reason without acting                        | Complex decision points                |
| `wait`        | Wait for a specified duration                         | Page loads, animation completion       |
| `ariaTree`    | Get the accessibility tree                            | Understanding page structure           |
| `navback`     | Go back in browser history                            | Recovering from wrong navigation       |

### fillForm -- Key Tool for Valet

The `fillForm` tool fills multiple fields in a single agent step, making it the
most important tool for job application workflows.

```
Agent Step 1: observe   -> "Find all form fields on this page"
Agent Step 2: fillForm  -> { firstName: "Jane", lastName: "Doe", email: "jane@..." }
Agent Step 3: extract   -> Verify all fields contain correct values
Agent Step 4: act       -> "Click the Next button"
```

The agent decides which tool to use based on its system prompt and the current
page state. For Valet, the system prompt strongly encourages `fillForm` for
form pages and `extract` for verification.

---

## 5. Custom Tools

Custom tools extend the agent with application-specific capabilities using
the Vercel AI SDK `tool()` helper.

### 5.1 Tool Definition Pattern

```typescript
// apps/worker/src/tools/valet-tools.ts

import { tool } from "ai";
import { z } from "zod";
import type { LLMRouter } from "@valet/llm/router";

export interface ValetToolDeps {
  qaBank: Map<string, string>;
  budgetTracker: { spent: number; limit: number };
  screenshotUploader: (buffer: Buffer) => Promise<string>;
  eventLogger: (event: string, data: Record<string, unknown>) => Promise<void>;
  llmRouter: LLMRouter;
}

export function buildValetTools(deps: ValetToolDeps) {
  return {
    lookupQABank,
    checkBudget: buildCheckBudget(deps),
    logEvent: buildLogEvent(deps),
    captureScreenshot: buildCaptureScreenshot(deps),
  };
}
```

### 5.2 lookupQABank

Lets the agent look up pre-written answers from the user's Q&A bank before
generating new answers.

```typescript
const lookupQABank = tool({
  description:
    "Look up a pre-written answer in the user's Q&A bank. " +
    "Always check this BEFORE generating a new answer. " +
    "Returns the stored answer if found, or null if not.",
  parameters: z.object({
    question: z
      .string()
      .describe("The screening question to look up, simplified to keywords"),
  }),
  execute: async ({ question }): Promise<{ found: boolean; answer: string | null }> => {
    // Fuzzy match against Q&A bank keys
    const normalizedQ = question.toLowerCase().trim();
    for (const [key, value] of deps.qaBank) {
      const normalizedKey = key.toLowerCase().trim();
      if (
        normalizedKey.includes(normalizedQ) ||
        normalizedQ.includes(normalizedKey)
      ) {
        return { found: true, answer: value };
      }
    }
    return { found: false, answer: null };
  },
});
```

### 5.3 checkBudget

Lets the agent self-monitor token spend and stop before exceeding the user's
budget.

```typescript
function buildCheckBudget(deps: ValetToolDeps) {
  return tool({
    description:
      "Check the current token budget status. " +
      "Call this before expensive operations like LLM-generated answers. " +
      "If remaining budget is low, prefer Q&A bank answers or skip optional fields.",
    parameters: z.object({}),
    execute: async (): Promise<{
      spentCents: number;
      limitCents: number;
      remainingCents: number;
      shouldContinue: boolean;
    }> => {
      const remaining = deps.budgetTracker.limit - deps.budgetTracker.spent;
      return {
        spentCents: deps.budgetTracker.spent,
        limitCents: deps.budgetTracker.limit,
        remainingCents: remaining,
        shouldContinue: remaining > 5, // keep 5 cent buffer
      };
    },
  });
}
```

### 5.4 logEvent

Structured event logging for the progress timeline shown in the UI.

```typescript
function buildLogEvent(deps: ValetToolDeps) {
  return tool({
    description:
      "Log a structured event for the user's progress timeline. " +
      "Use this to report meaningful milestones: page navigation, " +
      "field fills, verification results, errors encountered.",
    parameters: z.object({
      event: z.enum([
        "page_loaded",
        "fields_filled",
        "field_verified",
        "page_submitted",
        "error_encountered",
        "captcha_detected",
        "file_uploaded",
        "application_submitted",
      ]),
      data: z.record(z.unknown()).describe("Event-specific payload"),
    }),
    execute: async ({ event, data }) => {
      await deps.eventLogger(event, data);
      return { logged: true };
    },
  });
}
```

### 5.5 captureScreenshot

Takes a screenshot, uploads to S3, returns the URL for storage and display.

```typescript
function buildCaptureScreenshot(deps: ValetToolDeps) {
  return tool({
    description:
      "Take a screenshot of the current page and upload it. " +
      "Use this after filling a page, after submission, " +
      "and when an error occurs for debugging.",
    parameters: z.object({
      reason: z
        .string()
        .describe("Why this screenshot is being taken (for logging)"),
    }),
    execute: async ({ reason }): Promise<{ url: string; reason: string }> => {
      // The agent's built-in screenshot tool handles the capture;
      // this tool handles upload and URL generation.
      // In practice, the screenshot buffer comes from stagehand.page.
      const buffer = await stagehandInstance.page.screenshot();
      const url = await deps.screenshotUploader(buffer);
      await deps.eventLogger("screenshot_captured", { url, reason });
      return { url, reason };
    },
  });
}
```

### 5.6 Wiring Custom Tools into the Agent

```typescript
const tools = buildValetTools({
  qaBank: userQABank,
  budgetTracker: { spent: 0, limit: budgetLimitCents },
  screenshotUploader: uploadToS3,
  eventLogger: (event, data) => redis.publish(progressChannel, { event, data }),
  llmRouter,
});

const agent = stagehand.agent({
  mode: "dom",
  model: "anthropic/claude-sonnet-4-5-20250514",
  executionModel: "openai/gpt-4.1-mini",
  systemPrompt: VALET_AGENT_SYSTEM_PROMPT,
  tools,
  experimental: true,
  stream: true,
});
```

---

## 6. LLM Integration

### 6.1 How Stagehand Uses LLMs

Stagehand makes LLM calls in two contexts:

1. **Primitives** (act/extract/observe): Each call sends the current page
   accessibility tree + instruction to an LLM. The response is parsed into
   actions or structured data.

2. **Agent mode**: The LLM acts as the controller, deciding which tool to
   call at each step. Stagehand sends the tool results back, and the LLM
   plans the next action.

```
+------------------+     instruction      +------------------+
|  Valet Worker    | -------------------> |   Stagehand v3   |
|  (Hatchet task)  |                      |                  |
+------------------+                      +--------+---------+
                                                   |
                                     page DOM + instruction
                                                   |
                                          +--------v---------+
                                          |     LLM API      |
                                          | (Claude/GPT/etc) |
                                          +--------+---------+
                                                   |
                                          actions / data
                                                   |
                                          +--------v---------+
                                          |       CDP        |
                                          | (Chrome browser) |
                                          +------------------+
```

### 6.2 Model Configuration for Valet

Stagehand's model is configured independently of Valet's LLMRouter. Both
systems make LLM calls, but for different purposes:

| System      | Purpose                         | Model                           |
|-------------|----------------------------------|---------------------------------|
| Stagehand   | Page understanding, agent brain  | Claude Sonnet 4.5 (complex)     |
| Stagehand   | Tool execution                   | GPT-4.1 mini (routine)          |
| LLMRouter   | Form analysis prompts            | Claude Sonnet 4.5               |
| LLMRouter   | Field mapping prompts            | GPT-4.1 mini                    |
| LLMRouter   | Answer generation prompts        | Claude Sonnet 4.5               |
| LLMRouter   | Confirmation/navigation          | GPT-4.1 nano                    |

### 6.3 Tracking Token Usage from Stagehand

Stagehand reports token usage in the `AgentResult.usage` field. Track it
separately from LLMRouter usage:

```typescript
// apps/worker/src/services/token-tracker.ts

export interface TokenUsageRecord {
  source: "stagehand_agent" | "stagehand_primitive" | "llm_router";
  model: string;
  inputTokens: number;
  outputTokens: number;
  costCents: number;
  applicationId: string;
  timestamp: Date;
}

export class TokenTracker {
  private records: TokenUsageRecord[] = [];

  /** Record Stagehand agent usage from AgentResult */
  recordAgentUsage(
    result: AgentResult,
    model: string,
    applicationId: string,
  ): void {
    if (!result.usage) return;
    this.records.push({
      source: "stagehand_agent",
      model,
      inputTokens: result.usage.input_tokens,
      outputTokens: result.usage.output_tokens,
      costCents: this.calculateCost(
        model,
        result.usage.input_tokens,
        result.usage.output_tokens,
      ),
      applicationId,
      timestamp: new Date(),
    });
  }

  /** Record LLMRouter usage via the onUsage callback */
  recordRouterUsage(
    taskType: string,
    usage: { inputTokens: number; outputTokens: number },
    model: string,
    applicationId: string,
  ): void {
    this.records.push({
      source: "llm_router",
      model,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      costCents: this.calculateCost(model, usage.inputTokens, usage.outputTokens),
      applicationId,
      timestamp: new Date(),
    });
  }

  getTotalCostCents(applicationId: string): number {
    return this.records
      .filter((r) => r.applicationId === applicationId)
      .reduce((sum, r) => sum + r.costCents, 0);
  }

  private calculateCost(
    model: string,
    input: number,
    output: number,
  ): number {
    // Pricing per 1M tokens (cents)
    const pricing: Record<string, { input: number; output: number }> = {
      "claude-sonnet-4-5-20250514": { input: 300, output: 1500 },
      "gpt-4.1-mini":              { input: 40,  output: 160 },
      "gpt-4.1-nano":              { input: 10,  output: 40 },
    };
    const p = pricing[model] ?? pricing["gpt-4.1-mini"]!;
    return (input * p.input + output * p.output) / 1_000_000;
  }
}
```

---

## 7. Element Caching

Stagehand v3 automatically caches discovered elements and actions. When the
same action is repeated, it skips the LLM call and replays from cache.

### How It Works

```
First run:
  act("click Submit") -> LLM call -> finds xpath -> executes -> CACHES result

Second run:
  act("click Submit") -> CACHE HIT -> executes directly (no LLM call)
```

### Cache Configuration

```typescript
const stagehand = new Stagehand({
  env: "LOCAL",
  localBrowserLaunchOptions: { cdpUrl },
  // Enable persistent action cache
  // Cache dir is shared across Hatchet task runs for the same application
  cacheDir: `/tmp/valet-cache/${applicationId}`,
});
```

### Cache Invalidation

The cache is keyed on:
- Page URL
- Instruction text
- DOM structure hash

When the page structure changes (e.g., after navigation), stale entries are
automatically skipped and refreshed. No manual invalidation needed.

### Performance Benefits

| Scenario                       | Without Cache | With Cache | Savings     |
|--------------------------------|---------------|------------|-------------|
| Fill 10 fields (same form)     | 10 LLM calls  | 1 LLM call | 90% tokens  |
| Multi-page form (5 pages)      | 50 LLM calls  | ~10 calls  | 80% tokens  |
| Retry after error              | Full re-run    | Cached     | 95% tokens  |

---

## 8. Streaming & Progress

Real-time progress flows from Stagehand agent callbacks through Redis pub/sub
to WebSocket connections and into the frontend progress bar.

### 8.1 Pipeline Architecture

```
+-------------------+    onStepFinish    +---------------+    PUBLISH     +----------+
|  Stagehand Agent  | ----------------> | Hatchet Task  | ------------> |  Redis   |
|  (in worker)      |    callback        | (event handler)|   channel    | (Upstash)|
+-------------------+                   +---------------+               +----+-----+
                                                                             |
                                                                        SUBSCRIBE
                                                                             |
                                                                    +--------v--------+
                                                                    |   Fastify API   |
                                                                    | (WebSocket hub) |
                                                                    +--------+--------+
                                                                             |
                                                                         ws message
                                                                             |
                                                                    +--------v--------+
                                                                    |   React Web     |
                                                                    | (progress bar)  |
                                                                    +-----------------+
```

### 8.2 Worker: onStepFinish Callback

```typescript
// apps/worker/src/workflows/apply.ts

import Redis from "ioredis";

interface ProgressEvent {
  applicationId: string;
  step: number;
  totalSteps: number;
  action: string;
  status: "running" | "completed" | "error";
  screenshotUrl?: string;
  timestamp: number;
}

async function runApplication(
  stagehand: Stagehand,
  applicationId: string,
  redis: Redis,
) {
  const progressChannel = `application:${applicationId}:progress`;
  let stepCount = 0;

  const agent = stagehand.agent({
    mode: "dom",
    model: "anthropic/claude-sonnet-4-5-20250514",
    systemPrompt: VALET_AGENT_SYSTEM_PROMPT,
    tools: valetTools,
    experimental: true,
  });

  const result = await agent.execute({
    instruction: "Fill out and submit this job application",
    maxSteps: 50,
    callbacks: {
      onStepFinish: async (event) => {
        stepCount++;

        const progress: ProgressEvent = {
          applicationId,
          step: stepCount,
          totalSteps: 50,
          action: event.toolCalls?.[0]?.toolName ?? "thinking",
          status: "running",
          timestamp: Date.now(),
        };

        await redis.publish(progressChannel, JSON.stringify(progress));
      },
    },
  });

  // Final event
  await redis.publish(
    progressChannel,
    JSON.stringify({
      applicationId,
      step: stepCount,
      totalSteps: stepCount,
      action: "complete",
      status: result.success ? "completed" : "error",
      timestamp: Date.now(),
    }),
  );
}
```

### 8.3 API: Redis Subscribe + WebSocket Broadcast

```typescript
// apps/api/src/routes/ws/application-progress.ts

import type { FastifyInstance } from "fastify";
import Redis from "ioredis";

export async function applicationProgressWs(app: FastifyInstance) {
  const subscriber = new Redis(process.env.REDIS_URL!);

  app.get(
    "/api/v1/applications/:id/progress",
    { websocket: true },
    async (socket, req) => {
      const { id } = req.params as { id: string };
      const channel = `application:${id}:progress`;

      const handler = (_ch: string, message: string) => {
        socket.send(message);
      };

      await subscriber.subscribe(channel);
      subscriber.on("message", handler);

      socket.on("close", async () => {
        subscriber.off("message", handler);
        await subscriber.unsubscribe(channel);
      });
    },
  );
}
```

### 8.4 Frontend: WebSocket Consumer

```typescript
// apps/web/src/hooks/use-application-progress.ts

import { useState, useEffect, useRef } from "react";

interface ProgressState {
  step: number;
  totalSteps: number;
  action: string;
  status: "idle" | "running" | "completed" | "error";
  percentage: number;
}

export function useApplicationProgress(applicationId: string): ProgressState {
  const [state, setState] = useState<ProgressState>({
    step: 0,
    totalSteps: 1,
    action: "",
    status: "idle",
    percentage: 0,
  });
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const wsUrl = `${import.meta.env.VITE_WS_URL}/api/v1/applications/${applicationId}/progress`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      setState({
        step: data.step,
        totalSteps: data.totalSteps,
        action: data.action,
        status: data.status,
        percentage: Math.round((data.step / data.totalSteps) * 100),
      });
    };

    ws.onerror = () => setState((s) => ({ ...s, status: "error" }));

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [applicationId]);

  return state;
}
```

---

## 9. Form Filling Strategy

Valet uses agent mode with fillForm as the primary tool for multi-page
application forms. The strategy follows a per-page loop.

### 9.1 Per-Page Loop

```
For each page in the application form:

  +----------+     +-----------+     +----------+     +----------+     +----------+
  | Analyze  | --> | Map       | --> | Fill     | --> | Verify   | --> | Next     |
  | Page     |     | Fields    |     | Form     |     | Values   |     | Page     |
  +----------+     +-----------+     +----------+     +----------+     +----------+
       |                |                 |                |                |
   extract()       lookupQABank      fillForm         extract()        act()
   (page fields)   + LLMRouter       (agent tool)     (read back)     "click Next"
                   (field mapping)
```

### 9.2 Implementation

```typescript
// apps/worker/src/strategies/form-fill-strategy.ts

import type { Stagehand } from "@browserbasehq/stagehand";
import type { UserData, FormField, FieldMapping } from "@valet/shared/types";
import { z } from "zod";

const PageFieldsSchema = z.object({
  fields: z.array(z.object({
    label: z.string(),
    type: z.string(),
    required: z.boolean(),
    selector: z.string(),
    currentValue: z.string().optional(),
    options: z.array(z.string()).optional(),
  })),
  hasNextButton: z.boolean(),
  nextButtonSelector: z.string().optional(),
  hasSubmitButton: z.boolean(),
  submitButtonSelector: z.string().optional(),
  pageTitle: z.string().optional(),
});

const VerificationSchema = z.object({
  fields: z.array(z.object({
    label: z.string(),
    expectedValue: z.string(),
    actualValue: z.string(),
    matches: z.boolean(),
  })),
  allCorrect: z.boolean(),
});

export async function fillApplicationForm(
  stagehand: Stagehand,
  userData: UserData,
  qaBank: Map<string, string>,
  maxPages: number = 10,
): Promise<{ success: boolean; pagesProcessed: number; errors: string[] }> {
  const errors: string[] = [];
  let pagesProcessed = 0;

  for (let page = 0; page < maxPages; page++) {
    // Step 1: Analyze the current page
    const pageFields = await stagehand.extract(
      "Extract all form fields on this page with their labels, types, " +
      "selectors, current values, and available options",
      PageFieldsSchema,
    );

    if (pageFields.fields.length === 0) {
      // No more form fields -- might be confirmation page
      break;
    }

    // Step 2: Map fields to user data (via LLMRouter -- see Section 6)
    const mappings = await mapFieldsToUserData(
      pageFields.fields,
      userData,
      qaBank,
    );

    // Step 3: Fill using agent fillForm tool
    const agent = stagehand.agent({
      mode: "dom",
      model: "anthropic/claude-sonnet-4-5-20250514",
      systemPrompt: buildFillPagePrompt(mappings),
      experimental: true,
    });

    await agent.execute({
      instruction: buildFillInstruction(mappings),
      maxSteps: 15,
    });

    // Step 4: Verify values were filled correctly
    const verification = await stagehand.extract(
      "Check each form field and compare its current value to what was expected",
      VerificationSchema,
    );

    if (!verification.allCorrect) {
      const mismatches = verification.fields.filter((f) => !f.matches);
      for (const m of mismatches) {
        errors.push(`Field "${m.label}": expected "${m.expectedValue}", got "${m.actualValue}"`);
        // Retry the mismatched field
        await stagehand.act(
          `clear and fill the "${m.label}" field with "${m.expectedValue}"`,
        );
      }
    }

    pagesProcessed++;

    // Step 5: Navigate to next page
    if (pageFields.hasSubmitButton && !pageFields.hasNextButton) {
      // This is the last page -- submit
      await stagehand.act(
        `click the submit button at selector ${pageFields.submitButtonSelector}`,
      );
      break;
    }

    if (pageFields.hasNextButton) {
      await stagehand.act(
        `click the next button at selector ${pageFields.nextButtonSelector}`,
      );
      // Wait for next page to load
      await stagehand.act("wait for the page content to load");
    }
  }

  return { success: errors.length === 0, pagesProcessed, errors };
}

function buildFillInstruction(mappings: FieldMapping[]): string {
  const lines = mappings.map(
    (m) => `- Fill "${m.field.label}" (${m.field.type}) with: ${m.value}`,
  );
  return [
    "Fill out the following form fields with these exact values:",
    ...lines,
    "",
    "Use the fillForm tool to fill all fields at once.",
    "For select/radio fields, choose the closest matching option.",
    "For file uploads, skip them (handled separately).",
  ].join("\n");
}

function buildFillPagePrompt(mappings: FieldMapping[]): string {
  return [
    "You are filling out a job application form.",
    "Fill each field with the EXACT value provided.",
    "Do NOT modify or improve the answers.",
    "After filling, verify each field contains the correct value.",
    `There are ${mappings.length} fields to fill on this page.`,
  ].join(" ");
}
```

### 9.3 File Upload Handling

File uploads (resumes, cover letters) are handled separately from the
fillForm flow because they require special CDP interactions.

```typescript
async function uploadResume(
  stagehand: Stagehand,
  fileSelector: string,
  resumePath: string,
): Promise<void> {
  // Use CDP FileChooser interception
  const page = stagehand.page;

  // Trigger the file chooser
  const [fileChooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    stagehand.act(`click the file upload button at ${fileSelector}`),
  ]);

  await fileChooser.setFiles([resumePath]);
  await stagehand.act("wait for the file upload to complete");
}
```

---

## 10. Screenshot Capture

Screenshots serve three purposes: progress tracking, error debugging, and
submission confirmation.

### 10.1 Capture via CDP

```typescript
// apps/worker/src/services/screenshot-service.ts

import type { Stagehand } from "@browserbasehq/stagehand";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import crypto from "node:crypto";

const s3 = new S3Client({
  region: "auto",
  endpoint: process.env.S3_ENDPOINT!,     // Supabase Storage S3 endpoint
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID!,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
  },
  forcePathStyle: true,
});

export async function captureAndUpload(
  stagehand: Stagehand,
  applicationId: string,
  label: string,
): Promise<string> {
  // Take screenshot via CDP page API
  const buffer = await stagehand.page.screenshot({
    type: "png",
    fullPage: false,
  });

  // Generate unique key
  const hash = crypto.randomBytes(8).toString("hex");
  const key = `screenshots/${applicationId}/${label}-${hash}.png`;

  // Upload to Supabase Storage (S3-compatible)
  await s3.send(
    new PutObjectCommand({
      Bucket: "screenshots",
      Key: key,
      Body: buffer,
      ContentType: "image/png",
    }),
  );

  // Return public URL
  const baseUrl = process.env.SUPABASE_URL!;
  return `${baseUrl}/storage/v1/object/public/screenshots/${key}`;
}
```

### 10.2 Screenshot Timing

| Event                    | Label                  | Stored In                      |
|--------------------------|------------------------|--------------------------------|
| Page load                | `page-{n}-loaded`      | `application.screenshots[]`    |
| After filling fields     | `page-{n}-filled`      | `application.screenshots[]`    |
| Verification mismatch    | `page-{n}-mismatch`    | `application.errors[]`         |
| CAPTCHA detected         | `captcha-detected`     | `application.screenshots[]`    |
| Submission confirmation  | `submission-confirmed` | `application.confirmationUrl`  |
| Error state              | `error-{code}`         | `application.errors[]`         |

---

## 11. Error Handling

### 11.1 Error Categories and Recovery

```
+--------------------------+------------------+------------------------------------+
| Error                    | Detection        | Recovery                           |
+--------------------------+------------------+------------------------------------+
| CDP disconnect           | WebSocket close  | Reconnect via AdsPower re-launch   |
| LLM timeout              | Request timeout  | Retry with fallback model          |
| Element not found        | act() failure    | observe() + retry, or skip field   |
| Page navigation error    | goto() failure   | Retry, check URL validity          |
| Budget exceeded          | Budget check     | AbortController.abort()            |
| CAPTCHA detected         | extract/observe  | Pause, notify user, human takeover |
| Form validation error    | extract() after  | Re-fill invalid fields             |
| Session expired          | HTTP 401/403     | Re-login via platform adapter      |
| Rate limit               | HTTP 429         | Exponential backoff                |
+--------------------------+------------------+------------------------------------+
```

### 11.2 CDP Disconnect Recovery

```typescript
// apps/worker/src/adapters/stagehand-lifecycle.ts

import type { Stagehand } from "@browserbasehq/stagehand";

export async function withCdpRecovery<T>(
  createStagehand: () => Promise<Stagehand>,
  operation: (stagehand: Stagehand) => Promise<T>,
  maxRetries: number = 2,
): Promise<T> {
  let stagehand = await createStagehand();
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation(stagehand);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      const isCdpError =
        lastError.message.includes("WebSocket") ||
        lastError.message.includes("Target closed") ||
        lastError.message.includes("Protocol error") ||
        lastError.message.includes("Connection refused");

      if (!isCdpError || attempt === maxRetries) {
        throw lastError;
      }

      // CDP disconnected -- re-create Stagehand with new session
      await stagehand.close().catch(() => {});
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
      stagehand = await createStagehand();
    }
  }

  throw lastError ?? new Error("CDP recovery exhausted");
}
```

### 11.3 LLM Timeout Handling

```typescript
async function actWithFallback(
  stagehand: Stagehand,
  instruction: string,
): Promise<ActResult> {
  try {
    // Primary: Claude Sonnet 4.5
    return await stagehand.act(instruction, {
      timeout: 15_000,
    });
  } catch {
    // Fallback: GPT-4.1 mini (faster, cheaper)
    return await stagehand.act(instruction, {
      model: { modelName: "openai/gpt-4.1-mini" },
      timeout: 10_000,
    });
  }
}
```

### 11.4 CAPTCHA Detection and Human Takeover

```typescript
async function checkForCaptcha(stagehand: Stagehand): Promise<boolean> {
  const captchaCheck = await stagehand.extract(
    "Check if there is a CAPTCHA on this page (reCAPTCHA, hCaptcha, Turnstile, or any other challenge)",
    z.object({
      hasCaptcha: z.boolean(),
      captchaType: z.string().optional(),
      captchaSelector: z.string().optional(),
    }),
  );

  return captchaCheck.hasCaptcha;
}

// In the main workflow:
if (await checkForCaptcha(stagehand)) {
  await captureAndUpload(stagehand, applicationId, "captcha-detected");
  // Trigger human takeover via VNC
  await requestHumanTakeover(applicationId, "CAPTCHA detected");
  // Pause the Hatchet task until human resolves
}
```

---

## 12. Integration with Hatchet

Stagehand runs inside Hatchet durable tasks. The Stagehand instance persists
across task boundaries via a SandboxController that manages the browser
session lifecycle.

### 12.1 Architecture

```
+------------------+       +-------------------+       +------------------+
|  Hatchet Worker  |       | SandboxController |       |    Stagehand     |
|                  |       |                   |       |                  |
|  task: analyze   +------>| getOrCreate()     +------>| init()           |
|  task: fill      +------>| getStagehand()    +------>| agent.execute()  |
|  task: verify    +------>| getStagehand()    +------>| extract()        |
|  task: submit    +------>| getStagehand()    +------>| act()            |
|  task: cleanup   +------>| release()         +------>| close()          |
+------------------+       +-------------------+       +------------------+
```

### 12.2 Stagehand in Hatchet Workflow

```typescript
// apps/worker/src/workflows/apply-workflow.ts

import { hatchet } from "../hatchet.js";
import type { Context, DurableContext } from "@hatchet-dev/typescript-sdk";
import { createStagehandAgent } from "../adapters/stagehand-agent.js";

interface ApplyInput {
  applicationId: string;
  jobUrl: string;
  userId: string;
  cdpUrl: string;
  userData: Record<string, unknown>;
}

const applyWorkflow = hatchet.workflow("apply-to-job");

// Task 1: Navigate and analyze the form
const analyzeTask = applyWorkflow.durableTask(
  "analyze-form",
  async (ctx: DurableContext<ApplyInput>) => {
    const { cdpUrl, jobUrl, applicationId } = ctx.input;

    const stagehand = await createStagehandAgent({ cdpUrl, agentModel: "anthropic/claude-sonnet-4-5-20250514" });

    try {
      await stagehand.page.goto(jobUrl);
      await stagehand.act("wait for the page to fully load");

      const formAnalysis = await stagehand.extract(
        "Analyze this job application form: identify all fields, their types, " +
        "whether they are required, and the overall form structure",
        FormAnalysisSchema,
      );

      // Store stagehand connection info for subsequent tasks
      return {
        formAnalysis,
        cdpUrl,
      };
    } catch (error) {
      await stagehand.close();
      throw error;
    }
  },
);

// Task 2: Fill the form
const fillTask = applyWorkflow.durableTask(
  "fill-form",
  async (ctx: DurableContext<ApplyInput>) => {
    const analyzeResult = await ctx.getTaskOutput("analyze-form");
    const { cdpUrl } = analyzeResult;

    // Reconnect to the same browser session
    const stagehand = await createStagehandAgent({
      cdpUrl,
      agentModel: "anthropic/claude-sonnet-4-5-20250514",
    });

    const result = await fillApplicationForm(
      stagehand,
      ctx.input.userData as UserData,
      await loadQABank(ctx.input.userId),
    );

    return result;
  },
);

// Task 3: Verify and submit
const submitTask = applyWorkflow.durableTask(
  "submit-application",
  async (ctx: DurableContext<ApplyInput>) => {
    const fillResult = await ctx.getTaskOutput("fill-form");
    const analyzeResult = await ctx.getTaskOutput("analyze-form");
    const { cdpUrl } = analyzeResult;

    const stagehand = await createStagehandAgent({
      cdpUrl,
      agentModel: "anthropic/claude-sonnet-4-5-20250514",
    });

    try {
      // Take pre-submission screenshot
      const preSubmitUrl = await captureAndUpload(
        stagehand,
        ctx.input.applicationId,
        "pre-submit",
      );

      // Submit the application
      await stagehand.act("click the Submit Application button");
      await stagehand.act("wait for the submission confirmation");

      // Verify submission
      const confirmation = await stagehand.extract(
        "Check if the application was submitted successfully. " +
        "Look for confirmation messages, IDs, or thank-you pages.",
        z.object({
          submitted: z.boolean(),
          confirmationId: z.string().optional(),
          confirmationMessage: z.string().optional(),
        }),
      );

      // Post-submission screenshot
      const postSubmitUrl = await captureAndUpload(
        stagehand,
        ctx.input.applicationId,
        "submission-confirmed",
      );

      return {
        ...confirmation,
        screenshotUrls: { preSubmit: preSubmitUrl, postSubmit: postSubmitUrl },
      };
    } finally {
      await stagehand.close();
    }
  },
);
```

### 12.3 Shared Browser Session Across Tasks

The CDP URL persists across Hatchet task boundaries because the AdsPower browser
session remains running. Each task reconnects to the same CDP endpoint:

```
Hatchet Workflow: apply-to-job
  |
  +-- analyze-form   -> createStagehandAgent({ cdpUrl }) -> stagehand.init()
  |                      (navigates to job URL, analyzes form)
  |                      returns { cdpUrl } for next tasks
  |
  +-- fill-form      -> createStagehandAgent({ cdpUrl }) -> reconnects to same browser
  |                      (fills fields, verifies values)
  |
  +-- submit         -> createStagehandAgent({ cdpUrl }) -> reconnects to same browser
  |                      (submits form, captures confirmation)
  |                      stagehand.close() -- done with browser
  |
  +-- cleanup        -> adsPower.stopBrowser(profileId)
                         (releases browser profile for reuse)
```

---

## 13. Testing

### 13.1 Mock Browser Agent (Existing)

The existing `BrowserAgentMock` at `apps/worker/src/adapters/browser-agent.mock.ts`
implements `IBrowserAgent` and simulates Stagehand-compatible interactions with
realistic delays. This is used for unit tests of workflow logic without needing
a real browser.

### 13.2 Unit Tests: Mock Stagehand

For testing code that depends on the Stagehand SDK directly:

```typescript
// apps/worker/src/__tests__/mock-stagehand.ts

import type { Stagehand } from "@browserbasehq/stagehand";

export function createMockStagehand(): Stagehand {
  const mockPage = {
    goto: vi.fn().mockResolvedValue(undefined),
    screenshot: vi.fn().mockResolvedValue(Buffer.from("fake-png")),
    waitForEvent: vi.fn().mockResolvedValue({ setFiles: vi.fn() }),
    url: vi.fn().mockReturnValue("https://example.com/apply"),
  };

  const mockAgent = {
    execute: vi.fn().mockResolvedValue({
      success: true,
      message: "Application completed",
      actions: [],
      completed: true,
      usage: {
        input_tokens: 500,
        output_tokens: 200,
        inference_time_ms: 1500,
      },
    }),
  };

  return {
    init: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    page: mockPage,
    act: vi.fn().mockResolvedValue({
      success: true,
      message: "Action completed",
      actionDescription: "clicked button",
      actions: [],
    }),
    extract: vi.fn().mockResolvedValue({
      fields: [],
      hasNextButton: false,
      hasSubmitButton: true,
    }),
    observe: vi.fn().mockResolvedValue([]),
    agent: vi.fn().mockReturnValue(mockAgent),
  } as unknown as Stagehand;
}
```

### 13.3 Unit Test Example

```typescript
// apps/worker/src/__tests__/form-fill-strategy.test.ts

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockStagehand } from "./mock-stagehand.js";
import { fillApplicationForm } from "../strategies/form-fill-strategy.js";

describe("fillApplicationForm", () => {
  let stagehand: ReturnType<typeof createMockStagehand>;

  beforeEach(() => {
    stagehand = createMockStagehand();
  });

  it("processes a single-page form", async () => {
    // Mock extract to return form fields, then verification
    stagehand.extract
      .mockResolvedValueOnce({
        fields: [
          { label: "First Name", type: "text", required: true, selector: "#fname" },
          { label: "Last Name", type: "text", required: true, selector: "#lname" },
        ],
        hasNextButton: false,
        hasSubmitButton: true,
        submitButtonSelector: "#submit",
      })
      .mockResolvedValueOnce({
        fields: [
          { label: "First Name", expectedValue: "Jane", actualValue: "Jane", matches: true },
          { label: "Last Name", expectedValue: "Doe", actualValue: "Doe", matches: true },
        ],
        allCorrect: true,
      });

    const result = await fillApplicationForm(
      stagehand,
      { firstName: "Jane", lastName: "Doe", email: "jane@example.com", phone: "555-0100" },
      new Map(),
    );

    expect(result.success).toBe(true);
    expect(result.pagesProcessed).toBe(1);
  });

  it("retries mismatched fields", async () => {
    stagehand.extract
      .mockResolvedValueOnce({
        fields: [{ label: "Email", type: "email", required: true, selector: "#email" }],
        hasNextButton: false,
        hasSubmitButton: true,
        submitButtonSelector: "#submit",
      })
      .mockResolvedValueOnce({
        fields: [
          { label: "Email", expectedValue: "jane@example.com", actualValue: "", matches: false },
        ],
        allCorrect: false,
      });

    const result = await fillApplicationForm(
      stagehand,
      { firstName: "Jane", lastName: "Doe", email: "jane@example.com", phone: "555-0100" },
      new Map(),
    );

    // act() should have been called to retry the mismatched field
    expect(stagehand.act).toHaveBeenCalledWith(
      expect.stringContaining("Email"),
    );
  });
});
```

### 13.4 Integration Tests: Headless Chrome

For integration tests, launch a real headless Chrome and connect Stagehand:

```typescript
// tests/integration/stagehand-integration.test.ts

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Stagehand } from "@browserbasehq/stagehand";
import { spawn } from "node:child_process";

let stagehand: Stagehand;
let chromeProcess: ReturnType<typeof spawn>;

beforeAll(async () => {
  // Launch headless Chrome with remote debugging
  chromeProcess = spawn("google-chrome", [
    "--headless=new",
    "--remote-debugging-port=9222",
    "--no-sandbox",
    "--disable-gpu",
    "--disable-dev-shm-usage",
  ]);

  // Wait for Chrome to start
  await new Promise((r) => setTimeout(r, 2000));

  stagehand = new Stagehand({
    env: "LOCAL",
    localBrowserLaunchOptions: {
      cdpUrl: "http://localhost:9222",
      headless: true,
    },
  });

  await stagehand.init();
}, 30_000);

afterAll(async () => {
  await stagehand.close();
  chromeProcess.kill();
});

describe("Stagehand integration", () => {
  it("navigates and extracts page title", async () => {
    await stagehand.page.goto("https://example.com");

    const result = await stagehand.extract(
      "Extract the page title",
      z.object({ title: z.string() }),
    );

    expect(result.title).toBe("Example Domain");
  });

  it("fills a form field via act()", async () => {
    await stagehand.page.goto("https://httpbin.org/forms/post");

    await stagehand.act("fill the Customer name field with 'Test User'");

    const value = await stagehand.extract(
      "Get the current value of the Customer name field",
      z.object({ customerName: z.string() }),
    );

    expect(value.customerName).toBe("Test User");
  });
});
```

### 13.5 Test Matrix

| Level       | Browser       | LLM           | Speed    | CI       |
|-------------|---------------|---------------|----------|----------|
| Unit        | Mock          | Mock          | < 1s     | Always   |
| Integration | Headless Chrome| Real API     | 10-30s   | Nightly  |
| E2E         | Headed Chrome | Real API      | 1-5 min  | Manual   |

---

## Appendix: System Prompt for Valet Agent

```typescript
// apps/worker/src/prompts/agent-system-prompt.ts

export const VALET_AGENT_SYSTEM_PROMPT = `You are Valet, an AI assistant that fills out job application forms on behalf of users.

RULES:
1. Fill every field with the EXACT value provided. Do not modify, improve, or embellish answers.
2. For screening questions, ALWAYS check the Q&A bank first using the lookupQABank tool.
3. If the Q&A bank has no answer AND you have sufficient context, generate a brief, truthful answer.
4. For EEO/demographic questions, select "Prefer not to say" or "Decline to self-identify" when available.
5. For file uploads, skip them -- they are handled separately.
6. After filling each page, verify all fields contain the correct values.
7. Check the budget using checkBudget before generating LLM-powered answers.
8. Log meaningful events using logEvent (page loads, fills, verifications, errors).
9. Take screenshots using captureScreenshot after filling each page and after submission.
10. If you encounter a CAPTCHA, STOP and log the event -- do not attempt to solve it.

FORM FILLING ORDER:
1. Scroll to see the full page
2. Observe all form fields
3. Fill all fields using fillForm
4. Verify all values are correct
5. Take a screenshot
6. Click Next/Submit

ERROR HANDLING:
- If a field cannot be filled, skip it and log the error
- If navigation fails, wait and retry once
- If the form rejects submission, extract the error messages and report them
`;
```
